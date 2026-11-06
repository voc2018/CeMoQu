/* Demonstration record for patient DEMO01. Replaced when Data sheet CSV files are loaded. */
window.CeMoQuDemo = (() => {
  const noise = (i, seed) => { const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return s - Math.floor(s) - .5; };
  const series = (n, base, drift, amp, seed) => Array.from({ length: n }, (_, i) => base + drift * (i - n / 2) / 4 + noise(i, seed) * amp * 1.6);
  const N = 52, end = new Date(2026, 10, 1);
  const dates = Array.from({ length: N }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - (N - 1 - i) * 7); return d.toISOString().slice(0, 10); });
  const pack = (rows, score, clamp) => dates.map((d, i) => ({ date: d, values: rows.map(r => r[i]), score: +(Math.min(clamp, Math.max(0, score[i]))).toFixed(2) }));
  const LD = pack([series(N, 2.2, .03, .2, 1), series(N, 8.4, .05, .5, 2), series(N, 1.3, .02, .13, 3)], series(N, 1.5, .02, .12, 4), 4);
  const RT = pack([series(N, 2.6, .05, .28, 5), series(N, .61, .004, .022, 6), series(N, .34, .006, .05, 7)], series(N, 1.1, .03, .14, 8), 4);
  const SD = pack([series(N, .11, .004, .03, 9), series(N, 148, -.4, 6, 10), series(N, .19, .012, .02, 11), series(N, .06, .004, .008, 12)], series(N, 1.3, .03, .12, 13), 6);
  return {
    patients: {
      DEMO01: {
        id: 'DEMO01', demo: true,
        sessions: { LD, RT, SD },
        quality: { [dates[N - 4]]: 'Low light, 19 fps' },
        missed: [dates[N - 5], dates[N - 10]],
        trials: [
          ['RT', 'R · T3', 'R', 'Arrival 2.9 cm', 'Camera', '29', '100%', '18.7 px/cm', 'Pass', 'rt-scoring-v2', 'CSV, PNG'],
          ['RT', 'R · T4', 'R', 'Arrival 3.4 cm', 'Camera', '30', '100%', '18.7 px/cm', 'Pass', 'rt-scoring-v2', 'CSV, PNG'],
          ['RT', 'L · T3', 'L', 'Arrival 3.0 cm', 'Camera', '28', '96%', '18.7 px/cm', 'Pass', 'rt-scoring-v2', 'CSV, PNG'],
          ['RT', 'L · T5', 'L', 'Arrival 5.2 cm', 'Camera', '27', '92%', '18.7 px/cm', 'Review', 'rt-scoring-v2', 'CSV, PNG'],
          ['LD', 'R · T3', 'R', 'Turn amp. 2.4 cm', 'Touch', '60', '100%', '37.8 px/cm', 'Pass', 'ld-scoring-v3', 'CSV, PNG'],
          ['LD', 'L · T5', 'L', 'Discontinuities 4', 'Touch', '60', '100%', '37.8 px/cm', 'Review', 'ld-scoring-v3', 'CSV, PNG'],
          ['SD', 'Reading', '−', 'WER 0.11, 141 wpm', 'Mic', '−', '100%', '18 cm', 'Pass', 'sd-provisional-v1.8', 'Audio']
        ],
        sara: [{ date: dates[N - 6], Speech: 2, 'Finger Chase': 1.5, 'Nose-Finger': 2, Sitting: 1 }, { date: dates[N - 12], Speech: 1, 'Finger Chase': 1, 'Nose-Finger': 1.5, Sitting: 1 }],
        treatments: [
          { name: 'Medication A', detail: '10 mg · morning', start: dates[N - 13], end: '', color: '#2b6cb0' },
          { name: 'Physical therapy', detail: '2× weekly', start: dates[N - 9], end: '', color: '#2f855a' },
          { name: 'Speech therapy', detail: '1× weekly', start: dates[N - 7], end: dates[N - 3], color: '#b7791f' },
          { name: 'Occupational therapy', detail: '1× monthly', start: dates[N - 12], end: dates[N - 6], color: '#6b46c1' }
        ],
        changes: [{ date: dates[N - 9], label: 'Physical therapy started' }, { date: dates[N - 4], label: 'Medication A dose changed' }],
        status: [
          { date: dates[N - 2], Fatigue: 'Some', Dizziness: 'None', Falls: 'None' }, { date: dates[N - 3], Fatigue: 'High', Dizziness: 'Some', Falls: 'Near fall' }, { date: dates[N - 4], Fatigue: 'Some', Dizziness: 'None', Falls: 'None' }
        ],
        schedule: { next: '2026-11-07', done: 10, planned: 12, streakWeeks: 5 },
        opinion: { impression: 'RT score is stable. Left-hand arrival error is higher than right. Continue weekly check-ins and review at the next visit.', comment: 'Please keep the same chair and lighting for your check-ins.', date: dates[N - 2] }
      }
    }
  };
})();
