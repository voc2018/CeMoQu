# SD Task Design Rationale

This document explains **why the SD protocol looks the way it does**: why these three specific
tasks, why their durations, why the specific reading passage content, and why the scoring weights
are split the way they are. It is the "why" companion to [`METHODOLOGY.md`](./METHODOLOGY.md) (the
"how it's computed" document) and the [README](./README.md) (the general overview).

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

For ataxia specifically, this task has a directly documented reason to be included beyond that
general justification. Kent, Kent, Duffy, Thomas, Weismer, & Stuntebeck (2000, "Ataxic Dysarthria,"
*JSLHR* 43(5), 1275–1289) collected perceptual and acoustic data from 14 speakers with ataxic
dysarthria (7 men, 7 women) across sustained vowel phonation, syllable repetition, sentence
recitation, and conversation, specifically to determine **which speaking tasks are most sensitive to
the disorder**. Their multidimensional acoustic analysis of the sustained-vowel task found that the
single **largest and most frequent abnormality, in both men and women, was long-term variability of
fundamental frequency (pitch)** — with shimmer and peak-amplitude variation also frequently abnormal
in both sexes, and jitter frequently abnormal in women. In other words, this specific task, measuring
this specific quantity (pitch stability — see `METHODOLOGY.md` A2), was identified by name in the
literature as one of the more sensitive acoustic signals for this population, even though sustained
vowel is not part of SARA's own conversational examination.

**Duration:** 5 seconds is short by clinical maximum-phonation-time standards (which sometimes ask
for as long as possible), but provides multiple seconds of frames for provisional pitch-stability
analysis while keeping the test brief and low-burden. Five seconds is a feasibility-oriented
protocol choice, not an empirically established optimum, and should be evaluated for completion
rate, reliability, and sensitivity in the intended population.

## Why pa-ta-ka repetition, 10 seconds

Rapid syllable repetition tasks are grouped in the literature as **diadochokinetic (DDK)** tasks, of
which there are two standard variants: **alternating motion rate (AMR)** — repeating a single syllable
as fast as possible (e.g. "pa-pa-pa...") — and **sequential motion rate (SMR)** — repeating a fixed
sequence of different syllables (e.g. "pa-ta-ka-pa-ta-ka..."), which is what this task actually is.
Both variants test the same underlying capacity: fast, precisely sequenced, alternating movement
between three different articulatory targets (lips for "pa", tongue tip for "ta", tongue back/velum
for "ka") — exactly the category of rapid, coordinated motor timing that cerebellar damage disrupts.

This is not a generic assumption for this population: Wang, Kent, Duffy, & Thomas (2009, "Analysis of
diadochokinesis in ataxic dysarthria using the Motor Speech Profile program," *Folia Phoniatrica et
Logopaedica* 61(1), 1–11) analyzed DDK performance specifically in ataxic dysarthria. Separately, in
the same Kent et al. (2000) study cited above, AMR/SMR-type repetition was found to be **typically
slow and irregular in its temporal pattern** in ataxic speakers, with energy maxima and minima
**highly variable across repeated syllables** — a pattern the authors attribute to poorly coordinated
respiratory function and inadequate articulatory/voicing control. This maps directly onto the three
metrics this task is actually scored on (`METHODOLOGY.md` A3, B2): rate, rhythm variability, and
pause ratio.

