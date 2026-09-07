# SD Task Design Rationale

This document explains **why the SD protocol looks the way it does**: why these three specific
tasks, why their durations, and why the scoring weights are split the way they are. It is the
"why" companion to [`METHODOLOGY.md`](./METHODOLOGY.md) (the "how it's computed" document) and the
[README](./README.md) (the general overview).

For the reading passage *text itself* — why these three specific passages, and the phoneme-coverage
analysis behind them — see the dedicated
[`reading-passage-design-rationale.md`](./reading-passage-design-rationale.md). This document covers
the protocol as a whole; that one is a deep-dive appendix on one part of it.

## Why not just replicate the official SARA conversational exam?

SARA's Speech Disturbance item is scored by a clinician listening to normal conversation. That's rich
but not repeatable or automatable — two clinicians, or the same clinician on two different days, can
reasonably differ, and there's nothing for a browser to measure in an open-ended conversation. SD
instead uses standardized, structured tasks: the same instructions, the same timing, every time. This
trades conversational realism for **consistency and automatability** — the explicit tradeoff this
whole project is built on (see the [README](./README.md#what-sara-speech-normally-measures)).

Given that tradeoff, three tasks were chosen to each target a different part of the speech-motor
system that cerebellar damage affects, rather than trying to measure everything with one task.

## Why sustained vowel ("Ah"), 5 seconds

Sustained-vowel phonation is a standard tool in voice/speech assessment for testing two things at
once: whether someone has **adequate respiratory (breath) support**, and whether their **laryngeal
valving** (vocal fold closure) is sufficient to produce continuous, steady voicing.

For ataxia specifically, this task has a documented reason to be included beyond that general
justification: acoustic analyses of ataxic dysarthria (Kent et al.) found that during sustained
vowel production, the largest and most frequent abnormality — in both male and female speakers — was
**long-term fundamental frequency (pitch) variability**, with amplitude variation (shimmer-like
measures) also elevated. In other words, this specific task and this specific measurement
(pitch stability, see `METHODOLOGY.md` A2) is one of the more sensitive acoustic signals for this
population, even though it is not part of SARA's own conversational examination.

**Duration:** 5 seconds is short by clinical maximum-phonation-time standards (which sometimes ask
for as long as possible), but long enough to get a meaningful pitch-stability sample while keeping
the overall test brief and low-burden — this module favors a short, guided, repeatable test over an
exhaustive one.

## Why pa-ta-ka repetition, 10 seconds

Pa-ta-ka repetition is the classic **diadochokinetic (DDK)** task in motor-speech assessment: rapid
alternating movement between three different articulatory targets (lips for "pa", tongue tip for
"ta", tongue back/velum for "ka"). This kind of fast, precisely sequenced, alternating motor task is
exactly the category of movement that cerebellar coordination governs, which is why DDK rate and
regularity are core measures across essentially all motor-speech assessment batteries, not specific
to ataxia.

This task also carries the strongest *empirical* weight of the three in predicting SARA speech
severity specifically — see [Why 50% / 40% / 10%](#why-50-reading--40-pa-ta-ka--10-sustained-vowel)
below.

**Duration:** 10 seconds (double the vowel task) because a DDK rate estimate needs enough repetitions
to be stable — at a typical rate of 4–7 syllables/second, 10 seconds yields roughly 40–70 syllable
events, a large enough sample for the rhythm-variability and pause-pattern measurements in
`METHODOLOGY.md` A3 to be meaningful. Five seconds would roughly halve that sample.

## Why a reading passage, up to 30 seconds

SARA's own official 0–6 criteria for Speech Disturbance are defined almost entirely in terms of
**intelligibility** — "occasional/many words difficult to understand," "only single words
understandable," and so on. A read passage is the standardized-task equivalent of that construct: it
produces connected, real-word speech that a transcript can be checked against, which sustained vowels
and pa-ta-ka syllables cannot provide (see `METHODOLOGY.md` A4 for how that transcript comparison —
word error rate — is computed). This is why reading keeps the largest single weight in scoring (see
below) even though pa-ta-ka's raw predictive power is comparable or higher in the literature: the
official construct being estimated is defined around intelligibility, and reading is this protocol's
only direct intelligibility measure.

**Duration:** up to 30 seconds, with the passage stopped early if the reader finishes sooner. Thirty
seconds comfortably fits a 60–70 word passage at typical adult oral reading speeds (150–183 words per
minute, per Brysbaert's 2019 meta-analysis) without requiring an unusually long, fatiguing read. The
specific three passages used, and why they were written the way they were, are documented in
[`reading-passage-design-rationale.md`](./reading-passage-design-rationale.md).

## Why 50% Reading + 40% Pa-ta-ka + 10% Sustained vowel

These weights combine two different, and partly competing, kinds of evidence:

1. **SARA's own definition** centers on intelligibility (see above), which argues for reading
   carrying the largest single weight.
2. **Empirical predictive power.** Grobe-Einsler et al. (2023, "SARAspeech") built an automated
   SARA-speech-severity predictor from acoustic features across three elicitation tasks (PATA,
   counting, free speech) and examined which task each of the ten most-predictive features came
   from: **5 of the top 10 came from the PATA task alone**, versus 3 from counting and 2 from free
   speech. In that study, a DDK-type task was the single strongest predictor — comparable to, or
   stronger than, the two connected-speech-type tasks combined.

The original design used Reading 60% / Pa-ta-ka 30% / Vowel 10%, weighted almost entirely toward
argument (1). It was revised to **Reading 50% / Pa-ta-ka 40% / Vowel 10%** to give more credit to
argument (2), while still keeping reading as the single largest component because it remains the only
task tied directly to SARA's own definition. Sustained vowel was left at 10% in both versions: it has
real diagnostic signal (see above) but no precedent in the SARAspeech study's task set to argue for a
larger empirical weight.

**These are not fixed.** The weight split is an adjustable drag bar in the app's RESEARCH tab (snaps
to 10% steps, always sums to 100%) specifically because this is a reasoned starting point, not a
validated constant — see [Limitations](./README.md#limitations).

## Why pausing/breakdown is scored, not filtered out

A design decision that runs through several parts of this protocol: **pauses and mid-task
breakdowns are treated as data, not noise.** The pa-ta-ka score uses the rate computed over the full
task duration (pauses included), not just the time the person was actively making sound, and pause
ratio is itself a scored metric (`METHODOLOGY.md` A3, B2). This is a deliberate choice, not an
oversight: "scanning speech" — connected speech broken into syllables by noticeable pauses — is one
of the textbook-recognized perceptual features of ataxic dysarthria (part of the classic Darley,
Aronson & Brown 1969 description of ataxic prosodic and articulatory disturbance). A scoring method
that quietly excludes pause time from its rate calculation would filter out exactly the symptom this
task exists to detect.

## References

- Kent, R. D., et al. Acoustic analyses of sustained and running speech characteristics in ataxic
  dysarthria. (Multi-dimensional voice/acoustic analysis of ataxic dysarthria; F0 variability as the
  most frequent sustained-vowel abnormality.)
- Darley, F. L., Aronson, A. E., & Brown, J. R. (1969). Differential diagnostic patterns of
  dysarthria. *Journal of Speech and Hearing Research*, 12(2), 246–269.
- Grobe-Einsler, M., et al. (2023). SARAspeech — Feasibility of automated assessment of ataxic speech
  disturbance. *npj Digital Medicine*.
- Vogel, A. P., et al. (2024). Quantitative speech assessment in ataxia — Consensus recommendations
  by the Ataxia Global Initiative Working Group on Digital-Motor Markers.
- Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading
  rate. *Journal of Memory and Language*, 109.
