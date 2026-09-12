# SD Verification Report

**Verification date:** 2026-09-07  
**Protocol version:** `sd-protocol-v2`  
**Scoring configuration:** `sd-provisional-v1.8`  
**Build reviewed:** `SD(2).zip`  
**Status:** Conditional research-prototype verification — not clinical validation

This report distinguishes checks that were completed from checks that still require a real browser,
microphone, participant sample, or clinical reference. A code check, synthetic-signal test, or single
development recording is not described as clinical validation.

## 1. Scope

The reviewed SD build contains three browser-based tasks:

1. Sustained vowel (5 seconds)
2. Pa-ta-ka repetition (10 seconds)
3. Standard reading passage (up to 30 seconds)

The tasks may be completed in any order. A task may be repeated, and only the most recently accepted
attempt for each task contributes to the current overall estimate. Earlier attempts remain in the
session attempt history but are marked unaccepted.

## 2. Automatically verified against the current build

- JavaScript passes `node --check`.
- HTML contains no duplicate IDs.
- SD-local DOM references resolve. The `glob-*` participant/session fields are intentionally supplied
  by the shared CeMoQu header and therefore require integration testing with `../shared`.
- Protocol and scoring identifiers in code are `sd-protocol-v2` and `sd-provisional-v1.8`.
- Configured task durations are 5, 10, and 30 seconds.
- The default overall weights are Reading 50%, Pa-ta-ka 40%, and Vowel 10%.
- The research weight control changes weights in 10% increments while preserving a 100% total.
- Standard order-sensitive dynamic-programming WER produces substitutions, deletions, and insertions.
- Pa-ta-ka scoring uses overall syllable rate, inter-onset CV, and pause ratio at 40%/30%/30%.
- Sustained-vowel scoring uses valid phonation duration, F0 CV, and dropout count at 45%/35%/20%.
- Reading scoring uses WER and ASR-derived words per minute at 80%/20%.
- The intelligibility-priority rule prevents a Reading component of 4–6 from being averaged below
  that component score.
- An `empty_or_invalid` attempt or a task with no numeric scoring metric is returned as `Unavailable`,
  not automatically mapped to 0 or 6.
- Quality flags are preserved and displayed but do not automatically block an otherwise measurable
  attempt.
- Re-accepting a task marks the previous accepted attempt unaccepted and replaces it in the current
  calculation.
- Passage ID, version, title, and text are stored with Reading attempts.
- Requested and actual browser audio settings, browser user agent, microphone distance, language,
  transcript, quality flags, detection details, and scoring configuration are included in exports.
- CSV cells are quoted and embedded quotation marks are escaped.
- Accepted audio can be downloaded in the browser-selected recorded format.
- `Submit Data` prepares a payload but does not transmit it; the source contains an explicit TODO.
- SD contains a scoped `[hidden]` CSS rule and a responsive single-column layout below 900 px.

## 3. Previously tested in isolated development checks

The following checks were reported during development and remain useful regression evidence, but are
not substitutes for current multi-device testing:

- A synthetic continuous 130 Hz vowel exposed the earlier VAD noise-floor failure. After using the
  lower of pre-task ambient RMS and the recording's 20th-percentile RMS, the synthetic vowel was
  detected as active.
- Pure scoring functions were exercised with altered configuration weights to confirm that displayed
  configuration values are connected to the computation.
- A development recording was used to identify low-loudness octave-tracking errors and evaluate the
  two-stage F0 filter. This is a development-case check, not a validation dataset.

## 4. Current implementation limitations confirmed by review

- Thresholds, metric contributions, task weights, quality cutoffs, and the intelligibility-priority
  rule are engineering placeholders and have not been calibrated against an independent clinical
  cohort.
- Browser ASR supplies both WER and the recognized-word count used for WPM. A recognition miss can
  therefore worsen both Reading metrics; they are not independent.
- The displayed detection-confidence value is a heuristic, not a calibrated probability.
- If at least one task metric is numeric, the current component calculation assigns severity 0 to a
  missing metric. This can bias a partially observed component toward the normal end of the scale and
  requires an explicit policy decision before clinical calibration.
- Pa-ta-ka events are amplitude-envelope peaks, not manually verified syllable nuclei. Weak syllables
  and noise bursts can change rate and rhythm estimates.
