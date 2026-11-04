/* =========================
   CANVAS SETUP
========================= */

const canvas=document.getElementById("testCanvas");
const ctx=canvas.getContext("2d");

const INTERNAL_WIDTH=1000;
const INTERNAL_HEIGHT=700;

canvas.width=INTERNAL_WIDTH;
canvas.height=INTERNAL_HEIGHT;

const WIDTH=INTERNAL_WIDTH;
const HEIGHT=INTERNAL_HEIGHT;

const BOX=36;

/* =========================
   CALIBRATION
========================= */

let pixelsPerCm=0;
let cmPerPixel=0;

let calibrationVerified=false;

/* Saved calibration: restored only after the canvas size is locked and
   only if it was verified at the same locked canvas width and zoom
   (see lockCanvasSize). Older saves without that info are not restored. */
let savedCalibration=null;
(function loadSavedCalibration(){
try{
const saved=JSON.parse(localStorage.getItem("ld_cal")||"null");
if(saved&&saved.ppc>0&&saved.cpp>0){
savedCalibration=saved;
if(saved.measuredCm) document.getElementById("measuredDistance").value=saved.measuredCm;
}
}catch(e){}
})();

/* =========================
   STATE
========================= */

let currentTest=null;

let startBox,finishBox;

let active=false;
let drawing=false;
let success=false;
let trialAttempted=false;

let startHit=false;
let finishHit=false;

let touches=[];

let deviationSamples=[];

let statistics={
discontinuities:0,
verticalTurns:0,
horizontalTurns:0,
deviationAreaPx2:0,
outOfBounds:0,
startFails:0
};

/* Turn/reverse sensitivity is now driven by the on-screen "Tolerance (cm)" field
   (see updateDirectionChange), not a fixed constant. */
let xDirection=0;
let yDirection=0;
let xDirectionDistance=0;
let yDirectionDistance=0;

let timerId=0;
let trialStartTime=null;

const TRIALS_PER_TEST=5;
const completedTrials=[];
/* Trial counts per test mode AND per hand. SARA-6 (Nose-Finger) is rated
   separately for each side (Schmitz-Hübsch et al., 2006). */
const trialCounts={
horizontal:{R:0,L:0},
vertical:{R:0,L:0},
diagonal1:{R:0,L:0},
diagonal2:{R:0,L:0}
};

/* =========================
   HAND SEQUENCE
   Right → Left (same order as RT). Each hand block = TRIALS_PER_TEST
   trials and starts only after the examiner confirms the hand on the
   on-canvas prompt. Stopping mid-block keeps completed hands; the next
   Start Test redoes only the unfinished hand.
========================= */

const HAND_NAMES={R:"Right",L:"Left"};
/* Per-hand automated score = mean of the last HAND_SCORE_TRIALS trial
   scores (first trials treated as familiarization, as in RT; SARA-6 rates
   performance over three movements). Provisional — revisit with the
   tremor / path-deviation split. */
const HAND_SCORE_TRIALS=3;

let currentHand="R";
let handReady=false;
let handPromptResolve=null;

function handSequence(){
const v=document.getElementById("handSelector")?.value;
return v==="R"?["R"]:v==="L"?["L"]:["R","L"];
}

function nextHandFor(key){
return handSequence().find(h=>trialCounts[key][h]<TRIALS_PER_TEST)??null;
}

function allHandsComplete(key){
return nextHandFor(key)===null;
}

function showHandPrompt(hand){
const seq=handSequence();
const idx=seq.indexOf(hand);
const isSwitch=idx>0;
document.getElementById("handPromptKicker").textContent=isSwitch?"SWITCH HANDS":"HAND";
document.getElementById("handPromptTitle").textContent=`${HAND_NAMES[hand].toUpperCase()} HAND`;
document.getElementById("handPromptBody").textContent=isSwitch?
`${HAND_NAMES[seq[idx-1]]} hand complete. Switch to the ${HAND_NAMES[hand].toLowerCase()} hand for the next ${TRIALS_PER_TEST} trials.`:
`Use the ${HAND_NAMES[hand].toLowerCase()} hand for the next ${TRIALS_PER_TEST} trials.`;
document.getElementById("handPrompt").hidden=false;
setGuidance(isSwitch?`Switch to ${HAND_NAMES[hand].toLowerCase()} hand — press Ready.`:`${HAND_NAMES[hand]} hand — press Ready to begin.`,false);
return new Promise(resolve=>{handPromptResolve=resolve;});
}

function hideHandPrompt(){
const el=document.getElementById("handPrompt");
if(el) el.hidden=true;
handPromptResolve=null;
}

function confirmHandReady(){
const resolve=handPromptResolve;
hideHandPrompt();
if(resolve) resolve();
}

async function runHandBlock(key,hand){
currentHand=hand;
handReady=false;
updateHandScores();
appendLog(`${TEST_NAMES[key]} · ${HAND_NAMES[hand]} hand: block started.`);
await showHandPrompt(hand);
if(!sequenceRunning) return;
handReady=true;
resetForNextTrial();

if(key!=="horizontal"){
setGuidance(readyMessage(),false);
return;
}

try{
if(hand===handSequence()[0]){
setGuidance("Horizontal test is about to begin.",false);
await playAudioFile("01_intro_horizontal.mp3");
if(!sequenceRunning) return;
}
await wait(1000);
if(sequenceRunning) playTrialStart(1);
}catch(error){
console.error(error);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
document.getElementById("handSelector").disabled=false;
setGuidance("Audio failed — restart the test.",false);
}
}

async function finishHandBlock(key){
handReady=false;
const hand=currentHand;
const score=handScore(key,hand);
appendLog(`${TEST_NAMES[key]} · ${HAND_NAMES[hand]} hand complete: SARA-6 ${hand} = ${formatScore(score)}`);
updateHandScores();
const next=nextHandFor(key);
if(next&&sequenceRunning){
await wait(800);
if(sequenceRunning) runHandBlock(key,next);
return;
}
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
document.getElementById("handSelector").disabled=false;
const item=itemScore(key);
if(item!==null) appendLog(`${TEST_NAMES[key]} · SARA-6 item (R + L) / 2 = ${formatScore(item)}`);
setGuidance(`${TEST_NAMES[key]}: all hands complete.`,false,true);
}

/* =========================
   PER-HAND SCORES
========================= */

function formatScore(v){
return v===null||v===undefined?"—":(Math.round(v*100)/100).toString();
}

function handScore(key,hand){
const trials=completedTrials
.filter(t=>t.testMode===key&&t.hand===hand)
.sort((a,b)=>a.trialNumber-b.trialNumber);
if(trials.length<TRIALS_PER_TEST) return null;
const last=trials.slice(-HAND_SCORE_TRIALS);
return last.reduce((a,t)=>a+t.sara,0)/last.length;
}

function itemScore(key){
const seq=handSequence();
if(seq.length<2) return null;
const r=handScore(key,"R"),l=handScore(key,"L");
return r!==null&&l!==null?(r+l)/2:null;
}

function updateHandScores(){
const key=selectedTestKey();
const set=(id,v)=>{const el=document.getElementById(id);if(el) el.innerText=v;};
set("currentHandValue",HAND_NAMES[currentHand]);
set("handScoreRValue",formatScore(handScore(key,"R")));
set("handScoreLValue",formatScore(handScore(key,"L")));
set("itemScoreValue",formatScore(itemScore(key)));
}

