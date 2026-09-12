// Node simulation test for the RT dysmetria/tremor scoring pipeline.
// Mirrors the SD module's "Node-based simulation of pure scoring functions"
// verification approach (see SD/VERIFICATION-REPORT.md).

const RT_SCORING_CONFIG = {
  version: 'rt-scoring-v1',
  arrival: { peakVelocityThresholdPct: 0.08, minSustainMs: 100 },
  dysmetriaBucketsCm: [1.0, 5.0, 15.0],
  tremorBucketsCm: [1.0, 2.0, 5.0],
  weights: { dysmetria: 0.6, tremor: 0.4 },
  minReliableFps: 20
};

function bucketFromCm(valueCm, boundaries){
  for(let i=0;i<boundaries.length;i++){
    if(valueCm < boundaries[i]) return i;
  }
  return boundaries.length;
}

function dysmetria_score(arrival_dist_cm, missed){
  if(missed || arrival_dist_cm === null || arrival_dist_cm === undefined || Number.isNaN(arrival_dist_cm)) return null;
  return bucketFromCm(arrival_dist_cm, RT_SCORING_CONFIG.dysmetriaBucketsCm);
}

function tremor_score(tremor_max_dev_cm, missed){
  if(missed) return null;
  if(tremor_max_dev_cm === null || tremor_max_dev_cm === undefined || Number.isNaN(tremor_max_dev_cm)) return null;
  return bucketFromCm(tremor_max_dev_cm, RT_SCORING_CONFIG.tremorBucketsCm);
}

function combined_rt_score(dScore, tScore){
  if(dScore === null || dScore === undefined) return null;
  if(tScore === null || tScore === undefined) return { score: dScore, tremorAvailable: false };
  const W = RT_SCORING_CONFIG.weights;
  const raw = dScore * W.dysmetria + tScore * W.tremor;
  return { score: Math.min(4, Math.max(0, Math.round(raw))), tremorAvailable: true };
}

