/* RT Finger Chase — Clinic edition (with Cursor Test)
   Cursor mode uses the physical orange bar. Camera mode uses MediaPipe Hands
   and the participant's entered index-finger length to derive pixels/cm.
   Protocol defaults: five movements per hand and exactly 30 cm between targets.
*/

/* DOM */
const viewer = document.getElementById('viewer');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const modeCursor = document.getElementById('modeCursor');
const modeCamera = document.getElementById('modeCamera');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const exportBtn = document.getElementById('exportBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');

const cfg_interval = document.getElementById('cfg_interval');
const cfg_targets = document.getElementById('cfg_targets');
const cfg_radius_cm = document.getElementById('cfg_radius_cm');
const cfg_diameter_cm = document.getElementById('cfg_diameter_cm');
const cfg_edge_px = document.getElementById('cfg_edge_px');
const cfg_finger_cm = document.getElementById('cfg_finger_cm');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsSavedMsg = document.getElementById('settingsSavedMsg');
const calibrateBtn = document.getElementById('calibrateBtn');
const cfg_ppc = document.getElementById('cfg_ppc');

const meta_hand = document.getElementById('meta_hand');

/* Live read of global header fields (participant/session/date). Not cached —
   header.html is injected asynchronously by shared/header.js, so this must
   be looked up at the moment it's needed, same pattern as LD's fieldVal(). */
function headerFieldVal(id){
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

const statusLine = document.getElementById('statusLine');
const trialLine = document.getElementById('trialLine');
const ppcLabel = document.getElementById('ppcLabel');

const logArea = document.getElementById('logArea');
const clearLogBtn = document.getElementById('clearLogBtn');
const countdownOverlay = document.getElementById('countdownOverlay');
const testResultOverlay = document.getElementById('testResultOverlay');

const calibUI = document.getElementById('calibUI');
const calibBar = document.getElementById('calibBar');
const calibInstr = document.getElementById('calibInstr');
const calibInputs = document.getElementById('calibInputs');
const measuredDistance = document.getElementById('measuredDistance');
const barLengthField = document.getElementById('barLengthField');
const fingerLengthField = document.getElementById('fingerLengthField');

let camera = null;
let cameraFrameRequest = null;
let hands = null;
let handFrameBusy = false;
let handTrackingErrorShown = false;
let cameraCalibrationRunning = false;
let cameraCalibrationDone = false;
let handCalibrationSamples = [];
let calibrationFreezeImage = null;
let calibrationFreezeUntil = 0;
let cameraPreparationPromise = null;
let calibrationCaptureRunning = false;
let cameraCalibrationMeasurements = [];
const CAMERA_CALIBRATION_STEPS = ['Right','Left','Right','Left'];
let speechRecognition = null;
let voiceRestartTimer = null;

/* Modes */
let mode = 'cursor'; // 'cursor' or 'camera'

/* Video intrinsic */
let VIDEO_W = 640, VIDEO_H = 480;

/* Backing buffer scaling */
function resizeCanvasBacking(){
  const viewerRect = viewer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, Math.floor(viewerRect.width));
  const cssH = Math.max(1, Math.floor(viewerRect.height));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  // update calibration bar immediate width
  updateCalibBar();
}
window.addEventListener('resize', resizeCanvasBacking);

/* localStorage keys */
const LS_PREFIX = 'rt_fingerchase_v1_';
const LS_SETTINGS = LS_PREFIX + 'settings';

/* Defaults follow SARA Finger Chase; the movement count remains adjustable
   for research runs, while target-to-target amplitude stays fixed at 30 cm. */
const DEFAULTS = {
  targets: 5,
  interval_s: 2.0,
  radius_cm: 1.5,
  edge_px: 20,
  min_distance_cm: 30.0,
  center_dot: true,
  trail: true,
  countdown: true,
  ppc: 30.0,
  finger_cm: 7.5
};

/* ============================================================
   RT_SCORING_CONFIG — dysmetria + tremor scoring pipeline
   ============================================================
   Single source of truth for the arrival-detection thresholds, the
   dysmetria/tremor bucket boundaries, and the top-level weight between
   them. All scoring functions read from this object (same "config is the
   single source of truth" principle used in the SD module) so that the
   RESEARCH-tab weight bar and future settings UI can change behavior
   without code edits.

   References (see RT/TASK-DESIGN-RATIONALE.md for full citations):
   [1] Schmitz-Hübsch T. et al. "Scale for the assessment and rating of
       ataxia: development of a new clinical scale." Neurology 66 (2006):
       1717-1720. — SARA Finger Chase (item 5) and Nose-Finger (item 6)
       protocols and score buckets.
   [2] Corticospinal excitability / temporal feedback gap study (Neuroreport,
       via Ovid): movement onset/offset defined as the time point where
       index-finger velocity crosses 5% of that movement's peak velocity.
   [3] Multiple reaching/stroke-rehabilitation trial protocols (clinicaltrials.gov
       NCT05683158, NCT05767437): movement onset/offset defined at 10% of
       peak tangential velocity, with a minimum inter-movement interval
       (~150 ms) used to reject noise-driven "movement units".
   [4] Sato M. et al. "Quantitative Assessment of Upper Limb Ataxia Using a
       Virtual Reality-Based Evaluation System." Ann Clin Transl Neurol 13
       (2026): 180-192. — "terminal trajectory length" and "maximum
       overshoot distance", measured only in the phase after the finger
       first reaches the vicinity of the target, both correlate
       significantly with the SARA upper-limb sub-score (r=0.657 and
       r=0.609 respectively, p<0.001). Basis for scoring a separate
       post-arrival "hold phase" instead of only the endpoint.
   [5] Cerebellar/intention tremor frequency range: Scholarpedia "Tremor"
       (cerebellar tremor 3-5 Hz) and ScienceDirect "Intention Tremor"
       overview (3-8 Hz in the upper limb, dominant <5 Hz). Basis for the
       minimum camera-mode sampling rate used for the low-fps quality flag.
*/
const RT_SCORING_CONFIG = {
  version: 'rt-scoring-v1',

  arrival: {
    // "Arrival" = the point where the cursor/fingertip stops reaching toward
    // the target and starts merely holding position. Defined the same way
    // as movement offset in reaching kinematics literature [2][3]: velocity
    // drops to a small fraction of that trial's peak velocity...
    peakVelocityThresholdPct: 0.08, // ...8% of peak (between the 5% and 10% figures reported in [2]/[3])
    // ...and stays that low for a minimum duration, so a single noisy frame
    // isn't mistaken for the true end of the reach (same rationale as the
    // ~150 ms minimum interval used in [3]).
    minSustainMs: 100
  },

  // Dysmetria bucket boundaries (cm of error at the arrival point).
  // Keeps SARA's <5cm / <15cm boundaries [1] but subdivides the 0-1 and
  // 3-4 ends for finer digital resolution (open question flagged in
  // TASK-DESIGN-RATIONALE.md pending further calibration data).
  dysmetriaBucketsCm: [1.0, 5.0, 15.0], // <1->0, <5->1, <15->2, else->3

  // Tremor bucket boundaries (cm of max deviation from the arrival point
  // during the hold phase). Directly reuses SARA Nose-Finger's tremor
  // amplitude boundaries (<2cm->1, <5cm->2, >5cm->3) [1] and extends them
  // one step further (>10cm->4) for symmetry with the dysmetria buckets.
  tremorBucketsCm: [1.0, 2.0, 5.0], // <1->0, <2->1, <5->2, else->3 (experimental)

  // Top-level weight between the two sub-scores. Basis: [4] found both
  // classes of post-arrival measure (endpoint-accuracy-adjacent and
  // trajectory/drift-adjacent) correlate with the SARA upper-limb
  // sub-score at a similar magnitude (r=0.609 and r=0.657). Weighted
  // slightly toward dysmetria because it is the metric SARA's own Finger
  // Chase item explicitly defines [1]; tremor is CeMoQu's extension beyond
  // the original protocol. User-adjustable via the RESEARCH tab weight bar.
  weights: { dysmetria: 0.6, tremor: 0.4 },

  // Below this actual measured camera-mode frame rate, the Nyquist limit
  // (fps/2) falls within the cited cerebellar tremor frequency band
  // (3-8 Hz) [5], so tremor amplitude for that trial is flagged as
  // low-confidence rather than being suppressed.
  minReliableFps: 20
};

function bucketFromCm(valueCm, boundaries){
  for(let i=0;i<boundaries.length;i++){
    if(valueCm < boundaries[i]) return i;
  }
  return boundaries.length;
}


/* runtime config */
let cfg = {...DEFAULTS};

const DEFAULT_META = {
  participant: 'P000',
  session: 'S1',
  date: new Date().toISOString().slice(0,10),
  hand: 'B',
  notes: ''
};
let metaData = {...DEFAULT_META};

/* pixels per cm (set from settings / calibration) */
let pixels_per_cm = DEFAULTS.ppc;
let cursorPixelsPerCm = DEFAULTS.ppc;
let cameraPixelsPerCm = DEFAULTS.ppc;
let cursorCalibrationDone = false;
ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;

/* trial / data storage */
let allTouches = [];
let allTargetSummaries = [];
let allFinalSummaries = [];

/* per-run runtime */
let running = false;
let trialIndex = 0;
let targets = [];
let trialRunning = false;
let trialState = null;
let trailAnimation = null;

/* letterbox layout cache */
let drawLayout = { destW:0, destH:0, offsetX:0, offsetY:0, scale:1 };

/* cursor mode state */
let cursorIsDown = false;
let lastMousePos = null;

/* utility logging */
function appendLog(html){
  const el = document.createElement('div');
  el.innerHTML = html;
  logArea.appendChild(el);
  logArea.scrollTop = logArea.scrollHeight;
  return el;
}
function clearLog(){
  logArea.textContent = '';
}

function escapeLogHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clearPreviousResultsAndMessages(){
  testResultOverlay.style.display = 'none';
  testResultOverlay.innerHTML = '';
  countdownOverlay.style.display = 'none';
  const overlay = document.getElementById('calibPromptOverlay');
  if(overlay) overlay.style.display = 'none';
  trialLine.textContent = '';
}

function getCalibrationStatusElement(){
  let el = document.getElementById('calibrationStatusMsg');
  if(!el && calibrateBtn){
    el = document.createElement('span');
    el.id = 'calibrationStatusMsg';
    el.className = 'small-muted';
    el.style.marginLeft = '10px';
    el.style.fontWeight = '800';
    calibrateBtn.insertAdjacentElement('afterend', el);
  }
  return el;
}

function setCalibrationStatus(message='', tone='neutral'){
  const el = getCalibrationStatusElement();
  if(!el) return;
  el.textContent = message;
  el.style.color = tone === 'success' ? '#047857' : tone === 'warning' ? '#b45309' : '';
}

function clearCalibrationStatus(){
  setCalibrationStatus('', 'neutral');
}

function showCursorModeInstruction(){
  setCalibrationGuide(
    'CURSOR MODE',
    'Measure the calibration bar',
    'Please measure the orange calibration bar length and enter the value below.',
    '',
    ''
  );
  const detection = document.getElementById('calibDetectionStatus');
  if(detection){ detection.textContent = ''; detection.classList.remove('is-detected'); detection.style.display = 'none'; }
  statusLine.textContent = 'Cursor Mode: verify calibration before starting';
}

function showCursorCalibrationResult(){
  const diameterPx = cursorCmToPx(cfg.radius_cm * 2);
  const minDistancePx = cursorCmToPx(20);
  const result = `Calibration verified. Pixels/cm: ${cursorPixelsPerCm.toFixed(2)}. Target diameter: ${(cfg.radius_cm*2).toFixed(1)} cm = ${diameterPx} px. Minimum target distance: 20 cm = ${minDistancePx} px.`;
  calibInstr.textContent = result;
  setCalibrationStatus('Verified', 'success');
  setCalibrationGuide(
    'CALIBRATION RESULT',
    'Cursor calibration verified',
    `Pixels/cm: ${cursorPixelsPerCm.toFixed(2)}. Cursor test is ready to start.`,
    '',
    'success'
  );
  const detection = document.getElementById('calibDetectionStatus');
  if(detection){ detection.textContent = ''; detection.classList.remove('is-detected'); detection.style.display = 'none'; }
  statusLine.textContent = 'Cursor calibration verified';
}


