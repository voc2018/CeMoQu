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
  // Recording pipeline
  // ------------------------------
  function startRecording(){
    chunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: pickMime() });
    mediaRecorder.ondataavailable = e => { if(e.data && e.data.size>0) chunks.push(e.data); };
    mediaRecorder.onstop = () => { handleRecordingStop(); };
    mediaRecorder.start();
    els.status.textContent = 'Recording…';
  }
  function stopRecording(){ mediaRecorder && mediaRecorder.state==='recording' && mediaRecorder.stop(); }
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

    // --- Mean features (legacy)
    const meanRMS = Math.sqrt(ch0.reduce((s,v)=>s+v*v,0)/ch0.length);
    const meanF0 = estimateF0(ch0.subarray(0, Math.min(ch0.length, 44100*2)), decoded.sampleRate);

    // --- NEW: frame-wise series -> CVs
    const frameWinSec = 0.030; // 30 ms
    const hopSec = 0.015;      // 15 ms
    const frameWin = Math.max(64, Math.floor(decoded.sampleRate * frameWinSec));
    const hop = Math.max(32, Math.floor(decoded.sampleRate * hopSec));

    const { rmsSeries, f0Series } = seriesFromFrames(ch0, decoded.sampleRate, frameWin, hop);
    const rmsCV = coeffVar(rmsSeries); // unitless
    const f0CV  = coeffVar(f0Series);  // unitless (Hz scale)

    // --- CV-only scoring (0–6)
    // Heuristic thresholds (adjust as you calibrate):
    //   RMS CV: [<=0.20, <=0.30, <=0.40, <=0.55, <=0.75, <=1.00, >1.00]
    //   F0  CV: [<=0.08, <=0.12, <=0.18, <=0.25, <=0.35, <=0.50, >0.50]
    const sRMS = cvToScore(rmsCV, [0.20, 0.30, 0.40, 0.55, 0.75, 1.00]);
    const sF0  = cvToScore(f0CV,  [0.08, 0.12, 0.18, 0.25, 0.35, 0.50]);
    const score06 = Math.round((sRMS + sF0) / 2);

    const meta = currentMeta();
    const rec = {
      task: TASKS[state.iTask].key,
      taskTitle: TASKS[state.iTask].title,
      rep: state.iRep+1,
      text: SENTENCES[state.iTask],
      duration: dur,
      blob, url,
      features: {
        meanRMS, meanF0: meanF0||null,
        rmsCV: isFinite(rmsCV)?rmsCV:null,
        f0CV:  isFinite(f0CV)?f0CV:null,
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
      if(rms > 0.005){
        const f0 = estimateF0(frame, sr);
        if(f0 && isFinite(f0)) f0Series.push(f0);
      }
    }
    return { rmsSeries, f0Series };
  }

  function coeffVar(arr){
    const a = (arr||[]).filter(v=>isFinite(v) && v>0);
    if(a.length===0) return NaN;
    const mean = a.reduce((s,v)=>s+v,0)/a.length;
    if(mean===0) return NaN;
    const variance = a.reduce((s,v)=>s+(v-mean)*(v-mean),0)/a.length;
    const sd = Math.sqrt(variance);
    return sd/mean;
  }

  function cvToScore(cv, thresholds){
    // thresholds length = 6, returns 0..6
    if(!isFinite(cv)) return 6; // if undefined, treat as worst
    for(let i=0;i<thresholds.length;i++){
      if(cv <= thresholds[i]) return i; // 0..5
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
      setInstruction(`Rest, then repeat. When ready, press “Start Recording”.`);
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
      'mean_rms','rms_cv','mean_f0_hz','f0_cv','score_0_6',
      'sample_rate','mic_cm','recorded_at','device_caps','text'
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
        f.score06 ?? '',
        f.sampleRate ?? '',
        f.micDistanceCM ?? '',
        f.recordedAt ?? '',
        JSON.stringify(f.deviceCaps||''),
        '"' + (r.text.replaceAll('"','\"')) + '"'
      ].join(','));
    }
    saveText(`${(results[0]?.features.participant||'session')}_speech_reading.csv`, lines.join('\n'));
  }

  function exportJSON(){
    const out = results.map(({taskTitle,duration,features,text})=>({test:taskTitle,duration,features,text}));
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
