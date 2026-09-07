# SD — Speech Disturbance Test

Part of **CeMoQu** (Cerebellar Motor Quantification), a browser-based platform that measures motor
and speech symptoms of cerebellar ataxia using only a standard computer camera, microphone, and web
browser — no special hardware.

This module (**SD**) is a short, guided speech test that runs in about two minutes. It produces an
**Estimated SARA Speech Score (0–6)** alongside the individual measurements it was calculated from,
so a clinician or researcher can see not just the number but exactly how it was reached.

> **This is a research prototype, not a diagnostic tool.** It does not replace a clinician's
> judgment or the official SARA examination. Every score it produces is explicitly labeled
> "provisional research estimate — not clinically validated." See [Limitations](#limitations) below.

---

## What SARA Speech normally measures

SARA (Scale for the Assessment and Rating of Ataxia) is the standard clinical scale for cerebellar
ataxia. Its Speech Disturbance item is scored 0–6 by a clinician **while listening to the patient
talk in normal conversation**:

| Score | Meaning |
|---|---|
| 0 | Normal |
| 1 | Suggestion of speech disturbance |
| 2 | Impaired, but easy to understand |
| 3 | Occasional words hard to understand |
| 4 | Many words hard to understand |
| 5 | Only single words understandable |
| 6 | Speech unintelligible |

SD does **not** replicate that conversational exam. Instead, it asks the person to do three short,
standardized tasks that a browser can record and measure automatically and consistently, and
combines the results into an estimate on the same 0–6 scale. This trades the richness of a real
conversation for standardized quantitative measurements designed for comparison across repeated
assessments and research cohorts. Their test–retest reliability and comparability across devices,
browsers, and visits still require validation.

## The three tasks

Each task shows on-screen instructions, a 3‑2‑1‑Go countdown, and a live microphone level meter so
the person can see they're being heard clearly before and during recording. All three can be done in
any order, and any of them can be re-recorded — only the most recent recording of each task counts
toward the final score.

### 1. Sustained vowel ("Ah") — 5 seconds
The person takes a breath and holds a steady "ah" sound for 5 seconds. This checks whether they have
enough breath support and vocal-cord control to produce a steady sound — and, importantly for
ataxia, whether their **pitch stays steady** while they do it. Unsteady pitch during a held vowel is
one of the more consistently reported acoustic signs of ataxic speech in the research literature.

### 2. Pa-ta-ka repetition — 10 seconds
The person repeats "pa-ta-ka" as fast and evenly as they can for 10 seconds. This is a classic
"diadochokinetic" (DDK) task used across motor-speech assessment: it tests how quickly and how
*regularly* someone can move their lips, tongue tip, and tongue back in rapid alternation — exactly
the kind of fine motor timing that cerebellar damage disrupts. Pauses or breakdowns partway through
are treated as part of the result, not as noise to ignore (see [Scoring](#how-scoring-works)).

### 3. Reading passage — up to 30 seconds
The person reads a short passage aloud at a normal pace. One of **three original passages** is
picked at random each time this task is started, so repeated attempts (or repeated demos) don't
always use identical text. All three were written to have an energizing, motivational tone and were
checked against the CMU Pronouncing Dictionary to make sure that, between the three of them, every
phoneme (individual speech sound) of General American English appears at least once. The full design
rationale and the actual coverage numbers are in
[`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md), which also covers why all three tasks and
their weights were chosen.

This task is the closest proxy to real intelligibility: it's scored on how accurately a
speech-recognition engine can transcribe what was said, and how fast the person spoke.

![Reading passage task, with two prior tasks already scored in the Result Summary panel](docs/screenshots/reading-task-summary.png)

## What data comes out of a recording, and what it means

Nothing here is a black box — every number below is visible in the app's **RESEARCH** tab, next to a
plain-language note about its limitations, right after each task is finished (not only at the end).

| Task | What's measured | In plain terms |
|---|---|---|
| Sustained vowel | Valid phonation time | How much of the 5 seconds had detectable, sustained voice |
| | Pitch variability (F0 CV) | How much the pitch wobbled while holding the note |
| | Dropout count | How many separate times the voice cut out and restarted |
| Pa-ta-ka | Overall rate (incl. pauses) | Repetitions per second across the *whole* 10 seconds, pauses included |
| | Rhythm variability | How evenly spaced the repetitions were |
| | Pause ratio | What share of the 10 seconds had no speech at all |
| Reading | Word error rate | How much the spoken words differed from the passage, per a standard alignment algorithm |
| | Speaking rate | Words per minute |

All of these are **derived measurements**. The original browser-recorded audio file for each
accepted attempt is retained during the session and can be downloaded from the RESEARCH tab
(AH / PA-TA-KA / READING buttons) for direct listening or later re-analysis. Depending on browser
support, this file may be compressed WebM/Opus or another browser-selected format; it is not
uncompressed acquisition-grade raw audio and is not persisted after the page is closed unless it is
downloaded.

## How scoring works

Each task's measurements are converted into a **severity score from 0 (normal) to 6 (most severe)**
using a set of threshold tables — the same direction as the official SARA scale, where higher always
means worse. For example, a slower-than-normal pa-ta-ka rate pushes that task's score up; a longer,
steadier sustained vowel pushes it down.

The three task scores are then combined into one overall estimate using adjustable weights:

```
Reading 50%  +  Pa-ta-ka 40%  +  Sustained vowel 10%
```

![Final results screen showing the Estimated SARA Speech Score, the three component scores and weights, and the calculation breakdown](docs/screenshots/final-results.png)

These particular numbers are a starting point, not a fixed rule — the reading task keeps the largest
share because SARA's own definition centers on intelligibility, but pa-ta-ka's weight was raised from
an earlier default of 30% after Grobe-Einsler et al. (2023) found that pa-ta-ka-derived features were
the single strongest predictor of SARA speech severity in their automated-scoring study (5 of the top
10 most predictive features came from that task alone). **Anyone using the tool can drag the weight
bar in the RESEARCH tab to try different splits** (it snaps to 10% steps and always adds up to 100%);
the score recalculates immediately. *(Full rationale for all three tasks and this weighting:
[`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md).)*

![The RESEARCH tab's Scoring section: a draggable weight bar plus the raw per-metric measurements for one task, each labeled scoring/quality_control/exploratory](docs/screenshots/research-weight-bar.png)

One additional rule protects against a specific failure mode: if the reading task alone scores 4, 5,
or 6, the final estimate can never come out lower than that — a person who is severely hard to
understand doesn't get "averaged up" to a better score just because their pa-ta-ka or vowel task
happened to go well.

*(For the exact per-metric thresholds and step-by-step worked examples, see
[`METHODOLOGY.md`](./METHODOLOGY.md).)*

### Data quality isn't a pass/fail gate

Every recording is checked for problems — background noise, a quiet or clipped microphone signal, low
confidence in the speech-recognition transcript, and so on. Historically, tools like this often
**block** scoring or force a re-recording when a quality check fails. This one deliberately does not:
if a recording contains *any* usable signal, it gets scored, and any quality concerns are shown
alongside the score as a note rather than a wall. Scoring is only skipped entirely when there is
truly nothing to measure (e.g., a recording with no detected speech at all, or a total
speech-recognition failure on the reading task). The reasoning: this is a measurement tool for a
population whose speech is, by definition, sometimes hard to record cleanly — auto-rejecting the
hardest cases would bias the tool away from exactly the people it's meant to study.

### Plain-language feedback

Right after each task is accepted, the app shows the score for that task **and a short, specific
explanation in everyday language** (e.g. "There were a few brief interruptions" or "Your pitch was
noticeably unstable while holding the sound") instead of just the raw numbers — so a participant
gets feedback they can act on, and someone reviewing results later doesn't have to reverse-engineer
what went wrong from a threshold table.

![Task Result screen after accepting the Pa-ta-ka task: a large score plus three plain-language reasons for it](docs/screenshots/task-result.png)

## Exports

- **Download accepted audio** for any completed task (RESEARCH tab)
- **Export CSV** of the full session's measurements
- **Submit Data** currently packages the data but is not yet wired to a real submission
  endpoint — this needs the actual CeMoQu submission mechanism used by the other modules

## Limitations

- **Not clinically validated.** All thresholds and weights are engineering placeholders pending
  comparison against real clinician-rated SARA scores. Every result is labeled accordingly.
- **Browser speech recognition** powers the reading task's word-error-rate and speed measurements. It
  varies by browser, OS, accent, and network conditions, and — because it's trained mostly on fluent
  speech — may register unclear speech as recognition errors it made, not errors the speaker made.
- **Pitch estimation** uses a basic, browser-friendly algorithm (autocorrelation), not a
  clinical-grade tool like Praat. It's good enough to be useful but not precise enough for fine-grained
  voice-quality research on its own.
- **No jitter/shimmer/HNR** (classical voice-quality measures) are currently implemented; they were
  judged technically hard to do reliably at this level of audio quality and window size, though they
  could be added later, clearly labeled as exploratory, if needed.
- Needs healthy-control data, test–retest data, and same-day clinician-rated comparisons before any
  of the above can move from "provisional" to "validated."

## Where to look next

This module follows the standard four-document structure intended to apply across all CeMoQu
modules, not just this one:

- [`METHODOLOGY.md`](./METHODOLOGY.md) — every method used to go from raw audio to the final score:
  voice-activity detection, pitch tracking, event detection, transcript alignment, and the scoring
  formulas, with worked examples
- [`TASK-DESIGN-RATIONALE.md`](./TASK-DESIGN-RATIONALE.md) — why these three tasks, why their
  durations and reading-passage content, and why the scoring weights are split the way they are,
  with citations
- [`VERIFICATION-REPORT.md`](./VERIFICATION-REPORT.md) — what has been checked automatically and
  manually, what remains unverified, and the conditions required before clinical validation

**Current versions:** protocol `sd-protocol-v2`, scoring config `sd-provisional-v1.8`.
