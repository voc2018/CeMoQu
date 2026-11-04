/* Run with: node test_scoring.js */
const s=require("./scoring.js");
let pass=0,fail=0;
function check(name,cond,detail){
if(cond){pass++;console.log(`PASS  ${name}`);}
else{fail++;console.log(`FAIL  ${name}  ${detail??""}`);}
}
const near=(a,b,e=0.01)=>Math.abs(a-b)<=e;

const BOX=36,PPC=40,CPP=1/PPC;
const H=ls=>s.ldGuideLine([30,332],[934,332],BOX);
const line=H();
const yMid=350;
/* Zigzag path along the horizontal test. offsets are in cm from the line. */
function zig(offsetsCm,stepsPerLeg=20){
const pts=[];const total=offsetsCm.length-1;
for(let i=0;i<total;i++){
for(let k=0;k<stepsPerLeg;k++){
const f=k/stepsPerLeg;
const x=48+(904-48)*((i+f)/total);
const cm=offsetsCm[i]+(offsetsCm[i+1]-offsetsCm[i])*f;
pts.push([x,yMid+cm*PPC]);
}}
pts.push([904,yMid+offsetsCm[offsetsCm.length-1]*PPC]);
return pts;
}
const multi=(strokes,toleranceCm=0.25,failCode="")=>s.ldScoreTrial({strokes,line,toleranceCm,cmPerPixel:CPP,failCode});
const score=(points,toleranceCm=0.25,failCode="")=>multi([points],toleranceCm,failCode);
const wave=(amp,n)=>{const o=[0];for(let i=0;i<n;i++)o.push(i%2?-amp/2:amp/2);o.push(0);return o;};

let r=score(zig([0,0]));
check("straight on the line scores 0",r.score===0&&r.turnCount===0);
r=score(zig([0.7,0.7]).map(p=>p));
check("parallel 0.7 cm line, no shaking, scores 0",r.score===0&&r.turnCount===0);
r=score(zig(wave(0.2,12)));
check("shaking below tolerance is not a turn, scores 0",r.score===0&&r.turnCount===0);
r=score(zig(wave(1,12)));
check("1 cm tremor scores 1",r.score===1&&near(r.amplitudeMeanCm,1),JSON.stringify(r));
r=score(zig(wave(3,12)));
check("3 cm tremor scores 2",r.score===2&&near(r.amplitudeMeanCm,3),JSON.stringify(r));
r=score(zig(wave(6,12)));
check("6 cm tremor scores 3",r.score===3&&near(r.amplitudeMeanCm,6),JSON.stringify(r));
r=score(zig(wave(1.99,12)));
check("just under 2 cm scores 1",r.score===1,JSON.stringify(r));
r=score(zig(wave(2.01,12)));
check("just over 2 cm scores 2",r.score===2,JSON.stringify(r));
r=score(zig(wave(4.99,12)));
check("just under 5 cm scores 2",r.score===2,JSON.stringify(r));
r=score(zig(wave(5.01,12)));
check("just over 5 cm scores 3",r.score===3,JSON.stringify(r));
r=score(zig([0,3,0]));
check("single bump uses its height, scores 2",r.score===2&&r.turnCount===1&&near(r.amplitudeMeanCm,3),JSON.stringify(r));
r=score(zig([0,3]));
check("slow drift with no turn scores 0",r.score===0&&r.turnCount===0);

const spike=wave(1,24);spike[12]=12;
r=score(zig(spike));
check("one large jump is removed, score stays 1",r.score===1&&r.amplitudesRemoved>=1,JSON.stringify(r));
check("median is reported beside mean",r.amplitudeMedianCm!==null&&near(r.amplitudeMedianCm,1),JSON.stringify(r));

check("tolerance changes what counts as a turn",score(zig(wave(0.4,12)),0.25).turnCount>0&&score(zig(wave(0.4,12)),0.5).turnCount===0);

const lineAt=(cm,from,to)=>{const p=[];for(let x=from;x<=to;x+=10)p.push([x,yMid+cm*PPC]);return p;};
r=multi([lineAt(0,48,400),lineAt(5,420,904)]);
check("jump between two straight strokes is not an amplitude, scores 0",r.score===0&&r.turnCount===0,JSON.stringify(r));
check("jump distance is recorded",r.rejoinJumpsCm.length===1&&near(r.rejoinJumpMaxCm,Math.hypot(22,200)/PPC),JSON.stringify(r));
r=multi([zig(wave(3,12)).slice(0,100),lineAt(8,500,904)]);
check("tremor in one stroke still scores after a jump",r.score===2&&r.rejoinJumpMaxCm>4,JSON.stringify(r));
r=multi([lineAt(0,48,904)]);
check("no lift, no jump",r.rejoinJumpsCm.length===0&&r.rejoinJumpMaxCm===null);
const a=s.ldAmplitudeSummary([1,1,1,1,1,1,1,1,1,9]);
check("10 amplitudes: largest one removed",a.removed===1&&a.used===9&&near(a.mean,1));
const b=s.ldAmplitudeSummary(Array(40).fill(1).concat([9,9]));
check("42 amplitudes: top 5% rounded up removes 3",b.removed===3);
const c=s.ldAmplitudeSummary([1,6]);
check("2 amplitudes are kept",c.removed===0&&near(c.mean,3.5));
const d=s.ldAmplitudeSummary([1,2,9,10]);
check("median of even count",d.removed===1&&near(d.median,2));

const counts=(o={})=>({startFails:0,outOfBounds:0,discontinuities:0,...o});
check("3 start fails is SF",s.ldFailCode(counts({startFails:3}),1)==="SF");
check("2 start fails passes",s.ldFailCode(counts({startFails:2}),1)==="");
check("30 seconds is TO",s.ldFailCode(counts(),30)==="TO");
check("29.9 seconds passes",s.ldFailCode(counts(),29.9)==="");
check("3 out of bounds is OB",s.ldFailCode(counts({outOfBounds:3}),1)==="OB");
check("10 discontinuities is DC",s.ldFailCode(counts({discontinuities:10}),1)==="DC");
check("9 discontinuities passes",s.ldFailCode(counts({discontinuities:9}),1)==="");
check("fail code scores 4",score(zig([0,0]),0.25,"DC").score===4&&score(zig([0,0]),0.25,"DC").failCode==="DC");

check("horizontal: before end boundary",!s.ldCrossedEndBoundary([933,350],line,BOX));
check("horizontal: at F box near edge",s.ldCrossedEndBoundary([934,350],line,BOX));
check("horizontal: crossing far from the box still ends",s.ldCrossedEndBoundary([940,120],line,BOX));
const v=s.ldGuideLine([482,40],[482,634],BOX);
check("vertical: end boundary",s.ldCrossedEndBoundary([300,634],v,BOX)&&!s.ldCrossedEndBoundary([500,633],v,BOX));
const dg=s.ldGuideLine([30,40],[934,634],BOX);
check("diagonal: perpendicular distance",near(Math.abs(s.ldPerpendicular([48+100,58+100*(594/904)+40],dg)),40*Math.cos(Math.atan2(594,904)),0.01));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
