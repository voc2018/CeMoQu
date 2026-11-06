/* CeMoQu dashboard: a patient view and a research view of one patient.
   Data comes from the demo record or from Data sheet CSV files loaded here.
   Files stay in this browser. Entries are kept in this browser's storage. */
(() => {
  const MOD = {
    SD: { name: 'SD Speech', note: 'Speech Disturbance', color: '#e8654a', max: 6, item: 'Speech', metrics: [['Word error rate', '', 'reading_wer'], ['Reading rate', 'wpm', 'reading_wpm'], ['Rhythm CV', '', 'pataka_inter_onset_cv'], ['F0 CV', '', 'vowel_f0_cv']] },
    RT: { name: 'RT Reach', note: 'Random Target Touch', color: '#4fa8e0', max: 4, item: 'Finger Chase', metrics: [['Arrival error', 'cm', 'arrival_dist_cm'], ['Reaction time', 's', 'reaction_time_s'], ['Post-arrival radius', 'cm', 'tremor_cm']] },
    LD: { name: 'LD Drawing', note: 'Line Drawing', color: '#9fd356', max: 4, item: 'Nose-Finger', metrics: [['Turn amplitude', 'cm', 'turn_amp_mean_cm'], ['Completion time', 's', 'duration_seconds'], ['P95 deviation', 'cm', 'p95_deviation_cm']] }
  };
  const ITEMS = ['Speech', 'Finger Chase', 'Nose-Finger', 'Sitting'];
  const OPTS = { Fatigue: ['None', 'Some', 'High'], Dizziness: ['None', 'Some', 'High'], Sleep: ['Good', 'OK', 'Poor'], Condition: ['Good', 'Usual', 'Low'], Falls: ['None', 'Near fall', 'Fall'], 'Med change': ['No', 'Yes'] };
  const HARD = ['Eating', 'Writing', 'Walking', 'Speaking', 'Dressing'];
  const fit = new URLSearchParams(location.search).has('fit');
  const root = document.getElementById('dash');
  const patients = { ...CeMoQuDemo.patients };
  const st = { view: new URLSearchParams(location.search).get('view') === 'research' ? 'research' : 'patient', pid: 'DEMO01', mod: 'RT', metric: 0, period: '3M', simple: true, today: { Fatigue: 'Some', Dizziness: 'None', Sleep: 'OK', Condition: 'Usual', Falls: 'None', 'Med change': 'No', hard: {} }, msg: '' };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = k => `cemoqu_dash_${st.pid}_${k}`;
  const load = (k, d) => { try { const v = localStorage.getItem(key(k)); return v ? JSON.parse(v) : d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(key(k), JSON.stringify(v)); return true; } catch { return false; } };
  const P = () => patients[st.pid];
  const day = s => new Date(s + 'T12:00:00');
  const mmdd = s => day(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const num = (y, d = 2) => (Math.abs(y) >= 100 ? y.toFixed(0) : Math.abs(y) >= 10 ? y.toFixed(1) : y.toFixed(d));
  const sessions = k => P().sessions[k] || [];
  const last = a => a[a.length - 1];
  const statusLog = () => [...(P().status || []), ...load('status', [])];
  const opinion = () => load('opinion', P().opinion || { impression: '', comment: '', date: '' });
  const ratings = () => [...(P().sara || []), ...load('sara', [])].sort((a, b) => a.date < b.date ? 1 : -1);
  const treatments = () => [...(P().treatments || []), ...load('treatments', [])];
  const changes = () => [...(P().changes || []), ...load('treatments', []).map(t => ({ date: t.start, label: t.name + ' started' }))];

  /* The latest values, for the sentences in the companion and the summaries. */
  function delta(k) {
    const s = sessions(k); if (s.length < 2) return null;
    return { now: last(s), prev: s[s.length - 2], d: last(s).values[0] - s[s.length - 2].values[0], ds: last(s).score - s[s.length - 2].score };
  }
  function usual(k) {
    const v = sessions(k).slice(-12).map(s => s.values[0]).filter(Number.isFinite); if (v.length < 3) return null;
    const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    return [m - sd, m + sd];
  }
  function summaryLines() {
    const lines = [];
    for (const k of Object.keys(MOD)) {
      const c = delta(k); if (!c) continue;
      const u = usual(k), m = MOD[k].metrics[0], inside = u && c.now.values[0] >= u[0] && c.now.values[0] <= u[1];
      lines.push(`${k} ${m[0].toLowerCase()} ${num(c.now.values[0])}${m[1] ? ' ' + m[1] : ''}, ${c.d >= 0 ? 'up' : 'down'} ${num(Math.abs(c.d))} since ${mmdd(c.prev.date)}${u ? (inside ? ', within the usual range' : ', outside the usual range') : ''}.`);
    }
    if (P().missed?.length) lines.push(`${P().missed.length} missed tests, last ${mmdd(last(P().missed))}.`);
    for (const [d, w] of Object.entries(P().quality || {})) lines.push(`Quality warning on ${mmdd(d)}: ${w}.`);
    const f = statusLog().filter(s => s.Fatigue && s.Fatigue !== 'None').length;
    if (f) lines.push(`Patient reported fatigue on ${f} of the last ${statusLog().length} check-ins.`);
    return lines;
  }
  function reviewItems() {
    const out = [];
    const r = ratings()[0];
    if (r) for (const k of Object.keys(MOD)) { const s = last(sessions(k)); const v = r[MOD[k].item]; if (s && v != null && Math.abs(s.score - v) >= .5) out.push(['CMQ and SARA difference', `${k} ${num(s.score)} vs ${MOD[k].item} ${v}, ${mmdd(r.date)}`]); }
    for (const [d, w] of Object.entries(P().quality || {})) out.push(['Quality warning', `${mmdd(d)}, ${w}`]);
    for (const t of (P().trials || [])) if (t[8] === 'Review') out.push(['Trial marked for review', `${t[0]} ${t[1]}, ${t[3]}`]);
    for (const d of (P().missed || [])) out.push(['Missed test', mmdd(d)]);
    for (const s of statusLog()) { if (s.Falls && s.Falls !== 'None') out.push([s.Falls + ' reported', mmdd(s.date)]); if (s.note) out.push(['Patient question', `${mmdd(s.date)}, ${s.note}`]); }
    return out.slice(0, 8);
  }

  /* ---------- pieces ---------- */
  const kpi = (l, v, s, c) => `<div class="card"><div class="lbl">${l}</div><div class="big"${c ? ` style="color:${c}"` : ''}>${v}</div><div class="d-sub">${s}</div></div>`;
  function spark(k) {
    const s = sessions(k).slice(-12).map(x => x.score); if (s.length < 2) return '';
    const a = Math.min(...s), b = Math.max(...s);
    return `<svg viewBox="0 0 72 24" width="72" height="24" aria-hidden="true"><polyline points="${s.map((y, i) => (i * 72 / (s.length - 1)).toFixed(1) + ',' + (22 - (y - a) / ((b - a) || 1) * 20).toFixed(1)).join(' ')}" fill="none" stroke="${MOD[k].color}" stroke-width="1.6"/></svg>`;
  }
  function chart(id, v, opt) {
    const lo = opt.min ?? Math.min(...v.map(p => p.y)), hi = opt.max ?? Math.max(...v.map(p => p.y)), pad = opt.min != null ? 0 : ((hi - lo) || 1) * .25, a = lo - pad, b = hi + pad, n = v.length;
    const X = i => 5 + (n < 2 ? .5 : i / (n - 1)) * 93, Y = y => 92 - (y - a) / (b - a) * 84;
    const grid = [0, 1, 2, 3, 4].map(k => a + (b - a) * k / 4);
    const line = v.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(p.y).toFixed(2)).join(' ');
    let band = '';
    if (opt.band && n > 1) { const sd = (hi - lo) * .28; band = `<path d="${v.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(2) + ' ' + Y(p.y + sd).toFixed(2)).join(' ')} ${[...v].reverse().map((p, i) => 'L' + X(n - 1 - i).toFixed(2) + ' ' + Y(p.y - sd).toFixed(2)).join(' ')} Z" fill="${opt.color}" fill-opacity=".14"/>`; }
    const ch = (opt.marks || []).filter(m => m.i >= 0);
    let h = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${esc(id)}">`;
    h += grid.map(g => `<line x1="5" x2="99" y1="${Y(g)}" y2="${Y(g)}" stroke="#1b2a4a" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('') + band;
    h += ch.map(m => `<line x1="${X(m.i)}" x2="${X(m.i)}" y1="5" y2="93" stroke="#fbbf24" stroke-width="1.4" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`).join('');
    h += `<path d="${line}" fill="none" stroke="${opt.color}" stroke-width="2.4" vector-effect="non-scaling-stroke"/></svg>`;
    h += grid.map(g => `<span style="position:absolute;left:0;top:${Y(g)}%;transform:translateY(-50%);font-size:11px;color:#a3b1c6">${num(g)}</span>`).join('');
    h += v.map((p, i) => `<span title="${esc(mmdd(p.date) + ': ' + num(p.y))}" style="position:absolute;left:${X(i)}%;top:${Y(p.y)}%;width:9px;height:9px;margin:-4px 0 0 -4px;border-radius:50%;background:${p.warn ? '#020617' : opt.color};border:2px solid ${p.warn ? '#f97316' : opt.color}"></span>`).join('');
    h += ch.map(m => `<span style="position:absolute;left:${X(m.i)}%;top:0;transform:translateX(4px);font-size:11px;color:#fde68a">${esc(m.label)}</span>`).join('');
    const t = Math.min(n, 6);
    for (let k = 0; k < t; k++) { const i = t > 1 ? Math.round(k * (n - 1) / (t - 1)) : 0; h += `<span style="position:absolute;left:${Math.min(X(i), 95)}%;bottom:-2px;transform:translateX(-50%);font-size:11px;color:#a3b1c6">${mmdd(v[i].date)}</span>`; }
    return h;
  }

  /* ---------- patient view ---------- */
  function patientView() {
    const p = P(), mod = MOD[st.mod], ss = sessions(st.mod), n = { '2W': 3, '3M': 13, '1Y': 52 }[st.period];
    const useScore = st.metric === mod.metrics.length, cut = ss.slice(-n);
    const v = cut.map(s => ({ date: s.date, y: useScore ? s.score : s.values[st.metric], warn: !!p.quality?.[s.date] })).filter(x => Number.isFinite(x.y));
    const marks = changes().map(c => ({ i: cut.findIndex(s => s.date >= c.date), label: c.label })).filter(m => m.i > 0);
    const dates = [...Object.values(p.sessions).flat().map(s => s.date)].sort();
    const first = cut[0]?.date || dates[0], lastD = last(dates), span = (day(lastD) - day(first)) || 1;
    const pos = d => Math.max(0, Math.min(100, (day(d) - day(first)) / span * 100));
    const c = delta(st.mod), sch = p.schedule, op = opinion();
    return `<section class="kpis" style="--n:6">
      ${kpi('Next check-in', sch ? day(sch.next).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—', sch ? 'Reminder on' : 'No schedule set')}
      ${kpi('Last assessment', lastD ? mmdd(lastD) : '—', `${Object.keys(p.sessions).filter(k => sessions(k).length).length} modules`)}
      ${kpi('Completion', sch ? Math.round(sch.done / sch.planned * 100) + '%' : '—', sch ? `${sch.done} of ${sch.planned} scheduled` : 'No schedule set')}
      ${kpi('Check-in streak', sch ? sch.streakWeeks + ' weeks' : '—', 'Weekly check-ins')}
      ${kpi('Data quality', Object.keys(p.quality || {}).length ? 'Review' : 'Good', `${Object.keys(p.quality || {}).length} warning in 3 months`, '#7dd3fc')}
      ${kpi('Treatment changes', changes().length, 'Shown on charts')}
    </section>
    <div class="main">
      <aside class="col">
        <section class="card hl"><div class="lbl">Assessment companion</div>
          <p style="margin:7px 0 9px;font-size:14px;line-height:1.4;color:#f1f5f9">${sch ? `Your next check-in is on ${day(sch.next).toLocaleDateString('en-US', { weekday: 'long' })}. How are you feeling today?` : 'How are you feeling today?'}</p>
          <div class="d-sub">${c ? `Latest ${mod.metrics[0][0].toLowerCase()}: ${num(c.now.values[0])} ${mod.metrics[0][1]}, previous ${num(c.prev.values[0])} ${mod.metrics[0][1]}.` : ''} You can change or turn off reminders at any time.</div></section>
        <section class="card grow"><div class="hr"><h2 class="h">Module results</h2><span class="d-sub">Latest · vs previous</span></div>
          <div style="margin-top:6px">${Object.keys(MOD).map(k => { const s = sessions(k), d = delta(k); return `<button class="mrow${k === st.mod ? ' on' : ''}" data-mod="${k}"><span class="dot" style="background:${MOD[k].color}"></span><span style="min-width:0"><span style="display:block;font-size:13px;font-weight:600">${MOD[k].name}</span><span style="display:block;font-size:11px;color:#a3b1c6">${MOD[k].note}</span></span>${spark(k)}<span style="text-align:right"><span style="display:block;font-size:18px;font-weight:700">${s.length ? num(last(s).score) : '—'}</span><span style="display:block;font-size:11px;color:#a3b1c6">${d ? (d.ds >= 0 ? '+' : '') + num(d.ds) : ''}</span></span></button>`; }).join('')}
          <div class="mrow" style="cursor:default"><span class="dot" style="background:#9b7fe0"></span><span><span style="display:block;font-size:13px;font-weight:600">ST Sitting</span><span style="display:block;font-size:11px;color:#a3b1c6">Not in the Data sheet yet</span></span><span></span><span style="text-align:right;font-size:18px;font-weight:700">—</span></div></div>
          <div class="d-sub" style="margin-top:8px;line-height:1.35">Scores are provisional research estimates. A change is shown as a number, not as better or worse.</div></section>
      </aside>
      <main class="col">
        <section class="card grow" style="display:flex;flex-direction:column;min-height:340px">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h2 class="h" style="margin-right:6px">Progress over time</h2>
            ${[...mod.metrics.map(m => m[0]), `${st.mod} CMQ Score`].map((l, i) => `<button class="chip${i === st.metric ? ' on' : ''}" data-metric="${i}">${l}</button>`).join('')}
            <span class="d-sp"></span>${['2W', '3M', '1Y'].map(x => `<button class="chip${x === st.period ? ' on' : ''}" data-period="${x}">${x}</button>`).join('')}</div>
          <div class="chart">${v.length ? chart('Progress', v, { color: mod.color, band: true, marks }) : '<div class="d-sub">No results yet.</div>'}</div>
          <div class="legend"><span><span class="dot" style="display:inline-block;background:${mod.color}"></span> Completed</span><span><span class="dot" style="display:inline-block;border:2px solid #f97316"></span> Quality warning</span><span>━ ━ Treatment change</span><span>Shaded band: your usual day-to-day range</span></div>
        </section>
        <section class="card"><div class="hr"><h2 class="h">Treatment and medication timeline</h2><span class="d-sub">A change at the same time does not show that a treatment caused it.</span></div>
          <div style="display:grid;gap:5px;margin-top:8px">${treatments().map(t => { const l = pos(t.start), r = t.end ? pos(t.end) : 100; if (t.end && t.end < first) return ''; return `<div class="tx"><div><b style="font-weight:600">${esc(t.name)}</b> <span style="color:#a3b1c6">${esc(t.detail)}</span></div><div class="tr"><span style="left:${l}%;width:${Math.max(r - l, 1)}%;background:${t.color || '#2b6cb0'}"></span></div></div>`; }).join('')}</div>
          <form id="txForm" style="display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:6px;margin-top:8px"><input name="name" placeholder="Medication or therapy" required aria-label="Medication or therapy"><input name="detail" placeholder="Dose or frequency" aria-label="Dose or frequency"><input name="start" type="date" required aria-label="Start date"><button class="btn2">Add</button></form>
        </section>
      </main>
      <aside class="col">
        <section class="card"><div class="hr"><h2 class="h">What changed</h2><span><button class="chip${st.simple ? ' on' : ''}" data-simple="1">Simple</button> <button class="chip${st.simple ? '' : ' on'}" data-simple="0">Detailed</button></span></div>
          ${c ? (st.simple ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.45;color:#f1f5f9">Your ${esc(mod.metrics[0][0].toLowerCase())} in this test was ${Math.abs(c.d) < .01 ? 'the same as' : 'a little different from'} last time. Tiredness, the time of day or the room setup can also affect it, so review this with your care team.</p>` : `<div style="margin-top:8px;font-size:12px;line-height:1.5;color:#dbe4f0">${mod.metrics.map((m, i) => `${m[0]} ${num(c.now.values[i])} ${m[1]}, previous ${num(c.prev.values[i])} ${m[1]}.`).join(' ')} ${st.mod} CMQ Score ${num(c.now.score)}.</div>`) : '<p class="d-sub">Two sessions are needed.</p>'}</section>
        <section class="card grow" style="display:flex;flex-direction:column;gap:7px"><div class="hr"><h2 class="h">Today's status</h2><span class="d-sub">Optional · 1 minute</span></div>
          ${Object.keys(OPTS).map(k => `<div class="field"><span>${k}</span><div class="opts">${OPTS[k].map(o => `<button class="chip${st.today[k] === o ? ' on' : ''}" data-status="${k}" data-val="${o}">${o}</button>`).join('')}</div></div>`).join('')}
          <div class="lbl">Hard today</div><div style="display:flex;flex-wrap:wrap;gap:5px">${HARD.map(h => `<button class="chip${st.today.hard[h] ? ' on' : ''}" data-hard="${h}">${h}</button>`).join('')}</div>
          <label class="lbl" for="q">Note or question for my care team</label><textarea id="q" rows="2" placeholder="Write a note or a question"></textarea>
          <button class="btn2" id="saveStatus">Save today's status</button>${st.msg ? `<div class="note">${esc(st.msg)}</div>` : ''}</section>
        <section class="card"><div class="hr"><h2 class="h">Clinician comment</h2><span class="d-sub">${op.date ? mmdd(op.date) : ''}</span></div><p style="margin:6px 0 0;font-size:13px;line-height:1.4;color:#dbe4f0">${esc(op.comment) || 'No comment yet.'}</p></section>
      </aside>
    </div>`;
  }

  /* ---------- research view ---------- */
  function researchView() {
    const p = P(), mod = MOD[st.mod], ss = sessions(st.mod), rs = ratings(), op = opinion(), log = statusLog(), sch = p.schedule;
    const cut = ss.slice(-10), v = cut.map(s => ({ date: s.date, y: s.score }));
    const sv = [...rs].reverse().filter(r => r[mod.item] != null).map(r => ({ date: r.date, y: r[mod.item] }));
    const marks = changes().map(c => ({ i: cut.findIndex(s => s.date >= c.date), label: '' })).filter(m => m.i > 0);
    const dates = [...new Set(Object.values(p.sessions).flat().map(s => s.date))].sort().reverse();
    const visit = [...new Set([...dates.slice(0, 2), ...rs.map(r => r.date)])].sort().reverse().slice(0, 4);
    const nearest = (k, d) => { const c = sessions(k).filter(s => s.date <= d); return c.length ? num(last(c).score) : '−'; };
    const trials = (p.trials || []).filter(t => t[0] === st.mod);
    return `<section class="kpis" style="--n:6">
      ${kpi(st.mod + ' CMQ Score', ss.length ? num(last(ss).score) : '—', `Provisional, 0 to ${mod.max}`)}
      ${kpi('Clinician SARA', rs.length ? ITEMS.reduce((a, i) => a + (rs[0][i] || 0), 0).toFixed(1) : '—', rs.length ? `4 items, rated ${mmdd(rs[0].date)}` : 'Not rated')}
      ${kpi('Adherence', sch ? Math.round(sch.done / sch.planned * 100) + '%' : '—', sch ? `${sch.done} of ${sch.planned} · ${sch.planned - sch.done} missed` : 'No schedule set')}
      ${kpi('QC status', Object.keys(p.quality || {}).length ? 'Review' : 'Pass', `${Object.keys(p.quality || {}).length} warning`, '#7dd3fc')}
      ${kpi('Open patient questions', log.filter(s => s.note).length, 'From daily status')}
      ${kpi('Treatment changes', changes().length, 'Since first test')}
    </section>
    <div class="main" style="grid-template-columns:minmax(300px,18%) minmax(0,1fr) minmax(340px,22%)">
      <aside class="col">
        <section class="card hl"><div class="lbl">Research summary · review required</div>
          <ul style="margin:7px 0 0;padding-left:16px;font-size:13px;line-height:1.45;color:#f1f5f9">${summaryLines().map(l => `<li>${esc(l)}</li>`).join('')}</ul>
          <div class="d-sub" style="margin-top:7px">Generated from the stored records. Check the original measures.</div></section>
        <section class="card grow"><h2 class="h">Items to review</h2>${reviewItems().map(f => `<div class="flag"><span><b style="font-weight:600">${esc(f[0])}</b><small>${esc(f[1])}</small></span></div>`).join('') || '<div class="d-sub" style="margin-top:6px">Nothing to review.</div>'}</section>
        <section class="card"><h2 class="h">Patient-reported, last 30 days</h2><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px;font-size:12px">
          <div><div class="d-sub">Fatigue</div><b style="font-size:17px">${log.filter(s => s.Fatigue && s.Fatigue !== 'None').length} days</b></div><div><div class="d-sub">Dizziness</div><b style="font-size:17px">${log.filter(s => s.Dizziness && s.Dizziness !== 'None').length} days</b></div><div><div class="d-sub">Near falls</div><b style="font-size:17px">${log.filter(s => s.Falls && s.Falls !== 'None').length}</b></div></div></section>
      </aside>
      <main class="col">
        <section class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h2 class="h" style="margin-right:6px">Change over time</h2>${Object.keys(MOD).map(k => `<button class="chip${k === st.mod ? ' on' : ''}" data-mod="${k}">${MOD[k].name}</button>`).join('')}<span class="d-sp"></span><span class="d-sub">Two separate scales. Not directly comparable.</span></div>
          <div class="two" style="margin-top:7px"><div><div style="font-size:12px;font-weight:600">${mod.name} CMQ Score, every test (0 to ${mod.max})</div><div class="chart" style="height:205px;flex:none">${v.length ? chart('CMQ', v, { color: mod.color, min: 0, max: mod.max, marks }) : ''}</div></div>
          <div><div style="font-size:12px;font-weight:600">Clinician-rated SARA ${mod.item}, visits only (0 to ${mod.max})</div><div class="chart" style="height:205px;flex:none">${sv.length ? chart('SARA', sv, { color: '#e2e8f0', min: 0, max: mod.max }) : '<div class="d-sub">Not rated yet.</div>'}</div></div></div></section>
        <section class="card"><div class="hr"><h2 class="h">Visit comparison</h2><span class="d-sub">CMQ Score · Clinician-rated SARA Score · − = not rated</span></div>
          <div class="scroll" style="margin-top:4px"><table><thead><tr><th>Date</th><th>SD CMQ</th><th>SARA Speech</th><th>RT CMQ</th><th>SARA Finger Chase</th><th>LD CMQ</th><th>SARA Nose-Finger</th><th>SARA Sitting</th></tr></thead><tbody>${visit.map(d => { const r = rs.find(x => x.date === d) || {}; return `<tr><td>${mmdd(d)}</td><td>${nearest('SD', d)}</td><td>${r.Speech ?? '−'}</td><td>${nearest('RT', d)}</td><td>${r['Finger Chase'] ?? '−'}</td><td>${nearest('LD', d)}</td><td>${r['Nose-Finger'] ?? '−'}</td><td>${r.Sitting ?? '−'}</td></tr>`; }).join('')}</tbody></table></div></section>
        <section class="card grow"><div class="hr"><h2 class="h">Raw data and QC · ${mod.name}</h2><span class="d-sub">Latest session</span></div>
          <div class="scroll" style="margin-top:4px"><table><thead><tr><th>Trial</th><th>Hand</th><th>Key measure</th><th>Mode</th><th>FPS</th><th>Tracked</th><th>Calibration</th><th>QC</th><th>Version</th><th>Raw file</th></tr></thead><tbody>${trials.map(t => `<tr>${t.slice(1).map((c, i) => `<td${i === 9 ? ' style="color:#7dd3fc"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="10">No trials.</td></tr>'}</tbody></table></div></section>
      </main>
      <aside class="col">
        <section class="card"><h2 class="h">Clinician SARA rating</h2><div class="d-sub" style="margin-top:2px">Rated blind to CMQ Score</div>
          <form id="saraForm" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">${ITEMS.map(i => `<label class="d-sub">${i}<input name="${i}" type="number" min="0" max="${i === 'Speech' ? 6 : 4}" step="0.5" value="${rs[0]?.[i] ?? ''}"></label>`).join('')}<button class="btn" style="grid-column:1/3">Save rating</button></form></section>
        <section class="card grow" style="display:flex;flex-direction:column"><h2 class="h">Clinician opinion</h2><div class="d-sub" style="margin-top:2px">Written by the clinician, saved with this session</div>
          <label class="lbl" for="o1" style="margin-top:9px">Clinical impression</label><textarea id="o1" style="flex:1;margin-top:3px;min-height:90px;font-size:13px;line-height:1.4">${esc(op.impression)}</textarea>
          <label class="lbl" for="o2" style="margin-top:9px">Comment to the patient</label><textarea id="o2" style="flex:1;margin-top:3px;min-height:70px;font-size:13px;line-height:1.4">${esc(op.comment)}</textarea>
          <button class="btn" id="saveOpinion" style="margin-top:8px">Save and share with patient</button>${st.msg ? `<div class="note" style="margin-top:6px">${esc(st.msg)}</div>` : ''}</section>
      </aside>
    </div>`;
  }

  function render() {
    const ids = Object.keys(patients);
    root.classList.toggle('fit', fit);
    root.innerHTML = `<header class="d-top"><div style="display:flex;align-items:baseline;gap:8px"><strong>CeMoQu</strong><span class="d-sub">${st.view === 'patient' ? 'My Health' : 'Clinical Review'}</span></div>
      <nav style="display:flex;gap:2px"><button class="d-nav${st.view === 'patient' ? ' on' : ''}" data-view="patient">Patient view</button><button class="d-nav${st.view === 'research' ? ' on' : ''}" data-view="research">Research view</button></nav>
      <span class="d-sp"></span><span class="d-sub">Patient</span><select id="pick" style="width:130px" aria-label="Patient">${ids.map(i => `<option${i === st.pid ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select>
      <label class="btn2" style="display:inline-flex;align-items:center;cursor:pointer">Load Data sheet CSV<input id="csv" type="file" accept=".csv,text/csv" multiple hidden></label>
      <a class="btn" style="display:inline-flex;align-items:center;text-decoration:none" href="../index.html">Start assessment</a></header>
      ${st.view === 'patient' ? patientView() : researchView()}
      <footer class="d-foot"><span>Research tool, not a diagnostic device.</span><span>${P().demo ? 'Demonstration record.' : 'Loaded from Data sheet files. Files stay in this browser.'} Contact your clinician about new or urgent symptoms.</span></footer>`;
  }

  /* ---------- Data sheet CSV ---------- */
  function parseCsv(text) {
    const rows = [[]]; let cell = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { last(rows).push(cell); cell = ''; }
      else if (c === '\n') { last(rows).push(cell.replace(/\r$/, '')); cell = ''; rows.push([]); }
      else cell += c;
    }
    last(rows).push(cell);
    const head = rows[0];
    return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
  }
  const n = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
  const mean = a => { const v = a.filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN; };
  function addRows(rows) {
    const byP = {};
    for (const r of rows) if (r.patient_id && MOD[r.module]) (byP[r.patient_id] ||= []).push(r);
    for (const [id, list] of Object.entries(byP)) {
      const out = { id, sessions: {}, quality: {}, missed: [], trials: [], sara: [] };
      for (const k of Object.keys(MOD)) {
        const days = {};
        for (const r of list.filter(x => x.module === k)) (days[r.test_date] ||= []).push(r);
        out.sessions[k] = Object.keys(days).sort().map(d => {
          const rs = days[d];
          let score;
          if (k === 'SD') score = n(last(rs).score_auto);
          else { const it = rs.map(r => n(r.score_item)).filter(Number.isFinite), h = [mean(rs.map(r => n(r.score_right))), mean(rs.map(r => n(r.score_left)))].filter(Number.isFinite); score = it.length ? last(it) : mean(h.length ? h : rs.map(r => n(r.score_trial))); }
          return { date: d, score, values: MOD[k].metrics.map(m => mean(rs.map(r => n(r[m[2]])))) };
        }).filter(s => Number.isFinite(s.score));
        const latest = last(Object.keys(days).sort());
        for (const r of days[latest] || []) {
          const m = MOD[k].metrics[0], val = n(r[m[2]]), flag = r.fail_code || (r.low_fps_flag === '1' ? 'Low FPS' : '') || (r.missed === '1' ? 'Missed' : '');
          out.trials.push([k, k === 'SD' ? 'Session' : `${r.hand} · T${r.trial_number}`, r.hand, `${m[0]} ${Number.isFinite(val) ? num(val) : '−'} ${m[1]}`, r.mode || r.test_mode || 'Mic', r.measured_fps || '−', r.status || '−', r.pixels_per_cm ? (+r.pixels_per_cm).toFixed(1) + ' px/cm' : '−', flag ? 'Review' : 'Pass', r.scoring_version, 'Data sheet']);
          if (flag) out.quality[r.test_date] = `${k}: ${flag}`;
        }
        for (const r of list.filter(x => x.module === k)) {
          const c = k === 'SD' ? r.score_clinician : r.clinician_item, v = n(c);
          if (Number.isFinite(v) && v >= 0) { let s = out.sara.find(x => x.date === r.test_date); if (!s) { s = { date: r.test_date }; out.sara.push(s); } s[MOD[k].item] = v; }
        }
      }
      patients[id] = out; st.pid = id;
    }
    return Object.keys(byP).length;
  }

  /* ---------- events ---------- */
  root.addEventListener('click', e => {
    const b = e.target.closest('button,[data-mod]'); if (!b) return;
    const d = b.dataset;
    if (d.view) { st.view = d.view; st.msg = ''; }
    else if (d.mod) { st.mod = d.mod; st.metric = 0; }
    else if (d.metric) st.metric = +d.metric;
    else if (d.period) st.period = d.period;
    else if (d.simple) st.simple = d.simple === '1';
    else if (d.status) st.today[d.status] = d.val;
    else if (d.hard) st.today.hard[d.hard] = !st.today.hard[d.hard];
    else if (b.id === 'saveStatus') {
      const a = load('status', []); a.push({ date: new Date().toISOString().slice(0, 10), ...st.today, hard: Object.keys(st.today.hard).filter(k => st.today.hard[k]), note: document.getElementById('q').value.trim() });
      st.msg = save('status', a) ? 'Saved in this browser.' : 'Could not save in this browser.';
    } else if (b.id === 'saveOpinion') {
      st.msg = save('opinion', { impression: document.getElementById('o1').value, comment: document.getElementById('o2').value, date: new Date().toISOString().slice(0, 10) }) ? 'Saved in this browser.' : 'Could not save in this browser.';
    } else return;
    render();
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === 'txForm') { const a = load('treatments', []); a.push({ name: f.get('name'), detail: f.get('detail'), start: f.get('start'), end: '', color: '#0d9488' }); save('treatments', a); }
    if (e.target.id === 'saraForm') { const r = { date: new Date().toISOString().slice(0, 10) }; ITEMS.forEach(i => { const v = parseFloat(f.get(i)); if (Number.isFinite(v)) r[i] = v; }); const a = load('sara', []); a.push(r); save('sara', a); }
    render();
  });
  root.addEventListener('change', async e => {
    if (e.target.id === 'pick') { st.pid = e.target.value; st.msg = ''; render(); }
    if (e.target.id === 'csv') {
      const rows = []; for (const f of e.target.files) rows.push(...parseCsv(await f.text()));
      const c = addRows(rows); st.msg = ''; render();
      if (!c) alert('No LD, RT or SD rows were found. Export each Data sheet tab as CSV.');
    }
  });
  render();
})();