function showCameraCalibrationFinalResult(){
  ppcLabel.textContent = `Pixels/cm: ${cameraPixelsPerCm.toFixed(2)}`;
  statusLine.textContent = 'Camera calibration complete';
  setCalibrationGuide(
    'CALIBRATION RESULT',
    'Camera calibration complete',
    `Average Pixels/cm: ${cameraPixelsPerCm.toFixed(2)}. Please click Start Test.`,
    '',
    'success'
  );
  const detection = document.getElementById('calibDetectionStatus');
  if(detection){
    detection.textContent = '4 OF 4 CALIBRATIONS COMPLETE ✓';
    detection.classList.add('is-detected');
    detection.style.display = 'block';
  }
}

function setStartAvailability(){
  if(mode === 'cursor'){
    startBtn.disabled = !cursorCalibrationDone;
  }else{
    startBtn.disabled = !cameraCalibrationDone;
  }
}


/* save/load settings */
function saveSettingsToLocal(){
  const diameterCm = Math.min(10, Math.max(1, parseFloat(cfg_diameter_cm.value) || DEFAULTS.radius_cm * 2));
  cfg_diameter_cm.value = diameterCm;
  cfg_radius_cm.value = diameterCm / 2;
  const s = {
    settings_version: 5,
    targets: Math.min(20, Math.max(3, Math.round(parseFloat(cfg_targets.value) || DEFAULTS.targets))),
    interval_s: parseFloat(cfg_interval.value)||DEFAULTS.interval_s,
    diameter_cm: diameterCm,
    radius_cm: diameterCm / 2,
    edge_px: Number.isFinite(parseInt(cfg_edge_px.value)) ? Math.max(0, parseInt(cfg_edge_px.value)) : DEFAULTS.edge_px,
    min_distance_cm: 30,
    center_dot: true,
    trail: true,
    countdown: true,
    ppc: DEFAULTS.ppc,
    finger_cm: parseFloat(cfg_finger_cm.value) || DEFAULTS.finger_cm,
    participant: headerFieldVal('glob-id') || DEFAULT_META.participant,
    session: headerFieldVal('glob-sess') || DEFAULT_META.session,
    date: headerFieldVal('glob-date') || DEFAULT_META.date,
    hand: ['B','R','L'].includes(meta_hand.value) ? meta_hand.value : 'B',
    notes: DEFAULT_META.notes
  };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
  loadSettingsIntoRuntime();
  appendLog('<div class="small-muted">Settings saved</div>');
}
function loadSettingsFromLocal(){
  try{
    const raw = localStorage.getItem(LS_SETTINGS);
    if(raw){
      const s = JSON.parse(raw);
      const currentSettings = Number(s.settings_version) >= 3;
      const currentFourSettingLayout = Number(s.settings_version) >= 5;
      cfg_targets.value = currentFourSettingLayout && Number.isFinite(Number(s.targets)) ? Math.min(20,Math.max(3,Math.round(Number(s.targets)))) : DEFAULTS.targets;
      cfg_interval.value = s.interval_s || DEFAULTS.interval_s;
      const diameterCm = currentSettings && typeof s.diameter_cm === 'number' ? s.diameter_cm : DEFAULTS.radius_cm * 2;
      cfg_diameter_cm.value = diameterCm;
      cfg_radius_cm.value = diameterCm / 2;
      cfg_edge_px.value = s.edge_px || DEFAULTS.edge_px;
      cfg_ppc.value = DEFAULTS.ppc;
      cfg_finger_cm.value = (typeof s.finger_cm === 'number') ? s.finger_cm : DEFAULTS.finger_cm;
      meta_hand.value = currentFourSettingLayout && ['B','R','L'].includes(s.hand) ? s.hand : 'B';
    } else {
      cfg_targets.value = DEFAULTS.targets;
      cfg_interval.value = DEFAULTS.interval_s;
      cfg_radius_cm.value = DEFAULTS.radius_cm;
      cfg_diameter_cm.value = DEFAULTS.radius_cm * 2;
      cfg_edge_px.value = DEFAULTS.edge_px;
      cfg_ppc.value = DEFAULTS.ppc;
      cfg_finger_cm.value = DEFAULTS.finger_cm;
      meta_hand.value = DEFAULT_META.hand;
    }
    loadSettingsIntoRuntime();
  }catch(e){ console.warn('load settings fail',e); }
}
function loadSettingsIntoRuntime(){
  cfg.targets = Math.min(20, Math.max(3, Math.round(parseFloat(cfg_targets.value) || DEFAULTS.targets)));
  cfg_targets.value = cfg.targets;
  cfg.interval_s = parseFloat(cfg_interval.value)||DEFAULTS.interval_s;
  const diameterCm = Math.min(10, Math.max(1, parseFloat(cfg_diameter_cm.value) || DEFAULTS.radius_cm * 2));
  cfg_diameter_cm.value = diameterCm;
  cfg_radius_cm.value = diameterCm / 2;
  cfg.radius_cm = diameterCm / 2;
  cfg.edge_px = Number.isFinite(parseInt(cfg_edge_px.value)) ? Math.max(0, parseInt(cfg_edge_px.value)) : DEFAULTS.edge_px;
  cfg_edge_px.value = cfg.edge_px;
  cfg.min_distance_cm = 30;
  cfg.center_dot = true;
  cfg.trail = true;
  cfg.countdown = true;
  cfg.finger_cm = parseFloat(cfg_finger_cm.value) || DEFAULTS.finger_cm;
  if(!cursorCalibrationDone){
    cursorPixelsPerCm = DEFAULTS.ppc;
    if(mode === 'cursor') pixels_per_cm = cursorPixelsPerCm;
  }
  ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;
  metaData = {
    participant: headerFieldVal('glob-id') || DEFAULT_META.participant,
    session: headerFieldVal('glob-sess') || DEFAULT_META.session,
    date: headerFieldVal('glob-date') || DEFAULT_META.date,
    hand: ['B','R','L'].includes(meta_hand.value) ? meta_hand.value : 'B',
    notes: DEFAULT_META.notes
  };
  const handSetting = metaData.hand === 'B' ? 'right and left' : metaData.hand === 'L' ? 'left only' : 'right only';
  appendLog(`<div class="small-muted">Settings applied: ${cfg.targets} movements per hand • ${cfg.interval_s}s interval • ${(cfg.radius_cm*2).toFixed(1)} cm diameter • Cursor ≥20cm / Camera 30cm movement • ${handSetting}</div>`);
  updateCalibBar();
}

/* reset settings */
function resetSettings(){
  localStorage.removeItem(LS_SETTINGS);
  loadSettingsFromLocal();
  appendLog(`<div class="small-muted">Settings reset to defaults</div>`);
}

/* WebAudio beep */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq=880, dur=120, vol=0.06){
  try{
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    setTimeout(()=>{ o.stop(); o.disconnect(); g.disconnect(); }, dur);
  }catch(e){}
}

/* MediaPipe hands (camera) */
async function initHands(){
  const handModel = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
  });
  handModel.setOptions({ modelComplexity:1, maxNumHands:1, minDetectionConfidence:0.7, minTrackingConfidence:0.7 });
  handModel.onResults(onHandsResults);
  if(typeof handModel.initialize === 'function') await handModel.initialize();
  hands = handModel;
}

function getDetectedHand(results){
  return results?.multiHandLandmarks?.[0] || null;
}

function landmarkDistancePx(a, b){
  return Math.hypot((a.x-b.x)*VIDEO_W, (a.y-b.y)*VIDEO_H);
}

/* Anatomical index-finger length: MCP(5) -> PIP(6) -> DIP(7) -> tip(8). */
function indexFingerLengthPx(landmarks){
  if(!landmarks || landmarks.length < 21) return null;
  return landmarkDistancePx(landmarks[5],landmarks[6]) +
    landmarkDistancePx(landmarks[6],landmarks[7]) +
    landmarkDistancePx(landmarks[7],landmarks[8]);
}

function fingerIsStraight(landmarks, base, middle, distal, tip){
  const path = landmarkDistancePx(landmarks[base],landmarks[middle]) +
    landmarkDistancePx(landmarks[middle],landmarks[distal]) +
    landmarkDistancePx(landmarks[distal],landmarks[tip]);
  const direct = landmarkDistancePx(landmarks[base],landmarks[tip]);
  return path > 0 && direct/path >= 0.88;
}

function isOpenCalibrationHand(landmarks){
  if(!landmarks || landmarks.length < 21) return false;
  return fingerIsStraight(landmarks,5,6,7,8) &&
    fingerIsStraight(landmarks,9,10,11,12) &&
    fingerIsStraight(landmarks,13,14,15,16) &&
    fingerIsStraight(landmarks,17,18,19,20);
}

function updateHandCalibrationIndicator(results){
  if(!cameraCalibrationRunning || cameraCalibrationDone) return;
  const landmarks = getDetectedHand(results);
  const open = isOpenCalibrationHand(landmarks);
  const detection = document.getElementById('calibDetectionStatus');
  const ready = document.getElementById('calibGuideStatus');
  if(!detection) return;
  if(ready){ ready.disabled = true; ready.style.display = 'none'; }
  detection.textContent = !landmarks
    ? 'SEARCHING FOR YOUR HAND…'
    : open ? 'OPEN HAND DETECTED ✓' : 'STRAIGHTEN ALL FINGERS';
  detection.classList.toggle('is-detected', open);
}

/* start camera */
async function startCamera(){
  const vw = 1280, vh = 720;
  try{
    VIDEO_W = vw;
    VIDEO_H = vh;
    resizeCanvasBacking();
    appendLog(`<div class="small-muted">Camera starting...</div>`);

    const stream = await navigator.mediaDevices.getUserMedia({
      video:{width:{ideal:vw},height:{ideal:vh},aspectRatio:{ideal:16/9},facingMode:'user'},
      audio:false
    });
    video.srcObject = stream;
    await video.play();
    let active = true;
    camera = {
      stop(){
        active = false;
        if(cameraFrameRequest) cancelAnimationFrame(cameraFrameRequest);
        cameraFrameRequest = null;
        stream.getTracks().forEach(track=>track.stop());
      }
    };
    const processFrame = async ()=>{
      if(!active) return;
      if(!handFrameBusy && video.readyState >= 2){
        handFrameBusy = true;
        try{
          if(hands) await hands.send({image:video});
        }catch(e){
          if(!handTrackingErrorShown){
            handTrackingErrorShown = true;
            appendLog(`<div style="color:#f88">Tracking error: ${sanitize(e?.message || String(e))}</div>`);
            statusLine.textContent = 'Tracking error';
          }
        }finally{
          handFrameBusy = false;
        }
      }
      cameraFrameRequest = requestAnimationFrame(processFrame);
    };
    cameraFrameRequest = requestAnimationFrame(processFrame);
    handTrackingErrorShown = false;

    if(video.videoWidth) VIDEO_W = video.videoWidth;
    if(video.videoHeight) VIDEO_H = video.videoHeight;
    resizeCanvasBacking();
    appendLog(`<div class="small-muted">Camera ready: ${VIDEO_W}x${VIDEO_H}</div>`);

  }catch(e){
    appendLog(`<div style="color:#f88">Camera error: ${e.message}</div>`);
    throw e;
  }
}

/* stop camera safely */
function stopCamera(){
  stopCalibrationVoiceControl();
  try{
    if(camera?.stop) camera.stop();
    if(video?.srcObject){
      const tracks = video.srcObject.getTracks();
      tracks.forEach(t=>t.stop());
      video.srcObject = null;
    }
  }catch(e){}
  camera = null;
  if(cameraFrameRequest) cancelAnimationFrame(cameraFrameRequest);
  cameraFrameRequest = null;
  hands = null;
  cameraCalibrationRunning = false;
  handFrameBusy = false;
}

function setCalibrationGuide(kicker, title, body, status='', state=''){
  const card = document.getElementById('calibPromptOverlay');
  if(!card) return;
  document.getElementById('calibGuideKicker').textContent = kicker;
  document.getElementById('calibGuideTitle').textContent = title;
  document.getElementById('calibGuideBody').textContent = body;
  const statusControl = document.getElementById('calibGuideStatus');
  if(statusControl){
    statusControl.textContent = status || '';
    statusControl.disabled = true;
    statusControl.style.display = status ? 'inline-flex' : 'none';
  }
  const detection = document.getElementById('calibDetectionStatus');
  if(detection) detection.style.display = '';
  card.classList.toggle('is-warning', state === 'warning');
  card.classList.toggle('is-success', state === 'success');
  card.classList.toggle('is-accepted', state === 'accepted');
  card.style.display = 'block';
}

function showReadyAccepted(){
  const card = document.getElementById('calibPromptOverlay');
  const status = document.getElementById('calibGuideStatus');
  if(card) card.classList.add('is-accepted');
  if(status){
    status.textContent = 'READY RECEIVED ✓';
    status.disabled = true;
  }
  beep(1040, 150, 0.08);
}