- Pa-ta-ka `pauseRatio` includes all time classified inactive, including possible response latency,
  trailing silence, weak undetected articulation, and true mid-task pauses.
- Reading passages have documented phoneme-presence coverage but have not been shown to be equivalent
  in ASR difficulty, articulatory demand, reading time, or score distribution.
- A new passage is selected when Reading is re-entered, including re-record. This may reduce rehearsal
  while introducing an alternate-form effect.
- Browser-recorded audio may be compressed and browser-dependent; it is not acquisition-grade raw PCM.
- `Submit Data` is not connected to a production endpoint.

## 5. Real-browser and microphone verification still required

Test over HTTPS or localhost; microphone and browser speech-recognition APIs may not work from
`file://`.

1. Verify shared-header loading and all `glob-*` metadata fields.
2. Test microphone permission allowed, denied, revoked, and device-changed states.
3. Test default and alternate microphones and confirm exported actual settings.
4. Confirm visible 3–2–1–Go, optional sound cue, recording start at Go, timer behavior, and safe stop.
5. Confirm full preservation of recording endings and Reading early-finish behavior.
6. Verify playback, re-record, acceptance replacement, restart, and object-URL cleanup.
7. Test silence, quiet speech, loud speech, clipping, background noise, and changing room noise.
8. Test ASR success, partial transcript, no result, unsupported browser, and network loss.
9. Inspect deliberate substitutions, deletions, insertions, and word-order changes in WER output.
10. Download CSV and accepted audio; inspect commas, quotes, Unicode, multiline notes, filenames, and
    codec playback outside the recording browser.
11. Verify desktop and mobile layout, overflow, keyboard focus, screen-reader labels, contrast, and
    use by participants with hearing, visual, motor, speech, or cognitive access needs.
12. Repeat on the intended support matrix, including current Chrome and Edge on Windows/macOS and any
    Safari, Firefox, Android, or iOS environments the project intends to claim.

## 6. Signal-analysis validation still required

- Compare VAD active/silent labels with manually annotated recordings.
- Compare Pa-ta-ka event times, counts, pauses, and rhythm values with expert syllable annotations.
- Compare F0 tracks, F0 CV, voiced-frame selection, and dropouts with reference acoustic software.
- Quantify codec, sample-rate, microphone, distance, room-noise, browser, and operating-system effects.
- Test low-pitched, high-pitched, quiet, breathy, interrupted, and severely dysarthric voices.
- Measure failure rates rather than evaluating only successful recordings.

## 7. Clinical and statistical validation still required

- Healthy-control and cerebellar-ataxia cohorts covering the intended age, sex, language, accent,
  education, respiratory, hearing, and severity ranges
- Same-day blinded clinician-rated official SARA Speech scores based on the agreed conversational
  protocol
- Inter-rater reliability of the clinical reference
- Test–retest reliability and measurement error
- Concurrent and construct validity of each metric and task component
- Passage-form effects and passage assignment strategy
- Calibration or replacement of thresholds, metric contributions, overall weights, and the
  intelligibility-priority rule
- Sensitivity to longitudinal change and estimation of clinically meaningful change
- External validation on an independent cohort
- Missing-data, unusable-recording, and adjudication rules defined before confirmatory analysis

## 8. Questions requiring neurologist and SLP decisions

- Is the Reading task appropriate across the intended clinical population and education levels?
- Should a Reading re-record retain the same passage?
- Should the recording stop when the passage ends or retain a standardized tail?
- Which conversational sample should accompany the official SARA Item 4 rating?
- Which quality or task failures require re-recording, annotation, or clinician adjudication?
- Should severe dysarthria, anarthria, reading difficulty, cognitive impairment, and non-native
  English use distinct protocol paths?
- Which demographic, respiratory, hearing, language, accent, and device covariates are mandatory?
- How should partially available metrics be handled without interpreting missingness as normality?

## 9. Current verification decision

The current build passes static structural review and is suitable for supervised prototype and
research-development testing. It is **not verified for diagnostic use, clinical decision-making, or
claims of validated SARA scoring accuracy**. Advancement beyond provisional status requires the
real-browser, signal-analysis, accessibility, and clinical/statistical work listed above.
