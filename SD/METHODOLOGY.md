# SD Methodology

This document specifies **every method used to turn a recording into a number**, in two parts:

- **Part A** — how raw audio becomes measurements (voice-activity detection, pitch tracking, event
  detection, transcript alignment)
- **Part B** — how those measurements become the 0–6 Estimated SARA Speech Score

Everything here is also visible live in the app: RESEARCH → `View calculation details` shows the
exact config object, and each task's Detailed Measurements panel shows every raw value with its
method noted inline.

> **These thresholds and weights are engineering placeholders, not clinically validated cutoffs.**
> See the [README](./README.md#limitations) for what that means. Current scoring config version:
> `sd-provisional-v1.8`.

---

## Part A — from audio to measurements

### A1. Voice-activity detection (which parts of the recording count as "speech")

All three tasks start from the same base signal analysis:

1. The recording is split into 20ms frames with 50% overlap (10ms hop).
2. Each frame's RMS (root-mean-square) loudness and peak amplitude are computed.
3. A **noise floor** is estimated as the lower of two values: (a) the ambient noise level measured
   during the pre-test microphone check, and (b) the 20th-percentile RMS within this recording
   itself. Taking the *lower* of the two matters specifically for the sustained-vowel task: a
   continuous, unbroken "ah" has no internal silence to estimate a floor from, so relying only on
   this recording's own percentile can mistake the steady phonation itself for "background noise"
   and misclassify the whole recording as silent. Anchoring to a separately-measured quiet moment
   avoids that failure mode.
4. The detection threshold = `max(0.006, noiseFloor × 3)`. A frame counts as "active" if its RMS
   exceeds this threshold.
5. Consecutive active frames are grouped into **segments**; a gap between active frames only ends a
   segment once it's been silent for at least a minimum duration (**120ms** for general
   pause/silence accounting; **300ms** specifically for the sustained-vowel task's dropout count —
   see A2). Shorter gaps are treated as part of one continuous segment rather than a "break."
6. Quality flags are raised from this pass: `empty_or_invalid` (active duration < 0.4s),
   `too_quiet` (mean RMS < 0.008), `clipping` (peak > 0.98), `background_noise` (noise floor > 0.035).

### A2. Sustained-vowel pitch (F0) tracking

Pitch is estimated per 40ms frame (20ms hop) using normalized autocorrelation: the frame is
mean-centered, then checked for self-similarity at lags corresponding to 60–400 Hz; the lag with the
strongest correlation (above a 0.35 confidence floor) is taken as the fundamental period. This is a
standard, lightweight pitch-tracking method suitable for a browser, but — like any basic
autocorrelation tracker — it is prone to **octave errors**: occasionally locking onto exactly double
or half the true pitch, especially in short, low-signal-to-noise-ratio frames. Two corrections are
applied before any pitch statistic (mean, median, SD, coefficient of variation) is computed:

1. **Loudness confidence filter.** Frames whose local RMS is below 30% of this recording's loudest
   voiced frame are excluded. This targets a specific, empirically observed failure pattern: when a
   speaker's loudness genuinely drops (natural volume variation, or simply trailing off), the
   autocorrelation tracker's signal-to-noise ratio degrades and it tends to lock onto a harmonic
   (usually double the true pitch) for the entire quiet stretch. Real-recording validation showed a
   ~500ms block of consistent 2× errors coinciding exactly with the quietest part of one sample
   recording.
2. **Median-based octave correction.** Among the remaining (confident) frames, the median pitch is
   computed. Any frame within 4 semitones (a ratio of about 1.26×) of that median is kept as-is.
   Any frame outside that band but close to exactly double or half the median (within 15%) is
   corrected by multiplying or dividing by 2. Anything left over — an outlier that's neither close to
   the median nor a clean octave error — is dropped rather than guessed at.

**Why this combination, not a simpler fix:** an earlier version only trimmed the single highest and
lowest frame. Validated against a real recorded sample, that recording had 28 outlier frames out of
127 (22%) — far more than a single trim/frame could handle. The two-stage method above brought that
same sample's pitch coefficient of variation from 33.5% down to 2.5%, while a real, intentional break
in phonation (loudness dropping to near-silence and back, three times) was independently confirmed by
listening and was *not* erased by this correction — only the pitch-tracking artifacts were.