function getClinicianValues(){
const val=id=>{const el=document.getElementById(id);return el&&el.value!==""?Number(el.value):null;};
const seq=handSequence();
const r=seq.includes("R")?val("clinicianScoreR"):null;
const l=seq.includes("L")?val("clinicianScoreL"):null;
const notesEl=document.getElementById("researchNotes");
return{
r,l,
item:seq.length===2&&r!==null&&l!==null?(r+l)/2:null,
notes:notesEl?notesEl.value.replace(/[\r\n]+/g," ").trim():""
};
}

const AUDIO_BASE="./audio/";
const START_AUDIO={
1:"02_start_test_1.mp3",
2:"04_start_test_2.mp3",
3:"06_start_test_3.mp3",
4:"08_start_test_4.mp3",
5:"10_start_test_5.mp3"
};
// Exact spoken onsets measured from each supplied recording.
const COUNTDOWN_CUES={
1:[[3.63,"3"],[4.58,"2"],[5.53,"1"],[6.49,"GO"]],
2:[[3.07,"3"],[4.01,"2"],[4.93,"1"],[5.87,"GO"]],
3:[[3.06,"3"],[3.98,"2"],[4.93,"1"],[5.84,"GO"]],
4:[[3.19,"3"],[4.10,"2"],[4.97,"1"],[5.89,"GO"]],
5:[[3.05,"3"],[4.00,"2"],[4.88,"1"],[5.80,"GO"]]
};
const COMPLETE_AUDIO={
1:"03_test_1_complete.mp3",
2:"05_test_2_complete.mp3",
3:"07_test_3_complete.mp3",
4:"09_test_4_complete.mp3",
5:"11_horizontal_complete.mp3"
};

let currentAudio=null;
let countdownTimerIds=[];
let sequenceRunning=false;
let trialArmed=false;

const TEST_NAMES={
horizontal:"Horizontal Test",
vertical:"Vertical Test",
diagonal1:"Diagonal Test 1",
diagonal2:"Diagonal Test 2"
};

function showGuidanceBox(){
const el=document.getElementById("testGuidance");
if(el) el.classList.remove("guidance-hidden");
}

function hideGuidanceBox(){
const el=document.getElementById("testGuidance");
if(el) el.classList.add("guidance-hidden");
}

function setGuidance(message,announce=true,isComplete=false){
const el=document.getElementById("testGuidance");
if(el){
el.textContent=message;
el.classList.toggle("complete",isComplete);
el.classList.remove("countdown");
}
showGuidanceBox();
}

function showCountdownCue(cue,trialNumber){
const el=document.getElementById("testGuidance");
if(el){
el.textContent=cue;
el.classList.remove("complete");
el.classList.add("countdown");
}
showGuidanceBox();
if(cue==="GO") beginTrialAtGo(trialNumber);
}

let audioSessionId=0;

function stopAudio(){
countdownTimerIds.forEach(clearTimeout);
countdownTimerIds=[];
audioSessionId++;
hideGuidanceBox();
if(!currentAudio) return;
currentAudio.pause();
currentAudio.currentTime=0;
currentAudio=null;
}

function playAudioFile(filename){
stopAudio();
const session=++audioSessionId;
return new Promise((resolve,reject)=>{
const audio=new Audio(AUDIO_BASE+filename);
currentAudio=audio;
audio.addEventListener("ended",()=>{
if(currentAudio===audio) currentAudio=null;
if(session===audioSessionId) hideGuidanceBox();
resolve();
},{once:true});
audio.addEventListener("error",()=>{
if(session===audioSessionId) hideGuidanceBox();
reject(new Error(`Unable to play ${filename}`));
},{once:true});
audio.play().then(()=>{
if(session===audioSessionId) showGuidanceBox();
}).catch(reject);
});
}

function wait(ms){
return new Promise(resolve=>setTimeout(resolve,ms));
}

function beginTrialAtGo(trialNumber){
if(!sequenceRunning || trialArmed) return;
trialArmed=true;
active=false;
drawing=false;
success=false;
startHit=false;
finishHit=false;
touches=[];
resetStats();
stopTimer();
document.getElementById("timer").innerText="0.00";
trialStartTime=performance.now();
timerId=setInterval(()=>{
document.getElementById("timer").innerText=
((performance.now()-trialStartTime)/1000).toFixed(2);
},10);
setGuidance(`GO — Test ${trialNumber}`,false);
}

async function playTrialStart(trialNumber){
resetForNextTrial();
trialArmed=false;
setGuidance(`Get ready for Test ${trialNumber}.`,false);

const audio=new Audio(AUDIO_BASE+START_AUDIO[trialNumber]);
stopAudio();
const session=++audioSessionId;
currentAudio=audio;
showGuidanceBox();
let goStarted=false;
const armAtGo=()=>{
if(!goStarted){
goStarted=true;
showCountdownCue("GO",trialNumber);
}
};
audio.addEventListener("ended",()=>{
armAtGo();
if(currentAudio===audio) currentAudio=null;
/* Keep the GO cue on screen briefly before it fades out. */
setTimeout(()=>{
if(session===audioSessionId) hideGuidanceBox();
},900);
},{once:true});
audio.addEventListener("error",()=>{
if(session===audioSessionId) hideGuidanceBox();
setGuidance("Audio failed — restart the test.",false);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
},{once:true});
try{
await audio.play();
COUNTDOWN_CUES[trialNumber].forEach(([time,cue])=>{
const callback=cue==="GO"?armAtGo:()=>showCountdownCue(cue,trialNumber);
countdownTimerIds.push(setTimeout(callback,Math.max(0,(time-audio.currentTime)*1000)));
});
}catch(error){
if(session===audioSessionId) hideGuidanceBox();
setGuidance("Audio failed — restart the test.",false);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
document.getElementById("handSelector").disabled=false;
}
}

async function startTestSequence(){
if(!screenReady()){
setGuidance("Enter full screen before testing.",false);
return;
}
if(!calibrationVerified){
alert("Calibration required before testing.");
return;
}
if(sequenceRunning) return;

const key=selectedTestKey();
let hand=nextHandFor(key);
let redoHands;
if(hand===null){
/* All selected hands already complete → full restart of this test mode. */
redoHands=handSequence();
hand=redoHands[0];
}else{
/* Redo only the unfinished hand; finished hands are kept. */
redoHands=[hand];
}
redoHands.forEach(h=>{trialCounts[key][h]=0;});
completedTrials.splice(0,completedTrials.length,
...completedTrials.filter(t=>!(t.testMode===key&&redoHands.includes(t.hand))));

sequenceRunning=true;
trialArmed=false;
document.getElementById("startSequenceBtn").disabled=true;
document.getElementById("testSelector").disabled=true;
document.getElementById("handSelector").disabled=true;
resetForNextTrial();
runHandBlock(key,hand);
}

function selectedTestKey(){
return document.getElementById("testSelector").value;
}

function readyMessage(){
const key=selectedTestKey();
if(!sequenceRunning||!handReady){
return allHandsComplete(key)?`${TEST_NAMES[key]}: all hands complete.`:"Select Start Test when you are ready.";
}
const next=trialCounts[key][currentHand]+1;
return `${HAND_NAMES[currentHand]} hand: press S to start test ${next}.`;
}

/* =========================
   TEST DEFINITIONS
========================= */

const tests={

horizontal:{
position:()=>[
[30,HEIGHT/2-BOX/2],
[WIDTH-30-BOX,HEIGHT/2-BOX/2]
]
},

vertical:{
position:()=>[
[WIDTH/2-BOX/2,40],
[WIDTH/2-BOX/2,HEIGHT-30-BOX]
]
},

diagonal1:{
position:()=>[
[30,40],
[WIDTH-30-BOX,HEIGHT-30-BOX]
]
},

diagonal2:{
position:()=>[
[30,HEIGHT-30-BOX],
[WIDTH-30-BOX,40]
]
}

};