async function captureCameraCalibrationMeasurement(handName, stepIndex, totalSteps){
  cameraCalibrationRunning = true;
  handCalibrationSamples = [];
  const stepLabel = `Calibration ${stepIndex} of ${totalSteps}`;
  statusLine.textContent = `${stepLabel}: waiting for open ${handName.toLowerCase()} hand`;
  setCalibrationGuide(
    'CAMERA CALIBRATION',
    stepLabel,
    `Please open your ${handName.toLowerCase()} palm and show your hand to the camera.`,
    ''
  );
  const openDetected = await waitForOpenCalibrationHand(10000);
  if(!openDetected){
    setCalibrationGuide('TRY AGAIN','Hand not detected',`Please keep your whole ${handName.toLowerCase()} hand visible, palm facing the camera, and click Auto Calibration again.`,'','warning');
    statusLine.textContent = `${stepLabel}: hand not detected`;
    return null;
  }

  handCalibrationSamples = [];
  calibrationCaptureRunning = true;
  statusLine.textContent = `${stepLabel}: capturing`;
  setCalibrationGuide(
    'CAMERA CALIBRATION',
    `${stepLabel}: Capturing`,
    `Keep your ${handName.toLowerCase()} hand open and still.`,
    ''
  );
  await new Promise(r=>setTimeout(r, 1000));
  calibrationCaptureRunning = false;

  const samples = handCalibrationSamples.filter(Number.isFinite).sort((a,b)=>a-b);
  const medianPx = samples.length ? samples[Math.floor(samples.length/2)] : null;
  const actualFingerCm = parseFloat(cfg_finger_cm.value);
  if(!medianPx || samples.length < 3 || !actualFingerCm || actualFingerCm <= 0){
    setCalibrationGuide('TRY AGAIN','Calibration failed',`Keep the whole ${handName.toLowerCase()} hand visible, palm facing the camera, and fully straighten your fingers.`,'','warning');
    updateHandCalibrationIndicator(lastResults);
    statusLine.textContent = `${stepLabel}: try again`;
    return null;
  }

  const ppcValue = medianPx / actualFingerCm;

  // Log each completed camera calibration measurement without changing the capture/beep flow.
  // The user can intentionally place the hand close/far for the 4 trials and compare measured px values.
  const minPx = samples[0];
  const maxPx = samples[samples.length - 1];
  const calibrationLog = [
    `Camera ${stepLabel} (${handName})`,
    `measured finger length: ${medianPx.toFixed(1)} px`,
    `actual finger length: ${actualFingerCm.toFixed(2)} cm`,
    `pixels/cm: ${ppcValue.toFixed(2)}`,
    `samples: ${samples.length}`,
    `range: ${minPx.toFixed(1)}–${maxPx.toFixed(1)} px`
  ].join(' • ');
  console.log(calibrationLog);
  appendLog(`<div class="small-muted">${escapeLogHtml(calibrationLog)}</div>`);

  beep(980,160,0.08);
  setCalibrationGuide(
    'CAMERA CALIBRATION',
    `${stepLabel} complete`,
    `${stepLabel} complete.`,
    '',
    'success'
  );
  const detection = document.getElementById('calibDetectionStatus');
  if(detection){
    detection.textContent = `${stepIndex} OF ${totalSteps} COMPLETE ✓`;
    detection.classList.add('is-detected');
    detection.style.display = 'block';
  }
  statusLine.textContent = `${stepLabel} complete`;
  appendLog(`<div class="small-muted">Camera ${stepLabel.toLowerCase()} complete.</div>`);
  await new Promise(r=>setTimeout(r, 700));
  return ppcValue;
}

async function runCameraCalibrationSequence(){
  stopCalibrationVoiceControl();
  cameraCalibrationRunning = true;
  cameraCalibrationDone = false;
  cameraCalibrationMeasurements = [];
  setStartAvailability();

  const actualFingerCm = parseFloat(cfg_finger_cm.value);
  if(!actualFingerCm || actualFingerCm <= 0){
    setCalibrationGuide('CAMERA MODE','Enter index finger length','Please enter your index finger length before auto calibration.','', 'warning');
    statusLine.textContent = 'Enter index finger length before calibration';
    return false;
  }
  cfg.finger_cm = actualFingerCm;

  for(let i=0;i<CAMERA_CALIBRATION_STEPS.length;i++){
    const handName = CAMERA_CALIBRATION_STEPS[i];
    const measurement = await captureCameraCalibrationMeasurement(handName, i+1, CAMERA_CALIBRATION_STEPS.length);
    if(!Number.isFinite(measurement)){
      cameraCalibrationMeasurements = [];
      cameraCalibrationDone = false;
      setStartAvailability();
      return false;
    }
    cameraCalibrationMeasurements.push(measurement);
  }

  const averagePpc = cameraCalibrationMeasurements.reduce((a,b)=>a+b,0) / cameraCalibrationMeasurements.length;
  pixels_per_cm = averagePpc;
  cameraPixelsPerCm = averagePpc;
  cfg.ppc = averagePpc;
  cfg.finger_cm = actualFingerCm;

  const targetRadiusPx = cfg.radius_cm * pixels_per_cm;
  const usableDx = Math.max(0, VIDEO_W/2 - cfg.edge_px - targetRadiusPx);
  const usableDy = Math.max(0, VIDEO_H/2 - cfg.edge_px - targetRadiusPx);
  const centerToUpperCornerCm = Math.hypot(usableDx,usableDy) / pixels_per_cm;

  if(centerToUpperCornerCm <= 20){
    cameraCalibrationDone = false;
    beep(280,220,0.08);
    statusLine.textContent = 'Move farther away and calibrate again';
    setCalibrationGuide('MOVE FARTHER AWAY','More movement space is needed',`Center-to-corner space is ${centerToUpperCornerCm.toFixed(1)} cm. Move farther from the camera, then click Auto Calibration again.`,'','warning');
    const detection = document.getElementById('calibDetectionStatus');
    if(detection){
      detection.textContent = 'RE-CALIBRATION REQUIRED';
      detection.classList.remove('is-detected');
      detection.style.display = 'block';
    }
    setStartAvailability();
    return false;
  }

  cameraCalibrationDone = true;
  beep(1100,220,0.09);
  showCameraCalibrationFinalResult();
  appendLog(`<div class="small-muted">Camera calibration complete — average ${pixels_per_cm.toFixed(2)} px/cm from 4 measurements.</div>`);
  setStartAvailability();
  return true;
}

async function prepareCameraCalibrationView(){
  if(cameraPreparationPromise) return cameraPreparationPromise;
  cameraCalibrationRunning = true;
  setCalibrationGuide(
    'CAMERA CALIBRATION',
    'Show your open hand',
    'Please open your palm and show your hand to the camera.',
    ''
  );
  const readyStatus = document.getElementById('calibGuideStatus');
  if(readyStatus){ readyStatus.disabled = true; readyStatus.style.display = 'none'; }
  statusLine.textContent = 'Camera starting…';
  const detection = document.getElementById('calibDetectionStatus');
  if(detection){ detection.textContent = 'STARTING HAND TRACKING…'; detection.classList.remove('is-detected'); detection.style.display = 'block'; }
  cameraPreparationPromise = (async()=>{
    if(!camera) await startCamera();
    if(!hands) await initHands();
    updateHandCalibrationIndicator(lastResults);
    statusLine.textContent = 'Camera calibration ready';
  })();
  try{
    await cameraPreparationPromise;
  }finally{
    cameraPreparationPromise = null;
  }
}

async function waitForOpenCalibrationHand(timeoutMs=10000){
  const start = performance.now();
  while(performance.now() - start < timeoutMs){
    updateHandCalibrationIndicator(lastResults);
    if(isOpenCalibrationHand(getDetectedHand(lastResults))){
      return true;
    }
    await new Promise(r=>setTimeout(r, 100));
  }
  return false;
}

async function performAutomaticCameraCalibration(){
  await prepareCameraCalibrationView();
  try{
    resizeCanvasBacking();
    return await runCameraCalibrationSequence();
  }finally{
    calibrationCaptureRunning = false;
  }
}


function stopCalibrationVoiceControl(){
  clearTimeout(voiceRestartTimer);
  voiceRestartTimer = null;
  if(speechRecognition){
    const recognition = speechRecognition;
    speechRecognition = null;
    try{ recognition.onend = null; recognition.stop(); }catch(e){}
  }
}

function startCalibrationVoiceControl(){
  return;
  if(mode !== 'camera' || calibrationCaptureRunning || cameraCalibrationDone || speechRecognition) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recognition){
    updateHandCalibrationIndicator(lastResults);
    return;
  }
  const recognition = new Recognition();
  speechRecognition = recognition;
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;
  recognition.onresult = (event)=>{
    for(let i=event.resultIndex;i<event.results.length;i++){
      const alternatives = Array.from(event.results[i]).map(r=>String(r.transcript||'').trim().toLowerCase());
      const heard = alternatives.join(' | ');
      const readyHeard = /\bready\b|\balready\b|\breddy\b|\bred e\b|레디|준비/.test(heard);
      if(readyHeard && !calibrationCaptureRunning && isOpenCalibrationHand(getDetectedHand(lastResults))){
        stopCalibrationVoiceControl();
        calibrateBtn.click();
        break;
      }
    }
  };
  recognition.onerror = (event)=>{
    const status = document.getElementById('calibGuideStatus');
    if(event.error === 'not-allowed' || event.error === 'service-not-allowed'){
      stopCalibrationVoiceControl();
      updateHandCalibrationIndicator(lastResults);
    }else if(status){
      status.textContent = 'LISTENING…';
    }
  };
  recognition.onend = ()=>{
    if(speechRecognition === recognition) speechRecognition = null;
    if(mode === 'camera' && cameraCalibrationRunning && !calibrationCaptureRunning && !cameraCalibrationDone){
      voiceRestartTimer = setTimeout(startCalibrationVoiceControl, 500);
    }
  };
  try{
    recognition.start();
    updateHandCalibrationIndicator(lastResults);
  }catch(e){
    speechRecognition = null;
  }
}

/* Latest MediaPipe Hands result used for fingertip tracking. */
let lastResults = null;
let drawRequest = null;
function onHandsResults(results){
  lastResults = results;
  const landmarks = getDetectedHand(results);
  if(cameraCalibrationRunning && calibrationCaptureRunning && isOpenCalibrationHand(landmarks)){
    handCalibrationSamples.push(indexFingerLengthPx(landmarks));
  }
  updateHandCalibrationIndicator(results);

  if(!drawRequest) drawRequest = requestAnimationFrame(drawFrame);
}

/* compute letterbox layout */
function computeLetterboxLayout(cssW, cssH, vidW, vidH){
  const scale = Math.min(cssW / vidW, cssH / vidH);
  const destW = vidW * scale;
  const destH = vidH * scale;
  const offsetX = (cssW - destW) / 2;
  const offsetY = (cssH - destH) / 2;
  return { destW, destH, offsetX, offsetY, scale };
}

/* draw frame dispatcher */
function drawFrame(){
  if(mode === 'cursor') return drawCursorFrame();
  return drawCameraFrame();
}

function drawCursorFrame(){
  return drawFrameInternal();
}

function drawCameraFrame(){
  return drawFrameInternal();
}

/* shared drawing implementation; mode-specific entry points above keep the public
   control flow separated while preserving the proven camera drawing behavior. */