**Dropout counting** for the vowel task uses the 300ms-tolerant segmentation from A1 specifically
(rather than the general 120ms one) because natural sustained phonation has small, harmless amplitude
dips (breath support micro-variation, vibrato) that a stricter gap threshold would over-count as
separate "interruptions." `phonationDropoutCount = number of segments − 1`.

### A3. Pa-ta-ka event detection

1. The RMS envelope from A1 is smoothed with a 5-frame moving average.
2. A detection threshold is set to `max(1.35 × the base VAD threshold, 58th percentile of the smoothed envelope)`.
3. **Events** are local maxima of the smoothed envelope above that threshold, at least 90ms apart
   (this floor prevents one loud burst's shoulder from being counted as two events).
4. Each event is treated as one syllable onset (a "pa", "ta", or "ka"), not a verified phoneme
   boundary — this is stated explicitly in the app because amplitude-peak detection can miss weak
   articulation or mistake noise bursts for syllables. `estimatedPatakaCycleCount = eventCount / 3`.
5. **Two rate measurements are computed from the same events, on purpose:**
   - `syllablesPerSecond` = events ÷ *active* duration only (pauses excluded from the denominator)
   - `overallSyllablesPerSecond` = events ÷ the *full* 10-second duration (pauses included)

   The scoring formula (Part B) uses the **overall** rate, not the active-only one. This was a
   deliberate correction: the active-only rate can make a recording with long pauses look
   deceptively fast, because it only measures speed *while* the person was making sound. Pausing and
   breaking down mid-task is itself a recognized feature of ataxic dysarthria ("scanning speech" —
   see [`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md)), so it is scored, not excluded.
6. **Rhythm variability** (`interOnsetCv`) is the coefficient of variation of the time gaps between
   consecutive events — how *evenly spaced* the repetitions were, independent of how many pauses
   there were.

### A4. Reading passage: transcript alignment

The browser's built-in speech-recognition engine produces a transcript, which is compared to the
actual passage text (see [`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md) for which passage
and why) using a standard **order-sensitive dynamic-programming alignment** (the same family of
algorithm used to compute edit distance / Levenshtein distance), classifying every mismatch as a
substitution, deletion, or insertion:

```
WER = (substitutions + deletions + insertions) / reference word count
```

This replaced an earlier unordered "fuzzy" word-matching approach, which could not distinguish a
genuinely different word from a word spoken in the wrong order, and is not considered a valid WER
method in ASR/speech literature.

The two displayed rate measures use the browser-ASR transcript rather than a manually verified word
count:

```
wordsPerMinute       = recognizedWordCount / totalRecordingSeconds × 60
articulationRateWpm  = recognizedWordCount / activeSpeechSeconds × 60
```

Only `wordsPerMinute` contributes to the current reading component score. Because both WER and WPM
depend on the same browser-ASR transcript, an ASR miss can increase WER while also reducing the
recognized word count used for WPM. These are therefore not independent measures, and their combined
contribution must be recalibrated against manually verified transcripts and clinician-rated speech
before clinical use.

### A5. Detection confidence and partial measurements

The displayed `detectionConfidence` is a bounded engineering heuristic derived from detected active
frames, signal peak, clipping status, and task-specific evidence such as voiced F0 frames or detected
pa-ta-ka events. It is **not** a calibrated probability that the analysis is correct and must not be
interpreted as clinical confidence.

The current implementation returns `Unavailable` when a recording is marked `empty_or_invalid` or
when all scoring metrics for a task are unavailable. If at least one scoring metric is numeric, the
component is calculated; any missing metric receives severity 0 under the shared conversion
functions. This matches the current code but remains a provisional design decision: treating a
missing metric as severity 0 can bias a partially observed component toward the normal end of the
scale. Before clinical calibration, the project must decide whether incomplete components should
instead be unavailable or calculated with explicitly renormalized weights.

---

## Part B — from measurements to the 0–6 score

### B1. Severity conversion (shared logic)

Every raw measurement above is converted into a **severity score from 0 (normal) to 6 (most severe)**
by walking a 6-value threshold array and counting how many values it crosses:

- **`severityHigh(value, thresholds)`** — for metrics where *higher is worse* (e.g. word error rate).
- **`severityLow(value, thresholds)`** — for metrics where *lower is worse* (e.g. speaking rate,
  phonation duration).

A missing or non-numeric measurement always scores **severity 0** — a metric that couldn't be
computed is never treated as evidence of severe impairment.

### B2. Per-task component scores

```
componentRaw = Σ (metric_severity × metric_weight)
componentScore = round(componentRaw)
```

**Reading**

| Metric | Weight | Direction | Thresholds (severity 1→6) |
|---|---|---|---|
| Word Error Rate | 0.8 | higher = worse | 0.05, 0.15, 0.28, 0.42, 0.60, 0.80 |
| Speech rate (wpm) | 0.2 | lower = worse | 150, 125, 100, 75, 50, 25 |

*Worked example:* 59.7% word accuracy → WER 0.403 (severity 3); 104 wpm (severity 2).
`readingRaw = 3×0.8 + 2×0.2 = 2.8 → readingScore = 3`

**Pa-ta-ka**

| Metric | Weight | Direction | Thresholds (severity 1→6) |
|---|---|---|---|
| Overall rate incl. pauses (events/sec) | 0.40 | lower = worse | 6.0, 5.2, 4.4, 3.6, 2.8, 2.0 |
| Rhythm variability (CV) | 0.30 | higher = worse | 0.10, 0.16, 0.23, 0.32, 0.44, 0.60 |
| Pause ratio | 0.30 | higher = worse | 0.15, 0.25, 0.35, 0.50, 0.65, 0.80 |

*Worked example:* ~21 events in 10.006s → 2.1/sec (severity 5); rhythm CV 26% (severity 3); 67%
paused (severity 5). `patakaRaw = 5×0.40 + 3×0.30 + 5×0.30 = 4.4 → patakaScore = 4`

**Sustained vowel**

| Metric | Weight | Direction | Thresholds (severity 1→6) |
|---|---|---|---|
| Valid phonation seconds (of 5s) | 0.45 | lower = worse | 4.5, 4.0, 3.4, 2.8, 2.0, 1.0 |
| Pitch variability (F0 CV) | 0.35 | higher = worse | 0.025, 0.045, 0.070, 0.105, 0.16, 0.24 |
| Dropout count | 0.20 | higher = worse | 0, 1, 2, 3, 5, 8 |

*Worked example:* 4.48s valid phonation (severity 1); pitch CV 1% (severity 0); 0 dropouts
(severity 0). `vowelRaw = 1×0.45 = 0.45 → vowelScore = 0`

### B3. Combining the three component scores

```
weightedScore = readingScore × 0.50 + patakaScore × 0.40 + vowelScore × 0.10
roundedScore  = round(weightedScore)
```

Weights are adjustable in the RESEARCH tab (drag bar, snaps to 10%, always sums to 100%); 50/40/10 is
the default. See [`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md) for why.

*Continuing the example:* `weightedScore = 3×0.50 + 4×0.40 + 0×0.10 = 3.1 → roundedScore = 3`

### B4. Intelligibility-priority rule

Runs after rounding, and can only push the score **up**, never down:

```
if readingScore == 6:                     finalScore = 6
else if readingScore == 5 and rounded<5:   finalScore = 5
else if readingScore == 4 and rounded<4:   finalScore = 4
else:                                      finalScore = roundedScore
```

Rationale: reading is the closest proxy to real intelligibility, so a severe reading score should
never be "averaged away" by the other two tasks going relatively well. In the running example,
readingScore is 3, so this rule doesn't change anything — **final score = 3**.

### B5. When a component score isn't available

A task's score is `Unavailable` (not 0, not 6) only when **every** metric for that task is
null/NaN, or the recording is flagged `empty_or_invalid`. If that happens for reading, the whole
session's estimate is `Unavailable`; the same applies if it happens for pa-ta-ka or vowel. A
genuinely unscoreable component is never silently treated as "normal" or "worst."

### B6. Quality flags are not a gate

Every recording is also checked for signal-quality problems (see A1) and task-specific ones — but,
as covered in the [README](./README.md#data-quality-isnt-a-passfail-gate), those flags are shown
alongside the score, not used to block scoring or force a re-recording, unless there is truly no
usable data at all (B5).