/* =========================
   DRAWING
========================= */

function getOkColor(){
const v=getComputedStyle(document.documentElement).getPropertyValue("--ok").trim();
return v||"#22c55e";
}

function drawBox(x,y,label,activeColor){

/* The canvas may be displayed at a non-10:7 ratio (height is capped
   independently of width), which would otherwise stretch this square
   into a rectangle. Compensate so it always looks square on screen. */
const rect=canvas.getBoundingClientRect();
const scaleX=rect.width/WIDTH;
const scaleY=rect.height/HEIGHT;
const boxW=BOX;
const boxH=scaleY>0?BOX*(scaleX/scaleY):BOX;
const cx=x+BOX/2;
const cy=y+BOX/2;
const drawX=cx-boxW/2;
const drawY=cy-boxH/2;

ctx.fillStyle=
activeColor?getOkColor():"#ff0000";

ctx.fillRect(drawX,drawY,boxW,boxH);

ctx.fillStyle="#fff";

ctx.font="bold 16px Inter";
ctx.letterSpacing="0px";

ctx.textAlign="center";
ctx.textBaseline="middle";

/* Same non-uniform-scale issue applies to glyph shapes, not just the box:
   pre-warp the text on the opposite axis so it renders undistorted once
   the browser applies its own (possibly non-uniform) canvas scaling. */
const textYCompensation=scaleY>0?scaleX/scaleY:1;
ctx.save();
ctx.translate(cx,cy);
ctx.scale(1,textYCompensation);
ctx.fillText(label,0,0);
ctx.restore();

}

function drawReference(){

/* Reference line S → F */

ctx.strokeStyle="#475569";
ctx.lineWidth=3;

ctx.beginPath();

ctx.moveTo(
startBox[0]+BOX/2,
startBox[1]+BOX/2
);

ctx.lineTo(
finishBox[0]+BOX/2,
finishBox[1]+BOX/2
);

ctx.stroke();

}

function redraw(clear=true){

if(clear){

ctx.clearRect(
0,
0,
WIDTH,
HEIGHT
);

}

drawReference();

drawBox(
startBox[0],
startBox[1],
"S",
startHit
);

drawBox(
finishBox[0],
finishBox[1],
"F",
finishHit
);

}

/* =========================
   HELPERS
========================= */

function getCoords(e){

const r=canvas.getBoundingClientRect();

const scaleX=
canvas.width/r.width;

const scaleY=
canvas.height/r.height;

return[
(e.clientX-r.left)*scaleX,
(e.clientY-r.top)*scaleY
];

}

function isInside(x,y,box){

return(
x>=box[0] &&
x<=box[0]+BOX &&
y>=box[1] &&
y<=box[1]+BOX
);

}

function normalize(v){

return(
v>0?1:
v<0?-1:
0
);

}

function updateDirectionChange(delta,axis){

if(delta===0||!calibrationVerified)
return;

const toleranceCm=parseFloat(document.getElementById("toleranceInput").value)||0;
const thresholdPx=toleranceCm*pixelsPerCm;
const movementDirection=normalize(delta);

let direction=axis==="x"?xDirection:yDirection;
let distance=axis==="x"?xDirectionDistance:yDirectionDistance;

/* Establish the initial direction without counting it as a turn. */
if(direction===0){
distance+=Math.abs(delta);
if(distance>=thresholdPx){
direction=movementDirection;
distance=0;
}
}
/* Count only a sustained movement opposite to the current direction. */
else if(movementDirection!==direction){
distance+=Math.abs(delta);
if(distance>=thresholdPx){
direction=movementDirection;
distance=0;
if(axis==="x") statistics.horizontalTurns++;
else statistics.verticalTurns++;
}
}
/* Returning to the established direction cancels a small false reversal. */
else{
distance=0;
}

if(axis==="x"){
xDirection=direction;
xDirectionDistance=distance;
}
else{
yDirection=direction;
yDirectionDistance=distance;
}

}

function calcDeviation([x,y]){

const sx=startBox[0]+BOX/2;
const sy=startBox[1]+BOX/2;

const ex=finishBox[0]+BOX/2;
const ey=finishBox[1]+BOX/2;

if(sx!==ex){

const m=(ey-sy)/(ex-sx);

const a=-m;
const b=1;
const c=-sy+m*sx;

return Math.abs(a*x+b*y+c)/
Math.sqrt(a*a+b*b);

}

return Math.abs(x-sx);

}

function percentile(arr,p){

if(arr.length===0)
return 0;

const sorted=
[...arr].sort((a,b)=>a-b);

const index=
Math.floor(sorted.length*p);

return sorted[
Math.min(index,sorted.length-1)
];

}

/* =========================
   CALIBRATION VERIFY
========================= */

function verifyCalibration(){

if(!screenReady()){
setGuidance("Enter full screen before calibration.",false);
return;
}

const measuredCm=parseFloat(
document.getElementById("measuredDistance").value
);

if(!measuredCm || measuredCm<=0){

alert(
"Enter the measured length of the orange calibration bar."
);

return;

}

/* The sidebar bar's on-screen width is measured live (rather than assumed)
   so the math stays correct regardless of panel width or CSS changes.
   The canvas is responsive, so we also read its current displayed width to
   convert the real-world measurement into the canvas's internal 1000-unit
   coordinate space (the space all drawing/deviation math runs in). */
const barCssWidth=document.getElementById("calBarSidebar").getBoundingClientRect().width;
const canvasDisplayWidth=canvas.getBoundingClientRect().width;

const cmPerCssPx=measuredCm/barCssWidth;
const canvasCssPxPerInternalUnit=canvasDisplayWidth/WIDTH;

cmPerPixel=cmPerCssPx*canvasCssPxPerInternalUnit;

pixelsPerCm=1/cmPerPixel;

calibrationVerified=true;

localStorage.setItem(
"ld_cal",
JSON.stringify({
ppc:pixelsPerCm,
cpp:cmPerPixel,
measuredCm,
canvasW:canvasLockedSize?canvasLockedSize.w:null,
dpr:window.devicePixelRatio
})
);

document.getElementById("calibrationStatus")
.innerHTML=
'<span class="status-good">Verified</span>';

setGuidance("Select Start Test when you are ready.",false);

appendLog(`Calibration verified: ${measuredCm} cm bar → ${pixelsPerCm.toFixed(2)} canvas px/cm.`);

redraw();

updateStats();

}

/* =========================
   TIMER
========================= */

function startTimer(){

const start=Date.now();
trialStartTime=start;

clearInterval(timerId);

timerId=setInterval(()=>{

document.getElementById("timer")
.innerText=
((Date.now()-start)/1000)
.toFixed(2);

},10);

}

function stopTimer(){

clearInterval(timerId);

}

/* =========================
   RESET
========================= */

function resetStats(){

statistics={
discontinuities:0,
verticalTurns:0,
horizontalTurns:0,
deviationAreaPx2:0,
outOfBounds:0,
startFails:0
};

deviationSamples=[];

xDirection=0;
yDirection=0;
xDirectionDistance=0;
yDirectionDistance=0;

}

