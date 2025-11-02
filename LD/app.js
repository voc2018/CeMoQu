'use strict';

// ===== Canvas & Globals =====
const canvas = document.getElementById("testCanvas");
const ctx = canvas.getContext("2d");
const WIDTH = 900, HEIGHT = 600, BOX_SIZE = 50;
canvas.width = WIDTH; canvas.height = HEIGHT;

let currentPatient = null;
let currentTest = null;
let testActive = false;

let touches = [], turns = [], pointerdown = false, canDraw = false;
let startBox, finishBox, startHit = false, finishHit = false, success = false;
let dx = 0, dy = 0;

let statistics = {
  discontinuities: 0,
  verticalTurns: 0,
  deviationArea: 0,
  horizontalTurns: 0,
  outOfBounds: 0,
  startFails: 0
};

let deviationMode = "total";
let turnMode = "avgVertical";

// ===== Utils =====
function toggleDarkMode() { document.body.classList.toggle("invert-colors"); }

function getCoordinatesFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function getCurrentTouch() { return touches[touches.length - 1]; }

function isInsideBox(x, y, b) {
  return x >= b[0] && x <= b[0] + BOX_SIZE && y >= b[1] && y <= b[1] + BOX_SIZE;
}

function calcDeviation(coords) {
  const x = coords[0], y = coords[1];
  const sx = startBox[0] + BOX_SIZE/2, sy = startBox[1] + BOX_SIZE/2;
  const ex = finishBox[0] + BOX_SIZE/2, ey = finishBox[1] + BOX_SIZE/2;
  if (sx !== ex) {
    const m = (ey - sy) / (ex - sx);
    const a = -m, b = 1, c = -sy + m*sx;
    return Math.abs(a*x + b*y + c) / Math.sqrt(a*a + b*b);
  } else {
    return Math.abs(x - sx);
  }
}

// ===== Clinical Score =====
function computeClinicalScore() {
  const deviation_area = statistics.deviationArea;
  const turn_height = (turnMode === "avgVertical") ? statistics.verticalTurns : statistics.horizontalTurns;
  const discontinuities = statistics.discontinuities;
  const reverses = statistics.horizontalTurns;
  const out_of_bounds = statistics.outOfBounds;
  const start_fails = statistics.startFails;

  const score_dev = Math.min(4, deviation_area / 500);
  const score_turn = Math.min(4, turn_height / 150);
  const score_dis = Math.min(4, (discontinuities + reverses) / 5);
  const score_bounds = Math.min(4, (out_of_bounds + start_fails) / 3);
  const sara_score = (score_dev + score_turn + score_dis + score_bounds) / 4;

  let desc = "";
  if (sara_score < 0.5) desc = "Normal, smooth, accurate movement";
  else if (sara_score < 1.5) desc = "Slight tremor or inaccuracy, but target achieved";
  else if (sara_score < 2.5) desc = "Moderate tremor; instability present but functional";
  else if (sara_score < 3.5) desc = "Severe tremor; frequent overshoot or instability";
  else desc = "Inability to reach target or complete task";

  document.getElementById("clinical-score-content").innerHTML = `
    <p><strong>SARA Subscore:</strong> ${sara_score.toFixed(2)} / 4</p>
    <ul>
      <li><b>Deviation:</b> ${score_dev.toFixed(2)}</li>
      <li><b>Turns:</b> ${score_turn.toFixed(2)}</li>
      <li><b>Discontinuities:</b> ${score_dis.toFixed(2)}</li>
      <li><b>Bounds/Start Fails:</b> ${score_bounds.toFixed(2)}</li>
    </ul>
    <p><em>${desc}</em></p>
  `;

  return {
    score_dev: +score_dev.toFixed(2),
    score_turn: +score_turn.toFixed(2),
    score_dis: +score_dis.toFixed(2),
    score_bounds: +score_bounds.toFixed(2),
    sara_score: +sara_score.toFixed(2),
    description: desc,
    completed_at: new Date().toISOString()
  };
}