function drawFrameInternal(){
  drawRequest = null;
  // CSS dims of canvas
  const cssW = parseFloat(canvas.style.width);
  const cssH = parseFloat(canvas.style.height);

  // For camera mode we letterbox the camera feed; for cursor mode we treat canvas as full working area.
  let layout;
  if(mode === 'camera'){
    layout = computeLetterboxLayout(cssW, cssH, VIDEO_W, VIDEO_H);
    drawLayout = layout;
    // clear canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,cssW,cssH);
    // draw mirrored video into letterbox region
    if(video && video.readyState >= 2){
      ctx.save();
      ctx.translate(layout.offsetX + layout.destW, layout.offsetY);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, VIDEO_W, VIDEO_H, 0, 0, layout.destW, layout.destH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#000"; ctx.fillRect(layout.offsetX, layout.offsetY, layout.destW, layout.destH);
    }
    if(calibrationFreezeImage && performance.now() < calibrationFreezeUntil && calibrationFreezeImage.complete){
      ctx.drawImage(calibrationFreezeImage, 0, 0, cssW, cssH);
    }
  } else {
    // cursor mode: canvas is blank working area (no camera). We'll treat VIDEO_W/VIDEO_H as logical working dims.
    const vidW = cssW, vidH = cssH;
    layout = { destW: vidW, destH: vidH, offsetX:0, offsetY:0, scale:1 };
    drawLayout = layout;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,cssW,cssH);
    // draw a subtle background for cursor mode
    ctx.fillStyle = '#04121a';
    ctx.fillRect(0,0,cssW,cssH);
  }

  if(mode === 'camera' && cameraCalibrationRunning){
    const guideCtx = canvas.getContext('2d');
    guideCtx.save();
    const handLm = getDetectedHand(lastResults);
    if(handLm){
      const mapHand = p => ({
        x: layout.offsetX + layout.destW - p.x*layout.destW,
        y: layout.offsetY + p.y*layout.destH
      });
      guideCtx.strokeStyle = 'rgba(255,255,255,.9)';
      guideCtx.lineWidth = 2;
      for(const [a,b] of HAND_CONNECTIONS){
        const p1=mapHand(handLm[a]), p2=mapHand(handLm[b]);
        guideCtx.beginPath(); guideCtx.moveTo(p1.x,p1.y); guideCtx.lineTo(p2.x,p2.y); guideCtx.stroke();
      }
      // Emphasize the measured index-finger chain (5-6-7-8).
      guideCtx.strokeStyle = '#facc15';
      guideCtx.lineWidth = 7;
      for(const [a,b] of [[5,6],[6,7],[7,8]]){
        const p1=mapHand(handLm[a]), p2=mapHand(handLm[b]);
        guideCtx.beginPath(); guideCtx.moveTo(p1.x,p1.y); guideCtx.lineTo(p2.x,p2.y); guideCtx.stroke();
      }
      guideCtx.fillStyle = '#38bdf8';
      for(const p of handLm){
        const q=mapHand(p);
        guideCtx.beginPath();
        guideCtx.arc(q.x,q.y,4,0,Math.PI*2);
        guideCtx.fill();
      }
    }
    guideCtx.restore();
  }

  // draw targets & trail & trial text (map coordinates depending on mode)
  if(trialRunning && trialState){
    // mapping function: world px coords (based on VIDEO_W/VIDEO_H) -> canvas coords
    const mapX = (x) => (layout.offsetX + (mode === 'camera' ? (layout.destW - (x * (layout.destW/VIDEO_W))) : x * (layout.destW / VIDEO_W)));
    const mapY = (y) => (layout.offsetY + (mode === 'camera' ? (y * (layout.destH/VIDEO_H)) : y * (layout.destH / VIDEO_H)));

    const tx = trialState.target.x, ty = trialState.target.y, r_px = trialState.target.radius_px;
    const txCanvas = mapX(tx);
    const tyCanvas = mapY(ty);
    const ctx = canvas.getContext('2d');
    if(trialState.positions.length > 1){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 0.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mapX(trialState.positions[0].x), mapY(trialState.positions[0].y));
      for(let i=1;i<trialState.positions.length;i++){
        const p = trialState.positions[i], prev = trialState.positions[i-1];
        if(p.segment !== prev.segment) ctx.moveTo(mapX(p.x),mapY(p.y));
        else ctx.lineTo(mapX(p.x),mapY(p.y));
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,200,120,0.98)';
    ctx.beginPath(); ctx.arc(txCanvas, tyCanvas, Math.round(r_px * (layout.destW / VIDEO_W)), 0, Math.PI*2); ctx.fill();
    // info (text non-mirrored / drawn at top-left of working area)
    ctx.fillStyle = "#fff"; ctx.font = '14px Inter';
    ctx.fillText(`Trial ${trialIndex+1}/${cfg.targets}`, layout.offsetX + 12, layout.offsetY + 20);
  }

  // trail animation display (map points)
  if(trailAnimation){
    const now = performance.now();
    const t = Math.min(1, (now - trailAnimation.start) / trailAnimation.duration);
    const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
    const sx = trailAnimation.startPt.x, sy = trailAnimation.startPt.y;
    const ex = trailAnimation.endPt.x, ey = trailAnimation.endPt.y;
    const dx_ = sx + (ex - sx)*ease;
    const dy_ = sy + (ey - sy)*ease;
    // map
    const mapX = (x) => (drawLayout.offsetX + (mode === 'camera' ? (drawLayout.destW - (x * (drawLayout.destW/VIDEO_W))) : x * (drawLayout.destW / VIDEO_W)));
    const mapY = (y) => (drawLayout.offsetY + (y * (drawLayout.destH / VIDEO_H)));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,0,0.95)';
    ctx.beginPath(); ctx.arc(mapX(dx_), mapY(dy_), 8, 0, Math.PI*2); ctx.fill();
    if(t >= 1) trailAnimation = null;
  }

  // Always draw the live fingertip last so it remains visible during both
  // calibration and the test, including when it overlaps a filled target.
  if(mode === 'camera' && lastResults?.multiHandLandmarks?.length > 0){
    const tip = lastResults.multiHandLandmarks[0][8];
    const cx = layout.offsetX + layout.destW - (tip.x * layout.destW);
    const cy = layout.offsetY + (tip.y * layout.destH);
    const frameCtx = canvas.getContext('2d');
    frameCtx.save();
    frameCtx.fillStyle = 'rgba(255,45,45,0.98)';
    frameCtx.strokeStyle = '#ffffff';
    frameCtx.lineWidth = 1.5;
    frameCtx.beginPath();
    frameCtx.arc(cx, cy, 7, 0, Math.PI*2);
    frameCtx.fill();
    frameCtx.stroke();
    frameCtx.restore();
  }

  // handle trial logic outside of draw transforms
  if(trialRunning && trialState){
    if(mode === 'camera'){
      handleFrameForTrial(lastResults);
    } else {
      handleFrameForTrialCursor();
    }
  }
}

/* coordinate conversions
   Cursor and Camera modes keep separate conversion helpers so changes in one
   measurement mode do not accidentally affect the other. The legacy px_to_cm
   and cm_to_px names remain as a safe shared dispatch layer for analysis code. */
function cursorPxToCm(px){ return px / cursorPixelsPerCm; }
function cursorCmToPx(cm){ return Math.round(cm * cursorPixelsPerCm); }
function cameraPxToCm(px){ return px / pixels_per_cm; }
function cameraCmToPx(cm){ return Math.round(cm * pixels_per_cm); }
function px_to_cm(px){ return mode === 'cursor' ? cursorPxToCm(px) : cameraPxToCm(px); }
function cm_to_px(cm){ return mode === 'cursor' ? cursorCmToPx(cm) : cameraCmToPx(cm); }

/* ============================================================
   Dysmetria + tremor scoring (replaces the old single-metric
   trial_sara_score / dead enhanced_sara_score). See RT_SCORING_CONFIG
   above for the thresholds, weight, and full literature citations.
   ============================================================ */

// Dysmetria: distance (cm) from the target at the "arrival point" —
// the moment the cursor stops reaching and starts merely holding
// position (see findArrivalIndex). Trial-level technical/missing data remain
// unavailable; SARA score 4 is assigned only by the five-movement rule.
function dysmetria_score(arrival_dist_cm, missed){
  if(missed || arrival_dist_cm === null || arrival_dist_cm === undefined || Number.isNaN(arrival_dist_cm)) return null;
  return bucketFromCm(arrival_dist_cm, RT_SCORING_CONFIG.dysmetriaBucketsCm);
}

// Tremor: max deviation (cm) from the arrival point during the hold
// phase (arrival -> end of trial). Null when there was no measurable
// hold phase (e.g. arrival happened right at trial end, or trial missed).
function tremor_score(tremor_max_dev_cm, missed){
  if(missed) return null;
  if(tremor_max_dev_cm === null || tremor_max_dev_cm === undefined || Number.isNaN(tremor_max_dev_cm)) return null;
  return bucketFromCm(tremor_max_dev_cm, RT_SCORING_CONFIG.tremorBucketsCm);
}

// Combined score: weighted round of dysmetria + tremor (RT_SCORING_CONFIG.weights).
// If tremor is unavailable for this trial, falls back to dysmetria alone
// (weight renormalized to 1.0) rather than failing the whole trial —
// same "score what we can, flag what we can't" philosophy used in SD.
function combined_rt_score(dScore, tScore){
  if(dScore === null || dScore === undefined) return null;
  if(tScore === null || tScore === undefined){
    return { score: dScore, tremorAvailable: false };
  }
  const W = RT_SCORING_CONFIG.weights;
  const raw = dScore * W.dysmetria + tScore * W.tremor;
  return { score: Math.min(4, Math.max(0, Math.round(raw))), tremorAvailable: true };
}

/* Find the index in trialState.positions where the cursor "arrives":
   velocity has dropped to <= peakVelocityThresholdPct of that trial's
   peak velocity and stayed there for >= minSustainMs. Returns null if
   no such point was found before the movement window ended. */
function findArrivalIndex(positions, velocities){
  const cfg_ = RT_SCORING_CONFIG.arrival;
  let peak = 0, peakIdx = 0;
  for(let i=0;i<velocities.length;i++){
    if(velocities[i] > peak){ peak = velocities[i]; peakIdx = i; }
  }
  if(peak <= 0) return null;
  const thresh = peak * cfg_.peakVelocityThresholdPct;
  let slowStartIdx = null, slowStartT = null;
  // velocities[i] is the speed between positions[i] and positions[i+1]
  // Search only after peak velocity; pre-movement stillness is not arrival.
  for(let i=peakIdx+1;i<velocities.length;i++){
    if(velocities[i] <= thresh){
      if(slowStartIdx === null){ slowStartIdx = i; slowStartT = positions[i].t; }
      if(positions[i+1].t - slowStartT >= cfg_.minSustainMs){
        return slowStartIdx;
      }
    } else {
      slowStartIdx = null; slowStartT = null;
    }
  }
  return null;
}

function pushFrameTouch(trialIdx, frameIdx, ts, x_px, y_px, inside){
  allTouches.push({trialIdx,frameIdx,ts,x_px,y_px,inside,hand:metaData.hand});
}

/* Remove only an isolated one-frame out-and-back tracking spike. The raw
   MediaPipe positions remain stored separately. A point is replaced only
   when it jumps at least 2.5 cm away, returns close to the preceding path,
   and the full event lasts no more than 120 ms. This avoids general-purpose
   smoothing that could erase genuine dysmetria or 3–5 Hz tremor. */
function filterTrackingSpikes(rawPositions){
  const filtered = rawPositions.map(p => ({...p, tracking_outlier:false}));
  for(let i=1;i<rawPositions.length-1;i++){
    const a = rawPositions[i-1], b = rawPositions[i], c = rawPositions[i+1];
    const abCm = px_to_cm(Math.hypot(b.x-a.x, b.y-a.y));
    const bcCm = px_to_cm(Math.hypot(c.x-b.x, c.y-b.y));
    const acCm = px_to_cm(Math.hypot(c.x-a.x, c.y-a.y));
    const eventMs = c.t - a.t;
    if(eventMs <= 120 && abCm >= 2.5 && bcCm >= 2.5 && acCm <= Math.max(1.0, Math.min(abCm,bcCm)*0.35)){
      const ratio = Math.max(0, Math.min(1, (b.t-a.t) / Math.max(1, c.t-a.t)));
      filtered[i] = {
        x: a.x + (c.x-a.x)*ratio,
        y: a.y + (c.y-a.y)*ratio,
        t: b.t,
        segment: b.segment,
        tracking_outlier: true,
        raw_x: b.x,
        raw_y: b.y
      };
    }
  }
  return filtered;
}

function velocitiesForPositions(positions){
  const velocities = [];
  for(let i=1;i<positions.length;i++){
    const dtMs = Math.max(1, positions[i].t - positions[i-1].t);
    velocities.push(Math.hypot(positions[i].x-positions[i-1].x, positions[i].y-positions[i-1].y) / dtMs * 1000);
  }
  return velocities;
}

/* Shared per-frame sample handler for both cursor and camera modes.
   Tracks position+timestamp history (for velocity / arrival detection),
   a frame log with real timestamps (for a fps-independent
   percent_time_inside), and reaction_time (first radius entry, kept for
   backward-compat/CSV continuity even though dysmetria/tremor now drive
   the score). cx/cy null means "no fingertip/cursor detected this frame". */
