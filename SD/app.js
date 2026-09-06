(() => {
  'use strict';

  const PROTOCOL_VERSION = 'sd-protocol-v2';
  const PASSAGES = [
    { id: 'cemq-climb-v1', version: '1.0', title: 'The Climb',
      text: 'Every step up the steep trail tested her legs, but she kept a steady breath and pushed forward without slowing down. When her knees ached and the cold wind pushed against her chest, she remembered why she had started and pressed on anyway. At the top, the whole valley opened below her, bright and wide, and she finally understood that real strength grows exactly where doubt used to live.' },
    { id: 'cemq-oneshot-v1', version: '1.0', title: 'One More Shot',
      text: 'He missed the shot twice while the crowd fell quiet, and for a moment he thought about walking away for good. Instead, he picked up the ball, shook off the doubt, and took one more try with steady, patient hands. The ball spun through the evening air and dropped clean through the hoop, and the whole gym erupted with sound and joy.' },
    { id: 'cemq-sunrise-v1', version: '1.0', title: 'Before Sunrise',
      text: 'Every morning before sunrise, the young runner laced her shoes and stepped out into the cold, quiet street. Some mornings her legs felt heavy and her breath came in short, sharp bursts, but she never once turned back toward home. Months later, standing at the finish line with both arms raised high, she knew that every early morning had been a treasure.' }
  ];
  function pickPassage(){return PASSAGES[Math.floor(Math.random()*PASSAGES.length)]}
  const METRIC_CAVEATS = {
    wordsPerMinute: 'Recognized-word count comes from browser ASR, not a direct timing measurement — inherits ASR accuracy limits.',
    articulationRateWpm: 'Recognized-word count comes from browser ASR, not a direct timing measurement — inherits ASR accuracy limits.',
    wer: 'Alignment math is standard, but the transcript it runs on comes from browser ASR, which is tuned for fluent speech and may register unclear speech as errors it did not correctly interpret rather than errors the speaker made.',
    meanF0Hz: 'Basic autocorrelation pitch estimate. Frames much quieter than the loudest part of the recording are excluded (unreliable pitch tracking at low SNR), and remaining outliers close to double/half the median are corrected; unresolved outliers are dropped. Still approximate — not a substitute for clinical pitch analysis.',
    medianF0Hz: 'Basic autocorrelation pitch estimate, computed after excluding low-loudness frames and correcting likely octave errors; treat as approximate.',
    f0Cv: 'Basic autocorrelation pitch estimate. Frames much quieter than the loudest part of the recording are excluded, and remaining outliers close to double/half the median are corrected rather than left to inflate this value; unresolved outliers are dropped. Still an approximate, browser-derived measure.',
    syllablesPerSecond: 'Rate computed only over time judged "active" — excludes pauses entirely, so frequent or long pauses do not lower this number. Estimated from amplitude-envelope peaks, not verified syllable boundaries.',
    overallSyllablesPerSecond: 'Rate computed over the full recording including pauses (classic DDK-rate method). Long or frequent pauses lower this number, unlike the active-only rate above — pausing/breakdown is itself a recognized feature of ataxic dysarthria ("scanning speech"), not just noise to exclude.',
    interOnsetCv: 'Estimated from amplitude-envelope peaks, not verified syllable boundaries — background noise or weak articulation can shift the count.',
    pauseRatio: 'Share of the recording with no detected speech. In this task, high values may reflect genuine speech-timing breakdown rather than a recording problem.'
  };
  const PROVISIONAL_SCORING_CONFIG = {
    version: 'sd-provisional-v1.8', clinicallyValidated: false,
    label: 'Engineering placeholder thresholds pending clinical calibration',
    weights: { reading: 0.50, pataka: 0.40, vowel: 0.10 },
    reading: {
      metrics: { wer: { classification: 'scoring', contribution: 0.8 }, speechRateWpm: { classification: 'scoring', contribution: 0.2 }, pauses: { classification: 'exploratory' } },
      thresholds: { wer: [0.05, 0.15, 0.28, 0.42, 0.60, 0.80], speechRateWpm: [150, 125, 100, 75, 50, 25] },
      qualityRequirements: { asrRequired: true, minActiveSeconds: 5, minDetectionConfidence: 0.45 }
    },
    pataka: {
      metrics: { overallSyllablesPerSecond: { classification: 'scoring', contribution: 0.40 }, interOnsetCv: { classification: 'scoring', contribution: 0.30 }, pauseRatio: { classification: 'scoring', contribution: 0.30 }, syllablesPerSecond: { classification: 'exploratory' }, detectedEvents: { classification: 'exploratory' } },
      thresholds: { overallSyllablesPerSecond: [6.0, 5.2, 4.4, 3.6, 2.8, 2.0], interOnsetCv: [0.10, 0.16, 0.23, 0.32, 0.44, 0.60], pauseRatio: [0.15, 0.25, 0.35, 0.50, 0.65, 0.80] },
      qualityRequirements: { minEvents: 6, minDetectionConfidence: 0.45 }
    },
    vowel: {
      metrics: { validPhonationSeconds: { classification: 'scoring', contribution: 0.45 }, f0Cv: { classification: 'scoring', contribution: 0.35 }, phonationDropoutCount: { classification: 'scoring', contribution: 0.20 }, meanF0: { classification: 'exploratory' } },
      thresholds: { validPhonationSeconds: [4.5, 4.0, 3.4, 2.8, 2.0, 1.0], f0Cv: [0.025, 0.045, 0.070, 0.105, 0.16, 0.24], phonationDropoutCount: [0, 1, 2, 3, 5, 8] },
      qualityRequirements: { minVoicedFramePct: 25, minDetectionConfidence: 0.45 }
    }
  };
  window.PROVISIONAL_SCORING_CONFIG = PROVISIONAL_SCORING_CONFIG;

  const TASKS = [
    { key: 'vowel', name: 'Sustained vowel', short: 'AH', seconds: 5, instruction: 'Take a comfortable breath and sustain “ah” at your normal pitch and loudness until the recording stops.' },
    { key: 'pataka', name: 'Pa-ta-ka repetition', short: 'PA · TA · KA', seconds: 10, instruction: 'Repeat “pa-ta-ka” as quickly and evenly as you can until the recording stops.' },
    { key: 'reading', name: 'Standard reading passage', short: PASSAGES[0].text, seconds: 30, instruction: 'Read the passage aloud at your normal pace. Speak as naturally and clearly as you can.' }
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    topStatus: $('topStatus'), progressFill: $('progressFill'), stepLabel: $('stepLabel'), timeChip: $('timeChip'), timeText: $('timeText'),
    micTestBtn: $('micTestBtn'), startTestBtn: $('startTestBtn'), stopTestBtn: $('stopTestBtn'), submitDataBtn: $('submitDataBtn'), exportCsvTopBtn: $('exportCsvTopBtn'), toolbarMessage: $('toolbarMessage'),
    setupStage: $('setupStage'), taskStage: $('taskStage'), processingStage: $('processingStage'), reviewStage: $('reviewStage'), resultsStage: $('resultsStage'),
    micState: $('micState'), levelState: $('levelState'), noiseState: $('noiseState'), checkMicBtn: $('checkMicBtn'), micSelect: $('micSelect'), sideMeter: $('sideMeter'), micGuidance: $('micGuidance'),
    taskName: $('taskName'), taskInstruction: $('taskInstruction'), stimulus: $('stimulus'), countdown: $('countdown'), waveCanvas: $('waveCanvas'), levelFill: $('levelFill'), recordBtn: $('recordBtn'), finishBtn: $('finishBtn'),
    playback: $('playback'), reviewTitle: $('reviewTitle'), reviewMessage: $('reviewMessage'), reviewQuality: $('reviewQuality'), rerecordBtn: $('rerecordBtn'), acceptBtn: $('acceptBtn'),
    setupPanel: $('setupPanel'), summaryPanel: $('summaryPanel'), taskList: $('taskList'),
    estimatedScore: $('estimatedScore'), componentGrid: $('componentGrid'), calculationLine: $('calculationLine'), overallWarning: $('overallWarning'), restartBtn: $('restartBtn'), sideScore: $('sideScore'), summaryList: $('summaryList'),
    showScoringBtn: $('showScoringBtn'), scoringDetails: $('scoringDetails'), metricDetails: $('metricDetails'), audioDownloads: $('audioDownloads'),
    taskResultStage: $('taskResultStage'), taskResultName: $('taskResultName'), taskResultScore: $('taskResultScore'), taskResultExplain: $('taskResultExplain'), taskResultHint: $('taskResultHint'), viewFinalResultsBtn: $('viewFinalResultsBtn'),
    weightBar: $('weightBar'), wHandle1: $('wHandle1'), wHandle2: $('wHandle2'), wLabelReading: $('wLabelReading'), wLabelPataka: $('wLabelPataka'), wLabelVowel: $('wLabelVowel'),
    clinicianScore: $('clinicianScore'), researchNotes: $('researchNotes'), soundCue: $('soundCue'), language: $('language'), micDistance: $('micDistance')
  };

  const model = {
    state: 'idle', taskIndex: 0, attemptNumber: { vowel: 0, pataka: 0, reading: 0 }, attempts: [], accepted: {}, result: null,
    stream: null, audioContext: null, source: null, analyser: null, monitorFrame: null, recorder: null, chunks: [], stopTimer: null, clockTimer: null,
    recordStartedAt: 0, currentUrl: null, recognition: null, transcript: '', asrStatus: 'not_started', actualSettings: {}, micCheck: null, cueOscillator: null
  };
  const transitions = {
    idle: ['checking', 'ready', 'error'], checking: ['ready', 'idle', 'error'], ready: ['countdown', 'idle', 'error'], countdown: ['recording', 'ready', 'error'],
    recording: ['processing', 'ready', 'error'], processing: ['review', 'ready', 'error'], review: ['ready', 'accepted', 'error'], accepted: ['ready', 'completed'], completed: ['idle'], error: ['idle', 'checking', 'ready']
  };

  function setState(next) {
    if (model.state !== next && !(transitions[model.state] || []).includes(next)) throw new Error(`Invalid state transition: ${model.state} → ${next}`);
    model.state = next;
    const label = { idle: 'Not started', checking: 'Checking microphone', ready: 'Ready', countdown: 'Get ready', recording: 'Recording', processing: 'Processing', review: 'Review recording', accepted: 'Accepted', completed: 'Complete', error: 'Needs attention' }[next];
    els.topStatus.lastElementChild.textContent = label;
    els.topStatus.classList.toggle('recording', next === 'recording');
    renderTaskList();
    lockActions(['countdown', 'recording', 'processing'].includes(next));
  }
  function lockActions(locked) { document.querySelectorAll('.side-tab').forEach(b => { b.disabled = locked; }); }
  function showStage(stage) { ['setupStage','taskStage','processingStage','reviewStage','taskResultStage','resultsStage'].forEach(k => els[k].classList.toggle('active', els[k] === stage)); }
  function progress(percent) { els.progressFill.style.width = `${percent}%`; }

  async function requestMicrophone() {
    releaseMedia();
    const deviceId = els.micSelect.value;
    const requested = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1, sampleRate: { ideal: 48000 } };
    if (deviceId) requested.deviceId = { exact: deviceId };
    model.stream = await navigator.mediaDevices.getUserMedia({ audio: requested });
    const track = model.stream.getAudioTracks()[0];
    model.actualSettings = track.getSettings ? track.getSettings() : {};
    model.requestedConstraints = requested;
    model.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await model.audioContext.resume();
    model.source = model.audioContext.createMediaStreamSource(model.stream);
    model.analyser = model.audioContext.createAnalyser(); model.analyser.fftSize = 2048; model.analyser.smoothingTimeConstant = .72;
    model.source.connect(model.analyser); startMonitor(); await populateDevices(); return model.stream;
  }
  async function populateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const current = els.micSelect.value; const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    els.micSelect.innerHTML = '<option value="">Default microphone</option>' + devices.map((d,i) => `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(d.label || `Microphone ${i+1}`)}</option>`).join('');
    if ([...els.micSelect.options].some(o => o.value === current)) els.micSelect.value = current;
  }
  function startMonitor() {
    cancelAnimationFrame(model.monitorFrame); const data = new Float32Array(model.analyser.fftSize); const ctx = els.waveCanvas.getContext('2d');
    const loop = () => { if (!model.analyser) return; model.analyser.getFloatTimeDomainData(data); const rms = Math.sqrt(data.reduce((s,v) => s + v*v, 0) / data.length); const peak = data.reduce((m,v) => Math.max(m, Math.abs(v)), 0); const pct = Math.min(100, Math.sqrt(rms) * 150); els.levelFill.style.width = `${pct}%`; els.sideMeter.style.width = `${pct}%`; drawWave(ctx, data, peak); model.lastRms = rms; model.lastPeak = peak; model.monitorFrame = requestAnimationFrame(loop); }; loop();
  }
  function drawWave(ctx, data, peak) { const { width:w,height:h } = ctx.canvas; ctx.clearRect(0,0,w,h); ctx.strokeStyle = peak > .98 ? '#ef4444' : '#21c1fb'; ctx.lineWidth = 2; ctx.beginPath(); for(let i=0;i<data.length;i++){ const x=i/(data.length-1)*w,y=h/2+clamp(data[i]*1.6,-.48,.48)*h; i?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.stroke(); ctx.strokeStyle='#244050';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke(); }

  async function checkMicrophone() {
    if (model.state === 'checking') return; setState('checking'); els.checkMicBtn.disabled = true; els.micTestBtn.disabled = true; els.micGuidance.textContent = 'Stay quiet briefly, then say a few words at your normal level.';
    try {
      await requestMicrophone(); const noise=[]; const signal=[]; for(let i=0;i<30;i++){ await wait(100); (i<10?noise:signal).push(model.lastRms||0); }
      const noiseRms = mean(noise), signalRms = Math.max(...signal), peak = model.lastPeak || 0;
      const flags=[]; if(signalRms < .008) flags.push('too_quiet'); if(peak > .98) flags.push('clipping'); if(noiseRms > .035) flags.push('background_noise');
      model.micCheck = { timestamp: new Date().toISOString(), noiseRms, maxSignalRms: signalRms, peak, flags, passed: signalRms >= .008 && peak <= .98 };
      els.micState.textContent='Ready';els.micState.className='good';els.levelState.textContent=signalRms<.008?'Too quiet':peak>.98?'Clipping':'Good';els.levelState.className=flags.length?'warn':'good';els.noiseState.textContent=noiseRms>.035?'High':'Acceptable';els.noiseState.className=noiseRms>.035?'warn':'good';
      els.micGuidance.textContent = flags.length ? `Check complete: ${flags.map(pretty).join(', ')}. You may retry or continue.` : 'Microphone level is suitable. You can begin.';
      els.startTestBtn.disabled = false; setState('ready');
    } catch (error) { setState('error'); els.micState.textContent='Unavailable';els.micState.className='warn';els.micGuidance.textContent=`Microphone access failed: ${error.message}`; els.startTestBtn.disabled=true; }
    finally { els.checkMicBtn.disabled=false; els.checkMicBtn.textContent='Check Again'; els.micTestBtn.disabled=false; }
  }

  function startTask(key) {
    if (!model.micCheck || model.state !== 'ready') return;
    const idx = TASKS.findIndex(t => t.key === key);
    if (idx < 0) return;
    model.taskIndex = idx;
    els.micTestBtn.disabled = true; els.stopTestBtn.disabled = false; els.toolbarMessage.textContent = '';
    loadTask();
  }
  function startFirstIncompleteTask() {
    if (Object.keys(model.accepted).length >= 3) { restart(); if (model.micCheck) startTask(TASKS[0].key); return; }
    const next = TASKS.find(t => !model.accepted[t.key]);
    if (next) startTask(next.key);
  }
  function loadTask() {
    const task=TASKS[model.taskIndex]; showStage(els.taskStage); setState('ready'); els.stepLabel.textContent=`TASK ${model.taskIndex+1} OF 3 · ${task.name.toUpperCase()}`; els.taskName.textContent=task.name;els.taskInstruction.textContent=task.instruction;
    if(task.key==='reading'){model.currentPassage=pickPassage();els.stimulus.textContent=model.currentPassage.text}else{els.stimulus.textContent=task.short}
    els.stimulus.classList.toggle('passage',task.key==='reading');els.recordBtn.hidden=false;els.recordBtn.disabled=false;els.recordBtn.textContent='Start Recording';els.finishBtn.hidden=true;els.timeChip.hidden=true;progress(12+model.taskIndex*24);
  }
  async function countdownAndRecord() {
    if(model.state==='error')setState('ready');if(model.state!=='ready')return;setState('countdown');els.recordBtn.disabled=true;els.countdown.hidden=false;
    try{for(const token of ['3','2','1','Go']){els.countdown.textContent=token;if(els.soundCue.value==='on')beep(token==='Go'?760:520,token==='Go'?180:90);await wait(token==='Go'?350:1000)}els.countdown.hidden=true;await startRecording()}catch(error){els.countdown.hidden=true;fail(error)}
  }
  function beep(freq,duration){ stopCue(); try{const ctx=model.audioContext,osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=freq;gain.gain.value=.05;osc.connect(gain);gain.connect(ctx.destination);osc.start();model.cueOscillator=osc;setTimeout(()=>{try{osc.stop();}catch{}if(model.cueOscillator===osc)model.cueOscillator=null;},duration);}catch{} }
  function stopCue(){if(model.cueOscillator){try{model.cueOscillator.stop();}catch{}model.cueOscillator=null;}}
  function chooseMime(){ return ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'].find(t=>window.MediaRecorder?.isTypeSupported?.(t))||''; }
  async function startRecording() {
    if(!model.stream)await requestMicrophone(); const task=TASKS[model.taskIndex];model.chunks=[];model.transcript='';model.asrStatus=task.key==='reading'?'starting':'not_applicable';
    const mime=chooseMime();model.recorder=new MediaRecorder(model.stream,mime?{mimeType:mime,audioBitsPerSecond:128000}:undefined);model.recorder.ondataavailable=e=>{if(e.data.size)model.chunks.push(e.data)};model.recorder.onerror=e=>fail(e.error||new Error('Recorder error'));model.recorder.onstop=processRecording;
    if(task.key==='reading')startRecognition();model.recordStartedAt=performance.now();model.recorder.start(250);setState('recording');els.timeChip.hidden=false;els.finishBtn.hidden=task.key!=='reading';els.recordBtn.hidden=true;
    updateClock(task.seconds);
  }
  function updateClock(maxSeconds){clearInterval(model.clockTimer);model.autoStopped=false;model.taskMaxSeconds=maxSeconds;const tick=()=>{const elapsed=(performance.now()-model.recordStartedAt)/1000,remaining=Math.max(0,maxSeconds-elapsed);els.timeText.textContent=`00:${String(Math.ceil(remaining)).padStart(2,'0')}`;if(elapsed>=maxSeconds&&!model.autoStopped&&model.state==='recording'){model.autoStopped=true;stopRecording()}};tick();model.clockTimer=setInterval(tick,100)}
  function stopRecording(){if(model.state!=='recording')return;clearTimeout(model.stopTimer);clearInterval(model.clockTimer);stopRecognition();setState('processing');showStage(els.processingStage);els.stepLabel.textContent='PROCESSING';els.timeChip.hidden=true;els.finishBtn.hidden=true;try{if(model.recorder?.state!=='inactive')model.recorder.stop();else processRecording();}catch(error){fail(error)}}
  function startRecognition(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){model.asrStatus='unavailable';return}try{const rec=new SR();rec.continuous=true;rec.interimResults=true;rec.lang=els.language.value;rec.onresult=e=>{let heard='';for(let i=0;i<e.results.length;i++)heard+=`${e.results[i][0].transcript} `;model.transcript=heard.trim()};rec.onerror=e=>{model.asrStatus=`error_${e.error}`};rec.onend=()=>{if(model.asrStatus==='listening')model.asrStatus=model.transcript?'complete':'no_result'};rec.start();model.recognition=rec;model.asrStatus='listening'}catch(e){model.asrStatus='error_start'}}
  function stopRecognition(){if(model.recognition){try{model.recognition.stop()}catch{}model.recognition=null}if(model.asrStatus==='listening')model.asrStatus=model.transcript?'complete':'no_result'}

  async function processRecording() {
    try {
      const task=TASKS[model.taskIndex], duration=(performance.now()-model.recordStartedAt)/1000, blob=new Blob(model.chunks,{type:model.recorder?.mimeType||model.chunks[0]?.type||'audio/webm'});
      const decoded=await decodeBlob(blob);const base=analyzeSignal(decoded,duration,model.micCheck?.noiseRms);let specific={};if(task.key==='vowel')specific=analyzeVowel(base);if(task.key==='pataka')specific=analyzePataka(base);if(task.key==='reading')specific=analyzeReading(base,model.transcript,model.asrStatus,model.currentPassage);
      const metrics={...base.summary,...specific.metrics};const quality={...base.quality,...specific.quality};const scoring=scoreTask(task.key,metrics,quality);
      model.attemptNumber[task.key]++;const attempt={trialId:crypto.randomUUID?.()||`${Date.now()}-${task.key}`,task:task.key,taskName:task.name,attemptNumber:model.attemptNumber[task.key],accepted:false,timestamp:new Date().toISOString(),durationSeconds:duration,blob,mimeType:blob.type,codec:blob.type.includes('opus')?'Opus':'browser-selected',sampleRate:decoded.sampleRate,channelCount:decoded.numberOfChannels,requestedConstraints:model.requestedConstraints,actualSettings:model.actualSettings,browser:navigator.userAgent,microphoneDistanceCm:Number(els.micDistance.value)||null,testLanguage:els.language.value,metrics,quality,scoring,transcript:task.key==='reading'?model.transcript:null,asrStatus:task.key==='reading'?model.asrStatus:'not_applicable',passage:task.key==='reading'?model.currentPassage:null,detection:specific.detection||base.detection};
      model.attempts.push(attempt);model.currentAttempt=attempt;showReview(attempt);setState('review');
    } catch(error){fail(error)}
  }
  async function decodeBlob(blob){const buffer=await blob.arrayBuffer();const temp=new (window.AudioContext||window.webkitAudioContext)();try{return await temp.decodeAudioData(buffer.slice(0))}finally{await temp.close()}}
  function analyzeSignal(audioBuffer,duration,ambientNoiseRms){const channel=audioBuffer.getChannelData(0),sr=audioBuffer.sampleRate,frame=Math.max(256,Math.round(sr*.02)),hop=Math.round(frame/2),rms=[],peaks=[];for(let i=0;i+frame<=channel.length;i+=hop){let sum=0,peak=0;for(let j=0;j<frame;j++){const v=channel[i+j];sum+=v*v;peak=Math.max(peak,Math.abs(v))}rms.push(Math.sqrt(sum/frame));peaks.push(peak)}const sorted=[...rms].sort((a,b)=>a-b),percentileNoise=percentile(sorted,.2),hasAmbient=Number.isFinite(ambientNoiseRms),noise=hasAmbient?Math.min(ambientNoiseRms,percentileNoise):percentileNoise,threshold=Math.max(.006,noise*3),active=rms.map(v=>v>threshold),activeFrames=active.filter(Boolean).length,frameSec=hop/sr,segments=segmentsFromMask(active,frameSec,.12),activeDuration=activeFrames*frameSec,silence=Math.max(0,duration-activeDuration),peak=Math.max(0,...peaks),flags=[];if(activeDuration<.4)flags.push('empty_or_invalid');if(mean(rms)<.008)flags.push('too_quiet');if(peak>.98)flags.push('clipping');if(noise>.035)flags.push('background_noise');const confidence=clamp((activeFrames/Math.max(1,rms.length))*1.4+(peak>.02?.25:0)-(flags.includes('clipping')?.15:0),0,1);return{frames:{channel,sr,rms,active,frameSec,threshold,segments},summary:{totalDurationSeconds:round(duration),activeDurationSeconds:round(activeDuration),silenceDurationSeconds:round(silence),detectionThreshold:round(threshold,5),intensityMean:round(mean(rms),5),intensityCv:round(cv(rms),4),peakAmplitude:round(peak,4),pauseCount:Math.max(0,segments.length-1),totalPauseDurationSeconds:round(internalGapDuration(segments)),meanPauseDurationSeconds:round(internalGapDuration(segments)/Math.max(1,segments.length-1)),pauseRatio:round(silence/Math.max(duration,.001),4),detectionConfidence:round(confidence,3)},quality:{flags,valid:!flags.includes('empty_or_invalid'),detectionConfidence:confidence},detection:{method:hasAmbient?'adaptive RMS threshold; noise floor = min(pre-task ambient noise, in-recording 20th-percentile RMS); 20 ms frames, 50% overlap':'adaptive RMS threshold; noise floor = in-recording 20th-percentile RMS (no pre-task ambient measurement available); 20 ms frames, 50% overlap',threshold:round(threshold,5),ambientNoiseRmsUsed:hasAmbient?round(ambientNoiseRms,5):null,segments}}}
  function analyzeVowel(base){const cfg=PROVISIONAL_SCORING_CONFIG.vowel.qualityRequirements;const {channel,sr,active,frameSec}=base.frames;const frame=Math.round(sr*.04),hop=Math.round(sr*.02);const f0=[],f0Rms=[];
    for(let i=0,k=0;i+frame<=channel.length;i+=hop,k++){
      if(!active[Math.min(k,active.length-1)])continue;
      const seg=channel.subarray(i,i+frame);let sum=0;for(let j=0;j<seg.length;j++)sum+=seg[j]*seg[j];const segRms=Math.sqrt(sum/seg.length);
      const hz=estimateF0(seg,sr);if(hz>=60&&hz<=400){f0.push(hz);f0Rms.push(segRms)}
    }
    const voicedPct=f0.length/Math.max(1,Math.floor((channel.length-frame)/hop)+1)*100;
    const loudRef=f0Rms.length?Math.max(...f0Rms):0;
    const confidentF0=loudRef?f0.filter((v,idx)=>f0Rms[idx]>=loudRef*0.3):f0;
    const med=confidentF0.length?percentile([...confidentF0].sort((a,b)=>a-b),.5):0;
    const semitoneTol=Math.pow(2,4/12);
    const octaveCorrected=[];
    confidentF0.forEach(v=>{
      if(!med){octaveCorrected.push(v);return}
      const ratio=v/med;
      if(ratio>1/semitoneTol&&ratio<semitoneTol)octaveCorrected.push(v);
      else if(Math.abs(v*2-med)/med<.15)octaveCorrected.push(v*2);
      else if(Math.abs(v/2-med)/med<.15)octaveCorrected.push(v/2);
    });
    const f0Stable=octaveCorrected.length?octaveCorrected:(confidentF0.length?confidentF0:f0);
    const f0Sorted=[...f0Stable].sort((a,b)=>a-b);
    const toleredSegments=segmentsFromMask(active,frameSec,.3),dropouts=Math.max(0,toleredSegments.length-1),confidence=clamp(base.quality.detectionConfidence*(Math.min(1,f0.length/30)),0,1),flags=[...base.quality.flags];
    if(voicedPct<cfg.minVoicedFramePct)flags.push('low_voicing_confidence');if(confidence<cfg.minDetectionConfidence)flags.push('low_detection_confidence');
    return{metrics:{validPhonationSeconds:base.summary.activeDurationSeconds,voicedFramePercentage:round(voicedPct,1),meanF0Hz:round(mean(f0Sorted),1),medianF0Hz:round(percentile(f0Sorted,.5),1),f0SdHz:round(sd(f0Sorted),1),f0Cv:round(cv(f0Sorted),4),phonationDropoutCount:dropouts},quality:{flags,valid:base.quality.valid&&voicedPct>=cfg.minVoicedFramePct&&confidence>=cfg.minDetectionConfidence,detectionConfidence:confidence},detection:{...base.detection,voicedFrames:f0.length,pitchMethod:'normalized autocorrelation; browser-derived exploratory F0. Frames quieter than 30% of this recording\'s loudest voiced frame are excluded (low-SNR frames are unreliable for pitch tracking); remaining outliers within 4 semitones of the median are kept as-is, values close to double/half the median are octave-corrected, and unresolved outliers are dropped.',dropoutMethod:'gaps under 300ms are bridged as continuous phonation, not counted as separate dropouts'}}}
  function analyzePataka(base){const cfg=PROVISIONAL_SCORING_CONFIG.pataka.qualityRequirements;const env=base.frames.rms,dt=base.frames.frameSec,smooth=movingAverage(env,5),threshold=Math.max(base.frames.threshold*1.35,percentile([...smooth].sort((a,b)=>a-b),.58)),events=[];for(let i=2;i<smooth.length-2;i++){if(smooth[i]>threshold&&smooth[i]>=smooth[i-1]&&smooth[i]>smooth[i+1]&&(!events.length||(i-events.at(-1))*dt>.09))events.push(i)}const intervals=events.slice(1).map((v,i)=>(v-events[i])*dt),cycles=events.length/3,active=Math.max(base.summary.activeDurationSeconds,.001),total=Math.max(base.summary.totalDurationSeconds,.001),confidence=clamp(base.quality.detectionConfidence*Math.min(1,events.length/18),0,1),flags=[...base.quality.flags];if(events.length<cfg.minEvents||confidence<cfg.minDetectionConfidence)flags.push('low_event_detection_confidence');return{metrics:{estimatedSyllableNucleusCount:events.length,estimatedPatakaCycleCount:round(cycles,1),syllablesPerSecond:round(events.length/active,2),overallSyllablesPerSecond:round(events.length/total,2),cyclesPerSecond:round(cycles/active,2),meanInterOnsetIntervalSeconds:round(mean(intervals),3),interOnsetSdSeconds:round(sd(intervals),3),interOnsetCv:round(cv(intervals),3),rhythmIrregularity:round(cv(intervals),3),interruptionCount:base.summary.pauseCount},quality:{flags,valid:base.quality.valid&&events.length>=cfg.minEvents&&confidence>=cfg.minDetectionConfidence,detectionConfidence:confidence},detection:{...base.detection,eventMethod:'local maxima of smoothed amplitude envelope; events are estimates, not verified syllables',eventTimesSeconds:events.map(i=>round(i*dt,3)),eventThreshold:round(threshold,5)}}}
  function analyzeReading(base,transcript,asrStatus,passage){const cfg=PROVISIONAL_SCORING_CONFIG.reading.qualityRequirements;const refWords=tokenize(passage.text);const alignment=(asrStatus==='complete'&&transcript)?alignWords(refWords,tokenize(transcript)):null,recognized=transcript?tokenize(transcript).length:0,active=Math.max(base.summary.activeDurationSeconds,.001),confidence=alignment?clamp(base.quality.detectionConfidence*(recognized/Math.max(1,refWords.length)),0,1):0,flags=[...base.quality.flags];if(!alignment)flags.push('asr_unavailable');if(confidence<cfg.minDetectionConfidence)flags.push('low_asr_confidence');if(base.summary.activeDurationSeconds<cfg.minActiveSeconds)flags.push('insufficient_active_speech');return{metrics:{referenceWordCount:refWords.length,recognizedWordCount:recognized,wer:alignment?round(alignment.wer,4):null,substitutions:alignment?.substitutions??null,deletions:alignment?.deletions??null,insertions:alignment?.insertions??null,wordAccuracyPercentage:alignment?round(Math.max(0,1-alignment.wer)*100,1):null,wordsPerMinute:alignment?round(recognized/(base.summary.totalDurationSeconds/60),1):null,articulationRateWpm:alignment?round(recognized/(active/60),1):null,pitchVariability:null},quality:{flags,valid:base.quality.valid&&!!alignment&&confidence>=cfg.minDetectionConfidence&&base.summary.activeDurationSeconds>=cfg.minActiveSeconds,detectionConfidence:confidence},detection:{...base.detection,alignmentMethod:'standard order-sensitive Levenshtein dynamic-programming WER',asrStatus,asrConfidenceAvailable:false}}}

  function scoreTask(key,m,q){const cfg=PROVISIONAL_SCORING_CONFIG[key];let parts=[];
    if(key==='reading'){parts=[{metric:'wer',value:m.wer,severity:severityHigh(m.wer,cfg.thresholds.wer),weight:cfg.metrics.wer.contribution},{metric:'speechRateWpm',value:m.wordsPerMinute,severity:severityLow(m.wordsPerMinute,cfg.thresholds.speechRateWpm),weight:cfg.metrics.speechRateWpm.contribution}]}
    if(key==='pataka'){parts=[{metric:'overallSyllablesPerSecond',value:m.overallSyllablesPerSecond,severity:severityLow(m.overallSyllablesPerSecond,cfg.thresholds.overallSyllablesPerSecond),weight:cfg.metrics.overallSyllablesPerSecond.contribution},{metric:'interOnsetCv',value:m.interOnsetCv,severity:severityHigh(m.interOnsetCv,cfg.thresholds.interOnsetCv),weight:cfg.metrics.interOnsetCv.contribution},{metric:'pauseRatio',value:m.pauseRatio,severity:severityHigh(m.pauseRatio,cfg.thresholds.pauseRatio),weight:cfg.metrics.pauseRatio.contribution}]}
    if(key==='vowel'){parts=[{metric:'validPhonationSeconds',value:m.validPhonationSeconds,severity:severityLow(m.validPhonationSeconds,cfg.thresholds.validPhonationSeconds),weight:cfg.metrics.validPhonationSeconds.contribution},{metric:'f0Cv',value:m.f0Cv,severity:severityHigh(m.f0Cv,cfg.thresholds.f0Cv),weight:cfg.metrics.f0Cv.contribution},{metric:'phonationDropoutCount',value:m.phonationDropoutCount,severity:severityHigh(m.phonationDropoutCount,cfg.thresholds.phonationDropoutCount),weight:cfg.metrics.phonationDropoutCount.contribution}]}
    const hasUsableData=!q.flags.includes('empty_or_invalid')&&parts.some(p=>p.value!=null&&Number.isFinite(p.value));
    if(!hasUsableData)return{available:false,score:null,confidence:round(q.detectionConfidence,3),reason:`No usable data for this task (all scoring metrics unavailable: ${q.flags.join(', ')||'unknown'})`,metricsUsed:parts,thresholds:cfg.thresholds,configVersion:PROVISIONAL_SCORING_CONFIG.version};
    const raw=parts.reduce((s,p)=>s+p.severity*p.weight,0),score=Math.round(raw);return{available:true,score,rawScore:round(raw,3),confidence:round(q.detectionConfidence,3),qualityPassed:q.valid,qualityFlags:q.flags,metricsUsed:parts,thresholds:cfg.thresholds,explanation:parts.map(p=>`${p.metric}: ${p.value} → severity ${p.severity} × ${p.weight}`).join('; ')+(q.valid?'':` (computed despite quality flags: ${q.flags.join(', ')})`),configVersion:PROVISIONAL_SCORING_CONFIG.version};}
  function severityHigh(value,thresholds){if(value==null||!Number.isFinite(value))return 0;let s=0;thresholds.forEach((t,i)=>{if(value>t)s=i+1});return Math.min(6,s)}
  function severityLow(value,thresholds){if(value==null||!Number.isFinite(value))return 0;let s=0;thresholds.forEach((t,i)=>{if(value<t)s=i+1});return Math.min(6,s)}

  function showReview(a){showStage(els.reviewStage);els.stepLabel.textContent=`REVIEW · ${a.taskName.toUpperCase()}`;if(model.currentUrl)URL.revokeObjectURL(model.currentUrl);model.currentUrl=URL.createObjectURL(a.blob);els.playback.src=model.currentUrl;els.reviewTitle.textContent=`${a.taskName} complete`;const flags=a.quality.flags;els.reviewQuality.className=`quality-banner show ${a.quality.valid?'good':flags.includes('empty_or_invalid')?'bad':'warn'}`;els.reviewQuality.textContent=a.quality.valid?'Recording quality checks passed.':`Review recommended: ${flags.map(pretty).join(', ')}.`;els.acceptBtn.disabled=false;els.acceptBtn.textContent=model.taskIndex===2?'Accept and View Results':'Accept and Continue';progress(25+model.taskIndex*24)}
  function rerecord(){if(model.state!=='review')return;els.playback.pause();setState('ready');loadTask()}
  function taskSummaryDetail(t,a){const m=a.metrics;
    if(t.key==='reading'){
      const words=(m.recognizedWordCount!=null&&m.referenceWordCount!=null)?`${m.recognizedWordCount} / ${m.referenceWordCount} words in ${m.totalDurationSeconds}s (${formatValue(m.wordsPerMinute)} wpm)`:'Words: unavailable';
      const errCount=(m.substitutions??0)+(m.deletions??0)+(m.insertions??0);
      const acc=m.wordAccuracyPercentage!=null?`${formatValue(m.wordAccuracyPercentage)}% accuracy (${errCount} error${errCount===1?'':'s'}: ${m.substitutions??0} substituted, ${m.deletions??0} deleted, ${m.insertions??0} inserted)`:'Accuracy: unavailable (ASR unavailable)';
      return `${words}<br>${acc}`;
    }
    if(t.key==='pataka'){
      const overall=m.overallSyllablesPerSecond!=null?`${formatValue(m.overallSyllablesPerSecond)}/sec overall`:'overall rate unavailable';
      const active=m.syllablesPerSecond!=null?`${formatValue(m.syllablesPerSecond)}/sec while speaking`:null;
      const cycles=m.estimatedSyllableNucleusCount!=null?`~${formatValue(m.estimatedSyllableNucleusCount)} syllables detected in ${m.totalDurationSeconds}s (${overall}${active?'; '+active:''})`:'Syllable count: unavailable';
      const rhythm=m.interOnsetCv!=null?`Rhythm variability: ${Math.round(m.interOnsetCv*100)}%`:'Rhythm variability: unavailable';
      const pause=m.pauseRatio!=null?`Time spent paused: ${Math.round(m.pauseRatio*100)}%`:'';
      return `${cycles}<br>${rhythm}${pause?' · '+pause:''} (lower = more regular / less paused)`;
    }
    if(t.key==='vowel'){
      const pitch=m.meanF0Hz!=null?`Average pitch: ${formatValue(m.meanF0Hz)} Hz`:'Average pitch: unavailable';
      const stability=m.f0Cv!=null?`Pitch variability: ${Math.round(m.f0Cv*100)}% (lower = more stable)`:'Pitch variability: unavailable';
      return `${pitch}<br>${stability}`;
    }
    return '';
  }
  function renderTaskResultSummary(){
    const acceptedList=TASKS.filter(t=>model.accepted[t.key]);
    els.summaryPanel.hidden=acceptedList.length===0;
    els.summaryList.innerHTML=acceptedList.slice().reverse().map(t=>{const a=model.accepted[t.key],scoreText=a.scoring?.available?`${a.scoring.score} / 6`:'Unavailable';return `<div class="summary-task"><div class="summary-task-head"><span>${escapeHtml(t.name)}</span><strong>${scoreText}</strong></div><div class="summary-task-detail">${taskSummaryDetail(t,a)}</div></div>`}).join('');
  }
  function acceptAttempt(){if(model.state!=='review')return;const key=model.currentAttempt.task;if(model.accepted[key])model.accepted[key].accepted=false;model.currentAttempt.accepted=true;model.accepted[key]=model.currentAttempt;renderTaskResultSummary();renderResearch();const allDone=Object.keys(model.accepted).length>=3;if(allDone)computeOverallResult();setState('accepted');setState('ready');els.micTestBtn.disabled=false;els.stopTestBtn.disabled=true;showTaskResult(model.currentAttempt,allDone)}
  const EXPLANATIONS = {
    vowel: {
      validPhonationSeconds: s => s>=4 ? "The sustained sound didn't last as long as expected." : s>=2 ? 'The sustained sound was a little shorter than expected.' : null,
      f0Cv: s => s>=4 ? 'Your pitch was noticeably unstable while holding the sound.' : s>=2 ? 'Your pitch wavered somewhat.' : null,
      phonationDropoutCount: s => s>=4 ? 'There were noticeable interruptions during phonation.' : s>=2 ? 'There were a few brief interruptions.' : null
    },
    pataka: {
      overallSyllablesPerSecond: s => s>=4 ? 'Your overall repetition rate, including pauses, was slow.' : s>=2 ? 'Your overall repetition rate was a bit slow.' : null,
      interOnsetCv: s => s>=4 ? 'The rhythm between repetitions was quite irregular.' : s>=2 ? 'The rhythm between repetitions was somewhat uneven.' : null,
      pauseRatio: s => s>=4 ? 'You paused frequently or for long stretches during the task.' : s>=2 ? 'There were some noticeable pauses.' : null
    },
    reading: {
      wer: s => s>=4 ? 'Many words were not recognized correctly, suggesting reduced clarity.' : s>=2 ? 'Some words were not recognized clearly.' : null,
      speechRateWpm: s => s>=4 ? 'Your reading speed was much slower than typical.' : s>=2 ? 'Your reading speed was somewhat slow.' : null
    }
  };
  function explainScore(taskKey,attempt){
    if(!attempt.scoring.available) return [attempt.scoring.reason||'This attempt could not be scored — not enough usable data was captured.'];
    const lines=(attempt.scoring.metricsUsed||[]).map(p=>EXPLANATIONS[taskKey]?.[p.metric]?.(p.severity)).filter(Boolean);
    if(!lines.length) lines.push('Performance was within the normal range for every measure in this task.');
    if(!attempt.scoring.qualityPassed) lines.push('Note: this recording tripped a data-quality flag, so this score should be read with some caution.');
    return lines;
  }
  function showTaskResult(attempt,allDone){
    const task=TASKS.find(t=>t.key===attempt.task);
    showStage(els.taskResultStage);
    els.stepLabel.textContent='TASK RESULT';
    els.taskResultName.textContent=task.name;
    els.taskResultScore.textContent=attempt.scoring.available?attempt.scoring.score:'—';
    els.taskResultExplain.innerHTML=explainScore(attempt.task,attempt).map(s=>`<li>${escapeHtml(s)}</li>`).join('');
    els.viewFinalResultsBtn.hidden=!allDone;
    progress(Math.round(Object.keys(model.accepted).length/3*100));
  }
  function computeOverallResult(){const r=model.accepted.reading,p=model.accepted.pataka,v=model.accepted.vowel,W=PROVISIONAL_SCORING_CONFIG.weights;if(!r?.scoring.available){model.result={available:false,reason:'Reading intelligibility could not be assessed.'}}else if(!p?.scoring.available||!v?.scoring.available){model.result={available:false,reason:'One or more task component scores are unavailable.'}}else{const raw=r.scoring.score*W.reading+p.scoring.score*W.pataka+v.scoring.score*W.vowel,rounded=Math.round(raw);let final=rounded,floor=false;if(r.scoring.score===6){final=6;floor=true}else if(r.scoring.score===5&&final<5){final=5;floor=true}else if(r.scoring.score===4&&final<4){final=4;floor=true}model.result={available:true,weightedScore:round(raw,2),roundedWeightedScore:rounded,estimatedScore:final,intelligibilityFloorApplied:floor,weights:{...PROVISIONAL_SCORING_CONFIG.weights},scoringVersion:PROVISIONAL_SCORING_CONFIG.version,clinicallyValidated:false}}}
  function showResults(){showStage(els.resultsStage);els.stepLabel.textContent='ASSESSMENT COMPLETE';progress(100);const result=model.result;els.estimatedScore.textContent=result.available?result.estimatedScore:'Unavailable';els.sideScore.textContent=result.available?result.estimatedScore:'—';els.componentGrid.innerHTML=TASKS.slice().reverse().map(t=>componentCard(t)).join('');renderTaskResultSummary();els.calculationLine.textContent=result.available?`Weighted ${result.weightedScore} → rounded ${result.roundedWeightedScore} → final ${result.estimatedScore}${result.intelligibilityFloorApplied?' · intelligibility-priority rule applied':''}`:result.reason;const warnings=Object.values(model.accepted).flatMap(a=>a.quality.flags);els.overallWarning.className=`quality-banner show ${warnings.length?'warn':'good'}`;els.overallWarning.textContent=warnings.length?`Data-quality flags: ${[...new Set(warnings)].map(pretty).join(', ')}.`:'All accepted recordings passed configured quality checks.';enableExports();renderResearch();}
  function componentCard(t){const s=model.accepted[t.key]?.scoring;return `<div class="component-card"><span>${escapeHtml(t.name)} <small>${Math.round(PROVISIONAL_SCORING_CONFIG.weights[t.key]*100)}%</small></span><strong>${s?.available?s.score:'—'}</strong> / 6</div>`}
  function renderTaskList(){const canStart=!!model.micCheck&&model.state==='ready';const listLabels={pataka:'PA-TA-KA'};els.taskList.innerHTML=TASKS.map((t,i)=>{const a=model.accepted[t.key],done=!!a;const right=done?(a.scoring?.available?`<strong>${a.scoring.score} / 6</strong>`:`<strong>Unavailable</strong>`):`<small>${t.key==='reading'?'≤30':t.seconds}s</small>`;return `<button type="button" class="task-item-btn ${done?'done':''}" data-task="${t.key}" ${canStart?'':'disabled'}><span class="task-index">${done?'✓':i+1}</span><span class="task-item-label">${escapeHtml(listLabels[t.key]||t.name)}</span>${right}</button>`}).join('')}
  function renderResearch(){els.scoringDetails.textContent=JSON.stringify(PROVISIONAL_SCORING_CONFIG,null,2);const audioLabels={vowel:'AH',pataka:'PA-TA-KA',reading:'READING'};els.audioDownloads.innerHTML=TASKS.map(t=>{const a=model.accepted[t.key];return `<button type="button" class="audio-dl-btn" data-audio="${t.key}" ${a?'':'disabled'}>${audioLabels[t.key]}</button>`}).join('');els.metricDetails.innerHTML=TASKS.map(t=>metricGroup(t,model.accepted[t.key])).join('')}
  function metricDisplayValue(t,a,k,v){if((k==='wordsPerMinute'||k==='articulationRateWpm')&&t.key==='reading'&&a.metrics.referenceWordCount!=null&&a.metrics.recognizedWordCount!=null){return `${a.metrics.recognizedWordCount} / ${a.metrics.referenceWordCount} words (${formatValue(v)} wpm)`}return formatValue(v)}
  function metricGroup(t,a){if(!a)return'';const classifications={...PROVISIONAL_SCORING_CONFIG[t.key].metrics};return `<div class="metric-group"><h4>${escapeHtml(t.name)} · confidence ${a.scoring.confidence}</h4>${detectionViz(t,a)}${Object.entries(a.metrics).map(([k,v])=>`<div class="metric-row"><span>${escapeHtml(pretty(k))}<i class="metric-class">${escapeHtml(classifications[k]?.classification||classificationFor(k))}</i></span><b>${escapeHtml(metricDisplayValue(t,a,k,v))}</b></div>${METRIC_CAVEATS[k]?`<div class="metric-caveat">${escapeHtml(METRIC_CAVEATS[k])}</div>`:''}`).join('')}</div>`}
  function detectionViz(t,a){if(t.key!=='pataka')return'';const total=Math.max(.001,a.durationSeconds),events=a.detection?.eventTimesSeconds||[];return `<div class="detection-viz" title="Estimated amplitude-envelope events">${events.map(x=>`<i style="left:${clamp(x/total*100,0,100)}%"></i>`).join('')}<span>Estimated events · inspect for detection error</span></div>`}
  function classificationFor(k){return /duration|threshold|confidence|peak|silence/i.test(k)?'quality_control':'exploratory'}

  function buildExport(){const headerValues={participantId:$('glob-id')?.value||'',participantName:$('glob-name')?.value||'',age:$('glob-age')?.value||'',sex:$('glob-sex')?.value||'',sessionId:$('glob-sess')?.value||'',operator:$('glob-op')?.value||'',date:$('glob-date')?.value||''};return{module:'CeMoQu Speech Disturbance',protocolVersion:PROTOCOL_VERSION,createdAt:new Date().toISOString(),identification:headerValues,testLanguage:els.language.value,microphoneDistanceCm:Number(els.micDistance.value)||null,microphoneCheck:model.micCheck,acceptedTrials:Object.values(model.accepted).map(withoutBlob),attemptHistory:model.attempts.map(withoutBlob),overallScoring:model.result,scoringConfiguration:PROVISIONAL_SCORING_CONFIG,clinicalReference:{clinicianRatedSaraSpeechScore:els.clinicianScore.value===''?null:Number(els.clinicianScore.value),notes:els.researchNotes.value},limitations:['Research prototype; not diagnostic or clinically validated.','Standardized reading is a proxy; official SARA Speech is assessed during normal conversation.','Browser ASR and compressed recording behavior vary by platform.']}}
  function withoutBlob(a){const {blob,...rest}=a;return rest}
  function filename(ext,task='session'){const p=safe($('glob-id')?.value||'unknown'),s=safe($('glob-sess')?.value||'session'),stamp=new Date().toISOString().replace(/[:.]/g,'-');return `${p}_${s}_SD_${task}_${stamp}.${ext}`}
  function exportJson(){download(new Blob([JSON.stringify(buildExport(),null,2)],{type:'application/json;charset=utf-8'}),filename('json'))}
  function exportTrial(){const latest=model.currentAttempt||Object.values(model.accepted).at(-1);if(!latest)return;download(new Blob([JSON.stringify({...withoutBlob(latest),protocolVersion:PROTOCOL_VERSION},null,2)],{type:'application/json;charset=utf-8'}),filename('json',latest.task))}
  function exportCsv(){const data=buildExport(),rows=[];for(const a of data.acceptedTrials){const base={participant_id:data.identification.participantId,session_id:data.identification.sessionId,trial_id:a.trialId,attempt_number:a.attemptNumber,accepted_attempt:a.accepted,task:a.task,timestamp:a.timestamp,test_language:a.testLanguage,mic_distance_cm:a.microphoneDistanceCm,mime_type:a.mimeType,codec:a.codec,sample_rate:a.sampleRate,channel_count:a.channelCount,quality_flags:a.quality.flags.join('|'),detection_confidence:a.quality.detectionConfidence,component_score:a.scoring.score,scoring_version:a.scoring.configVersion,clinician_score:data.clinicalReference.clinicianRatedSaraSpeechScore,researcher_notes:data.clinicalReference.notes,estimated_sara_speech_score:data.overallScoring?.estimatedScore??'',weighted_score:data.overallScoring?.weightedScore??'',intelligibility_floor_applied:data.overallScoring?.intelligibilityFloorApplied??''};rows.push({...base,...flatten(a.metrics,'metric_'),transcript:a.transcript||'',reference_text:a.passage?.text||'',requested_constraints:JSON.stringify(a.requestedConstraints),actual_settings:JSON.stringify(a.actualSettings),browser:a.browser})}const headers=[...new Set(rows.flatMap(Object.keys))];const csv=[headers.map(csvCell).join(','),...rows.map(r=>headers.map(h=>csvCell(r[h]??'')).join(','))].join('\r\n');download(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}),filename('csv'))}
  function downloadAudio(key){const a=model.accepted[key];if(!a)return;const ext=a.mimeType.includes('ogg')?'ogg':a.mimeType.includes('wav')?'wav':'webm';download(a.blob,filename(ext,key))}
  function enableExports(){els.exportCsvTopBtn.disabled=false;els.stopTestBtn.disabled=true;els.submitDataBtn.disabled=!model.result?.available;}
  function stopTest(){if(!['countdown','recording','processing','review'].includes(model.state))return;clearTimeout(model.stopTimer);clearInterval(model.clockTimer);stopCue();stopRecognition();if(model.recorder&&model.recorder.state!=='inactive'){model.recorder.onstop=null;try{model.recorder.stop()}catch{}}cleanupAttemptUrls();els.countdown.hidden=true;els.timeChip.hidden=true;els.finishBtn.hidden=true;try{els.playback.pause()}catch{}setState('ready');loadTask()}
  function submitData(){if(!model.result?.available){els.toolbarMessage.textContent='Complete the assessment before submitting.';return}
    // TODO: wire to the real CeMoQu submission endpoint/shared upload function used by LD/RT/ST.
    // That code was not available when this was built, so this only prepares the payload and
    // does not actually transmit it anywhere yet.
    const payload=buildExport();
    console.warn('submitData(): no submission endpoint configured yet — payload prepared but not sent.',payload);
    els.toolbarMessage.textContent='Submit endpoint not yet configured — see console for the prepared payload.';
  }
  function restart(){cleanupAttemptUrls();model.attempts=[];model.accepted={};model.result=null;model.taskIndex=0;model.attemptNumber={vowel:0,pataka:0,reading:0};renderTaskResultSummary();setState('idle');if(model.micCheck)setState('ready');showStage(els.setupStage);progress(0);els.stepLabel.textContent='PRE-TEST SETUP';els.startTestBtn.disabled=!model.micCheck;els.micTestBtn.disabled=false;els.stopTestBtn.disabled=true;els.submitDataBtn.disabled=true;els.exportCsvTopBtn.disabled=true;els.toolbarMessage.textContent='';}
  function releaseMedia(){cancelAnimationFrame(model.monitorFrame);model.monitorFrame=null;if(model.stream)model.stream.getTracks().forEach(t=>t.stop());model.stream=null;model.source?.disconnect();model.analyser?.disconnect();model.source=null;model.analyser=null;if(model.audioContext&&model.audioContext.state!=='closed')model.audioContext.close();model.audioContext=null}
  function cleanupAttemptUrls(){if(model.currentUrl)URL.revokeObjectURL(model.currentUrl);model.currentUrl=null}
  function fail(error){console.error(error);clearTimeout(model.stopTimer);clearInterval(model.clockTimer);stopRecognition();try{if(model.state!=='error')setState('error')}catch{}showStage(els.taskStage);els.taskInstruction.textContent=`Error: ${error.message||error}`;els.recordBtn.hidden=false;els.recordBtn.disabled=false;els.recordBtn.textContent='Try Again'}

  function estimateF0(x,sr){let meanX=mean(x),energy=0;const y=new Float32Array(x.length);for(let i=0;i<x.length;i++){y[i]=x[i]-meanX;energy+=y[i]*y[i]}if(energy/x.length<1e-5)return null;const min=Math.floor(sr/400),max=Math.min(Math.floor(sr/60),x.length-2);let best=0,bestLag=0;for(let lag=min;lag<=max;lag++){let sum=0,a=0,b=0;for(let i=0;i<x.length-lag;i++){sum+=y[i]*y[i+lag];a+=y[i]*y[i];b+=y[i+lag]*y[i+lag]}const corr=sum/Math.sqrt(a*b||1);if(corr>best){best=corr;bestLag=lag}}return best>.35?sr/bestLag:null}
  function alignWords(ref,hyp){const m=ref.length,n=hyp.length,dp=Array.from({length:m+1},()=>Array(n+1));for(let i=0;i<=m;i++)dp[i][0]={cost:i,s:0,d:i,ins:0};for(let j=0;j<=n;j++)dp[0][j]={cost:j,s:0,d:0,ins:j};for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){if(ref[i-1]===hyp[j-1])dp[i][j]={...dp[i-1][j-1]};else{const opts=[{...dp[i-1][j-1],type:'s'},{...dp[i-1][j],type:'d'},{...dp[i][j-1],type:'ins'}].map(o=>({...o,cost:o.cost+1}));const best=opts.sort((a,b)=>a.cost-b.cost)[0];best[best.type]++;delete best.type;dp[i][j]=best}}const r=dp[m][n];return{wer:(r.s+r.d+r.ins)/Math.max(1,m),substitutions:r.s,deletions:r.d,insertions:r.ins}}
  function segmentsFromMask(mask,dt,minGap){const seg=[];let start=null,last=null;for(let i=0;i<mask.length;i++){if(mask[i]){if(start===null)start=i;last=i}else if(start!==null&&(i-last)*dt>=minGap){seg.push({start:round(start*dt),end:round((last+1)*dt)});start=null;last=null}}if(start!==null)seg.push({start:round(start*dt),end:round((last+1)*dt)});return seg}
  function internalGapDuration(seg){let s=0;for(let i=1;i<seg.length;i++)s+=Math.max(0,seg[i].start-seg[i-1].end);return s}
  const mean=a=>a?.length?a.reduce((s,v)=>s+v,0)/a.length:0;const sd=a=>{if(!a?.length)return 0;const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))};const cv=a=>{const m=mean(a);return m?sd(a)/m:0};const percentile=(a,p)=>a?.length?a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))]:0;const round=(n,d=3)=>Number.isFinite(n)?Number(n.toFixed(d)):null;const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const movingAverage=(a,w)=>a.map((_,i)=>mean(a.slice(Math.max(0,i-w+1),i+1)));const wait=ms=>new Promise(r=>setTimeout(r,ms));const tokenize=s=>(s.toLowerCase().match(/[a-z0-9']+/g)||[]);const pretty=s=>String(s).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());const safe=s=>String(s).replace(/[^a-zA-Z0-9_-]/g,'_');const formatValue=v=>v==null?'Unavailable':Array.isArray(v)?v.join(', '):typeof v==='object'?JSON.stringify(v):String(v);const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const flatten=(o,p='')=>Object.fromEntries(Object.entries(o).map(([k,v])=>[`${p}${k}`,typeof v==='object'&&v!==null?JSON.stringify(v):v]));const csvCell=v=>`"${String(v).replace(/"/g,'""')}"`;function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

  els.checkMicBtn.addEventListener('click',checkMicrophone);els.recordBtn.addEventListener('click',countdownAndRecord);els.finishBtn.addEventListener('click',stopRecording);els.rerecordBtn.addEventListener('click',rerecord);els.acceptBtn.addEventListener('click',acceptAttempt);els.restartBtn.addEventListener('click',restart);els.viewFinalResultsBtn.addEventListener('click',showResults);els.micSelect.addEventListener('change',()=>{model.micCheck=null;els.startTestBtn.disabled=true;checkMicrophone()});
  els.taskList.addEventListener('click',e=>{const btn=e.target.closest('[data-task]');if(btn&&!btn.disabled)startTask(btn.dataset.task)});
  els.micTestBtn.addEventListener('click',checkMicrophone);els.startTestBtn.addEventListener('click',startFirstIncompleteTask);els.stopTestBtn.addEventListener('click',stopTest);els.submitDataBtn.addEventListener('click',submitData);els.exportCsvTopBtn.addEventListener('click',exportCsv);
  document.querySelectorAll('.side-tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.side-tab').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',b===btn)});$('testPanel').classList.toggle('active',btn.dataset.tab==='test');$('researchPanel').classList.toggle('active',btn.dataset.tab==='research')}));
  els.showScoringBtn.addEventListener('click',()=>{els.scoringDetails.hidden=!els.scoringDetails.hidden;els.showScoringBtn.textContent=els.scoringDetails.hidden?'View calculation details':'Hide calculation details'});els.audioDownloads.addEventListener('click',e=>{const key=e.target.dataset.audio;if(key&&!e.target.disabled)downloadAudio(key)});window.addEventListener('beforeunload',()=>{clearTimeout(model.stopTimer);clearInterval(model.clockTimer);stopCue();stopRecognition();releaseMedia();cleanupAttemptUrls()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&model.state==='recording'){const elapsed=(performance.now()-model.recordStartedAt)/1000;if(elapsed>=model.taskMaxSeconds&&!model.autoStopped){model.autoStopped=true;stopRecording()}}});
  function renderWeightBar(){
    const w=PROVISIONAL_SCORING_CONFIG.weights;
    const rPct=Math.round(w.reading*100),pPct=Math.round(w.pataka*100),vPct=Math.round(w.vowel*100);
    els.wHandle1.style.left=rPct+'%';els.wHandle2.style.left=(rPct+pPct)+'%';
    els.wLabelReading.textContent=`Reading ${rPct}%`;els.wLabelPataka.textContent=`Pa-ta-ka ${pPct}%`;els.wLabelVowel.textContent=`Vowel ${vPct}%`;
  }
  function currentHandlePcts(){const w=PROVISIONAL_SCORING_CONFIG.weights;const h1=Math.round(w.reading*100);return [h1,h1+Math.round(w.pataka*100)]}
  function applyHandlePcts(h1,h2){PROVISIONAL_SCORING_CONFIG.weights={reading:h1/100,pataka:(h2-h1)/100,vowel:(100-h2)/100};renderWeightBar();renderResearch();if(Object.keys(model.accepted).length>=3){computeOverallResult();if(els.resultsStage.classList.contains('active'))showResults()}}
  function bindWeightHandle(handleEl,isFirst){
    handleEl.addEventListener('pointerdown',e=>{
      handleEl.setPointerCapture(e.pointerId);
      const barRect=els.weightBar.getBoundingClientRect();
      function move(ev){
        let pct=((ev.clientX-barRect.left)/barRect.width)*100;
        pct=Math.max(0,Math.min(100,Math.round(pct/10)*10));
        let [h1,h2]=currentHandlePcts();
        if(isFirst)h1=Math.max(0,Math.min(pct,h2));else h2=Math.max(h1,Math.min(pct,100));
        applyHandlePcts(h1,h2);
      }
      function up(){handleEl.releasePointerCapture(e.pointerId);handleEl.removeEventListener('pointermove',move);handleEl.removeEventListener('pointerup',up)}
      handleEl.addEventListener('pointermove',move);handleEl.addEventListener('pointerup',up);
    });
  }
  bindWeightHandle(els.wHandle1,true);bindWeightHandle(els.wHandle2,false);renderWeightBar();
  renderTaskList();renderResearch();
})();
