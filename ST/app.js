(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // SECTION 1: CONFIG — constants & shared mutable state
  // ══════════════════════════════════════════════════════════════

  const DURATION_S           = 10.0;
  const SWAY_NONE_CM         = 1.0;
  const SWAY_LARGE_CM        = 10.0;
  const SUPPORT_SHIFT_CM     = 8.0;
  const CONSTANT_DUTY        = 0.60;
  const TRACKING_LOSS_FRAMES = 15;

  let ppc            = 30;
  let calibRunning   = false;
  let calibSamples   = [];

  let pose        = null;
  let poseCamera  = null;
  let lm          = null;
  let VIDEO_W     = 640;
  let VIDEO_H     = 480;
  let drawReq     = null;

  let running  = false;
  let st       = null;
  let frameIdx = 0;

  let allFrames    = [];
  let allSummaries = [];
  let allFinals    = [];

  let scoreChartInst = null;

  // ══════════════════════════════════════════════════════════════
  // SECTION 2: DOM REFS
  // ══════════════════════════════════════════════════════════════

  const $ = id => document.getElementById(id);

  const video      = $('video');
  const ov         = $('ov');
  const ctx        = ov.getContext('2d');
  const viewer     = $('viewer');
  const btnCam     = $('btnCam');
  const btnCalib   = $('btnCalib');
  const btnStart   = $('btnStart');
  const btnStop    = $('btnStop');
  const monSz      = $('monSz');
  const monCust    = $('monCust');
  const shCm       = $('shCm');
  const scoreOv    = $('scoreOv');
  const countdownOv = $('countdownOv');
  const progBar    = $('progBar');
  const dashPanel  = $('dashPanel');

  // ══════════════════════════════════════════════════════════════
  // SECTION 3: AUDIO
  // ══════════════════════════════════════════════════════════════

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  function beep(freq, duration, volume) {
    if (freq === undefined) freq = 880;
    if (duration === undefined) duration = 120;
    if (volume === undefined) volume = 0.05;
    try {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type            = 'sine';
      osc.frequency.value = freq;
      gain.gain.value     = volume;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      setTimeout(function () { osc.stop(); osc.disconnect(); gain.disconnect(); }, duration);
    } catch (e) { /* silently ignore */ }
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 4: UI HELPERS
  // ══════════════════════════════════════════════════════════════

  function set(id, v) {
    const e = $(id);
    if (e) e.textContent = v;
  }

  function show(id) {
    const e = $(id);
    if (e) e.style.display = '';
  }

  function hide(id) {
    const e = $(id);
    if (e) e.style.display = 'none';
  }

  function setBadge(id, text, cls) {
    const e = $(id);
    if (!e) return;
    e.innerHTML = '<span class="pill-dot"></span>' + text;
    e.className = 'pill' + (cls ? ' ' + cls : '');
  }

  function setPill(id, text, cls) {
    const e = $(id);
    if (!e) return;
    e.textContent = text;
    e.className   = 'sp' + (cls ? ' ' + cls : '');
  }

  function setL(id, text, cls) {
    const e = $(id);
    if (!e) return;
    e.textContent = text;
    e.className   = 'lval' + (cls ? ' ' + cls : '');
  }

  function switchTab(name) {
    document.querySelectorAll('.st-tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.st-panel').forEach(function (p) { p.classList.remove('active'); });
    document.querySelector('.st-tab[data-tab="' + name + '"]').classList.add('active');
    $(name === 'test' ? 'testPanel' : 'researchPanel').classList.add('active');
    if (name === 'research') refreshDashboard();
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 5: SCORING
  // ══════════════════════════════════════════════════════════════

  const SARA_LABELS = [
    'Normal — no sway',
    'Slight intermittent sway, no support',
    'Constant sway, maintains without support',
    'Needs intermittent support',
    'Cannot maintain 10 s',
  ];

  function computeMetrics(pos) {
    var n = pos.length;
    if (n < 2) return null;

    var mx = 0, my = 0;
    pos.forEach(function (p) { mx += p.x; my += p.y; });
    mx /= n; my /= n;

    var radii   = pos.map(function (p) { return Math.hypot(p.x - mx, p.y - my); });
    var max_px  = Math.max.apply(null, radii);
    var mean_px = radii.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd_px   = Math.sqrt(radii.reduce(function (s, r) { return s + Math.pow(r - mean_px, 2); }, 0) / n);

    var swayThreshold = ppc * SWAY_NONE_CM;
    var swayDuty      = radii.filter(function (r) { return r > swayThreshold; }).length / n;

    var maxShift = 0;
    for (var i = 1; i < pos.length; i++) {
      maxShift = Math.max(maxShift, Math.hypot(pos[i].x - pos[i - 1].x, pos[i].y - pos[i - 1].y));
    }

    return {
      max_cm:      max_px  / ppc,
      mean_cm:     mean_px / ppc,
      sd_cm:       sd_px   / ppc,
      swayDuty:    swayDuty,
      maxShift_cm: maxShift / ppc,
      n:           n,
    };
  }

  function saraScore(m, trackingLostEarly, supportEvents, durationAchieved) {
    var r = {};
    if (!durationAchieved)         { r.score = 4; r.primary = 'Duration not reached'; return r; }
    if (trackingLostEarly)         { r.score = 4; r.primary = 'Tracking lost — patient left frame'; return r; }
    if (!m)                        { r.score = 4; r.primary = 'No position data'; return r; }
    if (supportEvents > 0)         { r.score = 3; r.primary = supportEvents + ' support event(s) detected'; return r; }
    if (m.max_cm >= SWAY_LARGE_CM) { r.score = 3; r.primary = 'Large deviation: ' + m.max_cm.toFixed(2) + ' cm'; return r; }
    if (m.max_cm < SWAY_NONE_CM)   { r.score = 0; r.primary = 'No sway: max ' + m.max_cm.toFixed(2) + ' cm'; return r; }
    if (m.swayDuty > CONSTANT_DUTY){ r.score = 2; r.primary = 'Constant sway: ' + (m.swayDuty * 100).toFixed(0) + '% frames'; return r; }
    r.score = 1;
    r.primary = 'Intermittent sway: ' + (m.swayDuty * 100).toFixed(0) + '% frames';
    return r;
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 6: CAMERA
  // ══════════════════════════════════════════════════════════════

  function initCamera() {
    btnCam.disabled    = true;
    btnCam.textContent = 'Loading…';

    pose = new Pose({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/' + f; } });
    pose.setOptions({
      modelComplexity:        1,
      smoothLandmarks:        true,
      enableSegmentation:     false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    });
    pose.onResults(onPose);

    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    }).then(function (stream) {
      video.srcObject = stream;
      return video.play();
    }).then(function () {
      VIDEO_W = video.videoWidth  || 640;
      VIDEO_H = video.videoHeight || 480;

      poseCamera = new Camera(video, {
        onFrame: function () { return pose.send({ image: video }); },
        width:  VIDEO_W,
        height: VIDEO_H,
      });
      poseCamera.start();

      setBadge('bPose', 'Pose: loading…', '');
      setPill('pCam', VIDEO_W + '×' + VIDEO_H, 'ok');
      btnCalib.disabled = false;
      btnStart.disabled = false;
      btnCam.textContent = '✓ Camera On';
      resizeOv();

      if (guideActive && guideStep === 0) advanceGuide();
    }).catch(function (e) {
      btnCam.disabled    = false;
      btnCam.textContent = '✗ Error: ' + e.message.slice(0, 30);
    });
  }

  function onPose(results) {
    lm = results.poseLandmarks || null;

    if (calibRunning && lm) {
      var ls = lm[11], rs = lm[12];
      if (ls && rs && ls.visibility > 0.4 && rs.visibility > 0.4) {
        var d = Math.hypot((ls.x - rs.x) * VIDEO_W, (ls.y - rs.y) * VIDEO_H);
        if (Number.isFinite(d) && d > 0) calibSamples.push(d);
      }
    }

    setBadge('bPose', lm ? 'Pose: ✓' : 'Pose: no detection', lm ? 'ok' : '');
    setPill('pTrack', lm ? 'Tracking: ✓' : 'Tracking: ✗', lm ? 'ok' : '');

    if (!drawReq) drawReq = requestAnimationFrame(draw);
  }

  function bodyCenter() {
    if (!lm) return null;
    var ls = lm[11], rs = lm[12];
    if (ls && rs && ls.visibility > 0.4 && rs.visibility > 0.4) {
      return { x: ((ls.x + rs.x) / 2) * VIDEO_W, y: ((ls.y + rs.y) / 2) * VIDEO_H };
    }
    var nose = lm[0];
    return (nose && nose.visibility > 0.4) ? { x: nose.x * VIDEO_W, y: nose.y * VIDEO_H } : null;
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 7: CALIBRATION
  // ══════════════════════════════════════════════════════════════

  function startCalib() {
    if (calibRunning) return;
    calibRunning = true;
    calibSamples = [];

    btnCalib.textContent = 'Calibrating 3s…';
    btnCalib.disabled    = true;
    set('calibInfo', 'Hold shoulders in frame — stay still…');

    var t = 3;
    var tick = setInterval(function () {
      t--;
      btnCalib.textContent = 'Calibrating ' + t + 's…';

      if (t <= 0) {
        clearInterval(tick);
        calibRunning    = false;
        btnCalib.disabled    = false;
        btnCalib.textContent = 'Calibrate';

        if (calibSamples.length > 0) {
          var sh = parseFloat(shCm.value) || 40;
          ppc = (calibSamples.reduce(function (a, b) { return a + b; }, 0) / calibSamples.length) / sh;
          set('calibInfo', '✓ Calibrated: ' + ppc.toFixed(2) + ' px/cm');
          setBadge('bCalib', 'Calib: ✓ ' + ppc.toFixed(2) + ' px/cm', 'ok');
          setPill('pPpc', 'px/cm: ' + ppc.toFixed(2), 'ok');
          updateCalibBar();
          if (guideActive && guideStep === 1) advanceGuide();
        } else {
          set('calibInfo', 'No shoulders detected — try again or use Estimate');
        }
      }
    }, 1000);
  }

  function estimatePpc() {
    var d = monSz.value === 'custom'
      ? parseFloat(monCust.value)
      : parseFloat(monSz.value);
    if (!d || d <= 0) d = 24;

    var w_cm = (d * 25.4 * 16 / Math.sqrt(16 * 16 + 9 * 9)) / 10;
    ppc = window.screen.width / w_cm;

    set('calibInfo', 'Estimated: ' + ppc.toFixed(2) + ' px/cm (' + d + '" monitor)');
    setBadge('bCalib', '~' + ppc.toFixed(2) + ' px/cm est', 'warn');
    setPill('pPpc', 'px/cm: ' + ppc.toFixed(2), 'ok');
    updateCalibBar();
  }

  function updateCalibBar() {
    var w = Math.min(
      Math.round(ppc * 8.5),
      viewer.clientWidth - 48
    );
    $('calibBar').style.width = Math.max(0, w) + 'px';
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 8: DRAW — canvas render loop
  // ══════════════════════════════════════════════════════════════

  function resizeOv() {
    var r   = viewer.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    ov.width  = Math.round(r.width  * dpr);
    ov.height = Math.round(r.height * dpr);
    ov.style.width  = r.width  + 'px';
    ov.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCalibBar();
  }

  window.addEventListener('resize', resizeOv);
  new ResizeObserver(resizeOv).observe(viewer);

  function handleFrame() {
    if (!running || !st) return;

    var ts = new Date().toISOString();
    var fi = frameIdx++;
    var c  = bodyCenter();

    if (!c) {
      st.missing = (st.missing || 0) + 1;
      allFrames.push({ fi: fi, ts: ts, x: '', y: '', tracking: 0 });
      if (st.missing >= TRACKING_LOSS_FRAMES && !st.trackingLostEarly) {
        st.trackingLostEarly = true;
        show('hLost');
      }
    } else {
      st.missing = 0;
      hide('hLost');

      var cx = Math.round(c.x), cy = Math.round(c.y);
      if (st.lastC) {
        var shift = Math.hypot(cx - st.lastC.x, cy - st.lastC.y) / ppc;
        if (shift >= SUPPORT_SHIFT_CM) {
          st.supportEvents.push({ fi: fi, shift: shift });
          show('hSupport');
          set('mEvt', st.supportEvents.length);
        }
      }
      st.lastC = { x: cx, y: cy };
      st.pos.push({ x: cx, y: cy });
      allFrames.push({ fi: fi, ts: ts, x: cx, y: cy, tracking: 1 });
    }

    if (st.pos.length > 0 && st.pos.length % 6 === 0) {
      var m = computeMetrics(st.pos);
      if (m) {
        set('mMax',  m.max_cm.toFixed(2));
        set('mMean', m.mean_cm.toFixed(2));
        set('mSd',   m.sd_cm.toFixed(3));
        var elapsed2 = (performance.now() - st.t0) / 1000;
        var res2     = saraScore(m, st.trackingLostEarly, st.supportEvents.length, elapsed2 >= 9.0);
        updateLogic(m, st.trackingLostEarly, st.supportEvents.length, elapsed2 >= 9.0, res2);
        setPill('pScore', 'Score: ~' + res2.score, 's' + res2.score);
        $('hSway').textContent = 'Sway ' + m.mean_cm.toFixed(2) + ' cm mean | max ' + m.max_cm.toFixed(2) + ' cm';
        show('hSway');
      }
    }

    var elapsed   = (performance.now() - st.t0) / 1000;
    var prog      = Math.min(1, elapsed / DURATION_S);
    progBar.style.width      = (prog * 100) + '%';
    progBar.style.background = prog < 0.7 ? 'var(--st-accent)' : 'var(--st-warn)';

    var secDisplay = Math.ceil(Math.max(0, DURATION_S - elapsed));
    $('hTimer').textContent = '' + secDisplay;

    if (!st.lastBeepSec || st.lastBeepSec !== secDisplay) {
      st.lastBeepSec = secDisplay;
      if (secDisplay > 0) beep(secDisplay <= 3 ? 900 : 600, 80, secDisplay <= 3 ? 0.07 : 0.03);
    }

    if (elapsed >= DURATION_S) finalizeTest();
  }

  function updateLogic(m, tl, se, dok, res) {
    setL('lDur',   dok ? 'YES' : 'NO',   dok  ? 'pass' : 'fail');
    setL('lTrack', !tl ? 'YES' : 'NO',   !tl  ? 'pass' : 'fail');
    setL('lSwayVis',
      m ? (m.max_cm >= SWAY_NONE_CM ? 'YES ' + m.max_cm.toFixed(2) + ' cm' : 'no') : '—',
      m && m.max_cm >= SWAY_NONE_CM ? 'warn' : 'pass');
    setL('lSwayType',
      m ? (m.swayDuty * 100).toFixed(0) + '% — ' + (m.swayDuty > CONSTANT_DUTY ? 'CONSTANT' : 'intermittent') : '—',
      m && m.swayDuty > CONSTANT_DUTY ? 'warn' : '');
    setL('lLarge',
      m ? (m.max_cm >= SWAY_LARGE_CM ? 'YES ' + m.max_cm.toFixed(2) + ' cm' : 'no') : '—',
      m && m.max_cm >= SWAY_LARGE_CM ? 'fail' : '');
    setL('lSupport', se > 0 ? 'YES (' + se + ')' : 'none', se > 0 ? 'fail' : 'pass');

    var el = $('lFinal');
    el.textContent = res.score;
    el.className   = 'lval s' + res.score;
  }

  function draw() {
    drawReq = null;

    var cw = parseFloat(ov.style.width)  || ov.clientWidth;
    var ch = parseFloat(ov.style.height) || ov.clientHeight;
    var sc = Math.min(cw / VIDEO_W, ch / VIDEO_H);
    var dW = VIDEO_W * sc, dH = VIDEO_H * sc;
    var oX = (cw - dW) / 2, oY = (ch - dH) / 2;

    ctx.clearRect(0, 0, cw, ch);

    if (video.readyState >= 2) {
      ctx.save();
      ctx.translate(oX + dW, oY);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, VIDEO_W, VIDEO_H, 0, 0, dW, dH);
      ctx.restore();
    }

    var mX = function (x) { return oX + dW - (x * (dW / VIDEO_W)); };
    var mY = function (y) { return oY + (y * (dH / VIDEO_H)); };

    if (lm) {
      var ls = lm[11], rs = lm[12];
      if (ls && rs && ls.visibility > 0.3 && rs.visibility > 0.3) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,200,255,.6)';
        ctx.lineWidth   = 2;
        ctx.moveTo(mX(ls.x * VIDEO_W), mY(ls.y * VIDEO_H));
        ctx.lineTo(mX(rs.x * VIDEO_W), mY(rs.y * VIDEO_H));
        ctx.stroke();
        [ls, rs].forEach(function (p) {
          ctx.beginPath();
          ctx.fillStyle = 'rgba(0,200,255,.85)';
          ctx.arc(mX(p.x * VIDEO_W), mY(p.y * VIDEO_H), 6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }

    if (running && st) {
      if (st.pos.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0,220,255,.45)';
        ctx.lineWidth   = 2;
        ctx.moveTo(mX(st.pos[0].x), mY(st.pos[0].y));
        for (var i = 1; i < st.pos.length; i++) ctx.lineTo(mX(st.pos[i].x), mY(st.pos[i].y));
        ctx.stroke();
      }

      if (st.pos.length > 5) {
        var ax = 0, ay = 0;
        st.pos.forEach(function (p) { ax += p.x; ay += p.y; });
        ax /= st.pos.length; ay /= st.pos.length;
        var maxR = Math.max.apply(null, st.pos.map(function (p) { return Math.hypot(p.x - ax, p.y - ay); })) * (dW / VIDEO_W);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,200,0,.5)';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.arc(mX(ax), mY(ay), Math.max(4, maxR), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (st.lastC) {
        ctx.beginPath();
        ctx.fillStyle = st.supportEvents.length ? 'rgba(255,80,80,.95)' : 'rgba(0,223,162,.95)';
        ctx.arc(mX(st.lastC.x), mY(st.lastC.y), 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }

      if (st.supportEvents.length) {
        var age = frameIdx - st.supportEvents[st.supportEvents.length - 1].fi;
        if (age < 12) {
          ctx.fillStyle = 'rgba(255,50,50,' + (.18 * (1 - age / 12)) + ')';
          ctx.fillRect(oX, oY, dW, dH);
        }
      }

      handleFrame();
    }

    drawReq = requestAnimationFrame(draw);
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 9: TEST LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  function startTest() {
    if (running) return;
    audioCtx.resume();
    btnStart.disabled = true;
    btnStop.disabled  = false;

    var cNum = $('countdownNum');
    var cLbl = $('countdownLabel');
    cLbl.textContent = 'Get ready…';
    countdownOv.classList.add('show');

    var steps = [3, 2, 1];
    var idx = 0;

    function nextCount() {
      if (idx >= steps.length) {
        cLbl.textContent = 'GO!';
        cNum.textContent = '▶';
        beep(1100, 180, 0.08);
        setTimeout(function () {
          countdownOv.classList.remove('show');
          beginRecording();
        }, 500);
        return;
      }
      var n = steps[idx];
      cNum.textContent = n;
      cNum.style.animation = 'none';
      cNum.offsetHeight;
      cNum.style.animation = '';
      beep(n === 1 ? 900 : 660, 120, 0.06);
      idx++;
      setTimeout(nextCount, 900);
    }
    nextCount();
  }

  function beginRecording() {
    allFrames = [];
    frameIdx  = 0;
    st = {
      pos:               [],
      t0:                performance.now(),
      supportEvents:     [],
      trackingLostEarly: false,
      lastC:             null,
      missing:           0,
    };
    running = true;

    setPill('pCam', 'RUNNING', 'run');
    set('mMax', '—'); set('mMean', '—'); set('mSd', '—'); set('mEvt', '0');
    setPill('pScore', 'Score: —', '');
    hide('hSupport'); hide('hLost');
    scoreOv.classList.remove('show');
    progBar.style.width = '0%';

    ['lDur', 'lTrack', 'lSwayVis', 'lSwayType', 'lLarge', 'lSupport', 'lFinal'].forEach(function (id) {
      var e = $(id);
      e.textContent = '—';
      e.className   = 'lval';
    });

    if (!drawReq) drawReq = requestAnimationFrame(draw);
  }

  function stopTest() {
    if (!running) return;
    running = false;
    btnStart.disabled = false;
    btnStop.disabled  = true;
    setPill('pCam', 'Stopped', '');
    $('hTimer').textContent  = 'Stopped';
    progBar.style.width      = '0%';
  }

  function finalizeTest() {
    if (!running) return;
    running = false;

    var snap    = st; st = null;
    var elapsed = (performance.now() - snap.t0) / 1000;
    var durOk   = elapsed >= (DURATION_S - 0.5);
    var m       = snap.pos.length > 1 ? computeMetrics(snap.pos) : null;
    var res     = saraScore(m, snap.trackingLostEarly, snap.supportEvents.length, durOk);
    var score   = res.score;

    var ts = new Date().toISOString();
    var summary = {
      ts:                ts,
      run_id:            allSummaries.length + 1,
      duration_s:        DURATION_S,
      achieved_s:        elapsed.toFixed(2),
      tracked_frames:    snap.pos.length,
      total_frames:      frameIdx,
      max_sway_cm:       m ? m.max_cm.toFixed(3)      : '',
      mean_sway_cm:      m ? m.mean_cm.toFixed(3)     : '',
      sway_sd_cm:        m ? m.sd_cm.toFixed(4)       : '',
      sway_duty_pct:     m ? (m.swayDuty * 100).toFixed(1) : '',
      max_shift_cm:      m ? m.maxShift_cm.toFixed(3) : '',
      support_events:    snap.supportEvents.length,
      tracking_lost:     snap.trackingLostEarly ? 1 : 0,
      sara_score:        score,
      score_reason:      res.primary,
      positions_snapshot: snap.pos,
    };
    allSummaries.push(summary);
    allFinals.push({ ts: ts, mode: 'camera', test_type: 'sitting_sara', final_score: score });

    if (m) updateLogic(m, snap.trackingLostEarly, snap.supportEvents.length, durOk, res);

    $('scoreBig').textContent = score;
    $('scoreBig').className   = 's' + score;

    var marker = $('scaleMarker');
    if (marker) marker.style.left = (score / 4 * 100) + '%';

    $('scoreReason').innerHTML =
      '<strong>' + SARA_LABELS[score] + '</strong><br><br>' +
      res.primary + '<br><br>' +
      'Max sway: ' + (m ? m.max_cm.toFixed(2) : '—') + ' cm  ·  ' +
      'Sway duty: ' + (m ? (m.swayDuty * 100).toFixed(0) : '—') + '%<br>' +
      'Support events: ' + snap.supportEvents.length + '  ·  ' +
      'Tracking lost: ' + (snap.trackingLostEarly ? 'YES ⚠' : 'No');
    scoreOv.classList.add('show');

    addQuickHist(summary, score);
    btnStart.disabled = false;
    btnStop.disabled  = true;
    $('bigDlAll').disabled = false;
    setPill('pCam', 'Done — SARA ' + score, 's' + score);
    progBar.style.width = '100%';
    beep(660, 200, 0.06);
  }

  function dismissScore() {
    scoreOv.classList.remove('show');
  }

  function addQuickHist(s, score) {
    var list = $('quickHist');
    if (list.children[0] && list.children[0].style && list.children[0].style.color) list.innerHTML = '';

    var t    = new Date(s.ts).toLocaleTimeString();
    var item = document.createElement('div');
    item.style.cssText =
      'background:#071520;border:1px solid var(--st-border);border-radius:8px;' +
      'padding:7px 10px;margin-bottom:6px;font-size:11px;display:flex;' +
      'justify-content:space-between;align-items:center';
    item.innerHTML =
      '<div>' +
      '<div style="color:var(--st-muted2)">Run ' + s.run_id + ' · ' + t + '</div>' +
      '<div style="color:var(--muted);margin-top:2px">' + s.score_reason.slice(0, 48) + '</div>' +
      '</div>' +
      '<div class="s' + score + '" style="font-size:24px;font-weight:700;margin-left:10px">' + score + '</div>';
    list.prepend(item);
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 10: DASHBOARD — research panel, charts, downloads
  // ══════════════════════════════════════════════════════════════

  function getParticipantMeta() {
    return {
      id:       localStorage.getItem('glob-id')   || '',
      name:     localStorage.getItem('glob-name') || '',
      age:      localStorage.getItem('glob-age')  || '',
      sex:      localStorage.getItem('glob-sex')  || '',
      session:  localStorage.getItem('glob-sess') || '',
      operator: localStorage.getItem('glob-op')   || '',
      date:     new Date().toISOString().split('T')[0],
    };
  }

  function refreshDashboard() {
    var noRuns = $('noRuns');

    if (allSummaries.length === 0) {
      noRuns.style.display = 'block';
      return;
    }
    noRuns.style.display = 'none';
    dashPanel.innerHTML = '';

    updateScoreChart();

    var reversed = allSummaries.slice().reverse();
    reversed.forEach(function (s) {
      var score = s.sara_score;
      var card  = document.createElement('div');
      card.className = 'run-card';
      var t = new Date(s.ts).toLocaleTimeString();

      card.innerHTML =
        '<div class="run-card-score s' + score + '">' + score + '</div>' +
        '<div class="run-card-time">Run ' + s.run_id + ' · ' + t + '</div>' +
        '<div class="run-card-detail">' +
        '<strong style="color:var(--text)">' + SARA_LABELS[score] + '</strong><br>' +
        'Max sway: <strong>' + (s.max_sway_cm || '—') + ' cm</strong>  ·  ' +
        'Mean: <strong>' + (s.mean_sway_cm || '—') + ' cm</strong><br>' +
        'Sway duty: <strong>' + (s.sway_duty_pct || '—') + '%</strong>  ·  ' +
        'SD: <strong>' + (s.sway_sd_cm || '—') + ' cm</strong><br>' +
        'Support events: <strong>' + s.support_events + '</strong>  ·  ' +
        'Tracking lost: <strong>' + (s.tracking_lost ? 'YES' : 'No') + '</strong><br>' +
        'Frames tracked: <strong>' + s.tracked_frames + ' / ' + s.total_frames + '</strong>' +
        '</div>';

      if (s.positions_snapshot && s.positions_snapshot.length > 1) {
        var tc = document.createElement('canvas');
        tc.className = 'traj-canvas';
        card.appendChild(tc);
        drawTrajectory(tc, s.positions_snapshot, score);
      }

      var dlRow = document.createElement('div');
      dlRow.className = 'dl-row';
      var idx = s.run_id - 1;
      dlRow.innerHTML =
        '<button class="dl-btn" data-action="frames" data-idx="' + idx + '">⬇ Frames CSV</button>' +
        '<button class="dl-btn" data-action="summary" data-idx="' + idx + '">⬇ Summary CSV</button>' +
        '<button class="dl-btn" data-action="chart" data-idx="' + idx + '">⬇ Sway Chart PNG</button>' +
        '<button class="dl-btn" data-action="report" data-idx="' + idx + '">⬇ Full Report</button>';
      card.appendChild(dlRow);
      dashPanel.appendChild(card);
    });
  }

  function updateScoreChart() {
    var canvas = $('scoreChart');
    if (!canvas) return;

    var labels = allSummaries.map(function (s) { return 'Run ' + s.run_id; });
    var data   = allSummaries.map(function (s) { return s.sara_score; });
    var ptColors = allSummaries.map(function (s) {
      return ['#00dfa2', '#80e000', '#f5c842', '#ff8c00', '#ff3a3a'][s.sara_score];
    });

    if (scoreChartInst) scoreChartInst.destroy();
    scoreChartInst = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label:              'SARA Score',
          data:               data,
          borderColor:        'rgba(0,223,162,.8)',
          backgroundColor:    'rgba(0,223,162,.12)',
          pointBackgroundColor: ptColors,
          pointRadius:        6,
          pointHoverRadius:   8,
          fill:               true,
          tension:            0.35,
          borderWidth:        2,
        }],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0, max: 4,
            ticks:  { stepSize: 1, color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } },
            grid:   { color: '#0e2030' },
            border: { color: '#162a38' },
          },
          x: {
            ticks:  { color: '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } },
            grid:   { color: '#0e2030' },
            border: { color: '#162a38' },
          },
        },
        plugins: {
          legend:  { display: false },
          tooltip: { callbacks: { label: function (c) { return 'SARA: ' + c.raw + ' — ' + SARA_LABELS[c.raw]; } } },
        },
      },
    });
  }

  function drawTrajectory(canvas, pos, score) {
    var W = canvas.offsetWidth || 320, H = 80;
    canvas.width  = W * 2;
    canvas.height = H * 2;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    var c = canvas.getContext('2d');
    c.scale(2, 2);
    c.fillStyle = '#040d13';
    c.fillRect(0, 0, W, H);

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pos.forEach(function (p) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    var pad = 16;
    var rX  = (maxX - minX) || 1, rY = (maxY - minY) || 1;
    var mapX = function (x) { return pad + (x - minX) / rX * (W - pad * 2); };
    var mapY = function (y) { return pad + (y - minY) / rY * (H - pad * 2); };

    var mx = 0, my = 0;
    pos.forEach(function (p) { mx += p.x; my += p.y; });
    mx /= pos.length; my /= pos.length;
    c.strokeStyle = 'rgba(255,200,0,.35)';
    c.lineWidth   = 1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(mapX(mx) - 8, mapY(my)); c.lineTo(mapX(mx) + 8, mapY(my)); c.stroke();
    c.beginPath(); c.moveTo(mapX(mx), mapY(my) - 8); c.lineTo(mapX(mx), mapY(my) + 8); c.stroke();
    c.setLineDash([]);

    var scoreColors = ['#00dfa2', '#80e000', '#f5c842', '#ff8c00', '#ff3a3a'];
    c.beginPath();
    c.strokeStyle = scoreColors[score] + 'cc';
    c.lineWidth   = 1.5;
    c.moveTo(mapX(pos[0].x), mapY(pos[0].y));
    pos.forEach(function (p) { c.lineTo(mapX(p.x), mapY(p.y)); });
    c.stroke();

    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.arc(mapX(pos[0].x), mapY(pos[0].y), 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = scoreColors[score];
    c.beginPath(); c.arc(mapX(pos[pos.length - 1].x), mapY(pos[pos.length - 1].y), 4, 0, Math.PI * 2); c.fill();

    c.fillStyle = 'rgba(148,163,184,.8)';
    c.font = '9px JetBrains Mono';
    c.fillText('sway trajectory (top view)', 4, H - 4);
  }

  // ── Per-run downloads ──

  function dlRunFrames(idx) {
    var meta = getParticipantMeta();
    var lines = ['participant_id,session_id,frame_idx,timestamp,x_px,y_px,tracking'];
    allFrames.forEach(function (f) {
      lines.push([meta.id, meta.session, f.fi, f.ts, f.x, f.y, f.tracking].join(','));
    });
    dl(lines.join('\n'), 'SITTING_run' + (idx + 1) + '_frames.csv');
  }

  function dlRunSummary(idx) {
    var meta = getParticipantMeta();
    var s   = allSummaries[idx];
    var hdr = 'participant_id,session_id,operator,date,run_id,run_ts,duration_s,achieved_s,' +
              'tracked_frames,total_frames,max_sway_cm,mean_sway_cm,sway_sd_cm,' +
              'sway_duty_pct,max_shift_cm,support_events,tracking_lost,sara_score,score_reason';
    var row = [
      meta.id, meta.session, meta.operator, meta.date,
      s.run_id, s.ts, s.duration_s, s.achieved_s, s.tracked_frames, s.total_frames,
      s.max_sway_cm, s.mean_sway_cm, s.sway_sd_cm, s.sway_duty_pct, s.max_shift_cm,
      s.support_events, s.tracking_lost, s.sara_score,
      '"' + s.score_reason.replace(/"/g, '""') + '"',
    ].join(',');
    dl([hdr, row].join('\n'), 'SITTING_run' + (idx + 1) + '_summary.csv');
  }

  function dlRunChart(idx) {
    var s = allSummaries[idx];
    if (!s.positions_snapshot || s.positions_snapshot.length < 2) {
      alert('No trajectory data for this run.');
      return;
    }
    var tmp = document.createElement('canvas');
    tmp.width  = 640;
    tmp.height = 160;
    document.body.appendChild(tmp);
    drawTrajectory(tmp, s.positions_snapshot, s.sara_score);
    setTimeout(function () {
      tmp.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'SITTING_run' + (idx + 1) + '_sway_chart.png';
        a.click(); a.remove();
        tmp.remove();
      }, 'image/png');
    }, 100);
  }

  function dlRunReport(idx) {
    dlRunFrames(idx);
    setTimeout(function () { dlRunSummary(idx); }, 200);
    setTimeout(function () { dlRunChart(idx); }, 400);
  }

  function downloadAll() {
    if (!allSummaries.length) return;
    var meta = getParticipantMeta();

    var ts    = new Date();
    var stamp = [
      ts.getFullYear(),
      String(ts.getMonth() + 1).padStart(2, '0'),
      String(ts.getDate()).padStart(2, '0'), '_',
      String(ts.getHours()).padStart(2, '0'),
      String(ts.getMinutes()).padStart(2, '0'),
      String(ts.getSeconds()).padStart(2, '0'),
    ].join('');

    // Frames
    var fLines = ['participant_id,session_id,frame_idx,timestamp,x_px,y_px,tracking'];
    allFrames.forEach(function (f) {
      fLines.push([meta.id, meta.session, f.fi, f.ts, f.x, f.y, f.tracking].join(','));
    });
    dl(fLines.join('\n'), 'SITTING_all_frames_' + stamp + '.csv');

    // All summaries
    var sh = 'participant_id,session_id,operator,date,run_id,run_ts,duration_s,achieved_s,' +
             'tracked_frames,total_frames,max_sway_cm,mean_sway_cm,sway_sd_cm,' +
             'sway_duty_pct,max_shift_cm,support_events,tracking_lost,sara_score,score_reason';
    var sLines = [sh];
    allSummaries.forEach(function (s) {
      sLines.push([
        meta.id, meta.session, meta.operator, meta.date,
        s.run_id, s.ts, s.duration_s, s.achieved_s, s.tracked_frames, s.total_frames,
        s.max_sway_cm, s.mean_sway_cm, s.sway_sd_cm, s.sway_duty_pct, s.max_shift_cm,
        s.support_events, s.tracking_lost, s.sara_score,
        '"' + s.score_reason.replace(/"/g, '""') + '"',
      ].join(','));
    });
    dl(sLines.join('\n'), 'SITTING_all_summary_' + stamp + '.csv');

    // Finals
    var finalLines = ['participant_id,session_id,run_ts,mode,test_type,final_score'];
    allFinals.forEach(function (f) {
      finalLines.push([meta.id, meta.session, f.ts, f.mode, f.test_type, f.final_score].join(','));
    });
    dl(finalLines.join('\n'), 'SITTING_final_' + stamp + '.csv');

    // Score chart PNG
    setTimeout(function () {
      var scoreCanvas = $('scoreChart');
      if (scoreCanvas && allSummaries.length > 0) {
        scoreCanvas.toBlob(function (blob) {
          var a = document.createElement('a');
          a.href     = URL.createObjectURL(blob);
          a.download = 'SITTING_score_chart_' + stamp + '.png';
          a.click(); a.remove();
        }, 'image/png');
      }
    }, 300);
  }

  function dl(text, name) {
    var a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 11: GUIDE
  // ══════════════════════════════════════════════════════════════

  var guideActive = false;
  var guideStep   = 0;

  var GUIDE_STEPS = [
    {
      tip: { text: '<strong>Step 1 — Start Camera</strong><br>Click this button to activate your webcam. MediaPipe will load in the background (~5 s on first use).', arrow: 'arrow-left' },
      target: 'btnCam', arrowDir: '→', arrowOffset: { x: -40, y: 0 }, highlight: 'btnCam',
    },
    {
      tip: { text: '<strong>Step 2 — Calibrate</strong><br>Make sure your full upper body is visible. Click Calibrate and stay still for 3 seconds so the app measures your shoulder width.', arrow: 'arrow-left' },
      target: 'btnCalib', arrowDir: '→', arrowOffset: { x: -40, y: 0 }, highlight: 'btnCalib',
    },
    {
      tip: { text: '<strong>Step 3 — Check the green dot</strong><br>You should see a <span style="color:#00dfa2">green dot</span> on the camera feed tracking the midpoint between your shoulders. Blue dots mark individual shoulders.', arrow: 'arrow-right' },
      target: 'viewer', position: { top: '40%', left: '5%' }, highlight: null,
    },
    {
      tip: { text: '<strong>Step 4 — Start the test</strong><br>Sit upright: no feet support, arms outstretched, eyes open. Click <strong>Start</strong> and hold for 10 seconds.', arrow: 'arrow-left' },
      target: 'btnStart', arrowDir: '→', arrowOffset: { x: -40, y: 0 }, highlight: 'btnStart',
    },
    {
      tip: { text: '<strong>Step 5 — Read the score</strong><br>After 10 s, a SARA score 0–4 appears. <span style="color:#00dfa2">0 = no sway</span>, <span style="color:#ff3a3a">4 = cannot sit unsupported</span>. The logic panel shows exactly why the score was given.', arrow: 'arrow-left' },
      target: 'lFinal', position: { top: '60%', left: '5%' }, highlight: 'logicPanel',
    },
    {
      tip: { text: '<strong>Step 6 — Research tab</strong><br>Switch to the <strong>RESEARCH</strong> tab after each run to see charts, download per-run CSVs, trajectory images, and full session exports.', arrow: 'arrow-bottom' },
      target: 'st-tab-bar', position: { top: '5%', right: '5%' }, highlight: null,
    },
  ];

  function toggleGuide() {
    guideActive ? dismissGuide() : startGuide();
  }

  function startGuide() {
    guideActive = true;
    guideStep   = 0;
    $('guideDimmer').classList.add('on');
    renderGuideStep();
  }

  function dismissGuide() {
    guideActive = false;
    $('guide').innerHTML = '';
    $('guideDimmer').classList.remove('on');
  }

  function advanceGuide() {
    guideStep++;
    if (guideStep >= GUIDE_STEPS.length) { dismissGuide(); return; }
    renderGuideStep();
  }

  function renderGuideStep() {
    var guideEl = $('guide');
    guideEl.innerHTML = '';

    var step  = GUIDE_STEPS[guideStep];
    var total = GUIDE_STEPS.length;

    var targetRect = null;
    if (step.highlight) {
      var el = $(step.highlight) || $(step.target);
      if (el) targetRect = el.getBoundingClientRect();
    }

    if (targetRect) {
      var viewerRect = viewer.getBoundingClientRect();
      var ring = document.createElement('div');
      ring.className  = 'pulse-ring';
      ring.style.cssText =
        'left:' + (targetRect.left - viewerRect.left + targetRect.width / 2 - 20) + 'px;' +
        'top:' + (targetRect.top - viewerRect.top + targetRect.height / 2 - 20) + 'px;' +
        'width:40px;height:40px';
      guideEl.appendChild(ring);
    }

    if (step.arrowDir && targetRect) {
      var viewerRect2 = viewer.getBoundingClientRect();
      var arr = document.createElement('div');
      arr.className  = 'guide-arrow';
      var ax = step.arrowOffset ? step.arrowOffset.x : 0;
      var ay = step.arrowOffset ? step.arrowOffset.y : 0;
      arr.style.cssText =
        'left:' + (targetRect.left - viewerRect2.left + ax) + 'px;' +
        'top:' + (targetRect.top - viewerRect2.top + targetRect.height / 2 - 16 + ay) + 'px;' +
        '--dx:8px;--dy:0';
      arr.textContent = step.arrowDir;
      guideEl.appendChild(arr);
    }

    var tip = document.createElement('div');
    tip.className = 'gtip guide-step active ' + (step.tip.arrow || '');

    var tipStyle = '';
    if (step.position) {
      if (step.position.top)   tipStyle += 'top:' + step.position.top + ';';
      if (step.position.left)  tipStyle += 'left:' + step.position.left + ';';
      if (step.position.right) tipStyle += 'right:' + step.position.right + ';';
    } else if (targetRect) {
      var viewerRect3 = viewer.getBoundingClientRect();
      tipStyle = 'left:' + (targetRect.right - viewerRect3.left + 20) + 'px;top:' + Math.max(8, targetRect.top - viewerRect3.top - 20) + 'px';
    } else {
      tipStyle = 'top:20%;left:50%;transform:translateX(-50%)';
    }
    tip.style.cssText = tipStyle;

    var dots = '';
    for (var i = 0; i < total; i++) {
      dots += '<span class="dot' + (i === guideStep ? ' on' : '') + '"></span>';
    }

    tip.innerHTML = step.tip.text +
      '<div class="gtip-nav">' +
      '<button class="gtip-btn" data-guide="next">' + (guideStep < total - 1 ? 'Next →' : 'Done ✓') + '</button>' +
      (guideStep > 0 ? '<button class="gtip-skip" data-guide="back">← Back</button>' : '') +
      '<button class="gtip-skip" data-guide="skip">Skip</button>' +
      '<div class="gtip-dots">' + dots + '</div>' +
      '</div>';

    guideEl.appendChild(tip);
  }

  // ══════════════════════════════════════════════════════════════
  // SECTION 12: EVENT BINDINGS
  // ══════════════════════════════════════════════════════════════

  btnCam.addEventListener('click', initCamera);
  btnCalib.addEventListener('click', startCalib);
  btnStart.addEventListener('click', startTest);
  btnStop.addEventListener('click', stopTest);
  $('btnEstimate').addEventListener('click', estimatePpc);
  $('guideToggle').addEventListener('click', toggleGuide);
  $('btnGuide').addEventListener('click', toggleGuide);
  $('btnDismissScore').addEventListener('click', dismissScore);
  $('btnViewResearch').addEventListener('click', function () { switchTab('research'); dismissScore(); });
  $('bigDlAll').addEventListener('click', downloadAll);

  monSz.addEventListener('change', function () {
    monCust.style.display = this.value === 'custom' ? 'inline-block' : 'none';
  });

  // Tab switching
  document.querySelectorAll('.st-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  // Event delegation for dashboard download buttons
  dashPanel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var idx    = parseInt(btn.dataset.idx, 10);
    if (action === 'frames')  dlRunFrames(idx);
    if (action === 'summary') dlRunSummary(idx);
    if (action === 'chart')   dlRunChart(idx);
    if (action === 'report')  dlRunReport(idx);
  });

  // Event delegation for guide buttons
  $('guide').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-guide]');
    if (!btn) return;
    var action = btn.dataset.guide;
    if (action === 'next') advanceGuide();
    if (action === 'back') { guideStep -= 2; advanceGuide(); }
    if (action === 'skip') dismissGuide();
  });

  // ══════════════════════════════════════════════════════════════
  // SECTION 13: BOOT
  // ══════════════════════════════════════════════════════════════

  resizeOv();
  estimatePpc();
  (function tick() {
    if (!drawReq) drawReq = requestAnimationFrame(draw);
    requestAnimationFrame(tick);
  })();

})();
