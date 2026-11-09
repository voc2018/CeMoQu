"""CeMoQu: separate Python recalculation of the simulated verification.

Reads the stored simulation records (raw CSV files and saved measures for
LD, RT and SD), recalculates each score with the same scoring rules written
again in Python, and compares it with the expected score and the website score.

It uses the same rules as the website, so it checks the code, not the rules.

Usage:
    python recalculate.py <folder with syn_part*.json> [output.csv]
"""
import base64, collections, csv, glob, io, json, math, os, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'CeMoQu_python_recalculation_results.csv'
rows = [r for p in sorted(glob.glob(os.path.join(SRC, 'syn_part*.json'))) for r in json.load(open(p))]
if not rows:
    sys.exit('No syn_part*.json files found in ' + SRC)


def raw(r):
    """Decode the stored raw CSV of one trial."""
    f = next(x for x in r['files'] if x['kind'] == 'raw')
    return list(csv.DictReader(io.StringIO(base64.b64decode(f['b64']).decode('utf8').lstrip('﻿'))))


# ---------- Line Drawing (LD) ----------
def turns(s, tol):
    """Turn amplitudes of a sideways-distance series, ignoring reversals below tol."""
    if len(s) < 2:
        return []
    p = [s[0]]; d = 0; e = s[0]; lo = hi = s[0]
    for v in s:
        if d == 0:
            lo = min(lo, v); hi = max(hi, v)
            if hi - lo >= tol:
                d = 1 if v == hi else -1; p[0] = lo if d > 0 else hi; e = v
        elif d > 0:
            if v > e: e = v
            elif e - v >= tol: p.append(e); d = -1; e = v
        else:
            if v < e: e = v
            elif v - e >= tol: p.append(e); d = 1; e = v
    t = p[1:]
    if not t:
        return []
    if len(t) == 1:
        return [a for a in (abs(t[0] - p[0]), abs(e - t[0])) if a >= tol]
    return [abs(t[i] - t[i - 1]) for i in range(1, len(t))]


def ld_trial(r):
    R = raw(r); x = R[0]; ppc = float(x['pixels_per_cm']); b = float(x['box'])
    sx, sy = float(x['start_x']) + b / 2, float(x['start_y']) + b / 2
    fx, fy = float(x['finish_x']) + b / 2, float(x['finish_y']) + b / 2
    L = math.hypot(fx - sx, fy - sy); ux, uy = (fx - sx) / L, (fy - sy) / L
    strokes = []; cur = None
    for l in R:
        if l['x'] == '':
            continue
        X, Y = float(l['x']), float(l['y']); d = (X - sx) * (-uy) + (Y - sy) * ux  # sideways distance from the guide
        if l['event'] == 'down': cur = [d]; strokes.append(cur)
        elif l['event'] == 'move' and cur is not None: cur.append(d)
        elif l['event'] == 'up': cur = None
    a = []
    for s in strokes:
        a += turns(s, float(x['tolerance_cm']) * ppc)
    a = sorted(v / ppc for v in a)
    k = math.ceil(len(a) * .05) if len(a) >= 3 else 0  # drop the largest 5 %
    kept = a[:len(a) - k]
    mean = sum(kept) / len(kept) if kept else None
    q = r['row']
    fail = q['start_fails'] >= 3 or q['duration_seconds'] >= 30 or q['out_of_bounds'] >= 3 or q['discontinuities'] >= 10
    score = 4 if fail else 0 if not strokes or mean is None else 1 if mean < 2 else 2 if mean < 5 else 3
    return score, mean


# ---------- Random Target (RT) ----------
def rt_trial(r):
    q = r['row']; ppc = q['pixels_per_cm']
    R = [l for l in raw(r) if l['event'] == 'frame' and l['tracked'] == '1' and l['x'] != '']
    if not R:
        return None, None
    P = [[float(l['t_ms']), float(l['x']), float(l['y'])] for l in R]
    F = [list(a) for a in P]
    for i in range(1, len(P) - 1):  # replace one-frame tracking spikes only
        a, b, c = P[i - 1], P[i], P[i + 1]
        ab = math.dist(a[1:], b[1:]) / ppc; bc = math.dist(b[1:], c[1:]) / ppc; ac = math.dist(a[1:], c[1:]) / ppc
        if c[0] - a[0] <= 120 and ab >= 2.5 and bc >= 2.5 and ac <= max(1, min(ab, bc) * .35):
            w = (b[0] - a[0]) / max(1, c[0] - a[0]); F[i] = [b[0], a[1] + (c[1] - a[1]) * w, a[2] + (c[2] - a[2]) * w]
    v = [math.dist(F[i][1:], F[i - 1][1:]) / max(1, F[i][0] - F[i - 1][0]) * 1000 for i in range(1, len(F))]
    pk = max(v); pi = v.index(pk); th = pk * .08; s = st = idx = None
    for i in range(pi + 1, len(v)):  # arrival: speed below 8 % of peak for 100 ms
        if v[i] <= th:
            if s is None: s = i; st = F[i][0]
            if F[i + 1][0] - st >= 100: idx = s; break
        else:
            s = st = None
    pt = F[idx] if idx is not None else F[-1]
    E = math.dist(pt[1:], (q['target_x'], q['target_y'])) / ppc
    return (0 if E < 1 else 1 if E < 5 else 2 if E < 15 else 3), E