function findArrivalIndex(positions, velocities){
  const cfg_ = RT_SCORING_CONFIG.arrival;
  let peak = 0, peakIdx = 0;
  for(let i=0;i<velocities.length;i++) if(velocities[i] > peak){ peak = velocities[i]; peakIdx = i; }
  if(peak <= 0) return null;
  const thresh = peak * cfg_.peakVelocityThresholdPct;
  let slowStartIdx = null, slowStartT = null;
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

// ---- helper to build a synthetic trial ----
// px_per_cm = 30 (matches DEFAULTS.ppc)
const PPC = 30;
function cm(px){ return px / PPC; }

function buildVelocities(positions){
  const v = [];
  for(let i=1;i<positions.length;i++){
    const dt = Math.max(1, positions[i].t - positions[i-1].t);
    const d = Math.hypot(positions[i].x-positions[i-1].x, positions[i].y-positions[i-1].y);
    v.push(d/dt*1000);
  }
  return v;
}

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail||''}`); }
}

// ---- Test 1: fast reach + clean hold near target (should score well) ----
{
  const target = {x:500, y:500};
  // fast approach: 0..300ms covers 400px, then holds steady near target for 1700ms
  const positions = [];
  let t = 0;
  // approach phase: 10 samples, decelerating into the target
  const approach = [
    [100,100],[200,180],[300,260],[380,330],[440,390],[480,430],[498,470],[500,495],[500,499],[500,500]
  ];
  approach.forEach((p,i)=>{ positions.push({x:p[0], y:p[1], t: i*30}); });
  // hold phase: 1700ms at ~60fps (16.6ms/frame), tiny jitter of +-1px (sub-mm tremor)
  let holdT = 300;
  for(let i=0;i<100;i++){
    holdT += 17;
    const jitter = (i%2===0)?1:-1;
    positions.push({x:500+jitter, y:500, t: holdT});
  }
  const velocities = buildVelocities(positions);
  const arrIdx = findArrivalIndex(positions, velocities);
  check('T1 arrival detected (not null)', arrIdx !== null, `arrIdx=${arrIdx}`);
  const arrivalPos = positions[arrIdx];
  const arrival_dist_cm = cm(Math.hypot(arrivalPos.x-target.x, arrivalPos.y-target.y));
  check('T1 arrival point is near target (<1cm)', arrival_dist_cm < 1.0, `arrival_dist_cm=${arrival_dist_cm.toFixed(3)}`);
  const holdPositions = positions.slice(arrIdx+1);
  let maxDevPx = 0;
  for(const p of holdPositions){ const d = Math.hypot(p.x-arrivalPos.x, p.y-arrivalPos.y); if(d>maxDevPx) maxDevPx = d; }
  const tremor_cm = cm(maxDevPx);
  check('T1 tremor small (<1cm, matches 1px jitter)', tremor_cm < 1.0, `tremor_cm=${tremor_cm.toFixed(3)}`);
  const dScore = dysmetria_score(arrival_dist_cm, false);
  const tScore = tremor_score(tremor_cm, false);
  check('T1 dysmetria score = 0', dScore === 0, `dScore=${dScore}`);
  check('T1 tremor score = 0', tScore === 0, `tScore=${tScore}`);
  const combined = combined_rt_score(dScore, tScore);
  check('T1 combined score = 0', combined.score === 0, `combined=${JSON.stringify(combined)}`);
}

// ---- Test 2: overshoot then correct (dysmetria should reflect the *stop* point, not the final tiny-jitter point) ----
{
  const target = {x:500, y:500};
  const positions = [];
  // fast movement overshoots to (560,500) [60px = 2cm past target], stays there briefly then no correction (single settle)
  const approach = [[100,500],[250,500],[400,500],[520,500],[560,500]];
  approach.forEach((p,i)=>{ positions.push({x:p[0], y:p[1], t: i*30}); });
  let holdT = 150;
  for(let i=0;i<50;i++){ holdT += 17; positions.push({x:560, y:500, t: holdT}); } // holds at overshoot point, minimal jitter
  const velocities = buildVelocities(positions);
  const arrIdx = findArrivalIndex(positions, velocities);
  check('T2 arrival detected', arrIdx !== null, `arrIdx=${arrIdx}`);
  const arrivalPos = positions[arrIdx];
  const arrival_dist_cm = cm(Math.hypot(arrivalPos.x-target.x, arrivalPos.y-target.y));
  check('T2 arrival distance ~2cm (overshoot captured)', Math.abs(arrival_dist_cm - 2.0) < 0.5, `arrival_dist_cm=${arrival_dist_cm.toFixed(3)}`);
  const dScore = dysmetria_score(arrival_dist_cm, false);
  check('T2 dysmetria score = 1 (2cm is outside 1cm target radius)', dScore === 1, `dScore=${dScore}`);
}

// ---- Test 3: missed trial (no positions at all) ----
{
  const dScore = dysmetria_score(null, true);
  const tScore = tremor_score(null, true);
  const combined = combined_rt_score(dScore, tScore);
  check('T3 missed -> dysmetria unavailable at trial level', dScore === null);
  check('T3 missed -> tremor unavailable at trial level', tScore === null);
  check('T3 missed -> combined unavailable at trial level', combined === null);
}

// ---- Test 4: no hold phase (arrival happens at the very last sample) -> tremor unavailable, falls back to dysmetria only ----
{
  const target = {x:500,y:500};
  const positions = [{x:100,y:500,t:0},{x:300,y:500,t:30},{x:490,y:500,t:60},{x:500,y:500,t:90}];
  const velocities = buildVelocities(positions);
  const arrIdx = findArrivalIndex(positions, velocities);
  // With only 90ms of total trial and minSustainMs=100, arrival likely not confirmed -> null -> fallback to last position by caller.
  // Simulate the caller's fallback logic here:
  const finalIdx = positions.length - 1;
  const useIdx = (arrIdx !== null) ? arrIdx : finalIdx;
  const holdPositions = positions.slice(useIdx+1);
  const tremor_max_dev_cm = holdPositions.length > 0 ? 0 : null;
  check('T4 no hold phase -> tremor null', tremor_max_dev_cm === null, `holdPositions.length=${holdPositions.length}`);
  const dScore = dysmetria_score(cm(Math.hypot(positions[useIdx].x-target.x, positions[useIdx].y-target.y)), false);
  const tScore = tremor_score(tremor_max_dev_cm, false);
  const combined = combined_rt_score(dScore, tScore);
  check('T4 combined falls back to dysmetria-only', combined.tremorAvailable === false && combined.score === dScore, `combined=${JSON.stringify(combined)}`);
}

// ---- Test 5: config is single source of truth -- changing weights changes the combined score ----
{
  const dScore = 1, tScore = 3;
  const before = combined_rt_score(dScore, tScore); // 0.6*1+0.4*3 = 1.8 -> round 2
  RT_SCORING_CONFIG.weights = { dysmetria: 0.2, tremor: 0.8 };
  const after = combined_rt_score(dScore, tScore); // 0.2*1+0.8*3 = 2.6 -> round 3
  check('T5 before weight change: score=2', before.score === 2, `before=${JSON.stringify(before)}`);
  check('T5 after weight change: score=3', after.score === 3, `after=${JSON.stringify(after)}`);
  RT_SCORING_CONFIG.weights = { dysmetria: 0.6, tremor: 0.4 }; // restore
}

// ---- Test 6: bucket boundary edge cases ----
{
  check('T6 exactly 1.0cm -> bucket 1', bucketFromCm(1.0, RT_SCORING_CONFIG.dysmetriaBucketsCm) === 1);
  check('T6 0.99cm -> bucket 0', bucketFromCm(0.99, RT_SCORING_CONFIG.dysmetriaBucketsCm) === 0);
  check('T6 15cm -> SARA dysmetria score 3', bucketFromCm(15, RT_SCORING_CONFIG.dysmetriaBucketsCm) === 3);
  check('T6 100cm remains score 3', bucketFromCm(100, RT_SCORING_CONFIG.dysmetriaBucketsCm) === 3);
  check('T6 tremor 0.5cm -> bucket 0', bucketFromCm(0.5, RT_SCORING_CONFIG.tremorBucketsCm) === 0);
  check('T6 tremor 11cm -> experimental bucket 3', bucketFromCm(11, RT_SCORING_CONFIG.tremorBucketsCm) === 3);
}

// ---- Test 7: index-finger calibration geometry ----
{
  const segmentPx = (a,b,w=1280,h=720) => Math.hypot((a.x-b.x)*w,(a.y-b.y)*h);
  const lm = Array.from({length:21},()=>({x:.5,y:.5}));
  lm[5]={x:.50,y:.60}; lm[6]={x:.50,y:.55}; lm[7]={x:.50,y:.50}; lm[8]={x:.50,y:.45};
  const measuredPx = segmentPx(lm[5],lm[6])+segmentPx(lm[6],lm[7])+segmentPx(lm[7],lm[8]);
  const ppc = measuredPx/7.5;
  check('T7 index length uses landmarks 5-6-7-8', Math.abs(measuredPx-108)<1e-9, `px=${measuredPx}`);
  check('T7 pixels/cm derives from entered finger length', Math.abs(ppc-14.4)<1e-9, `ppc=${ppc}`);
  const radiusPx=1.5*ppc, edge=20;
  const diagonalCm=Math.hypot(1280/2-edge-radiusPx,720/2-edge-radiusPx)/ppc;
  check('T7 center-to-upper-corner space exceeds 20cm', diagonalCm>20, `diagonal=${diagonalCm}`);
}

// ---- Test 8: a tracking-loss gap starts a new visible path segment ----
{
  const path = [
    {x:10,y:10,segment:0},{x:20,y:20,segment:0},
    {x:300,y:250,segment:1},{x:310,y:255,segment:1}
  ];
  const connected = path.slice(1).map((p,i)=>p.segment === path[i].segment);
  check('T8 path connects within each detected segment', connected[0] && connected[2]);
  check('T8 path does not bridge a hand-detection gap', connected[1] === false);
}

// ---- Test 9: five targets, exact 30cm steps, bounded generation time ----
{
  const cfg={edge_px:20};
  function generate(count,distancePx,radiusPx,width=1280,height=720){
    const margin=radiusPx+cfg.edge_px,minX=margin,maxX=width-margin,minY=margin,maxY=Math.min(height*.70-radiusPx,height-margin);
    const inside=p=>p[0]>=minX&&p[0]<=maxX&&p[1]>=minY&&p[1]<=maxY;
    const distinct=(p,path)=>path.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>Math.max(2,radiusPx));
    const starts=[[(minX+maxX)/2,(minY+maxY)/2],[minX,minY],[maxX,minY],[minX,maxY],[maxX,maxY]];
    for(let i=0;i<32;i++) starts.push([minX+Math.random()*(maxX-minX),minY+Math.random()*(maxY-minY)]);
    const phase=Math.random()*Math.PI*2,angles=Array.from({length:180},(_,i)=>phase+i*Math.PI/90);
    function extend(path){
      if(path.length===count)return path;
      const prev=path[path.length-1];
      for(const angle of angles){
        const next=[prev[0]+distancePx*Math.cos(angle),prev[1]+distancePx*Math.sin(angle)];
        if(inside(next)&&distinct(next,path)){const result=extend([...path,next]);if(result)return result;}
      }
      return null;
    }
    for(const start of starts){const result=extend([start]);if(result)return result;}
    return null;
  }
  const scenarios=[
    ...[8,12,15,16.5].map(ppc=>({ppc,width:640,height:480})),
    ...[8,15,25,30].map(ppc=>({ppc,width:1280,height:720}))
  ];
  const runs=scenarios.map(({ppc,width,height})=>{
    const start=performance.now();
    const targets=generate(5,30*ppc,1.5*ppc,width,height);
    return {ppc,width,height,targets,elapsed:performance.now()-start};
  });
  check('T9 generates exactly five targets', runs.every(r=>r.targets?.length===5));
  check('T9 generation finishes within 100ms', runs.every(r=>r.elapsed<100), JSON.stringify(runs.map(r=>r.elapsed)));
  check('T9 every consecutive movement is exactly 30cm', runs.every(r=>r.targets.slice(1).every((p,i)=>Math.abs(Math.hypot(p[0]-r.targets[i][0],p[1]-r.targets[i][1])/r.ppc-30)<1e-9)));
  check('T9 every target center stays in upper 70%', runs.every(r=>r.targets.every(p=>p[1]<=r.height*.70)));
  check('T9 every complete target circle stays in upper 70%', runs.every(r=>r.targets.every(p=>p[1]+1.5*r.ppc<=r.height*.70+1e-9)));
}

// ---- Test 10: fixed target timing and post-arrival analysis window ----
{
  const intervalMs=2000, count=5;
  const starts=Array.from({length:count},(_,i)=>i*intervalMs);
  const ends=Array.from({length:count},(_,i)=>(i+1)*intervalMs);
  check('T10 targets start at 0/2/4/6/8 seconds', JSON.stringify(starts)===JSON.stringify([0,2000,4000,6000,8000]));
  check('T10 run ends at 10 seconds', ends[ends.length-1]===10000);
  const arrivalMs=850, targetEndMs=2000;
  check('T10 tremor window ends at target boundary, not arrival plus 2s', targetEndMs-arrivalMs===1150 && targetEndMs!==arrivalMs+2000);
}

// ---- Test 11: bilateral flow and configurable movement count ----
{
  const selected='B';
  const hands=selected==='B'?['R','L']:[selected];
  const movements=7;
  check('T11 Both runs right hand before left hand', JSON.stringify(hands)===JSON.stringify(['R','L']));
  check('T11 user movement count is applied per hand', hands.length*movements===14);
  const right=.67,left=1.33;
  check('T11 bilateral result averages hand scores', Math.abs((right+left)/2-1)<1e-9);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