function processTrialSample(cx, cy, fingertip){
  if(!trialRunning || !trialState) return;
  const now = performance.now();
  if(now >= trialState.end_time_ms){
    finalizeTrialAndScheduleNext();
    return;
  }
  const frameIdx = trialState.positions.length + trialState.missingFrames;
  const timestamp = (new Date()).toISOString();

  let inside = false;
  if(fingertip){
    if(trialState.lastSampleMissing) trialState.currentSegment++;
    trialState.raw_positions.push({x:cx, y:cy, t:now, segment:trialState.currentSegment});
    trialState.lastSampleMissing = false;
    trialState.positions = filterTrackingSpikes(trialState.raw_positions);
    trialState.velocities = velocitiesForPositions(trialState.positions);
    const currentFiltered = trialState.positions[trialState.positions.length-1];
    const dist_px = Math.hypot(currentFiltered.x - trialState.target.x, currentFiltered.y - trialState.target.y);
    inside = dist_px <= trialState.target.radius_px;
    pushFrameTouch(trialIndex+1, frameIdx, timestamp, cx, cy, inside);
    if(inside && trialState.reaction_time === null){
      trialState.reaction_time = (now - trialState.start_time_ms)/1000.0;
    }
  } else {
    trialState.missingFrames++;
    trialState.lastSampleMissing = true;
  }
  trialState.inside_flags.push(inside);
  trialState.frameLog.push({t: now, inside});

  if(trialState.positions.length > 0){
    const last = trialState.positions[trialState.positions.length-1];
    const cur_dist_cm = px_to_cm(Math.hypot(last.x - trialState.target.x, last.y - trialState.target.y));
    statusLine.textContent = `Running — current err: ${cur_dist_cm.toFixed(2)} cm`;
  } else {
    statusLine.textContent = `Running — no touch yet`;
  }

  trialLine.textContent = `Trial: ${trialIndex+1}/${cfg.targets}`;

  if(trialState.positions.length >= 3){
    const detectedIdx = findArrivalIndex(trialState.positions, trialState.velocities);
    if(detectedIdx !== null){
      trialState.arrival_index = detectedIdx;
    }
  }
  if(trialState.arrival_index !== null){
    // The target window always ends on its scheduled two-second boundary.
    // Everything after arrival within that same window is hold/tremor data.
    const remaining = Math.max(0, (trialState.end_time_ms - now) / 1000);
    statusLine.textContent = `Hold still — tremor capture ${remaining.toFixed(1)} s`;
  }
}

function handleFrameForTrial(results){
  let fingertip = false, cx=null, cy=null;
  if(results && results.multiHandLandmarks && results.multiHandLandmarks.length>0){
    const tip = results.multiHandLandmarks[0][8];
    cx = Math.round(tip.x * VIDEO_W);
    cy = Math.round(tip.y * VIDEO_H);
    fingertip = true;
  }
  processTrialSample(cx, cy, fingertip);
}

function handleFrameForTrialCursor(){
  let fingertip = false, cx=null, cy=null;
  if(lastMousePos){
    fingertip = true;
    const canvasCssW = parseFloat(canvas.style.width), canvasCssH = parseFloat(canvas.style.height);
    const scaleX = VIDEO_W / canvasCssW;
    const scaleY = VIDEO_H / canvasCssH;
    cx = Math.round(lastMousePos.x * scaleX);
    cy = Math.round(lastMousePos.y * scaleY);
  }
  processTrialSample(cx, cy, fingertip);
}

function makeTrajectoryPng(positions, target, arrivalIndex, hand, runTrial){
  const w = 1280, h = 960;
  const plot = document.createElement('canvas');
  plot.width = w; plot.height = h;
  const pctx = plot.getContext('2d');
  pctx.fillStyle = '#04121a';
  pctx.fillRect(0, 0, w, h);
  const sx = w / VIDEO_W, sy = h / VIDEO_H;
  const mapX = x => mode === 'camera' ? w - x * sx : x * sx;
  const mapY = y => y * sy;

  if(positions.length > 1){
    pctx.strokeStyle = 'rgba(255,255,255,0.95)';
    pctx.lineWidth = 1;
    pctx.lineJoin = 'round';
    pctx.lineCap = 'round';
    pctx.beginPath();
    pctx.moveTo(mapX(positions[0].x), mapY(positions[0].y));
    for(let i=1;i<positions.length;i++){
      const p = positions[i], prev = positions[i-1];
      if(p.segment !== prev.segment) pctx.moveTo(mapX(p.x),mapY(p.y));
      else pctx.lineTo(mapX(p.x),mapY(p.y));
    }
    pctx.stroke();
  }

  pctx.fillStyle = 'rgba(0,200,120,0.98)';
  pctx.beginPath();
  pctx.arc(mapX(target.x), mapY(target.y), Math.max(2, target.radius_px * sx), 0, Math.PI*2);
  pctx.fill();

  if(arrivalIndex !== null && positions[arrivalIndex]){
    const a = positions[arrivalIndex];
    pctx.fillStyle = '#ff2d2d';
    pctx.strokeStyle = '#ffffff';
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.arc(mapX(a.x), mapY(a.y), 6, 0, Math.PI*2);
    pctx.fill(); pctx.stroke();
  }

  pctx.fillStyle = 'rgba(255,255,255,0.9)';
  pctx.font = '16px sans-serif';
  pctx.fillText(`${hand === 'L' ? 'Left' : 'Right'} hand · Trial ${runTrial}`, 14, 24);
  return plot.toDataURL('image/png');
}

function finalizeTrialAndScheduleNext(){
  if(!trialRunning || !trialState || runFinalized) return;
  const thisRunId = activeRunId;
  const completedTrial = trialState;
  trialRunning = false;
  if(completedTrial.endTimer) clearTimeout(completedTrial.endTimer);
  trialState.positions = filterTrackingSpikes(trialState.raw_positions);
  trialState.velocities = velocitiesForPositions(trialState.positions);
  trialState.arrival_index = findArrivalIndex(trialState.positions, trialState.velocities);
  const frames_recorded = trialState.inside_flags.length;
  // Cap analysis at the scheduled boundary so frame/timer jitter cannot
  // lengthen one target window beyond the configured two seconds.
  const nowEnd = Math.min(performance.now(), trialState.end_time_ms);
  const total_duration_s = (nowEnd - trialState.start_time_ms) / 1000.0;

  // fps-independent time-inside calculation (fixes the old
  // frames/hardcoded-30fps mismatch — see TASK-DESIGN-RATIONALE.md).
  // Each inter-frame interval's duration is attributed to the inside/
  // outside state recorded at the start of that interval; the final
  // interval (last sample -> trial end) is attributed the same way.
  const log = trialState.frameLog;
  let time_inside_ms = 0;
  for(let i=0;i<log.length-1;i++){
    const dt = log[i+1].t - log[i].t;
    if(log[i].inside) time_inside_ms += dt;
  }
  if(log.length){
    const lastEntry = log[log.length-1];
    const remain = Math.max(0, nowEnd - lastEntry.t);
    if(lastEntry.inside) time_inside_ms += remain;
  }
  const time_inside_s = time_inside_ms / 1000.0;
  const percent_time_inside = total_duration_s > 0 ? 100.0 * time_inside_s / total_duration_s : 0;
  const measured_fps = total_duration_s > 0 ? frames_recorded / total_duration_s : null;

  const missed = (trialState.positions.length === 0);

  // Final (last-recorded-position) distance — kept for CSV continuity.
  let final_dist_px=null, final_dist_cm=null;
  if(trialState.positions.length > 0){
    const last = trialState.positions[trialState.positions.length-1];
    final_dist_px = Math.hypot(last.x - trialState.target.x, last.y - trialState.target.y);
    final_dist_cm = px_to_cm(final_dist_px);
  }

  // Arrival point (see findArrivalIndex). Without a detected movement
  // offset, dysmetria is unavailable; the last frame is not substituted.
  let arrival_dist_cm = null, arrivalDetected = false;
  let tremor_max_dev_cm = null;
  if(!missed){
    const arrIdx = trialState.arrival_index;
    const useIdx = arrIdx;
    arrivalDetected = (arrIdx !== null);
    if(useIdx !== null){
      const arrivalPos = trialState.positions[useIdx];
      arrival_dist_cm = px_to_cm(Math.hypot(arrivalPos.x - trialState.target.x, arrivalPos.y - trialState.target.y));

    // Post-arrival phase: arrival point -> this target's fixed window end.
    // P95 radial deviation is measured around the median hold position.
      const holdCutoff = trialState.end_time_ms;
      const holdPositions = trialState.positions.slice(useIdx + 1).filter(p => p.t <= holdCutoff);
      if(holdPositions.length > 0){
      const median = values => {
        const a = values.slice().sort((x,y)=>x-y), m = Math.floor(a.length/2);
        return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
      };
      const centerX = median(holdPositions.map(p=>p.x));
      const centerY = median(holdPositions.map(p=>p.y));
      const radial = holdPositions.map(p=>Math.hypot(p.x-centerX,p.y-centerY)).sort((a,b)=>a-b);
      const p95 = radial[Math.min(radial.length-1, Math.ceil(radial.length*0.95)-1)];
        tremor_max_dev_cm = px_to_cm(p95);
      }
    }
  }

  const dScore = dysmetria_score(arrival_dist_cm, missed);
  const tScore = tremor_score(tremor_max_dev_cm, missed);
  const combined = combined_rt_score(dScore, tScore);
  const runTrial = trialIndex + 1;
  const safeToken = value => String(value || '').replace(/[^a-z0-9_-]+/gi, '_') || 'unknown';
  const safeParticipant = safeToken(metaData.participant || 'participant');
  const handCode = metaData.hand === 'L' ? 'L' : 'R';
  const trajectoryImageFile = `${safeParticipant}_${safeToken(metaData.date)}_${safeToken(metaData.session)}_${handCode}_T${runTrial}_trajectory.png`;
  const trajectoryImagePng = makeTrajectoryPng(trialState.positions, trialState.target, trialState.arrival_index, handCode, runTrial);
  const trackingOutliers = trialState.positions.filter(p => p.tracking_outlier).length;
  const trackingOutlierPct = trialState.positions.length ? trackingOutliers / trialState.positions.length * 100 : 0;

  // Camera-mode low-fps flag: below RT_SCORING_CONFIG.minReliableFps the
  // Nyquist limit falls inside the cited cerebellar tremor band (3-8 Hz,
  // see [5]) so the tremor reading for this trial is informational only.
  const lowFpsFlag = (mode === 'camera' && measured_fps !== null && measured_fps < RT_SCORING_CONFIG.minReliableFps);

  const summary = {
    trial: allTargetSummaries.length + 1,
    tx: trialState.target.x, ty: trialState.target.y,
    radius_px: trialState.target.radius_px, radius_cm: cfg.radius_cm,
    final_dist_cm: final_dist_cm !== null ? final_dist_cm : null,
    final_dist_px: final_dist_px !== null ? final_dist_px : null,
    arrival_dist_cm,
    arrivalDetected,
    tremor_cm: tremor_max_dev_cm,
    smoothness: null,
    time_inside_s,
    percent_time_inside,
    reaction_time: trialState.reaction_time,
    frames_recorded,
    measured_fps,
    lowFpsFlag,
    missed,
    run_trial: runTrial,
    hand: handCode,
    trajectory_image_file: trajectoryImageFile,
    trajectory_image_png: trajectoryImagePng,
    tracking_outliers: trackingOutliers,
    tracking_outlier_pct: trackingOutlierPct,
    dysmetria_score: dScore,
    tremor_score: tScore,
    trial_score: dScore,
    tremorAvailableInScore: combined ? combined.tremorAvailable : false,
    // Legacy field kept identical to trial_score for any downstream
    // consumer that still reads enhanced_score from earlier CSV exports.
    enhanced_score: combined ? combined.score : null
  };
  allTargetSummaries.push(summary);

  if(missed){
    appendLog(`<div>⚠️ <strong>Target ${summary.trial} — Missing</strong> — no valid touch detected in ${cfg.interval_s}s<br><small>Score: (not counted)</small></div>`);
  } else {
    const rt_ms = summary.reaction_time !== null ? Math.round(summary.reaction_time*1000) : '-';
    const tremorText = tScore !== null ? tScore : '—' + (summary.tremorAvailableInScore ? '' : ' (no hold phase / unavailable)');
    const arrivalText = summary.arrival_dist_cm !== null
      ? `${summary.arrival_dist_cm.toFixed(2)} cm (dysmetria ${dScore})`
      : 'unavailable (no velocity-defined arrival detected)';
    appendLog(`<div class="trial-log-entry"><div class="trial-log-text">🎯 <strong>Target ${summary.trial}</strong><br>
      Arrival error: ${arrivalText}<br>
      Post-arrival P95 radius: ${summary.tremor_cm !== null ? summary.tremor_cm.toFixed(2)+' cm' : 'n/a'} (experimental score ${tremorText})${lowFpsFlag ? ' <small>(low camera fps — low confidence)</small>' : ''}<br>
      Reaction time: ${rt_ms} ms<br>
      Percent time inside: ${summary.percent_time_inside.toFixed(1)}%<br>
      Tracking spikes removed: ${summary.tracking_outliers} (${summary.tracking_outlier_pct.toFixed(1)}%)<br>
      SARA-aligned dysmetria score: ${summary.trial_score}<br>
      CeMoQu weighted score: ${summary.enhanced_score ?? 'n/a'}</div><a class="trajectory-thumb-link" href="${summary.trajectory_image_png}" download="${summary.trajectory_image_file}" title="Download ${summary.trajectory_image_file}"><img class="trajectory-thumb" src="${summary.trajectory_image_png}" alt="${handCode === 'L' ? 'Left' : 'Right'} hand trial ${runTrial} trajectory" /></a></div>`);
  }

  trialState = null;
  activeTrialStartLog = null;
  trialIndex++;
  if(thisRunId !== activeRunId || runFinalized) return;
  if(trialIndex < cfg.targets && running){
    if(cfg.trail && allTargetSummaries.length >= 1){
      const prev = targets[Math.max(0, trialIndex-1)];
      const next = targets[trialIndex];
      startTrail(prev, next);
    }
    // No arrival wait and no inter-trial delay: targets change on the
    // absolute 0/2/4/6/8-second schedule.
    startTrialInternal();
  } else {
    finalizeRunAndLog();
  }
}

