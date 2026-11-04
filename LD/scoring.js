/* =========================
   LD CMQ SCORE
   Pure scoring functions, shared by app.js and test_scoring.js.
   The score uses turn amplitude only. Every other LD metric is calculated
   and stored but does not affect the score.

   The 2 cm and 5 cm cut-offs follow the SARA Nose-Finger tremor amplitudes.
   The limits marked provisional are placeholders until a clinician sets them.
========================= */

const LD_SCORING_CONFIG={
version:"ld-scoring-v2",
amplitudeCutoffsCm:[2,5],
trimTopFraction:0.05,
minAmplitudesForTrim:3,
/* Provisional limits */
startFailLimit:3,
timeLimitSeconds:30,
outOfBoundsLimit:3,
discontinuityLimit:10
};

const LD_FAIL_CODES={
SF:"Start Fail: 3 failed presses in a row at the start point",
TO:"Time Out: end boundary not crossed within 30 seconds",
OB:"Out of Bounds: left the canvas 3 or more times",
DC:"Discontinuity: 10 or more lifts during the trial"
};

function ldGuideLine(sBox,fBox,box){
const sx=sBox[0]+box/2,sy=sBox[1]+box/2,fx=fBox[0]+box/2,fy=fBox[1]+box/2;
const length=Math.hypot(fx-sx,fy-sy);
return{sx,sy,ux:(fx-sx)/length,uy:(fy-sy)/length,length};
}

/* Distance along the guide line, measured from the start point. */
function ldAlongLine([x,y],line){
return (x-line.sx)*line.ux+(y-line.sy)*line.uy;
}

/* Signed distance from the guide line, perpendicular to it. */
function ldPerpendicular([x,y],line){
return (x-line.sx)*(-line.uy)+(y-line.sy)*line.ux;
}

/* The trial ends when the path crosses the end boundary: the line across
   the guide line at the near edge of the F box. */
function ldCrossedEndBoundary(point,line,box){
return ldAlongLine(point,line)>=line.length-box/2;
}

/* Finds turns in the perpendicular signal. A reversal smaller than the
   tolerance is not a turn. Returns the amplitude between neighbouring turns.
   With a single turn there is no turn-to-turn span, so the two legs on each
   side of that turn are used, keeping those that reach the tolerance. */
function ldFindTurns(series,tolerance){
if(series.length<2||!(tolerance>0)) return{turnCount:0,amplitudes:[]};
const pivots=[series[0]];
let direction=0;
let extreme=series[0];
let low=series[0],high=series[0];
for(const value of series){
if(direction===0){
low=Math.min(low,value);
high=Math.max(high,value);
if(high-low>=tolerance){
direction=value===high?1:-1;
pivots[0]=direction>0?low:high;
extreme=value;
}
}else if(direction>0){
if(value>extreme) extreme=value;
else if(extreme-value>=tolerance){pivots.push(extreme);direction=-1;extreme=value;}
}else{
if(value<extreme) extreme=value;
else if(value-extreme>=tolerance){pivots.push(extreme);direction=1;extreme=value;}
}
}
const turnCount=pivots.length-1;
if(turnCount===0) return{turnCount:0,amplitudes:[]};
const turns=pivots.slice(1);
if(turnCount===1){
const legs=[Math.abs(turns[0]-pivots[0]),Math.abs(extreme-turns[0])];
return{turnCount,amplitudes:legs.filter(leg=>leg>=tolerance)};
}
const amplitudes=[];
for(let i=1;i<turns.length;i++) amplitudes.push(Math.abs(turns[i]-turns[i-1]));
return{turnCount,amplitudes};
}

/* Removes the largest 5% of amplitudes (rounded up), then reports the mean
   and median. Fewer than 3 amplitudes are kept as they are. */
function ldAmplitudeSummary(amplitudes,config=LD_SCORING_CONFIG){
if(amplitudes.length===0) return{mean:null,median:null,used:0,removed:0};
const sorted=[...amplitudes].sort((a,b)=>a-b);
const removed=sorted.length>=config.minAmplitudesForTrim?
Math.ceil(sorted.length*config.trimTopFraction):0;
const kept=sorted.slice(0,sorted.length-removed);
const mean=kept.reduce((a,b)=>a+b,0)/kept.length;
const middle=Math.floor(kept.length/2);
const median=kept.length%2?kept[middle]:(kept[middle-1]+kept[middle])/2;
return{mean,median,used:kept.length,removed};
}

function ldScoreFromAmplitude(turnCount,meanCm,config=LD_SCORING_CONFIG){
if(turnCount===0||meanCm===null) return 0;
if(meanCm<config.amplitudeCutoffsCm[0]) return 1;
if(meanCm<config.amplitudeCutoffsCm[1]) return 2;
return 3;
}

/* Reason a trial scores 4, or "" when it does not. */
function ldFailCode(counts,elapsedSeconds,config=LD_SCORING_CONFIG){
if(counts.startFails>=config.startFailLimit) return "SF";
if(counts.outOfBounds>=config.outOfBoundsLimit) return "OB";
if(counts.discontinuities>=config.discontinuityLimit) return "DC";
if(elapsedSeconds>=config.timeLimitSeconds) return "TO";
return "";
}

/* Distance jumped at each lift, from the end of one stroke to the start of
   the next. Recorded for review and not used in the score. */
function ldRejoinJumps(strokes,cmPerPixel){
const filled=strokes.filter(stroke=>stroke.length>0);
const jumps=[];
for(let i=1;i<filled.length;i++){
const[ax,ay]=filled[i-1].at(-1);
const[bx,by]=filled[i][0];
jumps.push(Math.hypot(bx-ax,by-ay)*cmPerPixel);
}
return jumps;
}

/* Full scoring of one trial. Each stroke is measured on its own, so the jump
   between strokes is never an amplitude. Amplitudes from all strokes are then
   pooled. cmPerPixel converts canvas units. */
function ldScoreTrial({strokes,line,toleranceCm,cmPerPixel,failCode},config=LD_SCORING_CONFIG){
let turnCount=0;
const amplitudes=[];
for(const stroke of strokes){
const series=stroke.map(point=>ldPerpendicular(point,line));
const found=ldFindTurns(series,toleranceCm/cmPerPixel);
turnCount+=found.turnCount;
amplitudes.push(...found.amplitudes);
}
const summary=ldAmplitudeSummary(amplitudes.map(a=>a*cmPerPixel),config);
const rejoinJumpsCm=ldRejoinJumps(strokes,cmPerPixel);
const score=failCode?4:ldScoreFromAmplitude(turnCount,summary.mean,config);
return{
score,
failCode:failCode||"",
turnCount,
amplitudeMeanCm:summary.mean,
amplitudeMedianCm:summary.median,
amplitudesUsed:summary.used,
amplitudesRemoved:summary.removed,
rejoinJumpsCm,
rejoinJumpMaxCm:rejoinJumpsCm.length?Math.max(...rejoinJumpsCm):null
};
}

if(typeof module!=="undefined"&&module.exports){
module.exports={
LD_SCORING_CONFIG,LD_FAIL_CODES,ldGuideLine,ldAlongLine,ldPerpendicular,
ldCrossedEndBoundary,ldFindTurns,ldAmplitudeSummary,ldScoreFromAmplitude,
ldFailCode,ldRejoinJumps,ldScoreTrial
};
}
