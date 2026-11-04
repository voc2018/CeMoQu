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
let trialOver=false;
let trialFailCode="";
let trialToleranceCm=0;
let trialStartedAtIso=null;
let isOutside=false;

let startHit=false;
let finishHit=false;

let touches=[];

let deviationSamples=[];

/* Raw data for each trial: time, x, y (canvas units) and event type. */
let rawSamples=[];

let statistics={
discontinuities:0,
verticalTurns:0,
horizontalTurns:0,
deviationAreaPx2:0,
outOfBounds:0,
startFails:0
};

/* Turn/reverse sensitivity comes from the on-screen "Tolerance (cm)" field.
   Its value is held for the whole trial (see beginTrackingTrial). */
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
   performance over three movements). */
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
appendLog(`${TEST_NAMES[key]} · ${HAND_NAMES[hand]} hand complete: LD CMQ Score ${HAND_NAMES[hand]} = ${formatScore(score)}`);
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
if(item!==null) appendLog(`${TEST_NAMES[key]} · LD CMQ Score Item (R + L) / 2 = ${formatScore(item)}`);
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
return last.reduce((a,t)=>a+t.score,0)/last.length;
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
syncStartButton();
}

/* Calibration is required before a test can start. */
function syncStartButton(){
const btn=document.getElementById("startSequenceBtn");
if(btn) btn.disabled=sequenceRunning||!calibrationVerified;
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
startTrialClock();
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
setGuidance("Verify calibration to begin.",false);
return;
}
if(!((parseFloat(document.getElementById("toleranceInput").value)||0)>0)){
setGuidance("Enter a Tolerance above 0 cm.",false);
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

/* End boundary: crossing this line anywhere ends the trial. */
const line=ldGuideLine(startBox,finishBox,BOX);
const along=line.length-BOX/2;
const bx=line.sx+line.ux*along;
const by=line.sy+line.uy*along;
const reach=Math.max(WIDTH,HEIGHT);
ctx.save();
ctx.setLineDash([8,8]);
ctx.lineWidth=2;
ctx.beginPath();
ctx.moveTo(bx-line.uy*reach,by+line.ux*reach);
ctx.lineTo(bx+line.uy*reach,by-line.ux*reach);
ctx.stroke();
ctx.restore();

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

const thresholdPx=trialToleranceCm*pixelsPerCm;
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

/* Horizontal: starts at GO. Other modes: starts when S is pressed.
   The same clock enforces the time limit. */
function startTrialClock(){
stopTimer();
trialStartTime=performance.now();
trialStartedAtIso=new Date().toISOString();
timerId=setInterval(()=>{
const elapsed=(performance.now()-trialStartTime)/1000;
document.getElementById("timer").innerText=elapsed.toFixed(2);
if(elapsed>=LD_SCORING_CONFIG.timeLimitSeconds) endTimedOutTrial();
},10);
}

function stopTimer(){

clearInterval(timerId);
timerId=null;

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
rawSamples=[];
trialOver=false;
trialFailCode="";
trialStartedAtIso=null;
isOutside=false;

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

function recordRaw(event,x,y){
rawSamples.push({t:performance.now(),x,y,event});
}

function beginTrackingTrial(testKey){
trialToleranceCm=parseFloat(document.getElementById("toleranceInput").value)||0;
const trialNumber=trialCounts[testKey][currentHand]+1;
setGuidance(`${HAND_NAMES[currentHand]} hand · Test ${trialNumber} in progress.`,false);
/* The clock may already be running after 3 start fails. */
if(testKey!=="horizontal"&&!timerId) startTrialClock();
}

function lastPoint(){
return touches.at(-1).points.at(-1);
}

/* A trial ends at the end boundary or at the time limit, never at SF, OB or
   DC, so every reason that applies is found. */
function settleFailCodes(){
const elapsed=(performance.now()-trialStartTime)/1000;
trialFailCode=ldFailCode(statistics,elapsed);
if(trialFailCode) success=false;
}

function endTimedOutTrial(){
if(trialOver) return;
trialOver=true;
trialAttempted=true;
success=false;
active=false;
drawing=false;
if(!startHit) trialToleranceCm=parseFloat(document.getElementById("toleranceInput").value)||0;
settleFailCodes();
stopTimer();
completeCurrentTrial();
updateStats();
}

function noteOutOfBounds(){
if(isOutside||!active||success) return;
isOutside=true;
const point=touches.at(-1)?.points.at(-1);
if(point) recordRaw("leave",point[0],point[1]);
statistics.outOfBounds++;
updateStats();
}

canvas.addEventListener(
"pointerdown",
e=>{

if(!screenReady()) return;

if(!calibrationVerified){

setGuidance("Verify calibration to begin.",false);

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

const testKey=selectedTestKey();

if(trialCounts[testKey][currentHand]>=TRIALS_PER_TEST){
setGuidance(`${HAND_NAMES[currentHand]} hand: all ${TRIALS_PER_TEST} trials are complete.`);
return;
}

/* After a finished trial, the next press starts a new one (manual modes). */
if(trialOver){
resetForNextTrial();
}

drawing=true;
isOutside=false;

if(
isInside(x,y,startBox)
&& !active
){

active=true;

startHit=true;

trialAttempted=true;

beginTrackingTrial(testKey);

redraw();

recordRaw("down",x,y);

touches.push({
points:[[x,y]]
});

}

else if(!active){

statistics.startFails++;

recordRaw("down",x,y);

drawing=false;

updateStats();

/* Manual modes have no clock until S is pressed. Start it here so a trial
   that never reaches S still ends at the time limit. */
if(statistics.startFails>=LD_SCORING_CONFIG.startFailLimit&&!timerId) startTrialClock();

}

else{

statistics.discontinuities++;

recordRaw("down",x,y);

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

/* Mouse released outside the canvas: treat as a lift. */
if(e.pointerType==="mouse"&&e.buttons===0){
drawing=false;
isOutside=false;
return;
}

const[x,y]=getCoords(e);

/* Touch keeps reporting positions past the edge. */
if(x<0||y<0||x>WIDTH||y>HEIGHT){
noteOutOfBounds();
return;
}

/* Back inside after leaving the canvas: drawing simply continues. */
if(isOutside){
isOutside=false;
touches.push({points:[[x,y]]});
recordRaw("down",x,y);
return;
}

const last=lastPoint();

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

recordRaw("move",x,y);

if(
!finishHit
&& ldCrossedEndBoundary([x,y],ldGuideLine(startBox,finishBox,BOX),BOX)
){

finishHit=true;
success=true;
trialOver=true;

active=false;

settleFailCodes();

stopTimer();

redraw(false);

completeCurrentTrial();

}

updateStats();

});

canvas.addEventListener(
"pointerup",
e=>{

if(active&&drawing){
const[x,y]=getCoords(e);
recordRaw("up",x,y);
}

drawing=false;

});

canvas.addEventListener(
"pointercancel",
()=>{

drawing=false;

});

canvas.addEventListener(
"pointerleave",
()=>{

/* Only while pressed: lifting a finger or moving a released mouse is not
   leaving the canvas. */
if(drawing) noteOutOfBounds();

});

/* =========================
   LD CMQ SCORE
   Rules and calculation are in scoring.js.
========================= */

const SCORE_LABELS=[
"0 — Normal",
"1 — Mild",
"2 — Moderate",
"3 — Severe",
"4 — Unable to perform"
];

function scoreLabel(score,failCode){
return (SCORE_LABELS[score]??score)+(failCode?` · ${failCode}`:"");
}

function fixedOrDash(value,digits,unit){
return value===null||value===undefined?"—":`${value.toFixed(digits)}${unit}`;
}

function currentTrialScore(){
return ldScoreTrial({
strokes:touches.map(t=>t.points),
line:ldGuideLine(startBox,finishBox,BOX),
toleranceCm:trialToleranceCm,
cmPerPixel,
failCode:trialFailCode
});
}

/* =========================
   UPDATE STATS
========================= */

function updateStats(){

/* Deviation is reported raw and unfiltered. */
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

/* Keeps showing the latest finished trial until the next one finishes. */
const key=selectedTestKey();
const scored=completedTrials.filter(t=>t.testMode===key&&t.hand===currentHand).at(-1)??null;

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

document.getElementById("cmqScoreValue")
.innerText=
scored?
`${scoreLabel(scored.score,scored.failCode)} · Test ${scored.trialNumber}`:
"--";

document.getElementById("trialScoresValue")
.innerText=
Array.from({length:TRIALS_PER_TEST},(_,i)=>{
const t=completedTrials.find(c=>c.testMode===key&&c.hand===currentHand&&c.trialNumber===i+1);
return t?(t.failCode?`${t.score} ${t.failCode}`:t.score):"–";
}).join("  |  ");

document.getElementById("rejoinJumpValue")
.innerText=
scored?fixedOrDash(scored.rejoinJumpMaxCm,2," cm"):"—";

document.getElementById("turnCountValue")
.innerText=
scored?scored.turnCount:"—";

document.getElementById("turnAmpMeanValue")
.innerText=
scored?fixedOrDash(scored.amplitudeMeanCm,2," cm"):"—";

document.getElementById("turnAmpMedianValue")
.innerText=
scored?fixedOrDash(scored.amplitudeMedianCm,2," cm"):"—";

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
title:"LD CMQ Score Right / Left",
text:"Automated per-hand score for this test mode: the mean of the last 3 trial LD CMQ Scores for that hand, once all 5 trials are complete."
},

itemscore:{
title:"LD CMQ Score Item (R + L) / 2",
text:"The arithmetic mean of the right and left scores. Shown only when both hands are selected and complete."
},

trialscores:{
title:"Trial Scores",
text:"The scores of trials 1 to 5 for the current hand and test, in order. A dash means the trial has not been done."
},

cmq:{
title:"LD CMQ Score (trial)",
text:"A 0–4 score based on turn amplitude. No turn above the Tolerance scores 0, a mean amplitude under 2 cm scores 1, under 5 cm scores 2, and 5 cm or more scores 3. A score of 4 shows its reason code: SF, TO, OB or DC. The 2 and 5 cm cut-offs follow the SARA Nose-Finger tremor amplitudes."
},

turns:{
title:"Turn Count",
text:"The number of side-to-side direction changes across the guide line. A movement smaller than the Tolerance is not counted as a turn."
},

ampmean:{
title:"Turn Amplitude Mean",
text:"The average height from one turn to the next, measured across the guide line, after removing the largest 5% of amplitudes. Each stroke is measured on its own. This value sets the LD CMQ Score."
},

rejoin:{
title:"Max Rejoin Jump",
text:"The largest distance between where the hand lifted and where it touched again. Every jump is stored. Jumps are not amplitudes and do not affect the score, so review a trial with a large jump."
},

ampmedian:{
title:"Turn Amplitude Median",
text:"The middle turn amplitude after removing the largest 5%. Stored for comparison and not used in the score."
},

p95:{
title:"P95 Deviation",
text:"The 95th-percentile distance between the cursor and the ideal guide line, in pixels and centimeters. Stored for reference and not used in the score."
},

max:{
title:"Max Deviation",
text:"The single largest distance recorded between the cursor and the guide line during the trial, in pixels and centimeters. Stored for reference and not used in the score."
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
text:"The number of times the hand lifted and pressed again before completing the trial. A lift can be forward-and-back tremor that a screen cannot measure in depth, so it is recorded. Ten or more score 4 (code DC). This can also appear with small tremor, so review those trials."
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
text:"The number of times the hand left the canvas while pressed during the trial. Three or more score 4 (code OB)."
},

startfails:{
title:"Start Fails",
text:"The number of times the user pressed outside the S block before beginning the trial. Three in a row score 4 (code SF)."
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
text:"Whether the calibration has been verified for this session. A test cannot start until calibration is verified."
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
const toleranceCm=trialToleranceCm;
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
...currentTrialScore()
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
startedAt:trialStartedAtIso,
timestamp:new Date().toISOString(),
durationSeconds:trialStartTime&&trialStartedAtIso?(performance.now()-trialStartTime)/1000:0,
pixelsPerCm,
cmPerPixel,
scoringVersion:LD_SCORING_CONFIG.version,
startBox:[...startBox],
finishBox:[...finishBox],
rawSamples:rawSamples.map(r=>({...r,t:r.t-(rawSamples[0]?.t??r.t)})),
...metrics,
statistics:{...statistics},
success
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
appendLogHtml(`<div class="trial-log-entry"><div class="trial-log-text"><span class="small-muted">${time}</span> ${escapeLogText(`${TEST_NAMES[key]} · ${HAND_NAMES[hand]} · Trial ${trialNumber}`)}<br>Turn amplitude ${escapeLogText(fixedOrDash(metrics.amplitudeMeanCm,2," cm"))} → LD CMQ Score ${escapeLogText(scoreLabel(metrics.score,metrics.failCode))}</div><a class="trajectory-thumb-link" href="${png}" download="${escapeLogText(file)}" title="Download ${escapeLogText(file)}"><img class="trajectory-thumb" src="${png}" alt="${HAND_NAMES[hand]} hand trial ${trialNumber} trajectory"></a></div>`);
}

updateHandScores();

if(key==="horizontal" && sequenceRunning){
setGuidance(trialResultMessage(hand,trialNumber,metrics.failCode),false,trialNumber>=TRIALS_PER_TEST);

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
setGuidance(trialResultMessage(hand,trialNumber,metrics.failCode),false);
}
}

function trialResultMessage(hand,trialNumber,failCode){
const base=`${HAND_NAMES[hand]} hand · Test ${trialNumber} complete`;
return failCode?`${base} · code ${failCode}.`:`${base}.`;
}

function csvEscape(value){
const text=String(value??"");
return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}

/* Columns added for scoring version 2. */
const EXTRA_HEADERS=[
"scoring_version","tolerance_cm","turn_count","turn_amp_mean_cm","turn_amp_median_cm",
"turn_amps_used","turn_amps_removed","fail_code","rejoin_jump_max_cm","rejoin_jumps_cm","trial_number",
"duration_seconds","started_at","ended_at"
];

/* The CSV already has these under its own columns. */
const CSV_ALREADY_HAS=["tolerance_cm","trial_number","duration_seconds"];

function extraValues(t){
const cm=v=>v===null||v===undefined?"":v.toFixed(3);
return[
t.scoringVersion,t.toleranceCm.toFixed(2),t.turnCount,cm(t.amplitudeMeanCm),cm(t.amplitudeMedianCm),
t.amplitudesUsed,t.amplitudesRemoved,t.failCode,cm(t.rejoinJumpMaxCm),t.rejoinJumpsCm.map(j=>j.toFixed(3)).join(";"),t.trialNumber,
t.durationSeconds.toFixed(2),t.startedAt||"",t.timestamp
];
}

/* Raw data for every completed trial, with what is needed to recalculate it. */
function exportRawCsv(){
const statusEl=document.getElementById("exportStatus");
if(completedTrials.length===0){
if(statusEl){statusEl.textContent="Complete at least one test before exporting raw data.";statusEl.style.color="#f59e0b";}
return;
}
const fieldVal=id=>{const el=document.getElementById(id);return el?el.value.trim():"";};
const participant=fieldVal("glob-id")||"UNKNOWN";
const date=fieldVal("glob-date")||new Date().toISOString().split("T")[0];
const headers=["participant_id","date","test_mode","hand","trial_number","t_ms","x","y","event",
"start_x","start_y","finish_x","finish_y","box","pixels_per_cm","tolerance_cm","scoring_version"];
const rows=completedTrials.flatMap(t=>t.rawSamples.map(r=>[
participant,date,t.testMode,t.hand,t.trialNumber,r.t.toFixed(1),r.x.toFixed(2),r.y.toFixed(2),r.event,
t.startBox[0],t.startBox[1],t.finishBox[0],t.finishBox[1],BOX,t.pixelsPerCm.toFixed(4),t.toleranceCm.toFixed(2),t.scoringVersion
]));
const csv="\uFEFF"+[headers,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
const link=document.createElement("a");
link.href=url;
link.download=`LD_raw_${participant.replace(/[^A-Za-z0-9_-]/g,"_")}_${date}.csv`;
document.body.appendChild(link);
link.click();
link.remove();
URL.revokeObjectURL(url);
if(statusEl){statusEl.textContent="Raw data downloaded.";statusEl.style.color="#22c55e";}
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
"participant_id","session","age","sex","dominant_hand","date","test_mode","test_name","trial_number","timestamp","duration_seconds",
"pixels_per_cm","cm_per_pixel","turn_tolerance_cm","discontinuities","vertical_turns","horizontal_reverses","out_of_bounds","start_fails",
"max_deviation_px","max_deviation_cm","mean_deviation_px","mean_deviation_cm","p95_deviation_px","p95_deviation_cm",
"deviation_area_px2","deviation_area_cm2","cmq_score","cmq_label","success",
"test_hand","cmq_score_right","cmq_score_left","cmq_score_item",
"clinician_right","clinician_left","clinician_item","researcher_notes",
...EXTRA_HEADERS.filter(h=>!CSV_ALREADY_HAS.includes(h))
];

const clin=getClinicianValues();
const fmt=v=>v===null||v===undefined?"":formatScore(v);

const rows=completedTrials.map(t=>[
metadata.participant_id,metadata.session,metadata.age,metadata.sex,metadata.hand,metadata.date,
t.testMode,t.testName,t.trialNumber,t.timestamp,t.durationSeconds.toFixed(2),t.pixelsPerCm.toFixed(4),t.cmPerPixel.toFixed(6),t.toleranceCm.toFixed(2),
t.statistics.discontinuities,t.statistics.verticalTurns,t.statistics.horizontalTurns,t.statistics.outOfBounds,t.statistics.startFails,
t.maxPx.toFixed(3),t.maxCm.toFixed(3),t.meanPx.toFixed(3),t.meanCm.toFixed(3),t.p95Px.toFixed(3),t.p95Cm.toFixed(3),
t.statistics.deviationAreaPx2.toFixed(3),t.areaCm2.toFixed(3),t.score,SCORE_LABELS[t.score]??t.score,t.success?1:0,
t.hand||"",fmt(handScore(t.testMode,"R")),fmt(handScore(t.testMode,"L")),fmt(itemScore(t.testMode)),
fmt(clin.r),fmt(clin.l),fmt(clin.item),clin.notes,
...extraValues(t).filter((v,i)=>!CSV_ALREADY_HAS.includes(EXTRA_HEADERS[i]))
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
   SUBMIT DATA
========================= */

/* Raw samples of one trial, with what is needed to recalculate it. */
function ldRawCsv(t,patientId,date){
const headers=["participant_id","date","test_mode","hand","trial_number","t_ms","x","y","event",
"start_x","start_y","finish_x","finish_y","box","pixels_per_cm","tolerance_cm","scoring_version"];
const rows=t.rawSamples.map(r=>[
patientId,date,t.testMode,t.hand,t.trialNumber,r.t.toFixed(1),r.x.toFixed(2),r.y.toFixed(2),r.event,
t.startBox[0],t.startBox[1],t.finishBox[0],t.finishBox[1],BOX,t.pixelsPerCm.toFixed(4),t.toleranceCm.toFixed(2),t.scoringVersion
]);
return CeMoQuUpload.csvText(headers,rows);
}

/* One row and its files for one trial. A score not given is blank; a clinician
   score not given is -1. */
function ldRecord(t,clin){
const startedAt=t.startedAt||t.timestamp;
const completeHand=completedTrials.filter(c=>c.testMode===t.testMode&&c.hand===t.hand).length>=TRIALS_PER_TEST;
const row=CeMoQuUpload.commonRow({
module:"LD",hand:t.hand,trial:t.trialNumber,startedAt,endedAt:t.timestamp,
status:completeHand?"complete":"stopped",scoringVersion:t.scoringVersion
});
const fixed=(v,d=3)=>v===null||v===undefined?"":Number(v.toFixed(d));
const score=v=>v===null||v===undefined?"":Number(v.toFixed(3));
const rated=v=>v===null||v===undefined?-1:v;
const stats=t.statistics;
Object.assign(row,{
test_mode:t.testMode,
pixels_per_cm:fixed(t.pixelsPerCm,4),
cm_per_pixel:fixed(t.cmPerPixel,6),
calibration_verified:calibrationVerified?1:0,
tolerance_cm:fixed(t.toleranceCm,2),
start_x:t.startBox[0],
start_y:t.startBox[1],
finish_x:t.finishBox[0],
finish_y:t.finishBox[1],
box:BOX,
duration_seconds:fixed(t.durationSeconds,2),
discontinuities:stats.discontinuities,
vertical_turns:stats.verticalTurns,
horizontal_reverses:stats.horizontalTurns,
out_of_bounds:stats.outOfBounds,
start_fails:stats.startFails,
max_deviation_cm:fixed(t.maxCm),
mean_deviation_cm:fixed(t.meanCm),
p95_deviation_cm:fixed(t.p95Cm),
deviation_area_cm2:fixed(t.areaCm2),
turn_count:t.turnCount,
turn_amp_mean_cm:fixed(t.amplitudeMeanCm),
turn_amp_median_cm:fixed(t.amplitudeMedianCm),
turn_amps_used:t.amplitudesUsed,
turn_amps_removed:t.amplitudesRemoved,
rejoin_jump_max_cm:fixed(t.rejoinJumpMaxCm),
rejoin_jumps_cm:t.rejoinJumpsCm.map(j=>j.toFixed(3)).join(";"),
success:t.success?1:0,
fail_code:t.failCode,
score_trial:t.score,
score_right:score(handScore(t.testMode,"R")),
clinician_right:rated(clin.r),
score_left:score(handScore(t.testMode,"L")),
clinician_left:rated(clin.l),
score_item:score(itemScore(t.testMode)),
clinician_item:rated(clin.item),
researcher_notes:clin.notes,
raw_sample_count:t.rawSamples.length
});
const base=CeMoQuUpload.fileBase({patientId:row.patient_id,startedAt,module:"LD",hand:t.hand,trial:t.trialNumber});
const files=[{
kind:"raw",name:`${base}_raw.csv`,mimeType:"text/csv",
blob:new Blob([ldRawCsv(t,row.patient_id,row.test_date)],{type:"text/csv"})
}];
if(t.trajectoryImagePng){
files.push({kind:"image",name:`${base}_trajectory.png`,mimeType:"image/png",blob:CeMoQuUpload.dataUrlToBlob(t.trajectoryImagePng)});
}
return{module:"LD",row,files};
}

/* Saves every completed trial. Each trial becomes one row. */
async function exportData(){
const statusEl=document.getElementById("exportStatus");
const btn=document.getElementById("exportTrialBtn");
const show=(text,color)=>{if(statusEl){statusEl.textContent=text;statusEl.style.color=color;}};
if(completedTrials.length===0){
show("Complete a test before submitting.","#f59e0b");
return;
}
const missing=CeMoQuUpload.missingFields();
if(missing){
show(missing,"#f59e0b");
return;
}
const clin=getClinicianValues();
if(btn)btn.disabled=true;
try{
await CeMoQuUpload.submit(completedTrials.map(t=>ldRecord(t,clin)));
}catch(err){
console.error("Submit error:",err);
show("Could not queue the data: "+err.message,"#ef4444");
}finally{
if(btn)btn.disabled=false;
}
}

window.addEventListener("cemoqu-upload-status",event=>{
const statusEl=document.getElementById("exportStatus");
if(!statusEl) return;
const{text,state}=event.detail;
statusEl.textContent=text;
statusEl.style.color=state==="saved"?"#22c55e":state==="error"?"#ef4444":"#f59e0b";
});

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

/* Scoring rules */
const showScoringBtn=document.getElementById("showScoringBtn");
const scoringDetails=document.getElementById("scoringDetails");
if(showScoringBtn&&scoringDetails){
showScoringBtn.addEventListener("click",()=>{
const hidden=scoringDetails.hidden;
scoringDetails.hidden=!hidden;
if(hidden){
const c=LD_SCORING_CONFIG;
scoringDetails.textContent=
`Scoring version: ${c.version}
Turn amplitude = height from one turn to the next, across the guide line.
A movement smaller than the Tolerance is not a turn.
Each stroke is measured on its own. A jump after a lift is stored, not scored.
The largest ${c.trimTopFraction*100}% of amplitudes are removed, then the mean sets the score.

No turn above Tolerance → 0
Mean amplitude < ${c.amplitudeCutoffsCm[0]} cm → 1
Mean amplitude < ${c.amplitudeCutoffsCm[1]} cm → 2
Mean amplitude ≥ ${c.amplitudeCutoffsCm[1]} cm → 3
SF, TO, OB or DC → 4

Provisional, to be set by a clinician:
Tolerance, ${c.startFailLimit} start fails, ${c.timeLimitSeconds} s, ${c.outOfBoundsLimit} out of bounds, ${c.discontinuityLimit} discontinuities.`;
}
});
}

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
syncStartButton();

appendLog("App ready. Verify calibration, then select Start Test.");
