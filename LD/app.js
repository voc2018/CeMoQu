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

/* Load saved calibration */
(function loadSavedCalibration(){

const saved=localStorage.getItem("ld_cal");

if(!saved) return;

try{

const{ppc,cpp,measuredCm}=JSON.parse(saved);

if(ppc>0&&cpp>0){

pixelsPerCm=ppc;
cmPerPixel=cpp;
calibrationVerified=true;

document.getElementById("measuredDistance").value=measuredCm;

document.getElementById("calibrationStatus")
.innerHTML=
'<span class="status-good">Verified (saved)</span>';

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
const trialCounts={horizontal:0,vertical:0,diagonal1:0,diagonal2:0};

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
setGuidance("Audio could not be played. Please restart the test.",false);
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
setGuidance("Audio could not be played. Please restart the test.",false);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
}
}

async function startTestSequence(){
if(!calibrationVerified){
alert("Calibration required before testing.");
return;
}
if(selectedTestKey()!=="horizontal"){
setGuidance("Recorded guidance is currently available for the Horizontal Test only.",false);
return;
}
if(sequenceRunning) return;

sequenceRunning=true;
trialArmed=false;
trialCounts.horizontal=0;
completedTrials.splice(0,completedTrials.length,
...completedTrials.filter(trial=>trial.testMode!=="horizontal"));
document.getElementById("startSequenceBtn").disabled=true;
document.getElementById("testSelector").disabled=true;
resetForNextTrial();
setGuidance("The line drawing test will now begin. Horizontal test.",false);

try{
await playAudioFile("01_intro_horizontal.mp3");
if(!sequenceRunning) return;
await wait(1000);
if(sequenceRunning) playTrialStart(1);
}catch(error){
console.error(error);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
setGuidance("Audio could not be played. Please restart the test.",false);
}
}

function selectedTestKey(){
return document.getElementById("testSelector").value;
}

function readyMessage(){
const key=selectedTestKey();
const next=trialCounts[key]+1;
if(next>TRIALS_PER_TEST){
return `${TEST_NAMES[key]}: all 5 trials are complete.`;
}
return `When you are ready, press S to start test ${next}.`;
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
measuredCm
})
);

document.getElementById("calibrationStatus")
.innerHTML=
'<span class="status-good">Verified</span>';

setGuidance("Select Start Test when you are ready.",false);

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
setGuidance("Select Start Test when you are ready.",false,trialCounts[selectedTestKey()]>=TRIALS_PER_TEST);
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

if(!calibrationVerified){

alert(
"Calibration required before testing."
);

return;

}

if(selectedTestKey()==="horizontal" && (!sequenceRunning || !trialArmed)){
return;
}

const[x,y]=getCoords(e);

drawing=true;

const testKey=selectedTestKey();

if(trialCounts[testKey]>=TRIALS_PER_TEST){
setGuidance(`${TEST_NAMES[testKey]}: all 5 trials are complete.`);
drawing=false;
return;
}

if(success){
resetForNextTrial();
}

if(
isInside(x,y,startBox)
&& !active
){

active=true;

startHit=true;

trialAttempted=true;

const trialNumber=trialCounts[testKey]+1;
setGuidance(`Test ${trialNumber} in progress.`,false);

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

sara:{
title:"SARA Score",
text:"A 0–4 ataxia severity score modeled on the SARA finger-chase item, derived from the P95 deviation: less than 0.5 cm scores 0 (Normal), 0.5–2 cm scores 1 (Mild), 2–5 cm scores 2 (Moderate), and over 5 cm scores 3 (Severe). An incomplete trial or unverified calibration is automatically scored 4 (Unable to Perform)."
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

function showDefinition(key){

const def=METRIC_DEFINITIONS[key];

if(!def) return;

document.getElementById("defTitle").innerText=def.title;
document.getElementById("defText").innerText=def.text;

document.getElementById("defOverlay").classList.add("open");

}

function closeDefinition(){

document.getElementById("defOverlay").classList.remove("open");

}

document.addEventListener("keydown",e=>{

if(e.key==="Escape")
closeDefinition();

});

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
setGuidance(key==="horizontal"?"Select Start Test when you are ready.":readyMessage(),false,trialCounts[key]>=TRIALS_PER_TEST);
}

}

function stopTest(){

active=false;
trialArmed=false;
sequenceRunning=false;

stopTimer();

stopAudio();

document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;

setGuidance("Test stopped. Select Start Test to begin again.",false);

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
trialCounts[key]++;
const trialNumber=trialCounts[key];
trialArmed=false;
completedTrials.push({
testMode:key,
testName:TEST_NAMES[key],
trialNumber,
timestamp:new Date().toISOString(),
durationSeconds:parseFloat(document.getElementById("timer").innerText)||0,
pixelsPerCm,
cmPerPixel,
...metrics,
statistics:{...statistics},
success:true
});

if(key==="horizontal" && sequenceRunning){
setGuidance(trialNumber>=TRIALS_PER_TEST?
"Test 5 complete. Horizontal test complete.":
`Test ${trialNumber} complete.`,false,trialNumber>=TRIALS_PER_TEST);

try{
await playAudioFile(COMPLETE_AUDIO[trialNumber]);
if(!sequenceRunning) return;
if(trialNumber>=TRIALS_PER_TEST){
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
return;
}
await wait(1000);
if(sequenceRunning) playTrialStart(trialNumber+1);
}catch(error){
console.error(error);
sequenceRunning=false;
document.getElementById("startSequenceBtn").disabled=false;
document.getElementById("testSelector").disabled=false;
setGuidance("Audio could not be played. Please restart the test.",false);
}
}else if(trialNumber>=TRIALS_PER_TEST){
setGuidance(`${TEST_NAMES[key]}: all 5 trials are complete.`,false,true);
}else{
setGuidance(`Test ${trialNumber} is complete.`,false);
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
"deviation_area_px2","deviation_area_cm2","sara_score","sara_label","success"
];

const rows=completedTrials.map(t=>[
metadata.participant_id,metadata.session,metadata.age,metadata.sex,metadata.hand,metadata.date,
t.testMode,t.testName,t.trialNumber,t.timestamp,t.durationSeconds.toFixed(2),t.pixelsPerCm.toFixed(4),t.cmPerPixel.toFixed(6),t.toleranceCm.toFixed(2),
t.statistics.discontinuities,t.statistics.verticalTurns,t.statistics.horizontalTurns,t.statistics.outOfBounds,t.statistics.startFails,
t.maxPx.toFixed(3),t.maxCm.toFixed(3),t.meanPx.toFixed(3),t.meanCm.toFixed(3),t.p95Px.toFixed(3),t.p95Cm.toFixed(3),
t.statistics.deviationAreaPx2.toFixed(3),t.areaCm2.toFixed(3),t.sara,SARA_LABELS[t.sara]??t.sara,t.success?1:0
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
const LD_GOOGLE_SHEET_WEB_APP_URL="https://script.google.com/macros/s/AKfycbzneQXEM3ElSdXBlhjCxaIlNSRJgV2iUAbYWh6uLllD7U90o6pqtL9EC3TBpjRLRFeP/exec";

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
'sara_score','sara_label','scoring_basis','success'
];

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
sara,SARA_LABELS[sara]??sara,"P95 deviation (cm)",success?1:0
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
   INIT
========================= */

changeTest();