// ===== Stats & UI =====
function totalPointCount() { return touches.reduce((a,t)=>a + t.points.length, 0); }

function updateOffBy(th) {
  let c = 0;
  for (const t of touches) {
    let last = 0;
    for (let i=0; i<t.points.length; i++) {
      const p = t.points[i];
      const d = calcDeviation(p);
      if (d > th && last <= th) c++;
      last = d;
    }
  }
  return c;
}

function averageTurnDistance(horizontalFlag) {
  const arr = turns.filter(t => t.horizontal === horizontalFlag).map(t => t.distance);
  if (!arr.length) return 0;
  const sum = arr.reduce((a,b)=>a+b,0);
  return sum / arr.length;
}

function updateTurnDisplay() {
  // 실제 평균값 표시 (모드별)
  const avg = (turnMode === "avgVertical")
    ? averageTurnDistance(false)
    : averageTurnDistance(true);
  document.getElementById("turnValue").innerText = avg.toFixed(2);

  const btn = document.getElementById("turnModeBtn");
  btn.innerText = (turnMode === "avgVertical") ? "Avg Vertical" : "Avg Horizontal";
}

function updateStats() {
  const th = parseFloat(document.getElementById("offByThreshold").value) || 10;
  document.getElementById("offByValue").innerText = updateOffBy(th);

  let dev = statistics.deviationArea;
  if (deviationMode === "average") dev = totalPointCount() > 0 ? dev / totalPointCount() : 0;
  document.getElementById("deviationValue").innerText = dev.toFixed(2);

  document.getElementById("outOfBoundsValue").innerText = statistics.outOfBounds;
  document.getElementById("startFailsValue").innerText = statistics.startFails;
  document.getElementById("discontValue").innerText = statistics.discontinuities;
  document.getElementById("verticalTurnValue").innerText = statistics.verticalTurns;
  document.getElementById("horizontalTurnValue").innerText = statistics.horizontalTurns;

  updateTurnDisplay();
}

document.getElementById("offByThreshold").addEventListener("input", updateStats);

// ===== Drawing & Test Management =====
const tests = {
  horizontal: { name: "Horizontal Test", position: () => [[10, HEIGHT/2 - BOX_SIZE/2], [WIDTH - 10 - BOX_SIZE, HEIGHT/2 - BOX_SIZE/2]] },
  vertical:   { name: "Vertical Test",   position: () => [[WIDTH/2 - BOX_SIZE/2, 10], [WIDTH/2 - BOX_SIZE/2, HEIGHT - 10 - BOX_SIZE]] },
  diagonal1:  { name: "Diagonal Test 1", position: () => [[10, 10], [WIDTH - 10 - BOX_SIZE, HEIGHT - 10 - BOX_SIZE]] },
  diagonal2:  { name: "Diagonal Test 2", position: () => [[10, HEIGHT - 10 - BOX_SIZE], [WIDTH - 10 - BOX_SIZE, 10]] }
};

function drawBox(x,y,w,h,c="red",t="") {
  ctx.fillStyle = c;
  ctx.fillRect(x,y,w,h);
  if (t) {
    ctx.fillStyle = "white";
    ctx.font = "30px Roboto";
    const m = ctx.measureText(t);
    ctx.fillText(t, x + w/2 - m.width/2, y + h - 15);
  }
}

function drawLine(sx,sy,ex,ey,w=1) {
  ctx.beginPath();
  ctx.moveTo(sx,sy);
  ctx.lineTo(ex,ey);
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.closePath();
}

function drawSuccessText() {
  ctx.fillStyle = "green";
  ctx.font = "bold 60px Roboto";
  ctx.textAlign = "center";
  ctx.fillText("Success!", WIDTH/2, HEIGHT/2);
  ctx.textAlign = "start";
}