function resetTest(){

if(!currentTest) return;

[startBox,finishBox]=
currentTest.position();

active=false;
drawing=false;
success=false;
trialArmed=false;
trialAttempted=false;

startHit=false;
finishHit=false;

touches=[];

resetStats();

redraw();

updateStats();

stopTimer();

document.getElementById("timer")
.innerText="0.00";

if(calibrationVerified){
setGuidance("Select Start Test when you are ready.",false,allHandsComplete(selectedTestKey()));
}

}

function resetForNextTrial(){
[startBox,finishBox]=currentTest.position();
active=false;
drawing=false;
success=false;
trialAttempted=false;
startHit=false;
finishHit=false;
touches=[];
resetStats();
stopTimer();
document.getElementById("timer").innerText="0.00";
redraw();
updateStats();
}

/* =========================
   POINTER EVENTS
========================= */

canvas.addEventListener(
"pointerdown",
e=>{

if(!screenReady()) return;

if(!calibrationVerified){

alert(
"Calibration required before testing."
);

return;

}

if(selectedTestKey()==="horizontal" && (!sequenceRunning || !trialArmed)){
return;
}

/* Manual modes: drawing only inside a confirmed hand block. */
if(selectedTestKey()!=="horizontal" && (!sequenceRunning || !handReady)){
setGuidance(readyMessage(),false,allHandsComplete(selectedTestKey()));
return;
}

const[x,y]=getCoords(e);

drawing=true;

const testKey=selectedTestKey();

if(trialCounts[testKey][currentHand]>=TRIALS_PER_TEST){
setGuidance(`${HAND_NAMES[currentHand]} hand: all ${TRIALS_PER_TEST} trials are complete.`);
drawing=false;
return;
}

if(success){
resetForNextTrial();
/* resetForNextTrial() clears `drawing`; restore it for this stroke.
   (Pre-existing bug: in manual modes every second stroke was ignored.) */
drawing=true;
}

if(
isInside(x,y,startBox)
&& !active
){

active=true;

startHit=true;

trialAttempted=true;

const trialNumber=trialCounts[testKey][currentHand]+1;
setGuidance(`${HAND_NAMES[currentHand]} hand · Test ${trialNumber} in progress.`,false);

redraw();

touches.push({
points:[[x,y]]
});

}

else if(!active){

statistics.startFails++;

updateStats();

}

else{

statistics.discontinuities++;

touches.push({
points:[[x,y]]
});

updateStats();

}

});

canvas.addEventListener(
"pointermove",
e=>{

if(
!drawing ||
!active ||
success
) return;

const[x,y]=getCoords(e);

const last=
touches.at(-1).points.at(-1);

ctx.beginPath();

ctx.moveTo(
last[0],
last[1]
);

ctx.lineTo(x,y);

ctx.strokeStyle="#60a5fa";
ctx.lineWidth=2;

ctx.stroke();

const deviation=
calcDeviation([x,y]);

deviationSamples.push(
deviation
);

const segLength=Math.hypot(
x-last[0],
y-last[1]
);

statistics.deviationAreaPx2+=
deviation*segLength;

updateDirectionChange(x-last[0],"x");
updateDirectionChange(y-last[1],"y");

touches.at(-1).points.push([x,y]);

if(
isInside(x,y,finishBox)
&& !finishHit
){

finishHit=true;
success=true;

active=false;

stopTimer();

redraw(false);

completeCurrentTrial();

}

updateStats();

});

canvas.addEventListener(
"pointerup",
()=>{

drawing=false;

});

canvas.addEventListener(
"pointerleave",
()=>{

if(active && !success){

statistics.outOfBounds++;

updateStats();

}

});

/* =========================
   SARA
========================= */

/*
 SARA scoring algorithm (P95 deviation in cm):
   < 0.5 cm  → 0  Normal
   0.5–2 cm  → 1  Mild
   2–5 cm    → 2  Moderate
   > 5 cm    → 3  Severe
   not completed or not calibrated → 4  Unable to perform

 Only P95 deviation is used for scoring.
 P95 is chosen over max deviation because it reflects
 sustained error rather than isolated outliers.
 All other captured metrics (turns, reverses,
 discontinuities, area, time) are exported but do
 not contribute to the SARA score.
*/

const SARA_LABELS=[
"0 — Normal",
"1 — Mild",
"2 — Moderate",
"3 — Severe",
"4 — Unable to perform"
];

function calculateSara(p95Cm){

if(!success||!calibrationVerified)
return 4;

if(p95Cm<0.5)  return 0;  // < 0.5 cm
if(p95Cm<2)    return 1;  // 0.5–2 cm
if(p95Cm<=5)   return 2;  // 2–5 cm  (boundary 5 cm = score 2)
return 3;                 // > 5 cm

}

/* =========================
   UPDATE STATS
========================= */

function updateStats(){

/* Tolerance now controls turn-detection sensitivity (see updateDirectionChange),
   not deviation scoring — deviation is reported raw and unfiltered. */
const toleranceCm=
parseFloat(document.getElementById("toleranceInput").value)||0;

const effective=deviationSamples;

const maxPx=
effective.length?
Math.max(...effective):
0;

const meanPx=
effective.length?
effective.reduce((a,b)=>a+b,0)/
effective.length:
0;

const p95Px=
percentile(
effective,
0.95
);

const maxCm=
maxPx*cmPerPixel;

const meanCm=
meanPx*cmPerPixel;

const p95Cm=
p95Px*cmPerPixel;

const areaCm2=
statistics.deviationAreaPx2*
(cmPerPixel*cmPerPixel);

const sara=
calculateSara(p95Cm);

document.getElementById("calibrationUsed")
.innerText=
pixelsPerCm.toFixed(2)+
" canvas px/cm";

document.getElementById("cmPerPixelValue")
.innerText=
cmPerPixel.toFixed(4);

document.getElementById("calibrationResult")
.innerText=
calibrationVerified?
"Verified":
"Not Verified";

document.getElementById("discontValue")
.innerText=
statistics.discontinuities;

document.getElementById("verticalTurnValue")
.innerText=
statistics.verticalTurns;

document.getElementById("horizontalTurnValue")
.innerText=
statistics.horizontalTurns;

document.getElementById("outOfBoundsValue")
.innerText=
statistics.outOfBounds;

document.getElementById("startFailsValue")
.innerText=
statistics.startFails;

document.getElementById("maxDeviationValue")
.innerText=
`${maxPx.toFixed(2)} px / ${maxCm.toFixed(2)} cm`;

document.getElementById("p95DeviationValue")
.innerText=
`${p95Px.toFixed(2)} px / ${p95Cm.toFixed(2)} cm`;

document.getElementById("meanDeviationValue")
.innerText=
`${meanPx.toFixed(2)} px / ${meanCm.toFixed(2)} cm`;

document.getElementById("deviationAreaValue")
.innerText=
`${statistics.deviationAreaPx2.toFixed(2)} px² / ${areaCm2.toFixed(2)} cm²`;

document.getElementById("saraScoreValue")
.innerText=
trialAttempted?
(SARA_LABELS[sara]??sara):
"--";

}

/* =========================
   METRIC DEFINITIONS POPUP
========================= */

