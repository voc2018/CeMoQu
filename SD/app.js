// Keep everything scoped, and rely on <script defer> so DOM is ready
(function(){
  // ------------------------------
  // Sentences to read (can be edited)
  // ------------------------------
  const SENTENCES = [
    'The quick brown fox jumps over the lazy dog.',
    'We were away a year ago, and we saw a wide view of the valley.',
    'Please pack my box with five dozen liquor jugs.',
    'She sells sea shells by the sea shore.',
    'Many men, many minds; every voice tells a different story.'
  ];

  // Build 5 "tests" out of the sentences
  const TASKS = SENTENCES.map((text, i) => ({
    key: `test${i+1}`,
    title: `Test ${i+1}`,
    seconds: 8, // recording window per sentence
    repeat: 1,
    prompt: `Read aloud: "${text}"`
  }));

  // ------------------------------
  // State
  // ------------------------------
  let stream, audioCtx, analyser, source;
  let mediaRecorder, chunks = [];
  let recognition = null;
  let currentTranscript = '';
  let state = { iTask: -1, iRep: 0, running: false, sampleRate: null };
  const results = []; // {task, rep, blob, duration, features}

  // UI refs
  const $ = sel => document.querySelector(sel);
  const els = {
    status: $('#status'), caps: $('#caps'), sr: $('#sr'), rms: $('#rms'), f0: $('#f0'), meter: $('#meter'),
    instr: $('#task-instructions'), playback: $('#playback'), rows: $('#rows'),
    btnPerm: $('#btn-permission'), btnStart: $('#btn-start'), btnStop: $('#btn-stop'), btnRecord: $('#btn-record'), btnDone: $('#btn-done'),
    btnCSV: $('#btn-export-csv'), btnJSON: $('#btn-export-json'), btnClear: $('#btn-clear'),
    pid: $('#pid'), sid: $('#sid'), micdist: $('#micdist')
  };

  // ------------------------------
  // Mic & monitor
  // ------------------------------
  async function ensureMic(){
    if(stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: false
      }
    });
    setupMonitor(stream);
    els.status.textContent = 'Mic ready';
    return stream;
  }

  function setupMonitor(str){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.sampleRate = audioCtx.sampleRate;
    els.sr.textContent = `${Math.round(state.sampleRate)} Hz`;
    source = audioCtx.createMediaStreamSource(str);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const timeData = new Float32Array(analyser.fftSize);
    const ctx = els.meter.getContext('2d');

    function loop(){
      if(!analyser) return;
      analyser.getFloatTimeDomainData(timeData);
      const rms = Math.sqrt(timeData.reduce((s,v)=>s+v*v,0)/timeData.length) || 0;
      els.rms.textContent = rms.toFixed(3);
      drawMeter(ctx, rms);

      const f0 = estimateF0(timeData, state.sampleRate);
      els.f0.textContent = f0 ? f0.toFixed(1) : '—';
      requestAnimationFrame(loop);
    }
    loop();
  }

  function drawMeter(ctx, rms){
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#1f2a44';
    ctx.fillRect(0,0,w,h);
    const v = Math.min(1, rms * 10);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0,0,w*v,h);
  }

  // Simple autocorrelation-based F0 (works for clean vowels; heuristic)
  function estimateF0(buf, sr){
    let mean = 0; for(let i=0;i<buf.length;i++) mean += buf[i]; mean/=buf.length;
    const x = new Float32Array(buf.length); for(let i=0;i<buf.length;i++) x[i]=buf[i]-mean;
    const n = x.length; const corr = new Float32Array(n);
    for(let lag=0;lag<n;lag++){
      let s=0; for(let i=0;i<n-lag;i++){ s += x[i]*x[i+lag]; }
      corr[lag]=s;
    }
    const minLag = Math.floor(sr/400), maxLag = Math.floor(sr/60);
    let bestLag=0, bestVal=-1;
    for(let lag=minLag; lag<=Math.min(maxLag, n-1); lag++){
      if(corr[lag] > bestVal){ bestVal = corr[lag]; bestLag = lag; }
    }
    if(bestLag>0) return sr / bestLag; else return null;
  }

  // ------------------------------
  // ------------------------------
  // Fuzzy Word Matching (enhanced WER)
  // ------------------------------
  
  // Levenshtein distance between two strings
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  // Similarity score between 0 and 1
  function wordSimilarity(target, spoken) {
    if (!target || !spoken) return 0;
    const t = target.toLowerCase().replace(/[^a-z]/g, '');
    const s = spoken.toLowerCase().replace(/[^a-z]/g, '');
    if (t === s) return 1;
    if (!t.length || !s.length) return 0;
    const dist = levenshtein(t, s);
    const maxLen = Math.max(t.length, s.length);
    return Math.max(0, 1 - dist / maxLen);
  }

  // Match ASR words to target words using greedy best-match alignment
  // Returns { wordsCorrect, wordsTotal, accuracyPct, details[] }
  function matchWords(targetWords, asrText, similarityThreshold = 0.6) {
    const spokenWords = normalizeText(asrText);
    const total = targetWords.length;
    
    if (spokenWords.length === 0) {
      return {
        wordsCorrect: 0,
        wordsTotal: total,
        accuracyPct: 0,
        details: targetWords.map(w => ({ target: w, spoken: '—', similarity: 0, correct: false })),
      };
    }

    // Dynamic programming alignment: greedy best-match
    const used = new Set();
    const details = [];
    let correct = 0;

    for (const tw of targetWords) {
      let bestIdx = -1, bestSim = 0;
      for (let j = 0; j < spokenWords.length; j++) {
        if (used.has(j)) continue;
        const sim = wordSimilarity(tw, spokenWords[j]);
        if (sim > bestSim) { bestSim = sim; bestIdx = j; }
      }

      // Threshold: similarity ≥ 0.6 counts as a "correct" word
      const isCorrect = bestSim >= similarityThreshold;
      if (bestIdx >= 0 && isCorrect) {
        used.add(bestIdx);
        correct++;
        details.push({ target: tw, spoken: spokenWords[bestIdx], similarity: bestSim, correct: true });
      } else {
        details.push({ target: tw, spoken: bestIdx >= 0 ? spokenWords[bestIdx] : '—', similarity: bestSim, correct: false });
      }
    }

    return {
      wordsCorrect: correct,
      wordsTotal: total,
      accuracyPct: (correct / total) * 100,
      details,
    };
  }

  // Enhanced computeWER with fuzzy matching
  function computeWER(reference, hypothesis, useFuzzy = true){
    const ref = normalizeText(reference);
    const hyp = normalizeText(hypothesis);
    
    if(useFuzzy && hyp.length > 0) {
      // Use fuzzy matching for accuracy calculation
      const match = matchWords(ref, hypothesis);
      const correctWords = match.wordsCorrect;
      const accuracyPct = match.accuracyPct;
      const wer = 1 - (accuracyPct / 100); // WER = 1 - accuracy
      
      return {
        wer: Math.min(wer, 1.0),
        sub: 0, del: 0, ins: 0, // Not applicable with fuzzy matching
        refLen: ref.length,
        hypLen: hyp.length,
        correctWords,
        accuracyPct,
        details: match.details
      };
    }
    
    // Original exact matching WER
    if(ref.length === 0) return { wer: hyp.length > 0 ? 1.0 : 0.0, sub: 0, del: 0, ins: hyp.length, refLen: 0, hypLen: hyp.length };

    // DP matrix
    const n = ref.length, m = hyp.length;
    const d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for(let i = 0; i <= n; i++) d[i][0] = i;
    for(let j = 0; j <= m; j++) d[0][j] = j;
    for(let i = 1; i <= n; i++){
      for(let j = 1; j <= m; j++){
        const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,        // deletion
          d[i][j - 1] + 1,        // insertion
          d[i - 1][j - 1] + cost  // substitution
        );
      }
    }

    // Backtrace to count S, D, I
    let i = n, j = m, sub = 0, del = 0, ins = 0;
    while(i > 0 || j > 0){
      if(i > 0 && j > 0 && d[i][j] === d[i-1][j-1] + (ref[i-1] !== hyp[j-1] ? 1 : 0)){
        if(ref[i-1] !== hyp[j-1]) sub++;
        i--; j--;
      } else if(i > 0 && d[i][j] === d[i-1][j] + 1){
        del++; i--;
      } else {
        ins++; j--;
      }
    }

    const correctWords = Math.max(0, ref.length - del - sub);
    return {
      wer: Math.min((sub + del + ins) / ref.length, 1.0),
      sub, del, ins,
      refLen: ref.length,
      hypLen: hyp.length,
      correctWords
    };
  }

  function normalizeText(text){
    return text
      .toLowerCase()
      .replace(/[^\w\s']/g, '')   // strip punctuation except apostrophes
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w.length > 0);
  }

  // WER → 0–6 score (lower WER = better = lower score)
  function werToScore(wer){
    const thresholds = [0.05, 0.10, 0.20, 0.35, 0.50, 0.70];
    for(let i = 0; i < thresholds.length; i++){
      if(wer <= thresholds[i]) return i;
    }
    return 6;
  }

  // Accuracy → 0–6 score (higher accuracy = lower score)
  function accuracyToScore(pct) {
    if (pct >= 90) return 0;
    if (pct >= 80) return 1;
    if (pct >= 65) return 2;
    if (pct >= 50) return 3;
    if (pct >= 30) return 4;
    if (pct >= 10) return 5;
    return 6;
  }

  // ------------------------------
  // Recording pipeline
  // ------------------------------
  function startRecording(){
    chunks = [];
    currentTranscript = '';

    // -- MediaRecorder (audio capture) --
    mediaRecorder = new MediaRecorder(stream, { mimeType: pickMime() });
    mediaRecorder.ondataavailable = e => { if(e.data && e.data.size>0) chunks.push(e.data); };
    mediaRecorder.onstop = () => { handleRecordingStop(); };
    mediaRecorder.start();

    // -- SpeechRecognition (runs in parallel for WER) --
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SpeechRec){
      recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (e) => {
        let transcript = '';
        for(let i = 0; i < e.results.length; i++){
          if(e.results[i].isFinal){
            transcript += e.results[i][0].transcript + ' ';
          }
        }
        currentTranscript = transcript.trim();
      };
      recognition.onerror = (e) => {
        console.warn('SpeechRecognition error:', e.error);
      };
      recognition.start();
    }

    els.status.textContent = 'Recording…';
  }

  function stopRecording(){
    if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop();
    if(recognition){
      try { recognition.stop(); } catch(e){ /* already stopped */ }
      recognition = null;
    }
  }

  function pickMime(){
    const prefs = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
    for(const m of prefs){ if(MediaRecorder.isTypeSupported(m)) return m; }
    return '';
  }

  async function handleRecordingStop(){
    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    els.playback.src = url;

    const arrBuf = await blob.arrayBuffer();
    const audioCtxTmp = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtxTmp.decodeAudioData(arrBuf);
    const ch0 = decoded.getChannelData(0);
    const dur = decoded.duration;

    // --- Mean features ---
    const meanRMS = Math.sqrt(ch0.reduce((s,v)=>s+v*v,0)/ch0.length);
    const meanF0 = estimateF0(ch0.subarray(0, Math.min(ch0.length, 44100*2)), decoded.sampleRate);

    // --- Frame-wise series -> CVs ---
    const frameWinSec = 0.030; // 30 ms
    const hopSec = 0.015;      // 15 ms
    const frameWin = Math.max(64, Math.floor(decoded.sampleRate * frameWinSec));
    const hop = Math.max(32, Math.floor(decoded.sampleRate * hopSec));

    const { rmsSeries, f0Series } = seriesFromFrames(ch0, decoded.sampleRate, frameWin, hop);
    const rmsCV = coeffVar(rmsSeries);
    const f0CV  = coeffVar(f0Series);

    // --- WER / Accuracy ---
    const referenceText = SENTENCES[state.iTask];
    let werResult = null;
    if(currentTranscript.length > 0){
      werResult = computeWER(referenceText, currentTranscript, true); // Use fuzzy matching
    }

    // --- Scoring: blend acoustic CVs + Accuracy ---
    const sRMS = cvToScore(rmsCV, [0.45, 0.60, 0.75, 0.90, 1.10, 1.35]);
    const sF0  = cvToScore(f0CV,  [0.20, 0.30, 0.40, 0.55, 0.70, 0.90]);
    const sWER = werResult ? werToScore(werResult.wer) : null;
    const sAcc = werResult ? accuracyToScore(werResult.accuracyPct || 0) : null;

    let score06;
    if(sWER !== null && sAcc !== null){
      // Use average of WER score and Accuracy score
      score06 = Math.round((sRMS + sF0 + sWER + sAcc) / 4);
    } else if(sWER !== null){
      score06 = Math.round((sRMS + sF0 + sWER) / 3);
    } else {
      score06 = Math.round((sRMS + sF0) / 2);
    }

    const meta = currentMeta();
    const rec = {
      task: TASKS[state.iTask].key,
      taskTitle: TASKS[state.iTask].title,
      rep: state.iRep+1,
      text: referenceText,
      transcript: currentTranscript || null,
      duration: dur,
      blob, url,
      features: {
        meanRMS, meanF0: meanF0||null,
        rmsCV: isFinite(rmsCV)?rmsCV:null,
        f0CV:  isFinite(f0CV)?f0CV:null,
        wer: werResult?.wer ?? null,
        werSubs: werResult?.sub ?? null,
        werDels: werResult?.del ?? null,
        werIns: werResult?.ins ?? null,
        correctWords: werResult?.correctWords ?? null,
        refLen: werResult?.refLen ?? null,
        accuracyPct: werResult?.accuracyPct ?? null,
        score06,
        sampleRate: decoded.sampleRate,
        ...meta
      }
    };
    results.push(rec);
    appendRow(results.length-1);
    updateExportsEnabled();
    els.status.textContent = 'Segment saved';
  }

  // Frame → series helpers
  function seriesFromFrames(x, sr, win, hop){
    const n = x.length;
    const rmsSeries = [];
    const f0Series = [];
    for(let start=0; start+win<=n; start+=hop){
      const frame = x.subarray(start, start+win);
      // RMS
      const rms = Math.sqrt(frame.reduce((s,v)=>s+v*v,0)/frame.length);
      rmsSeries.push(rms);
      // F0 (skip very quiet frames to reduce pitch errors)
      if(rms > 0.02){
        const f0 = estimateF0(frame, sr);
        if(f0 && isFinite(f0) && f0 > 60 && f0 < 400) f0Series.push(f0);
      }
    }
    return { rmsSeries, f0Series };
  }

  function coeffVar(arr){
    const a = (arr||[]).filter(v=>isFinite(v) && v>0);
    if(a.length < 10) return NaN;
    const mean = a.reduce((s,v)=>s+v,0)/a.length;
    if(mean===0) return NaN;
    const variance = a.reduce((s,v)=>s+(v-mean)*(v-mean),0)/a.length;
    const sd = Math.sqrt(variance);
    return sd/mean;
  }

  function cvToScore(cv, thresholds){
    if(!isFinite(cv)) return 6;
    for(let i=0;i<thresholds.length;i++){
      if(cv <= thresholds[i]) return i;
    }
    return 6;
  }

  function appendRow(idx){
    const r = results[idx];
    const f = r.features;
    const tr = document.createElement('tr');
    const dl = document.createElement('a');
    dl.textContent = 'AUDIO'; dl.href = r.url; dl.download = `${f.participant}_${r.task}.webm`;

    tr.innerHTML =
      `<td>${idx+1}</td>`+
      `<td>${r.taskTitle}</td>`+
      `<td>${r.duration.toFixed(2)}</td>`+
      `<td>${num(f.meanRMS,3)}</td>`+
      `<td>${num(f.rmsCV,3)}</td>`+
      `<td>${num(f.meanF0,1,true)}</td>`+
      `<td>${num(f.f0CV,3)}</td>`+
      `<td>${f.wer != null ? (f.wer * 100).toFixed(1) + '%' : '—'}</td>`+
      `<td>${f.correctWords != null ? f.correctWords + '/' + f.refLen : '—'}</td>`+
      `<td><b>${f.score06}</b></td>`;
    const td = document.createElement('td'); td.appendChild(dl); tr.appendChild(td);
    els.rows.appendChild(tr);
  }

  function num(v, digits=3, dash=false){
    if(v==null || !isFinite(v)) return dash?'—':'';
    return Number(v).toFixed(digits);
  }

  function updateExportsEnabled(){
    const has = results.length>0;
    els.btnCSV.disabled = !has; els.btnJSON.disabled = !has; els.btnClear.disabled = !has;
  }

  function currentMeta(){
    return {
      participant: els.pid.value || 'NA',
      session: els.sid.value || 'S1',
      micDistanceCM: Number(els.micdist.value||0),
      recordedAt: new Date().toISOString(),
      deviceCaps: els.caps.textContent,
    };
  }

  // ------------------------------
  // Test flow
  // ------------------------------
  function setInstruction(text){ els.instr.textContent = text; }

  function beginTest(){
    state.running = true; state.iTask = 0; state.iRep = 0;
    els.status.textContent = 'Ready';
    stepUI();
  }

  function stepUI(){
    if(!state.running){ setInstruction('Test was stopped.'); return; }
    const T = TASKS[state.iTask];
    setInstruction(`▶ ${T.title} · ${T.prompt}`);
    els.btnRecord.disabled = false; els.btnDone.disabled = true;
  }

  function afterSegment(){
    const T = TASKS[state.iTask];
    state.iRep++;
    if(state.iRep < T.repeat){
      setInstruction(`Rest, then repeat. When ready, press "Start Recording".`);
      els.btnRecord.disabled = false; els.btnDone.disabled = true;
    } else {
      state.iTask++;
      state.iRep = 0;
      if(state.iTask >= TASKS.length){
        finishTest();
      } else {
        stepUI();
      }
    }
  }

  function finishTest(){
    state.running = false;
    setInstruction('All tests are complete. Please export CSV/JSON.');
    els.status.textContent = 'Done';
    els.btnRecord.disabled = true; els.btnDone.disabled = true;
  }

  // ------------------------------
  // Exports
  // ------------------------------
  function saveText(name, text){
    const blob = new Blob([text], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  }

  function exportCSV(){
    const header = [
      'participant','session','test','duration_s',
      'mean_rms','rms_cv','mean_f0_hz','f0_cv',
      'wer','wer_subs','wer_dels','wer_ins',
      'correct_words','total_words','accuracy_pct',
      'score_0_6',
      'sample_rate','mic_cm','recorded_at','device_caps',
      'reference_text','transcript'
    ];
    const lines = [header.join(',')];
    for(const r of results){
      const f = r.features;
      lines.push([
        f.participant,
        f.session,
        r.taskTitle,
        r.duration.toFixed(3),
        f.meanRMS?.toFixed(6) ?? '',
        isFinite(f.rmsCV)?f.rmsCV.toFixed(6):'',
        f.meanF0!=null && isFinite(f.meanF0)?f.meanF0.toFixed(2):'',
        isFinite(f.f0CV)?f.f0CV.toFixed(6):'',
        f.wer != null ? f.wer.toFixed(4) : '',
        f.werSubs ?? '',
        f.werDels ?? '',
        f.werIns ?? '',
        f.correctWords ?? '',
        f.refLen ?? '',
        f.accuracyPct != null ? f.accuracyPct.toFixed(1) : '',
        f.score06 ?? '',
        f.sampleRate ?? '',
        f.micDistanceCM ?? '',
        f.recordedAt ?? '',
        JSON.stringify(f.deviceCaps||''),
        '"' + (r.text.replaceAll('"','\"')) + '"',
        '"' + ((r.transcript||'').replaceAll('"','\"')) + '"'
      ].join(','));
    }
    saveText(`${(results[0]?.features.participant||'session')}_speech_reading.csv`, lines.join('\n'));
  }

  function exportJSON(){
    const out = results.map(({taskTitle,duration,features,text,transcript})=>({test:taskTitle,duration,features,text,transcript}));
    saveText(`${(results[0]?.features.participant||'session')}_speech_reading.json`, JSON.stringify(out,null,2));
  }

  function clearAll(){
    results.splice(0,results.length);
    els.rows.innerHTML='';
    updateExportsEnabled();
    els.playback.removeAttribute('src');
  }

  // ------------------------------
  // Capability probe
  // ------------------------------
  async function probeCaps(){
    const devices = await navigator.mediaDevices.enumerateDevices();
    const micNames = devices.filter(d=>d.kind==='audioinput').map(d=>d.label||'Mic');
    els.caps.textContent = `${micNames[0]||'Mic'} · noiseSuppression:on · echoCancellation:on`;
  }

  // ------------------------------
  // Bindings
  // ------------------------------
  els.btnPerm.onclick = async()=>{ await ensureMic(); await probeCaps(); };
  els.btnStart.onclick = async()=>{ await ensureMic(); await probeCaps(); beginTest(); };
  els.btnStop.onclick = ()=>{ state.running=false; finishTest(); };

  let countdownTimer=null; let countdownLeft=0;
  els.btnRecord.onclick = ()=>{
    if(!state.running) return;
    const T = TASKS[state.iTask];
    els.btnRecord.disabled = true; els.btnDone.disabled = true;
    startRecording();
    startCountdown(T.seconds, ()=>{
      stopRecording();
      els.btnDone.disabled = false;
    });
  };
  els.btnDone.onclick = ()=>{ els.btnDone.disabled = true; afterSegment(); };

  function startCountdown(seconds, onElapsed){
    countdownLeft = seconds;
    const label = (s)=>`Recording… ${s}s left`;
    els.status.textContent = label(countdownLeft);
    if(countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(()=>{
      countdownLeft--;
      els.status.textContent = label(countdownLeft);
      if(countdownLeft<=0){ clearInterval(countdownTimer); onElapsed && onElapsed(); }
    },1000);
  }

  // ------------------------------
  // Hook up exports & clear
  // ------------------------------
  els.btnCSV.onclick = exportCSV;
  els.btnJSON.onclick = exportJSON;
  els.btnClear.onclick = clearAll;

})();