function startTrialInternal(){
  if(!running || runFinalized || trialIndex >= cfg.targets) return;
  const [tx,ty] = targets[trialIndex];
  const radius_px = cm_to_px(cfg.radius_cm);
  const scheduledStartMs = runTestStartMs + trialIndex * cfg.interval_s * 1000;
  const scheduledEndMs = runTestStartMs + (trialIndex + 1) * cfg.interval_s * 1000;
  trialState = {
    target: {x:tx, y:ty, radius_px},
    raw_positions: [], // unmodified MediaPipe samples retained for audit/export
    positions: [],      // {x,y,t} — t = performance.now() ms
    velocities: [],     // px/s, velocities[i] is between positions[i] and positions[i+1]
    inside_flags: [],
    frameLog: [],        // {t, inside} for every processed frame (fps-independent timing)
    reaction_time: null,
    arrival_index: null,
    start_time_ms: scheduledStartMs,
    end_time_ms: scheduledEndMs,
    endTimer: null,
    missingFrames: 0,
    currentSegment: 0,
    lastSampleMissing: false
  };
  trialRunning = true;
  const thisRunId = activeRunId;
  const thisTrialIndex = trialIndex;
  trialState.endTimer = setTimeout(()=>{
    if(thisRunId === activeRunId && trialRunning && trialState && trialIndex === thisTrialIndex){
      finalizeTrialAndScheduleNext();
    }
  }, Math.max(0, scheduledEndMs - performance.now()));
  activeTrialStartLog = appendLog(`<div class="small-muted">Starting trial ${trialIndex+1} (radius ${cfg.radius_cm} cm)</div>`);
  beep(900,100,0.04);
}

async function finalizeRunAndLog(){
  if(runFinalized) return;
  const thisRunId = activeRunId;
  runFinalized = true;
  running = false;
  trialRunning = false;
  appendLog(`<div class="small-muted">Finalizing run...</div>`);
  const summaries = allTargetSummaries.slice(runStartSummaryIndex);
  const scored = summaries.filter(s=>!s.missed && (typeof s.trial_score === 'number'));
  const scores = scored.map(s => s.trial_score).filter(v=>v!==null && v!==undefined);

  let totalScoreText = 'SARA Finger Chase Score: unavailable';
  let finalScore = null;
  // Tracking loss or failure of the velocity detector is not the same as
  // the clinical SARA category "unable to perform 5 pointing movements".
  // Never manufacture score 4 from missing automated measurements.
  const lastThree = summaries.slice(-3);
  if(summaries.length === cfg.targets && lastThree.every(s=>!s.missed && typeof s.trial_score === 'number')){
    const arr = lastThree.map(s=>s.trial_score);
    const avg = arr.reduce((a,b)=>a+b,0)/arr.length;
    finalScore = avg;
    totalScoreText = `SARA Finger Chase Score: ${finalScore.toFixed(2)} (average of last 3 movements)`;
  } else if(summaries.some(s=>s.missed)){
    totalScoreText = 'SARA Finger Chase Score: unavailable (hand tracking was missing; not automatically scored as 4)';
  } else if(summaries.length !== 5){
    totalScoreText = 'SARA Finger Chase Score: unavailable (run incomplete)';
  } else {
    totalScoreText = 'SARA Finger Chase Score: unavailable (arrival could not be detected in all of the last 3 movements)';
  }

  appendLog(`<div style="margin-top:8px"><strong>✅ Test completed successfully.</strong></div>`);
  appendLog(`<div style="margin-top:6px"><strong>${totalScoreText}</strong></div>`);
  const mean = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const mean_sara_score = finalScore;
  const mean_enhanced_score = mean(summaries.map(s => s.enhanced_score).filter(v => typeof v === 'number'));
  const mean_dysmetria_score = mean(summaries.map(s => s.dysmetria_score).filter(v => typeof v === 'number'));
  const mean_tremor_score = mean(summaries.map(s => s.tremor_score).filter(v => typeof v === 'number'));
  const mean_arrival_dist_cm = mean(summaries.map(s => s.arrival_dist_cm).filter(v => typeof v === 'number'));
  const mean_distance_to_target_cm = mean(summaries.map(s => s.final_dist_cm).filter(v => typeof v === 'number'));
  const mean_time_to_target_s = mean(summaries.map(s => s.reaction_time).filter(v => typeof v === 'number'));
  const mean_percent_time_inside = mean(summaries.map(s => s.percent_time_inside).filter(v => typeof v === 'number'));
  const mean_tremor = mean(summaries.map(s => s.tremor_cm).filter(v => typeof v === 'number'));
  const mean_smoothness = mean(summaries.map(s => s.smoothness).filter(v => typeof v === 'number'));

  const clinicianScoreEl = document.getElementById('clinicianScore');
  const researchNotesEl = document.getElementById('researchNotes');

  const runSummary = {
    ts: new Date().toISOString(),
    session_id: `${metaData.participant}_${metaData.date}_${metaData.session}`,
    participant_id: metaData.participant,
    session: metaData.session,
    date: metaData.date,
    hand: metaData.hand,
    mode,
    num_targets: cfg.targets,
    mean_sara_score,
    mean_enhanced_score,
    mean_dysmetria_score,
    mean_tremor_score,
    mean_arrival_dist_cm,
    mean_distance_to_target_cm,
    mean_time_to_target_s,
    mean_percent_time_inside,
    mean_tremor,
    mean_smoothness,
    notes: metaData.notes,
    cfg: {...cfg},
    targets: summaries,
    finalScore,
    scoringConfig: {...RT_SCORING_CONFIG, weights:{...RT_SCORING_CONFIG.weights}},
    clinicalReference: {
      clinicianRatedSaraFingerChaseScore: (clinicianScoreEl && clinicianScoreEl.value !== '') ? Number(clinicianScoreEl.value) : null,
      notes: researchNotesEl ? researchNotesEl.value : ''
    }
  };
  window.lastRunSummary = runSummary;
  allFinalSummaries.push(runSummary);
  running = false;
  firstTrialCountdownDone = false;

  const completedHand = metaData.hand;
  handSessionResults.push(runSummary);
  await showPhaseMessage(`${completedHand === 'L' ? 'Left' : 'Right'} hand test is complete.`, 1000);
  if(sessionHandIndex + 1 < sessionHands.length && thisRunId === activeRunId){
    sessionHandIndex++;
    metaData.hand = sessionHands[sessionHandIndex];
    await beginCurrentHandRun();
  }else if(thisRunId === activeRunId){
    showFinalTestResult();
  }
}

/* Cursor-mode target generator. Consecutive targets must be at least
   minDistancePx apart. This uses the touchscreen working area and stays
   intentionally separate from the camera-mode 30 cm path generator. */
function generateCursorTargets(count, minDistancePx, radiusPx, width=VIDEO_W, height=VIDEO_H){
  const margin = radiusPx + cfg.edge_px;
  const minX = margin, maxX = width - margin;
  const minY = margin, maxY = height - margin;
  if(count < 1 || minX >= maxX || minY >= maxY) return null;

  const randomPoint = () => [
    minX + Math.random() * (maxX - minX),
    minY + Math.random() * (maxY - minY)
  ];

  for(let pathAttempt = 0; pathAttempt < 120; pathAttempt++){
    const path = [randomPoint()];
    let failed = false;

    while(path.length < count){
      const prev = path[path.length - 1];
      let chosen = null;

      for(let candidateAttempt = 0; candidateAttempt < 500; candidateAttempt++){
        const candidate = randomPoint();
        const fromPrev = Math.hypot(candidate[0] - prev[0], candidate[1] - prev[1]);
        const distinctFromPath = path.every(q =>
          Math.hypot(candidate[0] - q[0], candidate[1] - q[1]) > Math.max(radiusPx * 2, 2)
        );
        if(fromPrev >= minDistancePx && distinctFromPath){
          chosen = candidate;
          break;
        }
      }

      if(!chosen){
        failed = true;
        break;
      }
      path.push(chosen);
    }

    if(!failed && path.length === count) return path;
  }
  return null;
}

/* Camera-mode target generator wrapper. It deliberately preserves the existing
   exact-distance camera path algorithm. */
function generateCameraTargets(count, distancePx, radiusPx, width=VIDEO_W, height=VIDEO_H){
  return generateExactDistanceTargets(count, distancePx, radiusPx, width, height);
}

/* Build all requested targets in one bounded search. Every consecutive pair is
   constructed at exactly distancePx; there is no approximate/farthest fallback. */
function generateExactDistanceTargets(count, distancePx, radiusPx, width=VIDEO_W, height=VIDEO_H){
  const margin = radiusPx + cfg.edge_px;
  // Only target centers are restricted to the upper 70% of the frame.
  // Video capture and MediaPipe tracking continue over the full frame.
  const minX=margin, maxX=width-margin, minY=margin, maxY=Math.min(height*0.70-radiusPx,height-margin);
  if(count < 1 || minX >= maxX || minY >= maxY) return null;
  const inside = p => p[0]>=minX && p[0]<=maxX && p[1]>=minY && p[1]<=maxY;
  const distinct = (p,path) => path.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>Math.max(2,radiusPx));
  const starts = [[(minX+maxX)/2,(minY+maxY)/2],[minX,minY],[maxX,minY],[minX,maxY],[maxX,maxY]];
  for(let i=0;i<32;i++) starts.push([minX+Math.random()*(maxX-minX),minY+Math.random()*(maxY-minY)]);
  const phase = Math.random()*Math.PI*2;
  const angles = Array.from({length:180},(_,i)=>phase+i*Math.PI/90);
  function extend(path){
    if(path.length===count) return path;
    const prev=path[path.length-1];
    for(const angle of angles){
      const next=[prev[0]+distancePx*Math.cos(angle),prev[1]+distancePx*Math.sin(angle)];
      if(inside(next) && distinct(next,path)){
        const result=extend([...path,next]);
        if(result) return result;
      }
    }
    return null;
  }
  for(const start of starts){
    const result=extend([start]);
    if(result) return result;
  }
  return null;
}

function startTrail(startPt, endPt, duration=260){
  if(!cfg.trail) return;
  trailAnimation = {start:performance.now(), duration, startPt:{x:startPt[0],y:startPt[1]}, endPt:{x:endPt[0],y:endPt[1]}}; 
}

async function runCountdownAndCue(){
  if(!cfg.countdown) return;
  countdownOverlay.classList.remove('phase-message');
  countdownOverlay.style.display = 'flex';
  const seq = [3,2,1];
  for(let i=0;i<seq.length;i++){
    countdownOverlay.textContent = String(seq[i]);
    beep(700 - i*100, 180, 0.06);
    await new Promise(r=>setTimeout(r, 1000));
  }
  countdownOverlay.style.display = 'none';
}

async function showPhaseMessage(message, durationMs){
  countdownOverlay.classList.add('phase-message');
  countdownOverlay.textContent = message;
  countdownOverlay.style.display = 'flex';
  await new Promise(r=>setTimeout(r,durationMs));
  countdownOverlay.style.display = 'none';
  countdownOverlay.classList.remove('phase-message');
}

function scoreText(value){
  return typeof value === 'number' ? value.toFixed(2) : 'Unavailable';
}