const METRIC_DEFINITIONS={

hand:{
title:"Current Hand",
text:"The hand currently being tested. With Right and Left selected, the right hand is tested first (5 trials), then the examiner confirms the switch and the left hand is tested (5 trials)."
},

handscore:{
title:"SARA-6 Right / Left",
text:"Automated per-hand score for this test mode: the mean of the last 3 trial SARA scores for that hand, once all 5 trials are complete. SARA-6 (Nose-Finger) is rated separately for each side."
},

itemscore:{
title:"SARA-6 Item (R + L) / 2",
text:"The SARA-6 item score: the arithmetic mean of the right and left scores, as in the original SARA (limb items 5–8 are rated per side and averaged; Schmitz-Hübsch et al., 2006). Shown only when both hands are selected and complete."
},

sara:{
title:"SARA Score (trial)",
text:"A 0–4 ataxia severity score modeled on the SARA Nose-Finger item (SARA-6), derived from the P95 deviation: less than 0.5 cm scores 0 (Normal), 0.5–2 cm scores 1 (Mild), 2–5 cm scores 2 (Moderate), and over 5 cm scores 3 (Severe). An incomplete trial or unverified calibration is automatically scored 4 (Unable to Perform)."
},

p95:{
title:"P95 Deviation",
text:"The 95th-percentile distance between the cursor and the ideal guide line, in pixels and centimeters, using the raw (unadjusted) deviation. This is the only metric used to calculate the SARA score, since it reflects sustained tracing error rather than one extreme outlier."
},

max:{
title:"Max Deviation",
text:"The single largest distance recorded between the cursor and the guide line during the trial, in pixels and centimeters. Captured for reference — it does not factor into the SARA score."
},

mean:{
title:"Mean Deviation",
text:"The average distance between the cursor and the guide line across every recorded sample in the trial, in pixels and centimeters."
},

area:{
title:"Deviation Area",
text:"The cumulative area swept out between the cursor's path and the ideal guide line, in px² and cm². Each movement segment's deviation is multiplied by its length and summed, so a larger area reflects more sustained drift from the line."
},

discont:{
title:"Discontinuities",
text:"The number of times the user released the mouse button and pressed again before completing the trial. Each re-press after the first counts as one discontinuity."
},

vturns:{
title:"Vertical Turns",
text:"The number of times the cursor's vertical direction (up vs. down) reversed during the trial — a proxy for vertical tremor or overcorrection."
},

hturns:{
title:"Horizontal Reverses",
text:"The number of times the cursor's horizontal direction (left vs. right) reversed during the trial — a proxy for horizontal tremor or overcorrection."
},

oob:{
title:"Out-of-Bounds",
text:"The number of times the cursor left the canvas area entirely while the trial was active and not yet completed."
},

startfails:{
title:"Start Fails",
text:"The number of times the user pressed the mouse button outside the green S (start) block before successfully beginning the trial."
},

calibration:{
title:"Calibration (px/cm)",
text:"The number of canvas pixels that correspond to one real-world centimeter, derived from the measured length of the orange calibration bar in the sidebar. Used to convert every pixel-based metric into centimeters."
},

cmpx:{
title:"cm/px",
text:"The inverse of the calibration value — how many real-world centimeters one canvas pixel represents. Used internally to convert pixel measurements to centimeters."
},

calstatus:{
title:"Calibration Status",
text:"Whether the calibration has been verified for this session. Testing and scoring are not considered valid until calibration is verified."
}

};

/* Hover tooltip (not click), same behaviour as RT: the definition appears
   while the pointer is over a metric name and hides when it leaves.
   Keyboard focus shows it too. */
function showDefinition(label){
const def=METRIC_DEFINITIONS[label.dataset.def];
const tip=document.getElementById("defTip");
if(!def||!tip) return;
document.getElementById("defTitle").textContent=def.title;
document.getElementById("defText").textContent=def.text;
tip.hidden=false;
const r=label.getBoundingClientRect();
const tw=tip.offsetWidth,th=tip.offsetHeight;
/* Prefer the left of the label (side panel is on the right edge). */
let x=r.left-tw-12;
let y=r.top+r.height/2-th/2;
if(x<8){x=Math.max(8,Math.min(r.left,window.innerWidth-tw-8));y=r.bottom+8;}
y=Math.max(8,Math.min(y,window.innerHeight-th-8));
tip.style.left=x+"px";
tip.style.top=y+"px";
}

function closeDefinition(){
const tip=document.getElementById("defTip");
if(tip) tip.hidden=true;
}

document.querySelectorAll(".metric-label[data-def]").forEach(label=>{
label.addEventListener("mouseenter",()=>showDefinition(label));
label.addEventListener("mouseleave",closeDefinition);
label.addEventListener("focus",()=>showDefinition(label));
label.addEventListener("blur",closeDefinition);
});

document.addEventListener("keydown",e=>{
if(e.key==="Escape") closeDefinition();
});

window.addEventListener("scroll",closeDefinition,true);

/* =========================
   CONTROLS
========================= */

function changeTest(){

currentTest=
tests[
document.getElementById("testSelector").value
];

resetTest();

if(calibrationVerified){
const key=selectedTestKey();
setGuidance(readyMessage(),false,allHandsComplete(key));
updateHandScores();
}

}

function stopTest(){

if(active||sequenceRunning) appendLog("Test stopped by examiner.");

active=false;
trialArmed=false;
sequenceRunning=false;
handReady=false;
hideHandPrompt();

stopTimer();

stopAudio();

document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
document.getElementById("handSelector").disabled=false;

setGuidance("Test stopped. Press Start Test to resume.",false);

}

function getTrialMetrics(){
const toleranceCm=parseFloat(document.getElementById("toleranceInput").value)||0;
const effective=deviationSamples;
const maxPx=effective.length?Math.max(...effective):0;
const meanPx=effective.length?effective.reduce((a,b)=>a+b,0)/effective.length:0;
const p95Px=percentile(effective,0.95);
const p95Cm=p95Px*cmPerPixel;
return{
toleranceCm,maxPx,meanPx,p95Px,p95Cm,
maxCm:maxPx*cmPerPixel,
meanCm:meanPx*cmPerPixel,
areaCm2:statistics.deviationAreaPx2*cmPerPixel*cmPerPixel,
sara:calculateSara(p95Cm)
};
}

async function completeCurrentTrial(){
const key=selectedTestKey();
const metrics=getTrialMetrics();
const hand=currentHand;
trialCounts[key][hand]++;
const trialNumber=trialCounts[key][hand];
trialArmed=false;
completedTrials.push({
testMode:key,
testName:TEST_NAMES[key],
hand,
trialNumber,
timestamp:new Date().toISOString(),
durationSeconds:parseFloat(document.getElementById("timer").innerText)||0,
pixelsPerCm,
cmPerPixel,
...metrics,
statistics:{...statistics},
success:true
});

{
const safe=v=>String(v||"").replace(/[^A-Za-z0-9_-]+/g,"_")||"unknown";
const fv=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
const file=`${safe(fv("glob-id")||"participant")}_${safe(fv("glob-date")||new Date().toISOString().split("T")[0])}_${safe(fv("glob-sess")||"S1")}_${key}_${hand}_T${trialNumber}_trajectory.png`;
const png=makeTrajectoryPng(touches,startBox,finishBox,hand,trialNumber,key);
const rec=completedTrials[completedTrials.length-1];
rec.trajectoryImageFile=file;
rec.trajectoryImagePng=png;
const time=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
appendLogHtml(`<div class="trial-log-entry"><div class="trial-log-text"><span class="small-muted">${time}</span> ${escapeLogText(`${TEST_NAMES[key]} · ${HAND_NAMES[hand]} · Trial ${trialNumber}`)}<br>P95 ${metrics.p95Cm.toFixed(2)} cm → SARA ${escapeLogText(SARA_LABELS[metrics.sara]??metrics.sara)}</div><a class="trajectory-thumb-link" href="${png}" download="${escapeLogText(file)}" title="Download ${escapeLogText(file)}"><img class="trajectory-thumb" src="${png}" alt="${HAND_NAMES[hand]} hand trial ${trialNumber} trajectory"></a></div>`);
}

updateHandScores();

if(key==="horizontal" && sequenceRunning){
setGuidance(`${HAND_NAMES[hand]} hand · Test ${trialNumber} complete.`,false,trialNumber>=TRIALS_PER_TEST);

try{
await playAudioFile(COMPLETE_AUDIO[trialNumber]);
if(!sequenceRunning) return;
if(trialNumber>=TRIALS_PER_TEST){
await finishHandBlock(key);
return;
}
await wait(1000);
if(sequenceRunning) playTrialStart(trialNumber+1);
}catch(error){
console.error(error);
sequenceRunning=false;
handReady=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
document.getElementById("handSelector").disabled=false;
setGuidance("Audio failed — restart the test.",false);
}
}else if(trialNumber>=TRIALS_PER_TEST){
await finishHandBlock(key);
}else{
setGuidance(`${HAND_NAMES[hand]} hand · Test ${trialNumber} complete.`,false);
}
}

