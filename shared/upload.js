/* =========================================================
   CeMoQu upload, shared by LD, RT and SD.

   Every module builds one record per trial and calls CeMoQuUpload.submit().
   Records wait in the browser (IndexedDB) and are sent one at a time, so a
   lost connection never loses a trial. A record is removed only after the
   server confirms it. The server ignores a trial_id it already has.

   A record:
   { module, row: {column: value}, files: [{kind, name, mimeType, blob}] }
========================================================= */
const CeMoQuUpload = (() => {
  const URL_ = 'https://script.google.com/macros/s/AKfycbx8SW1QOnTSp0T-i-SfZejIxe6w_h1zrzRrkLy6r-oNNcHdAB7q_YPi_nQRkMRZ_E4iHQ/exec';
  const UPLOAD_TOKEN = '071ad297fe86c8dcef134c92470311a9';
  const SCHEMA_VERSION = 1;
  const DB_NAME = 'cemoqu_upload';
  const STORE = 'queue';
  const RETRY_MS = 60000;
  const OFFLINE_NOTICE_MS = 15000;

  let sending = false;
  let retryTimer = null;
  let waitingSince = null;

  const field = id => document.getElementById(id)?.value.trim() || '';
  const safe = value => String(value || '').replace(/[^A-Za-z0-9_-]+/g, '_');
  const pad = n => String(n).padStart(2, '0');

  /* Patient and test fields, the same for every module. */
  function patient() {
    return {
      patient_id: field('glob-id'),
      patient_name: field('glob-name'),
      age: field('glob-age'),
      dob: field('glob-dob'),
      sex: field('glob-sex'),
      dominant_hand: field('glob-hand'),
      session: field('glob-sess') || 'S1',
      test_date: field('glob-date'),
      operator: field('glob-op')
    };
  }

  /* Returns what must be fixed before saving, or "". */
  function missingFields() {
    const p = patient();
    const missing = [];
    if (!p.patient_id) missing.push('Patient ID');
    if (!p.sex) missing.push('Sex');
    if (!p.dominant_hand) missing.push('Dominant hand');
    return missing.length ? `Enter ${missing.join(', ')} in the header before submitting.` : '';
  }

  function sessionId(p = patient()) {
    return `${safe(p.patient_id)}_${p.test_date}_${safe(p.session)}`;
  }

  /* patient-date-time-module-hand-trial, from the trial start time. */
  function fileBase({ patientId, startedAt, module, hand, trial }) {
    const d = new Date(startedAt);
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${safe(patientId)}-${date}-${time}-${module}-${hand}-T${trial}`;
  }

  /* The same trial always gets the same ID, so a second Submit is ignored. */
  function trialId({ session, module, hand, trial, startedAt }) {
    return `${session}-${module}-${hand}-T${trial}-${new Date(startedAt).getTime()}`;
  }

  /* Columns every row shares. */
  function commonRow({ module, hand, trial, startedAt, endedAt, status, scoringVersion, session }) {
    const p = patient();
    const id = session || sessionId(p);
    return {
      ...p,
      session_id: id,
      trial_id: trialId({ session: id, module, hand, trial, startedAt }),
      module,
      hand,
      trial_number: trial,
      started_at: startedAt,
      ended_at: endedAt,
      status,
      schema_version: SCHEMA_VERSION,
      scoring_version: scoringVersion,
      is_synthetic: 0,
      score_expected: '',
      synthetic_note: ''
    };
  }

  function csvText(headers, rows) {
    const cell = value => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = dataUrl.split(',');
    const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    return new Blob([bytes], { type: head.match(/data:([^;]+)/)?.[1] || 'application/octet-stream' });
  }

  /* ---------- browser queue ---------- */
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'trial_id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(request?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  const allRecords = () => withStore('readonly', store => store.getAll());
  const removeRecord = id => withStore('readwrite', store => store.delete(id));
  const putRecord = record => withStore('readwrite', store => store.put(record));

  /* ---------- sending ---------- */
  function setStatus(text, state = 'waiting') {
    const el = document.getElementById('gh-upload-status');
    if (el) {
      el.hidden = !text;
      el.textContent = text;
      el.dataset.state = state;
    }
    window.dispatchEvent(new CustomEvent('cemoqu-upload-status', { detail: { text, state } }));
  }

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    }
    return btoa(binary);
  }

  async function sha256(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function sendRecord(record) {
    const files = [];
    for (const file of record.files) {
      files.push({
        kind: file.kind,
        name: file.name,
        mimeType: file.mimeType,
        sha256: await sha256(file.blob),
        base64: await blobToBase64(file.blob)
      });
    }
    const response = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: UPLOAD_TOKEN, module: record.module, row: record.row, files })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, RETRY_MS);
  }

  function showWaiting(count) {
    waitingSince = waitingSince || Date.now();
    const long = !navigator.onLine || Date.now() - waitingSince >= OFFLINE_NOTICE_MS;
    setStatus(long
      ? `Will save automatically once online (${count})`
      : `Waiting to save (${count})`);
  }

  /* Sends everything waiting, oldest first. */
  async function flush() {
    if (sending) return;
    sending = true;
    clearTimeout(retryTimer);
    try {
      const records = (await allRecords()).sort((a, b) => a.queued_at - b.queued_at);
      if (!records.length) return;
      let saved = 0, already = 0, problem = '';
      for (let i = 0; i < records.length; i++) {
        const left = records.length - i;
        if (!navigator.onLine) {
          showWaiting(left);
          scheduleRetry();
          return;
        }
        setStatus(`Saving ${i + 1} of ${records.length}`);
        let result;
        try {
          result = await sendRecord(records[i]);
        } catch (error) {
          console.warn('CeMoQu upload will retry:', error);
          showWaiting(left);
          scheduleRetry();
          return;
        }
        if (result?.status === 'success' || result?.status === 'duplicate') {
          await removeRecord(records[i].trial_id);
          if (result.status === 'success') saved++; else already++;
        } else {
          /* The server refused it. Keep it, and show why. */
          problem = result?.message || 'Unknown server error';
          records[i].last_error = problem;
          await putRecord(records[i]);
        }
      }
      waitingSince = null;
      if (problem) {
        setStatus(`Not saved: ${problem}`, 'error');
        scheduleRetry();
      } else {
        const parts = [];
        if (saved) parts.push(`${saved} saved`);
        if (already) parts.push(`${already} already saved`);
        setStatus(parts.join(', ') + ' to Research Data', 'saved');
      }
    } catch (error) {
      console.error('CeMoQu upload queue error:', error);
      setStatus(`Not saved: ${error.message}`, 'error');
    } finally {
      sending = false;
    }
  }

  /* Puts every record in the browser queue first, then sends. */
  async function submit(records) {
    const now = Date.now();
    for (let i = 0; i < records.length; i++) {
      await putRecord({ ...records[i], trial_id: records[i].row.trial_id, queued_at: now + i });
    }
    waitingSince = null;
    await flush();
  }

  window.addEventListener('online', flush);
  window.addEventListener('cemoqu-header-ready', flush);

  return { patient, missingFields, sessionId, fileBase, commonRow, csvText, dataUrlToBlob, submit, flush };
})();