function showFinalTestResult(){
  const right = handSessionResults.find(r=>r.hand==='R');
  const left = handSessionResults.find(r=>r.hand==='L');
  let finalScore = null;
  if(right && left && typeof right.finalScore==='number' && typeof left.finalScore==='number'){
    finalScore = (right.finalScore + left.finalScore) / 2;
  }else if(handSessionResults.length===1){
    finalScore = handSessionResults[0].finalScore;
  }
  const extendedValues = handSessionResults.map(r=>r.mean_enhanced_score).filter(v=>typeof v==='number');
  const extended = extendedValues.length ? extendedValues.reduce((a,b)=>a+b,0)/extendedValues.length : null;
  const handRows = right && left
    ? `<div>Right Hand&nbsp;&nbsp; ${scoreText(right.finalScore)}</div><div>Left Hand&nbsp;&nbsp; ${scoreText(left.finalScore)}</div><div>Average&nbsp;&nbsp; ${scoreText(finalScore)}</div>`
    : `<div>${handSessionResults[0]?.hand==='L'?'Left':'Right'} Hand&nbsp;&nbsp; ${scoreText(finalScore)}</div><div>Bilateral score not available</div>`;
  testResultOverlay.innerHTML = `<div class="result-kicker">TEST COMPLETE</div><div class="result-title">RANDOM TARGET TEST SCORE</div><div class="result-score">${scoreText(finalScore)}</div><div class="result-hands">${handRows}</div><div class="result-extended">CeMoQu Extended Score&nbsp;&nbsp; ${scoreText(extended)}</div>`;
  testResultOverlay.style.display = 'flex';
  const bilateralSummary = {
    ts:new Date().toISOString(),
    session_id:`${metaData.participant}_${metaData.date}_${metaData.session}`,
    participant_id:metaData.participant, session:metaData.session, date:metaData.date,
    hand:right&&left?'B':(handSessionResults[0]?.hand||null), mode,
    num_targets:cfg.targets, finalScore, mean_sara_score:finalScore,
    mean_enhanced_score:extended,
    right_score:right?.finalScore??null, left_score:left?.finalScore??null,
    targets:handSessionResults.flatMap(r=>r.targets||[]), hand_runs:handSessionResults.slice(), cfg:{...cfg}
  };
  window.lastBilateralRunSummary = bilateralSummary;
  window.lastRunSummary = bilateralSummary;
}

let firstTrialCountdownDone = false;
let skipNextRunCountdown = false;
let activeRunId = 0;
let runStartSummaryIndex = 0;
let runFinalized = false;
let activeTrialStartLog = null;
let runTestStartMs = 0;
let sessionHands = [];
let sessionHandIndex = 0;
let handSessionResults = [];

async function beginCurrentHandRun(){
  if(mode === 'cursor') return beginCursorHandRun();
  return beginCameraHandRun();
}

function resetHandRunState(){
  runFinalized = false;
  running = true;
  trialRunning = false;
  trialIndex = 0;
  targets = [];
  runStartSummaryIndex = allTargetSummaries.length;
}

async function startPreparedHandRun(thisRunId){
  const handName = metaData.hand === 'L' ? 'Left' : 'Right';
  await showPhaseMessage(`The ${handName.toLowerCase()}-hand test will begin.`, 3000);
  if(thisRunId !== activeRunId) return;
  await runCountdownAndCue();
  if(thisRunId !== activeRunId) return;
  if(mode === 'cursor') attachCursorListeners();
  runTestStartMs = performance.now();
  startTrialInternal();
}

async function beginCursorHandRun(){
  const thisRunId = activeRunId;
  resetHandRunState();

  const cursorMinDistanceCm = 20;
  const cursorMinDistancePx = cursorCmToPx(cursorMinDistanceCm);
  const radiusPx = cursorCmToPx(cfg.radius_cm);
  const generatedTargets = generateCursorTargets(cfg.targets, cursorMinDistancePx, radiusPx);

  if(!generatedTargets){
    running = false;
    statusLine.textContent = `Unable to place ${cfg.targets} targets at least ${cursorMinDistanceCm} cm apart`;
    appendLog(`<div style="color:#f88">Cursor target generation failed: the calibrated touchscreen area cannot contain the requested ${cfg.targets}-movement path with at least ${cursorMinDistanceCm} cm between consecutive targets.</div>`);
    return;
  }

  targets = generatedTargets;
  await startPreparedHandRun(thisRunId);
}

async function beginCameraHandRun(){
  const thisRunId = activeRunId;
  resetHandRunState();

  const cameraDistanceCm = 30;
  const exactDistancePx = cameraCmToPx(cameraDistanceCm);
  const radiusPx = cameraCmToPx(cfg.radius_cm);
  const generatedTargets = generateCameraTargets(cfg.targets, exactDistancePx, radiusPx);

  if(!generatedTargets){
    running = false;
    statusLine.textContent = `Unable to place ${cfg.targets} targets ${cameraDistanceCm} cm apart`;
    appendLog(`<div style="color:#f88">Target generation failed: calibrated camera view cannot contain the requested ${cfg.targets}-movement ${cameraDistanceCm} cm path.</div>`);
    return;
  }

  targets = generatedTargets;
  await startPreparedHandRun(thisRunId);
}


startBtn.addEventListener('click', async ()=>{
  const thisRunId = ++activeRunId;
  runFinalized = false;
  running = false;
  trialRunning = false;
  saveSettingsToLocal();
  clearPreviousResultsAndMessages();

  // camera init only if in camera mode
  if(mode === 'camera'){
    if(!cameraCalibrationDone){
      setCalibrationGuide('CAMERA MODE','Calibration required','Please enter your index finger length and click Auto Calibration before starting the test.','', 'warning');
      statusLine.textContent = 'Auto calibration required before Start Test';
      setStartAvailability();
      return;
    }
    cameraCalibrationRunning = false;
    pixels_per_cm = cameraPixelsPerCm;
    ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;
    resizeCanvasBacking();
    const overlay = document.getElementById('calibPromptOverlay');
    if(overlay) overlay.style.display = 'none';
  } else {
    if(!cursorCalibrationDone){
      showCursorModeInstruction();
      setCalibrationStatus('Calibration required', 'warning');
      statusLine.textContent = 'Verify cursor calibration before starting';
      return;
    }
    const overlay = document.getElementById('calibPromptOverlay');
    if(overlay) overlay.style.display = 'none';
    // cursor mode: set VIDEO_W/VIDEO_H to working canvas virtual pixel space (CSS pixels)
    const viewerRect = viewer.getBoundingClientRect();
    VIDEO_W = Math.max(1, Math.floor(viewerRect.width));
    VIDEO_H = Math.max(1, Math.floor(viewerRect.height));
    resizeCanvasBacking();
    calibUI.style.display = 'flex';
  }

  sessionHands = metaData.hand === 'B' ? ['R','L'] : [metaData.hand];
  sessionHandIndex = 0;
  handSessionResults = [];
  metaData.hand = sessionHands[0];
  await beginCurrentHandRun();
});


cfg_finger_cm?.addEventListener('input', ()=>{
  if(mode !== 'camera') return;
  cameraCalibrationDone = false;
  cameraCalibrationMeasurements = [];
  setStartAvailability();
  statusLine.textContent = 'Camera Mode: enter index finger length, then click Auto Calibration';
  setCalibrationGuide('CAMERA MODE','Enter index finger length','Please enter your index finger length, then click Auto Calibration.','', '');
});

/* stop */
stopBtn.addEventListener('click', ()=>{
  activeRunId++;
  runFinalized = true;
  running = false;
  if(trialState?.endTimer) clearTimeout(trialState.endTimer);
  trialRunning = false;
  trialState = null;
  calibrationCaptureRunning = false;
  if(activeTrialStartLog?.isConnected) activeTrialStartLog.remove();
  activeTrialStartLog = null;
  detachCursorListeners();
  countdownOverlay.style.display = 'none';
  testResultOverlay.style.display = 'none';
  document.getElementById('calibPromptOverlay').style.display = 'none';
  // Camera mode remains live. The unfinished trial never reaches the summary,
  // log, export, or database payload.
  statusLine.textContent = mode === 'camera' && camera ? 'Camera ready' : 'Ready';
});

/* Camera calibration uses the Auto Calibration button; the overlay status is not a Ready button. */
document.getElementById('calibGuideStatus')?.addEventListener('click', ()=>{});

/* calibrate button (camera or user) */
calibrateBtn.addEventListener('click', async ()=>{
  if(mode === 'camera'){
    cameraCalibrationDone = false;
    cameraCalibrationMeasurements = [];
    setStartAvailability();
    calibrateBtn.disabled = true;
    try{
      const ok = await performAutomaticCameraCalibration();
      if(!ok){
        calibrateBtn.disabled = false;
      }
    }catch(e){
      const detection = document.getElementById('calibDetectionStatus');
      if(detection){ detection.textContent = 'MEDIAPIPE FAILED TO START'; detection.classList.remove('is-detected'); detection.style.display = 'block'; }
      statusLine.textContent = 'MediaPipe failed to start';
      appendLog(`<div style="color:#f88">MediaPipe startup error: ${sanitize(e?.message || String(e))}</div>`);
      calibrateBtn.disabled = false;
    }
    if(cameraCalibrationDone){
      calibrateBtn.disabled = false;
    }
    return;
  } else {
    const measuredCm = parseFloat(measuredDistance.value);
    if(!measuredCm || measuredCm <= 0){
      alert('Enter the measured length of the orange calibration bar.');
      return;
    }
    const barWidthPx = calibBar.getBoundingClientRect().width;
    pixels_per_cm = barWidthPx / measuredCm;
    cursorPixelsPerCm = pixels_per_cm;
    cfg_ppc.value = pixels_per_cm.toFixed(2);
    ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;
    updateCalibBar();
    cursorCalibrationDone = true;
    showCursorCalibrationResult();
    setStartAvailability();
    appendLog(`<div class="small-muted">Cursor calibration verified — ${pixels_per_cm.toFixed(2)} px/cm</div>`);
  }
});