function csvEscape(value){
const text=String(value??"");
return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

function exportCsv(){
const statusEl=document.getElementById("exportStatus");
if(completedTrials.length===0){
if(statusEl){statusEl.textContent="Complete at least one test before exporting CSV.";statusEl.style.color="#f59e0b";}
setGuidance("Complete at least one test before exporting CSV.");
return;
}

const fieldVal=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
const metadata={
participant_id:fieldVal("glob-id")||"UNKNOWN",
session:fieldVal("glob-sess")||"S1",
age:fieldVal("glob-age"),
sex:fieldVal("glob-sex"),
hand:fieldVal("glob-hand"),
date:fieldVal("glob-date")||new Date().toISOString().split("T")[0]
};

const headers=[
"participant_id","session","age","sex","hand","date","test_mode","test_name","trial_number","timestamp","duration_seconds",
"pixels_per_cm","cm_per_pixel","turn_tolerance_cm","discontinuities","vertical_turns","horizontal_reverses","out_of_bounds","start_fails",
"max_deviation_px","max_deviation_cm","mean_deviation_px","mean_deviation_cm","p95_deviation_px","p95_deviation_cm",
"deviation_area_px2","deviation_area_cm2","sara_score","sara_label","success",
"test_hand","sara6_right","sara6_left","sara6_item",
"clinician_sara6_right","clinician_sara6_left","clinician_sara6_item","researcher_notes"
];

const clin=getClinicianValues();
const fmt=v=>v===null||v===undefined?"":formatScore(v);

const rows=completedTrials.map(t=>[
metadata.participant_id,metadata.session,metadata.age,metadata.sex,metadata.hand,metadata.date,
t.testMode,t.testName,t.trialNumber,t.timestamp,t.durationSeconds.toFixed(2),t.pixelsPerCm.toFixed(4),t.cmPerPixel.toFixed(6),t.toleranceCm.toFixed(2),
t.statistics.discontinuities,t.statistics.verticalTurns,t.statistics.horizontalTurns,t.statistics.outOfBounds,t.statistics.startFails,
t.maxPx.toFixed(3),t.maxCm.toFixed(3),t.meanPx.toFixed(3),t.meanCm.toFixed(3),t.p95Px.toFixed(3),t.p95Cm.toFixed(3),
t.statistics.deviationAreaPx2.toFixed(3),t.areaCm2.toFixed(3),t.sara,SARA_LABELS[t.sara]??t.sara,t.success?1:0,
t.hand||"",fmt(handScore(t.testMode,"R")),fmt(handScore(t.testMode,"L")),fmt(itemScore(t.testMode)),
fmt(clin.r),fmt(clin.l),fmt(clin.item),clin.notes
]);

const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
const url=URL.createObjectURL(blob);
const link=document.createElement("a");
const safeParticipant=metadata.participant_id.replace(/[^A-Za-z0-9_-]/g,"_");
link.href=url;
link.download=`LD_${safeParticipant}_${metadata.date}.csv`;
document.body.appendChild(link);
link.click();
link.remove();
URL.revokeObjectURL(url);

if(statusEl){statusEl.textContent=`CSV downloaded (${completedTrials.length} trials).`;statusEl.style.color="#22c55e";}
setGuidance(`CSV downloaded with ${completedTrials.length} completed trials.`);
}

/* =========================
   EXPORT TRIAL (GOOGLE SHEETS)
========================= */

/* Paste your Google Apps Script Web App URL here — see setup guide. */
const LD_GOOGLE_SHEET_WEB_APP_URL="https://script.google.com/macros/s/AKfycbx8SW1QOnTSp0T-i-SfZejIxe6w_h1zrzRrkLy6r-oNNcHdAB7q_YPi_nQRkMRZ_E4iHQ/exec";

async function exportData(){

const statusEl=document.getElementById("exportStatus");
const btn=document.getElementById("exportTrialBtn");

if(!LD_GOOGLE_SHEET_WEB_APP_URL||LD_GOOGLE_SHEET_WEB_APP_URL==="INSERT_YOUR_GOOGLE_WEB_APP_URL_HERE"){
if(statusEl){statusEl.textContent="⚠ Google Sheet URL not configured — see setup guide.";statusEl.style.color="#f59e0b";}
return;
}

const toleranceCm=
parseFloat(document.getElementById("toleranceInput").value)||0;

const effective=deviationSamples;

const maxPx=
effective.length?
Math.max(...effective):
0;

const meanPx=
effective.length?
effective.reduce((a,b)=>a+b,0)/
effective.length:
0;

const p95Px=
percentile(effective,0.95);

const p95Cm=p95Px*cmPerPixel;

const sara=calculateSara(p95Cm);

/* Patient / session metadata from the global header bar */
const fieldVal=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
const participant=fieldVal("glob-id")||"UNKNOWN";
const patientName=fieldVal("glob-name");
const age=fieldVal("glob-age");
const sex=fieldVal("glob-sex");
const dob=fieldVal("glob-dob");
const sessionLabel=fieldVal("glob-sess")||"S1";
const operator=fieldVal("glob-op");
const dateLabel=fieldVal("glob-date")||new Date().toISOString().split("T")[0];
const testMode=document.getElementById("testSelector").value;

const sanitize=v=>String(v||"").replace(/[^A-Za-z0-9_-]/g,"");
const sessionId=`${sanitize(participant)}_${dateLabel}_${sanitize(sessionLabel)}`;

const headerRow=[
'session_id','participant_id','name','age','sex','dob','session','operator','date',
'test_mode','timestamp','pixels_per_cm','cm_per_pixel','calibration_verified',
'discontinuities','vertical_turns','horizontal_reverses','out_of_bounds','start_fails',
'max_deviation_px','max_deviation_cm','mean_deviation_px','mean_deviation_cm',
'p95_deviation_px','p95_deviation_cm','deviation_area_px2','deviation_area_cm2',
'sara_score','sara_label','scoring_basis','success',
'test_hand','sara6_right','sara6_left','sara6_item',
'clinician_sara6_right','clinician_sara6_left','clinician_sara6_item','researcher_notes'
];

const clin=getClinicianValues();
const fmt=v=>v===null||v===undefined?"":formatScore(v);

const dataRow=[
sessionId,participant,patientName,age,sex,dob,sessionLabel,operator,dateLabel,
testMode,new Date().toISOString(),
pixelsPerCm.toFixed(4),cmPerPixel.toFixed(6),calibrationVerified?1:0,
statistics.discontinuities,statistics.verticalTurns,statistics.horizontalTurns,
statistics.outOfBounds,statistics.startFails,
maxPx.toFixed(3),(maxPx*cmPerPixel).toFixed(3),
meanPx.toFixed(3),(meanPx*cmPerPixel).toFixed(3),
p95Px.toFixed(3),p95Cm.toFixed(3),
statistics.deviationAreaPx2.toFixed(3),
(statistics.deviationAreaPx2*cmPerPixel*cmPerPixel).toFixed(3),
sara,SARA_LABELS[sara]??sara,"P95 deviation (cm)",success?1:0,
currentHand,fmt(handScore(testMode,"R")),fmt(handScore(testMode,"L")),fmt(itemScore(testMode)),
fmt(clin.r),fmt(clin.l),fmt(clin.item),clin.notes
];

const payload={trials:[headerRow,dataRow]};

if(statusEl){statusEl.textContent="Uploading…";statusEl.style.color="";}
if(btn)btn.disabled=true;

try{

const res=await fetch(LD_GOOGLE_SHEET_WEB_APP_URL,{
method:"POST",
headers:{"Content-Type":"text/plain;charset=utf-8"},
body:JSON.stringify(payload)
});

if(!res.ok) throw new Error("Network response was not ok.");

const responseData=await res.json();

if(responseData.status==="success"){
if(statusEl){statusEl.textContent="✅ Saved to Google Sheet.";statusEl.style.color="#22c55e";}
}else{
throw new Error(responseData.message||"Unknown error from server.");
}

}catch(err){

console.error("Export Error:",err);
if(statusEl){statusEl.textContent="❌ Upload failed: "+err.message;statusEl.style.color="#ef4444";}

}finally{

if(btn)btn.disabled=false;

}

}

/* =========================
   TRAJECTORY THUMBNAIL (pattern from RT: per-trial PNG in the Log,
   click to download)
========================= */

function makeTrajectoryPng(strokes,sBox,fBox,hand,trialNumber,testKey){
const plot=document.createElement("canvas");
plot.width=WIDTH;
plot.height=HEIGHT;
const p=plot.getContext("2d");
p.fillStyle="#04121a";
p.fillRect(0,0,WIDTH,HEIGHT);

/* Guide line between box centers */
const sx=sBox[0]+BOX/2,sy=sBox[1]+BOX/2,fx=fBox[0]+BOX/2,fy=fBox[1]+BOX/2;
p.strokeStyle="rgba(148,163,184,0.55)";
p.lineWidth=3;
p.beginPath();p.moveTo(sx,sy);p.lineTo(fx,fy);p.stroke();

/* Start / finish boxes */
p.fillStyle="rgba(0,200,120,0.9)";
p.fillRect(sBox[0],sBox[1],BOX,BOX);
p.fillRect(fBox[0],fBox[1],BOX,BOX);

/* Drawn path; each touch (after a lift) is its own segment */
p.strokeStyle="rgba(255,255,255,0.95)";
p.lineWidth=2.5;
p.lineJoin="round";
p.lineCap="round";
strokes.forEach(t=>{
if(!t.points||t.points.length<2) return;
p.beginPath();
p.moveTo(t.points[0][0],t.points[0][1]);
for(let i=1;i<t.points.length;i++) p.lineTo(t.points[i][0],t.points[i][1]);
p.stroke();
});

p.fillStyle="rgba(255,255,255,0.9)";
p.font="26px sans-serif";
p.fillText(`${TEST_NAMES[testKey]} · ${HAND_NAMES[hand]} hand · Trial ${trialNumber}`,20,HEIGHT-20);
return plot.toDataURL("image/png");
}

function appendLogHtml(html){
if(!logArea) return;
const el=document.createElement("div");
el.innerHTML=html;
logArea.appendChild(el);
logArea.scrollTop=logArea.scrollHeight;
}

/* =========================
   RESEARCH TAB
   TEST / RESEARCH side tabs, clinical reference, weight bar, log.
   UI pattern reused from RT's RESEARCH tab (itself from SD), per the
   CeMoQu design principle (2026-09-08).
========================= */

/* SARA Tremor / Path Deviation weights.
   UI ONLY for now — not yet applied to calculateSara(). The score still
   uses P95 deviation until the tremor / path-deviation split is
   implemented (LD ten-step process, pending). */
const LD_SCORING_WEIGHTS={tremor:1.0,path:0.0};

const logArea=document.getElementById("logArea");

function escapeLogText(value){
return String(value??"")
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;");
}

function appendLog(text){
if(!logArea) return;
const el=document.createElement("div");
const time=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
el.innerHTML=`<span class="small-muted">${time}</span> ${escapeLogText(text)}`;
logArea.appendChild(el);
logArea.scrollTop=logArea.scrollHeight;
}

(function wireResearchTab(){

/* Tabs */
const tabs=document.querySelectorAll(".ld-tab");
const panels=document.querySelectorAll(".ld-side-panel");
tabs.forEach(btn=>btn.addEventListener("click",()=>{
tabs.forEach(b=>b.classList.toggle("active",b===btn));
panels.forEach(p=>p.classList.toggle("active",p.dataset.panel===btn.dataset.panel));
}));

/* Clinical reference: SARA-6 is rated per side; item score = (R + L) / 2
   (Schmitz-Hübsch et al., 2006 — limb items 5–8 use the arithmetic mean
   of both sides, giving half-point values). Fields follow the Hand(s)
   selector in the test controls; with one hand selected, only that side
   is shown and no item mean is formed. */
const handsSel=document.getElementById("handSelector"); // TEST-side Hand(s) setting; clinical fields follow it
const scoreR=document.getElementById("clinicianScoreR");
const scoreL=document.getElementById("clinicianScoreL");
const fieldR=document.getElementById("clinicianScoreRField");
const fieldL=document.getElementById("clinicianScoreLField");
const meanEl=document.getElementById("clinicianScoreMean");
const scoreGrid=document.querySelector(".clinician-score-grid");

function renderClinicianScores(){
if(!handsSel) return;
const hands=handsSel.value;
if(fieldR) fieldR.hidden=(hands==="L");
if(fieldL) fieldL.hidden=(hands==="R");
if(scoreGrid) scoreGrid.classList.toggle("single",hands!=="B");
if(!meanEl) return;
const r=scoreR&&scoreR.value!==""?Number(scoreR.value):null;
const l=scoreL&&scoreL.value!==""?Number(scoreL.value):null;
if(hands==="B"){
meanEl.textContent=(r!==null&&l!==null)?((r+l)/2).toFixed(1):"—";
}else{
meanEl.textContent="— (both sides required)";
}
}

[handsSel,scoreR,scoreL].forEach(el=>el?.addEventListener("change",renderClinicianScores));
renderClinicianScores();

/* Log */
document.getElementById("clearLogBtn")?.addEventListener("click",()=>{
if(logArea) logArea.textContent="";
});

/* Weight bar: handle position = SARA Tremor %, snaps to 10% */
const weightBar=document.getElementById("weightBar");
const wHandle1=document.getElementById("wHandle1");
const wLabelTremor=document.getElementById("wLabelTremor");
const wLabelPath=document.getElementById("wLabelPath");
const showScoringBtn=document.getElementById("showScoringBtn");
const scoringDetails=document.getElementById("scoringDetails");
if(!weightBar||!wHandle1) return;

function renderWeightBar(){
const pathPct=Math.round(LD_SCORING_WEIGHTS.path*100);
wHandle1.style.left=(100-pathPct)+"%";
wHandle1.setAttribute("aria-valuenow",String(pathPct));
if(wLabelTremor) wLabelTremor.textContent=`SARA Tremor ${100-pathPct}%`;
if(wLabelPath) wLabelPath.textContent=`Path Deviation ${pathPct}%`;
}

function applyPathPct(pct){
const pathPct=Math.max(0,Math.min(100,Math.round(pct/10)*10));
LD_SCORING_WEIGHTS.tremor=(100-pathPct)/100;
LD_SCORING_WEIGHTS.path=pathPct/100;
renderWeightBar();
}

function pathPctFromClientX(clientX){
const rect=weightBar.getBoundingClientRect();
const tremorPct=Math.max(0,Math.min(100,((clientX-rect.left)/rect.width)*100));
return 100-tremorPct;
}

let dragging=false;
wHandle1.addEventListener("pointerdown",e=>{dragging=true;e.preventDefault();});
window.addEventListener("pointermove",e=>{
if(!dragging) return;
applyPathPct(pathPctFromClientX(e.clientX));
});
window.addEventListener("pointerup",()=>{dragging=false;});
wHandle1.addEventListener("keydown",e=>{
const cur=Math.round(LD_SCORING_WEIGHTS.path*100);
if(e.key==="ArrowLeft"){applyPathPct(cur+10);e.preventDefault();}
else if(e.key==="ArrowRight"){applyPathPct(cur-10);e.preventDefault();}
});

if(showScoringBtn&&scoringDetails){
showScoringBtn.addEventListener("click",()=>{
const hidden=scoringDetails.hidden;
scoringDetails.hidden=!hidden;
if(hidden){
scoringDetails.textContent=
`Current score (in use): P95 of raw deviation from the guide line.
  < 0.5 cm → 0 · 0.5–2 cm → 1 · 2–5 cm → 2 · > 5 cm → 3
  Incomplete trial or unverified calibration → 4

Planned split (not yet applied):
  SARA Tremor = oscillation amplitude around the drawn path
    (SARA Nose-Finger buckets: < 2 cm, < 5 cm, > 5 cm)
  Path Deviation = slow drift away from the guide line

Weights set here: SARA Tremor ${Math.round(LD_SCORING_WEIGHTS.tremor*100)}% · Path Deviation ${Math.round(LD_SCORING_WEIGHTS.path*100)}%`;
}
});
}

renderWeightBar();

})();

/* =========================
   FULL SCREEN + CANVAS SIZE LOCK
   The test runs in full screen only. On the first entry the canvas is
   given a fixed CSS pixel size at the internal 10:7 aspect ratio (uniform
   x/y scale) and is never resized afterward — not on window resize, not on
   leaving full screen. Leaving full screen stops a running test; browser
   zoom shortcuts are blocked, and a zoom change clears calibration because
   it changes the physical size of a CSS pixel.
========================= */

let canvasLockedSize=null;
const FS_SUPPORTED=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);