function redrawTest(clear = true) {
  if (clear) ctx.clearRect(0,0,canvas.width,canvas.height);
  drawLine(
    startBox[0]+BOX_SIZE/2, startBox[1]+BOX_SIZE/2,
    finishBox[0]+BOX_SIZE/2, finishBox[1]+BOX_SIZE/2, 0.5
  );
  drawBox(startBox[0], startBox[1], BOX_SIZE, BOX_SIZE, startHit ? "green" : "red", "S");
  drawBox(finishBox[0], finishBox[1], BOX_SIZE, BOX_SIZE, finishHit ? "green" : "red", "F");
  if (success) drawSuccessText();
}

function resetStats() {
  statistics = {
    discontinuities: 0,
    verticalTurns: 0,
    deviationArea: 0,
    horizontalTurns: 0,
    outOfBounds: 0,
    startFails: 0
  };
  turns = [];
  dx = 0; dy = 0;
}

function resetTest() {
  if (!currentTest) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  [startBox, finishBox] = currentTest.position();
  touches = [];
  canDraw = false;
  startHit = finishHit = success = false;
  resetStats();
  redrawTest();
  updateStats();
}

// Timer
let timerId = 0;
function startTimer() {
  const t = document.getElementById("timer");
  const now = Date.now();
  clearInterval(timerId);
  timerId = setInterval(() => {
    t.innerText = ((Date.now() - now) / 1000).toFixed(2);
  }, 10);
}
function stopTimer() { clearInterval(timerId); }

// Pointer events
canvas.addEventListener("pointerdown", e => {
  pointerdown = true;
  const c = getCoordinatesFromEvent(e);
  if (testActive && !success) {
    const d = calcDeviation(c);
    if (isInsideBox(c[0], c[1], startBox)) {
      if (startHit) {
        statistics.discontinuities++;
      } else {
        startTimer();
        canDraw = true;
        startHit = true;
        redrawTest();
      }
      touches.push({ points: [[c[0], c[1], Date.now()]] });
    } else {
      if (!startHit) {
        statistics.startFails++;
      } else {
        statistics.discontinuities++;
        touches.push({ points: [[c[0], c[1], Date.now()]] });
        statistics.deviationArea += d;
      }
    }
    updateStats();
  }
});

canvas.addEventListener("pointerleave", () => {
  if (pointerdown && canDraw && !success) {
    statistics.outOfBounds++;
    updateStats();
    pointerdown = false;
  }
});