# ---------- Speech Disturbance (SD) ----------
def sd_score(q):
    H = lambda v, t: max([i + 1 for i, c in enumerate(t) if v > c], default=0)
    Lw = lambda v, t: max([i + 1 for i, c in enumerate(t) if v < c], default=0)
    Rr = int(.8 * H(q['reading_wer'], [.05, .15, .28, .42, .6, .8]) + .2 * Lw(q['reading_wpm'], [150, 125, 100, 75, 50, 25]) + .5)
    Pp = int(.4 * Lw(q['pataka_overall_syllables_per_sec'], [6, 5.2, 4.4, 3.6, 2.8, 2]) + .3 * H(q['pataka_inter_onset_cv'], [.1, .16, .23, .32, .44, .6]) + .3 * H(q['pataka_pause_ratio'], [.15, .25, .35, .5, .65, .8]) + .5)
    Vv = int(.45 * Lw(q['vowel_valid_phonation_sec'], [4.5, 4, 3.4, 2.8, 2, 1]) + .35 * H(q['vowel_f0_cv'], [.025, .045, .07, .105, .16, .24]) + .2 * H(q['phonation_dropout_count'], [0, 1, 2, 3, 5, 8]) + .5)
    h = int(.5 * Rr + .4 * Pp + .1 * Vv + .5)
    return max(h, Rr) if Rr >= 4 else h  # reading floor


# ---------- run ----------
by = collections.defaultdict(list)
for r in rows:
    by[(r['row']['module'], r['row']['patient_id'])].append(r)
out = []; amp_diff = []; arr_diff = []
for (m, pid), rs in by.items():
    rs.sort(key=lambda q: q['row']['trial_number'])
    exp = rs[0]['row']['score_expected']
    if m == 'LD':
        sc = []
        for r in rs:
            s, mean = ld_trial(r); sc.append(s)
            if mean is not None and r['row']['turn_amp_mean_cm'] not in ('', None):
                amp_diff.append(abs(mean - r['row']['turn_amp_mean_cm']))
        py = round(sum(sc[2:5]) / 3, 2)  # mean of trials 3-5
    elif m == 'RT':
        sc = []
        for r in rs:
            s, E = rt_trial(r); sc.append(s)
            if E is not None: arr_diff.append(abs(E - r['row']['arrival_dist_cm']))
        tr = [x for x in sc if x is not None]
        py = 4 if (5 - len(tr)) / 5 >= .5 else round(sum(tr[-3:]) / 3, 2)  # last 3 tracked
    else:
        py = sd_score(rs[0]['row'])
    site = None
    for r in rs:
        for k in ('score_auto', 'score_left', 'score_right', 'score_item'):
            v = r['row'].get(k)
            if v not in ('', None, -1): site = v
    match = site is not None and round(float(site), 2) == exp == py
    out.append([m, pid, rs[0]['row'].get('synthetic_note', ''), exp, site, py, 'yes' if match else 'NO'])

order = {'LD': 0, 'RT': 1, 'SD': 2}
out.sort(key=lambda r: (order[r[0]], r[1]))
with open(OUT, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f)
    w.writerow(['module', 'scenario_id', 'scenario_description', 'expected_score', 'website_score', 'python_score', 'all_three_match'])
    w.writerows(out)
n = collections.Counter(r[0] for r in out); ok = collections.Counter(r[0] for r in out if r[6] == 'yes')
for m in ('LD', 'RT', 'SD'):
    print(f'{m}: {ok[m]}/{n[m]} match')
print(f'Total: {sum(ok.values())}/{len(out)} match')
print(f'LD turn amplitude, max difference from website: {max(amp_diff):.4f} cm ({len(amp_diff)} trials)')
print(f'RT arrival error, max difference from website: {max(arr_diff):.4f} cm ({len(arr_diff)} trials)')
print('Saved', OUT)