function isFullscreen(){
return !!(document.fullscreenElement||document.webkitFullscreenElement);
}

function screenReady(){
return canvasLockedSize!==null&&(!FS_SUPPORTED||isFullscreen());
}

function updateScreenGate(){
const gate=document.getElementById("screenGate");
if(!gate) return;
gate.hidden=screenReady();
const title=document.getElementById("screenGateTitle");
const btn=document.getElementById("enterFullscreenBtn");
if(canvasLockedSize){
if(title) title.textContent="RETURN TO FULL SCREEN";
if(btn) btn.textContent="Return to Full Screen";
}
}

function lockCanvasSize(){
if(canvasLockedSize) return;
const container=document.getElementById("canvas-container");
const availW=container.clientWidth;
const availH=Math.max(240,window.innerHeight-260);
const w=Math.floor(Math.min(availW,availH*WIDTH/HEIGHT));
const h=Math.floor(w*HEIGHT/WIDTH);
canvas.style.width=w+"px";
canvas.style.height=h+"px";
canvas.style.flexShrink="0";
canvasLockedSize={w,h,dpr:window.devicePixelRatio};
appendLog(`Canvas size locked: ${w} × ${h} px.`);

if(savedCalibration&&savedCalibration.canvasW===w&&Math.abs((savedCalibration.dpr||0)-window.devicePixelRatio)<0.001){
pixelsPerCm=savedCalibration.ppc;
cmPerPixel=savedCalibration.cpp;
calibrationVerified=true;
document.getElementById("calibrationStatus").innerHTML='<span class="status-good">Verified (saved)</span>';
appendLog("Saved calibration restored (same canvas size and zoom).");
updateStats();
}
redraw();
}