This task also carries the strongest *empirical* weight of the three in predicting SARA speech
severity specifically — see [Why 50% / 40% / 10%](#why-50-reading--40-pa-ta-ka--10-sustained-vowel)
below.

**Duration:** 10 seconds (double the vowel task) because a DDK rate estimate needs enough repetitions
to be stable — at a typical rate of 4–7 syllables/second, 10 seconds yields roughly 40–70 syllable
events, a large enough sample for the rhythm-variability and pause-pattern measurements to be
meaningful (5 seconds would roughly halve that sample). This is consistent with the general use of
single-breath-group or short fixed-window DDK protocols rather than prolonged maximal-effort tasks.
Ten seconds remains a provisional feasibility choice; its reliability, fatigue burden, and agreement
with manual syllable labels must be evaluated in the intended population.

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
minute, per Brysbaert's 2019 meta-analysis) without requiring an unusually long, fatiguing read.

### Why not reuse an existing standard passage (Rainbow, Grandfather, Caterpillar)?

Standardized reading passages such as the **Rainbow Passage** (Fairbanks, 1960), the **Grandfather
Passage** (attributed to Van Riper, per Reilly & Fisher, 2012), **The North Wind and the Sun**
(International Phonetic Association, 1989), and **The Caterpillar** (Patel et al., 2013) are the
established tools for eliciting connected speech in motor speech / dysarthria assessment. They were
not reused here for two reasons: (1) **topical fit** — the project wanted an energizing, motivational
narrative rather than the descriptive/expository style of the existing passages (a rainbow forming, a
grandfather's routine, a caterpillar), and none of the standard passages fit that brief; (2)
**copyright/reproduction** — reusing a copyrighted passage's exact text verbatim was avoided in favor
of new passages written from scratch, following the same design principles reported in the literature
for these tools.

### Design principles followed (from the literature)

- **Phonemic and phonetic coverage.** The literature evaluates passages on two related but distinct
  properties: whether they contain the individual phonemes of English at all ("phonemic coverage"),
  and whether they contain those phonemes across a wide range of positional/allophonic contexts —
  e.g. a consonant in word-initial vs. word-medial vs. word-final position, in a stressed vs.
  unstressed syllable ("phonetic coverage"). Bunta et al. (2022, ASHA Perspectives) analyzed 466
  allowable consonant contexts and found the standard passages covered them only partially: 24.89%
  for The Caterpillar, 27.25% for The Grandfather Passage, and 35.84% for The Rainbow Passage. A
  separate analysis (JSLHR, 2020) found The Caterpillar gave the best match to the phoneme *frequency
  distribution* of natural spoken American English among the three, though none were close to ideal.
  Shared takeaway from both papers: **no existing standard passage is fully phonetically balanced,
  and there is room for new passages.**
- **Sentence-length variety.** The Grandfather Passage averages roughly 16.5 words per sentence
  (Patel et al., 2013); mixing short and long sentences allows assessment of prosody, breath support,
  and pacing across different sentence structures rather than a single rhythm.
- **Accessible, broadly relatable content.** Passages should avoid rare vocabulary, culturally or
  religiously specific content, and gendered assumptions where unnecessary (a concern also raised in
  a 2023 AJSLP paper proposing inclusive edits to the Rainbow Passage itself).

### What was actually done, and how it was verified

Three original passages were written to an energizing/motivational theme (a mountain climb, a
basketball comeback, a pre-dawn training run), each averaging 3 sentences of mixed short/medium/long
length, in the 60–70 word range.

Each passage was then **verified computationally**, not just by ear: every word was looked up in the
**CMU Pronouncing Dictionary** (the standard machine-readable phonemic lexicon used in speech and NLP
research) via the `pronouncing` Python library, and the resulting ARPAbet phoneme sequences were
compared against the 39-phoneme General American English inventory (24 consonants + 15 vowels,
including diphthongs).

**Results (phonemic coverage — presence/absence of each phoneme, not positional-context coverage):**

| Passage | Words | Phonemes covered | Missing |
|---|---|---|---|
| The Climb | 69 | 36 / 39 (92%) | JH, OY, ZH |
| One More Shot | 62 | 35 / 39 (90%) | CH, ER, Y |
| Before Sunrise | 62 | 35 / 39 (90%) | CH, JH, OY, UH |
| **All three combined** | — | **39 / 39 (100%)** | none |

Two words were added specifically to close the remaining gaps in the combined set: **"joy"** (adds
the OY diphthong, as in *boy*) at the end of *One More Shot*, and **"a treasure"** (adds ZH, the
rarest English consonant, as in *measure*) at the end of *Before Sunrise*. Both fit naturally into
the existing sentences without altering the narrative.

**Caveat:** this is phoneme *presence* coverage (does the sound occur at least once), a coarser
measure than the positional/allophonic-context coverage used in the Bunta et al. (2022) analysis of
the standard passages. A full 466-context allophonic analysis was not performed here — a reasonable
next step if this task set is used in a formal publication. What can be said with confidence is
limited to the analysis actually performed: at the phoneme-presence level, the three-passage set
covers the full General American English inventory. Because a participant reads only one passage in
an attempt, no single assessment contains that combined 39/39 coverage. Presence coverage must not
be numerically compared with the positional/allophonic-context percentages reported for established
passages because the denominators and constructs differ.

### Why three passages instead of one, and why random selection

A single fixed passage means a participant who repeats the task (e.g., retesting the same day, or a
student practicing the interface) reads identical text every time, which risks rehearsal effects. One
of three passages is chosen at random each time the reading task is entered (including on
re-record), and the specific passage shown is recorded in that attempt's exported data so scoring
(WER, word counts) is always computed against the passage actually displayed.

The three passages have not yet been demonstrated to be equivalent in ASR difficulty, vocabulary,
articulatory demand, reading time, or score distribution. Random selection therefore reduces
rehearsal but introduces a potential alternate-form effect. Passage identity must remain in every
export, and future validation should estimate passage effects and determine whether re-records should
retain the same passage while separate sessions use a counterbalanced assignment.

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

The original design used Reading 60% / Pa-ta-ka 30% / Vowel 10%, weighted primarily toward
argument (1). It was revised to **Reading 50% / Pa-ta-ka 40% / Vowel 10%** to give more credit to
argument (2), while still keeping reading as the single largest component because it remains the only
task tied directly to SARA's own definition. Sustained vowel was left at 10% in both versions: it has
real diagnostic signal (see above) but no precedent in the SARAspeech study's task set to argue for a
larger empirical weight.

Feature importance in SARAspeech does not mathematically establish a 40% task weight for this
different rule-based score. The 50/40/10 split is therefore an **evidence-informed engineering
starting point**, not a weight set estimated or validated by that study.

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

- Kent, R. D., Kent, J. F., Duffy, J. R., Thomas, J. E., Weismer, G., & Stuntebeck, S. (2000). Ataxic
  dysarthria. *Journal of Speech, Language, and Hearing Research*, 43(5), 1275–1289. (Sustained-vowel
  F0 variability as the largest/most frequent acoustic abnormality; AMR/SMR slow and irregular timing
  with variable syllable energy.)
- Wang, Y., Kent, R. D., Duffy, J. R., & Thomas, J. E. (2009). Analysis of diadochokinesis in ataxic
  dysarthria using the Motor Speech Profile program. *Folia Phoniatrica et Logopaedica*, 61(1), 1–11.
- Darley, F. L., Aronson, A. E., & Brown, J. R. (1969). Differential diagnostic patterns of
  dysarthria. *Journal of Speech and Hearing Research*, 12(2), 246–269.
- Grobe-Einsler, M., et al. (2023). SARAspeech — Feasibility of automated assessment of ataxic speech
  disturbance. *npj Digital Medicine*.
- Vogel, A. P., et al. (2024). Quantitative speech assessment in ataxia — Consensus recommendations
  by the Ataxia Global Initiative Working Group on Digital-Motor Markers.
- Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading
  rate. *Journal of Memory and Language*, 109.
- Fairbanks, G. (1960). *Voice and Articulation Drillbook* (2nd ed.). Harper & Row. [Source of the
  Rainbow Passage.]
- Patel, R., Connaghan, K., Franco, D., Edsall, E., Forgit, D., Olsen, L., Ramage, L., Tyler, E., &
  Russell, S. (2013). "The Caterpillar": A novel reading passage for assessment of motor speech
  disorders. *American Journal of Speech-Language Pathology*, 22(1), 1–9.
- Reilly, J., & Fisher, J. L. (2012). Sherlock Holmes and the strange case of the missing
  attribution: A historical note on "The Grandfather Passage." *Journal of Speech, Language, and
  Hearing Research*, 55, 84–88.
- Bunta, F., et al. (2022). Examination of consonantal phonetic coverage in standard reading
  passages. *Perspectives of the ASHA Special Interest Groups*.
- Analysis of Phonetic Balance in Standard English Passages. (2020). *Journal of Speech, Language,
  and Hearing Research*.
- CMU Pronouncing Dictionary, Carnegie Mellon University (used here via the `pronouncing` Python
  library) — standard machine-readable phonemic lexicon for General American English.