canvas.addEventListener("pointermove", e => {
  if (pointerdown && canDraw && !success) {
    const c = getCoordinatesFromEvent(e);
    const points = getCurrentTouch().points;
    const lp = points[points.length - 1];

    // draw stroke
    ctx.beginPath();
    ctx.moveTo(lp[0], lp[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
    ctx.closePath();

    // deviation
    const d = calcDeviation(c);
    statistics.deviationArea += d;

    // direction changes
    const norm = (a) => (a > 0 ? 1 : a < 0 ? -1 : 0);
    const dxNow = norm(c[0] - lp[0]), dyNow = norm(c[1] - lp[1]);
    if (dx !== dxNow) { statistics.horizontalTurns++; turns.push({ horizontal: true, distance: d }); }
    if (dy !== dyNow) { statistics.verticalTurns++;   turns.push({ horizontal: false, distance: d }); }
    dx = dxNow; dy = dyNow;

    // push point
    points.push([c[0], c[1], Date.now()]);

    // finish?
    if (isInsideBox(c[0], c[1], finishBox)) {
      stopTimer();
      canDraw = false;
      pointerdown = false;
      finishHit = true;
      success = true;
      redrawTest(false);
      drawSuccessText();
      computeClinicalScore();
    }
    updateStats();
  }
});

canvas.addEventListener("pointerup", () => { pointerdown = false; });

function changeTest() {
  const v = document.getElementById("testSelector").value;
  currentTest = tests[v];
  testActive = true;
  resetTest();
}

function stopTest() {
  testActive = false;
  stopTimer();
  pointerdown = false;
  canDraw = false;
  computeClinicalScore();
}

function toggleDeviationMode() {
  deviationMode = (deviationMode === "total") ? "average" : "total";
  document.getElementById("deviationModeBtn").innerText =
    deviationMode.charAt(0).toUpperCase() + deviationMode.slice(1);
  updateStats();
}

function toggleTurnMode() {
  turnMode = (turnMode === "avgVertical") ? "avgHorizontal" : "avgVertical";
  updateTurnDisplay();
  updateStats();
}

// ===== Patient Management =====
const patientDialog = document.getElementById("patientDialog");

function openPatientDialog(){ patientDialog.showModal(); }

function setPatientInfo(){
  const n = document.getElementById("patientName").value;
  const id = document.getElementById("patientID").value;
  if(!n || !id) return;
  currentPatient = { name:n, id:id };
  document.getElementById("patientInfo").innerText = `${n} (ID: ${id})`;
  savePatientList();
  patientDialog.close();
}

function savePatientList(){
  let list = JSON.parse(localStorage.getItem("patients") || "[]");
  if (!list.some(p => p.id === currentPatient.id)) list.push(currentPatient);
  localStorage.setItem("patients", JSON.stringify(list));
  updatePatientDropdown();
}

function updatePatientDropdown(){
  const sel = document.getElementById("previousPatients");
  sel.innerHTML = '<option value="">Select Previous Patient</option>';
  const list = JSON.parse(localStorage.getItem("patients") || "[]");
  list.forEach(p => {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.name} (ID: ${p.id})`;
    sel.appendChild(o);
  });
}

function loadPreviousPatient(id){
  if (!id) return;
  const list = JSON.parse(localStorage.getItem("patients") || "[]");
  const p = list.find(p => p.id === id);
  if (p){
    currentPatient = p;
    document.getElementById("patientInfo").innerText = `${p.name} (ID: ${p.id})`;
  }
}

function clearAllPatients(){
  localStorage.removeItem("patients");
  updatePatientDropdown();
  document.getElementById("patientInfo").innerText = "No patient selected";
}

updatePatientDropdown();

// ===== Export =====
function exportData() {
  if (!currentPatient || !currentTest) {
    alert("Please select patient and test first.");
    return;
  }

  const clinical = computeClinicalScore();

  const exportObj = {
    patient: currentPatient,
    test: currentTest.name,
    timestamp: new Date().toISOString(),
    stats: {
      ...statistics,
      offByThreshold: parseFloat(document.getElementById("offByThreshold").value) || 10,
      offByCount: parseFloat(document.getElementById("offByValue").innerText) || 0,
      deviationMode,
      deviationShown: parseFloat(document.getElementById("deviationValue").innerText) || 0,
      turnMode,
      turnShown: parseFloat(document.getElementById("turnValue").innerText) || 0,
      clinical
    }
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ataxia_data_${currentPatient.id}_${Date.now()}.json`;
  a.click();
}

// ===== Expose to window for inline handlers =====
window.toggleDarkMode      = toggleDarkMode;
window.openPatientDialog   = openPatientDialog;
window.setPatientInfo      = setPatientInfo;
window.loadPreviousPatient = loadPreviousPatient;
window.clearAllPatients    = clearAllPatients;
window.changeTest          = changeTest;
window.stopTest            = stopTest;
window.resetTest           = resetTest;
window.exportData          = exportData;
window.toggleDeviationMode = toggleDeviationMode;
window.toggleTurnMode      = toggleTurnMode;

// ===== On first load: select a default test =====
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('testSelector');
  if (sel && sel.value) changeTest(); else {
    document.getElementById('testSelector').value = 'vertical';
    changeTest();
  }
});