function invalidateCalibration(reason){
if(sequenceRunning||active) stopTest();
calibrationVerified=false;
document.getElementById("calibrationStatus").innerHTML='<span class="status-bad">Not Verified</span>';
setGuidance(reason,false);
appendLog(reason);
updateStats();
}

function enterFullScreen(){
const el=document.documentElement;
const fn=el.requestFullscreen||el.webkitRequestFullscreen;
if(!fn){
/* No Fullscreen API (e.g. iPhone Safari): lock at the current size. */
lockCanvasSize();
updateScreenGate();
return;
}
try{
const r=fn.call(el);
if(r&&r.catch) r.catch(()=>setGuidance("Full screen blocked — try again.",false));
}catch(e){
setGuidance("Full screen blocked — try again.",false);
}
}

function onFullscreenChange(){
if(isFullscreen()){
/* Wait two frames so the full-screen layout has settled before measuring. */
requestAnimationFrame(()=>requestAnimationFrame(()=>{
lockCanvasSize();
updateScreenGate();
if(calibrationVerified) setGuidance(readyMessage(),false,allHandsComplete(selectedTestKey()));
else setGuidance("Verify calibration to begin.",false);
}));
}else{
if(sequenceRunning||active){
stopTest();
appendLog("Full screen exited — test stopped.");
}
updateScreenGate();
setGuidance("Return to full screen to continue.",false);
}
}

document.addEventListener("fullscreenchange",onFullscreenChange);
document.addEventListener("webkitfullscreenchange",onFullscreenChange);
document.getElementById("enterFullscreenBtn")?.addEventListener("click",enterFullScreen);

/* Block browser zoom shortcuts (Ctrl/Cmd + + - = 0, Ctrl + wheel). */
window.addEventListener("keydown",e=>{
if((e.ctrlKey||e.metaKey)&&["+","-","=","0","_"].includes(e.key)) e.preventDefault();
},{capture:true});
window.addEventListener("wheel",e=>{
if(e.ctrlKey) e.preventDefault();
},{passive:false});

/* Zoom that gets through anyway (browser menu) changes devicePixelRatio. */
window.addEventListener("resize",()=>{
if(!canvasLockedSize) return;
if(Math.abs(window.devicePixelRatio-canvasLockedSize.dpr)>0.001){
canvasLockedSize.dpr=window.devicePixelRatio;
if(calibrationVerified) invalidateCalibration("Zoom changed — verify calibration again.");
}
});

/* =========================
   INIT
========================= */

document.getElementById("handReadyBtn")?.addEventListener("click",confirmHandReady);
document.getElementById("handSelector")?.addEventListener("change",()=>{
if(sequenceRunning) return;
currentHand=handSequence()[0];
updateHandScores();
if(calibrationVerified){
const key=selectedTestKey();
setGuidance(readyMessage(),false,allHandsComplete(key));
}
});

changeTest();
updateHandScores();
updateScreenGate();

appendLog("App ready. Verify calibration, then select Start Test.");