/* export CSV (3 files) - include mode in final summary export */
exportBtn.addEventListener('click', ()=>{
  const sanitize = (value) => String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
  const participant = sanitize(metaData.participant || DEFAULT_META.participant) || 'P000';
  const sessionLabel = sanitize(metaData.session || DEFAULT_META.session) || 'S1';
  const dateLabel = (metaData.date || DEFAULT_META.date).slice(0,10);
  const handLabel = (metaData.hand && metaData.hand.trim()) ? sanitize(metaData.hand) : 'Unknown';
  const sessionId = `${participant}_${dateLabel}_${sessionLabel}`;
  const fileSuffix = `${participant}${dateLabel}${sessionLabel}`;

  // touches csv
  const touchesHeader = ['touch_id','session_id','target_id','participant_id','session','date','hand','trial_idx','frame_idx','timestamp','x_px','y_px','inside'];
  const touchesLines = [touchesHeader.join(',')];
  for(const t of allTouches){
    const rowHand = t.hand === 'L' ? 'L' : 'R';
    const targetId = `${sessionId}_${rowHand}_T${t.trialIdx}`;
    const touchId = `${targetId}_F${t.frameIdx}`;
    touchesLines.push([
      touchId,
      sessionId,
      targetId,
      participant,
      sessionLabel,
      dateLabel,
      rowHand,
      t.trialIdx,
      t.frameIdx,
      t.ts,
      t.x_px===undefined?'':t.x_px,
      t.y_px===undefined?'':t.y_px,
      t.inside?1:0
    ].join(','));
  }
  downloadBlob(touchesLines.join('\n'), `RT_touches_${fileSuffix}.csv`);

  // targets summary csv
  const targHeader = ['target_id','session_id','participant_id','session','date','hand','trial_global_index','run_trial','trajectory_image_file','tracking_spikes_removed','tracking_spike_pct','x_px','y_px','radius_cm','radius_px','distance_to_target_cm','arrival_dist_cm','arrival_detected','tremor_cm','tremor_available_in_score','dysmetria_score','tremor_score','time_to_target_s','percent_time_inside','frames_recorded','measured_fps','low_fps_flag','missed','valid','sara_score','enhanced_score'];
  const targLines = [targHeader.join(',')];
  for(const s of allTargetSummaries){
    const rowHand = s.hand === 'L' ? 'L' : 'R';
    const targetId = `${sessionId}_${rowHand}_T${s.run_trial}`;
    const valid = s.missed ? 0 : 1;
    targLines.push([
      targetId,
      sessionId,
      participant,
      sessionLabel,
      dateLabel,
      rowHand,
      s.trial,
      s.run_trial || '',
      s.trajectory_image_file || '',
      s.tracking_outliers || 0,
      Number.isFinite(s.tracking_outlier_pct) ? s.tracking_outlier_pct.toFixed(2) : '',
      s.tx,
      s.ty,
      s.radius_cm,
      s.radius_px,
      s.final_dist_cm!==null ? s.final_dist_cm.toFixed(3):'',
      s.arrival_dist_cm!==null && s.arrival_dist_cm!==undefined ? s.arrival_dist_cm.toFixed(3):'',
      s.arrivalDetected?1:0,
      s.tremor_cm!==null && s.tremor_cm!==undefined ? s.tremor_cm.toFixed(3):'',
      s.tremorAvailableInScore?1:0,
      s.dysmetria_score!==null && s.dysmetria_score!==undefined ? s.dysmetria_score : '',
      s.tremor_score!==null && s.tremor_score!==undefined ? s.tremor_score : '',
      s.reaction_time!==null ? s.reaction_time.toFixed(3):'',
      s.percent_time_inside.toFixed(2),
      s.frames_recorded,
      s.measured_fps!==null && s.measured_fps!==undefined ? s.measured_fps.toFixed(1) : '',
      s.lowFpsFlag?1:0,
      s.missed?1:0,
      valid,
      s.trial_score!==null ? s.trial_score.toFixed(3) : '',
      s.enhanced_score!==null ? s.enhanced_score.toFixed(3) : ''
    ].join(','));
  }
  downloadBlob(targLines.join('\n'), `RT_targets_summary_${fileSuffix}.csv`);

  // final summary
  const clinicianScoreEl = document.getElementById('clinicianScore');
  const researchNotesEl = document.getElementById('researchNotes');
  const clinicianScoreVal = (clinicianScoreEl && clinicianScoreEl.value !== '') ? clinicianScoreEl.value : '';
  const researcherNotesVal = researchNotesEl ? researchNotesEl.value.replace(/[\r\n,]+/g,' ') : '';
  const finalHeader = ['session_id','participant_id','session','trial','date','hand','mode','num_targets','trajectory_image_file','tracking_spikes_removed','tracking_spike_pct','sara_score','enhanced_score','dysmetria_score','tremor_score','distance_to_target_cm','arrival_dist_cm','tremor_cm','time_to_target_s','percent_time_inside','clinician_sara_finger_chase_score','researcher_notes','notes'];
  const finalLines = [finalHeader.join(',')];
  for(const f of allFinalSummaries){
    for(const s of f.targets){
      finalLines.push([
        f.session_id,
        f.participant_id,
        f.session,
        s.trial,
        f.date,
        f.hand,
        f.mode,
        f.num_targets,
        s.trajectory_image_file || '',
        s.tracking_outliers || 0,
        Number.isFinite(s.tracking_outlier_pct) ? s.tracking_outlier_pct.toFixed(2) : '',
        s.trial_score !== null ? s.trial_score.toFixed(3) : '',
        s.enhanced_score !== null ? s.enhanced_score.toFixed(3) : '',
        s.dysmetria_score !== null && s.dysmetria_score !== undefined ? s.dysmetria_score : '',
        s.tremor_score !== null && s.tremor_score !== undefined ? s.tremor_score : '',
        s.final_dist_cm !== null ? s.final_dist_cm.toFixed(3) : '',
        s.arrival_dist_cm !== null && s.arrival_dist_cm !== undefined ? s.arrival_dist_cm.toFixed(3) : '',
        s.tremor_cm !== null && s.tremor_cm !== undefined ? s.tremor_cm.toFixed(3) : '',
        s.reaction_time !== null ? s.reaction_time.toFixed(3) : '',
        s.percent_time_inside.toFixed(2),
        clinicianScoreVal,
        researcherNotesVal,
        f.notes || ''
      ].join(','));
    }
  }
  downloadBlob(finalLines.join('\n'), `RT_final_summary_${fileSuffix}.csv`);
  appendLog(`<div class="small-muted">Exported CSVs</div>`);
});

/* helper download */
function downloadBlob(text, filename){
  const blob = new Blob([text], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* clear log */
clearLogBtn.addEventListener('click', ()=>{ clearLog(); });

/* save/apply settings */
saveSettingsBtn.addEventListener('click', ()=>{
  saveSettingsToLocal();
  if(settingsSavedMsg){
    settingsSavedMsg.textContent = '✓ Settings saved';
    clearTimeout(settingsSavedMsg._hideTimer);
    settingsSavedMsg._hideTimer = setTimeout(()=>{ settingsSavedMsg.textContent = ''; }, 3000);
  }
});
resetSettingsBtn.addEventListener('click', ()=>{ resetSettings(); });

/* attach/detach cursor listeners */
function attachCursorListeners(){
  canvas.style.cursor = 'crosshair';
  canvas.addEventListener('mousemove', onCanvasMouseMove);
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  canvas.addEventListener('mouseup', onCanvasMouseUp);
  canvas.addEventListener('mouseleave', onCanvasMouseLeave);
}
function detachCursorListeners(){
  canvas.style.cursor = 'default';
  canvas.removeEventListener('mousemove', onCanvasMouseMove);
  canvas.removeEventListener('mousedown', onCanvasMouseDown);
  canvas.removeEventListener('mouseup', onCanvasMouseUp);
  canvas.removeEventListener('mouseleave', onCanvasMouseLeave);
  lastMousePos = null;
}

/* mouse handlers store last position in CSS pixels (relative to canvas) */
function onCanvasMouseMove(e){
  const rect = canvas.getBoundingClientRect();
  lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
function onCanvasMouseDown(e){
  cursorIsDown = true;
  onCanvasMouseMove(e);
}
function onCanvasMouseUp(e){
  cursorIsDown = false;
  onCanvasMouseMove(e);
}
function onCanvasMouseLeave(e){
  lastMousePos = null;
}

/* update calibration bar width according to pixels_per_cm and current canvas scale
   ensure bar doesn't overflow viewer area — cap to viewer width - margins
*/
function updateCalibBar(){
  const viewerRect = viewer.getBoundingClientRect();
  const pxFor8_5cm = Math.round(pixels_per_cm * 8.5);
  const maxWidth = Math.max(24, Math.floor(viewerRect.width - 48)); // leave margins
  const w = Math.min(pxFor8_5cm, maxWidth);
  calibBar.style.width = w + 'px';
}

/* Mode toggle click handlers */
modeCursor.addEventListener('click', ()=>{
  setMode('cursor');
});
modeCamera.addEventListener('click', ()=>{
  setMode('camera');
});
function setMode(m){
  if(m === mode){
    return;
  }
  mode = m;
  clearPreviousResultsAndMessages();
  clearCalibrationStatus();
  
  if(mode === 'cursor'){
    modeCursor.classList.add('active');
    modeCamera.classList.remove('active');
    pixels_per_cm = cursorPixelsPerCm;
    ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;
    // stop camera if running; keep session calibration value in memory.
    stopCalibrationVoiceControl();
    stopCamera();
    calibUI.style.display = 'flex';
    if(calibInputs) calibInputs.style.display = 'flex';
    if(barLengthField) barLengthField.style.display = 'block';
    if(fingerLengthField) fingerLengthField.style.display = 'none';
    calibrateBtn.textContent = 'Verify Calibration';
    calibrateBtn.disabled = false;
    if(cursorCalibrationDone){
      showCursorCalibrationResult();
    }else{
      calibInstr.textContent = 'Measure the orange bar with a physical ruler and enter its length in centimeters.';
      showCursorModeInstruction();
    }
  } else {
    modeCamera.classList.add('active');
    modeCursor.classList.remove('active');
    pixels_per_cm = cameraPixelsPerCm;
    ppcLabel.textContent = `Pixels/cm: ${pixels_per_cm.toFixed(2)}`;
    if(calibUI) calibUI.style.display = 'none';
    if(calibInputs) calibInputs.style.display = 'flex';
    if(barLengthField) barLengthField.style.display = 'none';
    if(fingerLengthField) fingerLengthField.style.display = 'block';
    calibrateBtn.textContent = 'Auto Calibration';
    calibrateBtn.disabled = false;
    statusLine.textContent = 'Camera Mode: enter index finger length, then click Auto Calibration';
    if(cameraCalibrationDone){
      showCameraCalibrationFinalResult();
    }else{
      setCalibrationGuide('CAMERA MODE','Enter index finger length','Please enter your index finger length, then click Auto Calibration.','', '');
    }
  }
  setStartAvailability();
}

/* Run initialization */
/* ============================================================
   RESEARCH tab: dysmetria/tremor weight bar (reuses the SD module's
   weight-bar drag pattern per the CeMoQu design principle 2026-09-08).
   Single handle: 0% = all-dysmetria, 100% = all-tremor, snaps to 10%.
   ============================================================ */
(function wireWeightBar(){
  const weightBar = document.getElementById('weightBar');
  const wHandle1 = document.getElementById('wHandle1');
  const wLabelDysmetria = document.getElementById('wLabelDysmetria');
  const wLabelTremor = document.getElementById('wLabelTremor');
  const showScoringBtn = document.getElementById('showScoringBtn');
  const scoringDetails = document.getElementById('scoringDetails');
  if(!weightBar || !wHandle1) return;

  function renderWeightBar(){
    const tPct = Math.round(RT_SCORING_CONFIG.weights.tremor * 100);
    wHandle1.style.left = (100 - tPct) + '%';
    if(wLabelDysmetria) wLabelDysmetria.textContent = `Dysmetria ${Math.round(RT_SCORING_CONFIG.weights.dysmetria*100)}%`;
    if(wLabelTremor) wLabelTremor.textContent = `Tremor ${tPct}%`;
  }

  function applyHandlePct(pct){
    const tremorPct = Math.max(0, Math.min(100, Math.round(pct/10)*10));
    RT_SCORING_CONFIG.weights = { dysmetria: (100-tremorPct)/100, tremor: tremorPct/100 };
    renderWeightBar();
  }

  function pctFromClientX(clientX){
    const rect = weightBar.getBoundingClientRect();
    const dysPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return 100 - dysPct; // handle position = dysmetria%, we want tremor%
  }

  let dragging = false;
  wHandle1.addEventListener('pointerdown', (e)=>{ dragging = true; e.preventDefault(); });
  window.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    applyHandlePct(pctFromClientX(e.clientX));
  });
  window.addEventListener('pointerup', ()=>{ dragging = false; });
  wHandle1.addEventListener('keydown', (e)=>{
    const cur = Math.round(RT_SCORING_CONFIG.weights.tremor*100);
    if(e.key === 'ArrowLeft') applyHandlePct(cur - 10);
    else if(e.key === 'ArrowRight') applyHandlePct(cur + 10);
  });

  if(showScoringBtn && scoringDetails){
    showScoringBtn.addEventListener('click', ()=>{
      const hidden = scoringDetails.hidden;
      scoringDetails.hidden = !hidden;
      if(hidden){
        scoringDetails.textContent =
`Dysmetria bucket boundaries (cm, arrival-point error): ${RT_SCORING_CONFIG.dysmetriaBucketsCm.join(', ')}
Tremor bucket boundaries (cm, max hold-phase deviation): ${RT_SCORING_CONFIG.tremorBucketsCm.join(', ')}
Arrival = velocity <= ${Math.round(RT_SCORING_CONFIG.arrival.peakVelocityThresholdPct*100)}% of this trial's peak velocity, sustained >= ${RT_SCORING_CONFIG.arrival.minSustainMs} ms.
Combined score = round(dysmetria_score * ${RT_SCORING_CONFIG.weights.dysmetria.toFixed(2)} + tremor_score * ${RT_SCORING_CONFIG.weights.tremor.toFixed(2)}), clamped 0-4.
If no measurable hold phase, falls back to dysmetria score alone.
Config version: ${RT_SCORING_CONFIG.version}. See TASK-DESIGN-RATIONALE.md for full literature citations.`;
      }
    });
  }

  renderWeightBar();
})();

function init(){
  loadSettingsFromLocal();
  if(fingerLengthField) fingerLengthField.style.display = 'none';
  resizeCanvasBacking();
  showCursorModeInstruction();
  setStartAvailability();
  appendLog('<div class="small-muted">App ready. Verify settings. Use Cursor Mode for mouse-based runs; Camera Mode for a webcam.</div>');
}
init();

/* observe viewer size changes */
new ResizeObserver(()=>{ resizeCanvasBacking(); }).observe(document.getElementById('viewer'));

/* Ensure page draws continuously when running/receiving data */
(function tick(){
  if(!drawRequest) drawRequest = requestAnimationFrame(drawFrame);
  requestAnimationFrame(tick);
})();
