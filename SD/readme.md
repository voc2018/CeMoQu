# CeMoQu Speech Disturbance (SD)

Browser-based research prototype for standardized speech recording and transparent, provisional measurement in cerebellar ataxia. This module is **not a diagnostic device**, is **not clinically validated**, and does not replace a clinician-rated SARA examination.

## Clinical construct

Official SARA Item 4 (Speech Disturbance) is rated during normal conversation:

| Score | Official construct |
|---:|---|
| 0 | Normal |
| 1 | Suggestion of speech disturbance |
| 2 | Impaired speech, but easy to understand |
| 3 | Occasional words difficult to understand |
| 4 | Many words difficult to understand |
| 5 | Only single words understandable |
| 6 | Speech unintelligible/anarthria |

CeMoQu uses repeatable standardized browser tasks. The reading passage is a connected-speech proxy; it does not reproduce the official conversational examination.

## Changelog

**v1.3 — scoring is no longer gated by quality flags**
- Removed the hard quality gate that blocked Accept and scoring when a recording didn't meet quality-gate thresholds. Quality flags (clipping, low detection confidence, low voicing confidence, etc.) are still computed and shown as warnings, but they no longer prevent accepting a recording or computing a component score from it. Rationale: this is a research measurement tool, not a pass/fail exam — a recording that trips a quality flag still usually contains real, partially usable data, and blocking on quality made it impossible to ever complete an assessment for anyone whose performance (or environment) didn't cleanly satisfy the placeholder thresholds.
- `scoreTask()` now only returns "unavailable" when there is genuinely no usable data at all — every scoring metric is null/NaN, or the recording is flagged `empty_or_invalid` (nothing was actually captured). Any other case, however many quality warnings it carries, is scored from whatever real metrics exist; missing individual metrics still contribute zero severity rather than a false high or low value.
- Fixed a related gap: when reading's ASR completely failed (no transcript at all), `wordsPerMinute`/`articulationRateWpm` previously computed to `0`, which registered as maximal severity even though it reflected a technical failure, not measured speech. Both are now `null` when there is no transcript, so a total ASR failure correctly falls into the "no usable data" case above instead of silently scoring as intelligibility failure.
- Each score result now also carries `qualityPassed` and `qualityFlags` so downstream exports/UI can still show that a given score was computed despite a quality warning, without blocking it.
- Fixed `loadTask()` never resetting `recordBtn`'s `hidden` state after the first task's recording set it to hidden, which made "Start Recording" permanently invisible (and therefore unusable) from the second task onward.
- Scoring version bumped to `sd-provisional-v1.3`.

**v1.2 — pataka confidence fix**
- Fixed a conflict in `analyzePataka`'s quality-gate `confidence` formula: it previously multiplied in `(1 - rhythm-irregularity)`, meaning an irregular pa-ta-ka rhythm — the exact thing this task is designed to measure in ataxic dysarthria — could push `confidence` below the pass threshold and block an otherwise valid, sufficiently-detected recording. Rhythm irregularity (`interOnsetCv`) is already used correctly as a severity metric in scoring; it should not also gate quality control. `confidence` is now based only on overall signal-detection quality and event count sufficiency.
- Added a persistent top toolbar (Mic Test / Start Test / Stop Test / Submit Data / Export CSV) above the pre-test setup screen, in addition to the existing setup-panel controls. **Stop Test** safely aborts an in-progress countdown, recording, or unaccepted review at any point and returns to a ready state for the current task, without corrupting already-accepted attempts. **Submit Data** currently only assembles the export payload and logs it to the console; it is not wired to a real submission endpoint, since the actual CeMoQu submission mechanism used by LD/RT/ST was not available when this was built.
- Fixed the per-task recording timer relying on a single `setTimeout` for auto-stop, which browsers throttle or suspend when the tab is backgrounded. The 100ms clock interval now itself checks real elapsed wall-clock time (`performance.now()`) and triggers the stop, with a `visibilitychange` listener forcing an immediate catch-up check when the tab regains focus.

**v1.1 — quality-gate wiring and VAD fix**
- Fixed a CSS defect where `.countdown` and `.time-chip` unconditionally set `display`, which overrides the browser's default `[hidden]{display:none}` rule regardless of the element's `hidden` attribute. This made the countdown overlay permanently visible and click-blocking over the entire experiment panel. Fixed with a single SD-scoped rule (`.sd-shell [hidden]{display:none!important}`); no shared file was touched.
- Fixed the sustained-vowel voice-activity detection, which previously used only the current recording's own 20th-percentile RMS as the noise floor. For a task with no internal pauses (a single sustained "ah"), that self-referential floor sits close to the signal's own level, so a clean, fully-compliant recording was always misclassified as silence (`empty_or_invalid`). The detector now uses the lower of that in-recording estimate and the ambient noise level measured during the pre-test microphone check.
- Wired `PROVISIONAL_SCORING_CONFIG.*.qualityRequirements` (`minEvents`, `minDetectionConfidence`, `minVoicedFramePct`) into the actual pa-ta-ka/vowel quality checks; these values were previously declared in the config object but duplicated as separate hardcoded literals in the analysis functions.
- Added the previously-declared-but-unenforced `reading.qualityRequirements.minActiveSeconds` check, and a `vowel.qualityRequirements.minDetectionConfidence` check that was declared but never referenced.
- Wired the top-level `weights.reading/pataka/vowel` and each component's per-metric `contribution` values into `completeAssessment()`/`scoreTask()`; these were previously duplicated as separate hardcoded numbers. `PROVISIONAL_SCORING_CONFIG` is now the actual single source of truth for every weight and threshold.
- Scoring version bumped to `sd-provisional-v1.1`.

## Protocol

- Protocol version: `sd-protocol-v2` (unchanged — task content/order/durations did not change)
- Scoring version: `sd-provisional-v1.3`
- Start Countdown is mandatory: `3`, `2`, `1`, `Go`. Recording and timing begin at `Go`.

1. **Sustained vowel — 5 seconds.** Sustain “ah” at normal pitch and loudness. Measures valid phonation duration, voicing continuity, pitch stability, intensity stability, and interruptions.
2. **Pa-ta-ka — 10 seconds.** Repeat “pa-ta-ka” quickly and evenly. Estimates articulatory event rate, timing consistency, rhythm irregularity, and interruptions. Detected envelope peaks are estimates, not verified syllables.
3. **Standard reading passage — up to 30 seconds.** Read one fixed adult English passage naturally and clearly. Measures order-sensitive ASR word error rate, word accuracy, speech/articulation rate, pauses, and related acoustic descriptors.

Each task supports playback, re-recording, and explicit acceptance. Only the accepted attempt enters the final calculation. Attempt history remains available in exports.

## Measurement classes

- `scoring`: explicitly configured metrics that may influence a provisional component score.
- `exploratory`: measurements retained for research but excluded from scoring unless the central configuration is deliberately changed.
- `quality_control`: signal, duration, detection, and recording checks used to determine whether analysis is usable. Failure never means severe speech impairment.

The UI and exports identify these roles. `PROVISIONAL_SCORING_CONFIG` in `app.js` is the single source for all scoring weights, thresholds, quality requirements, and the scoring version.

## Provisional scoring

Component scores are 0–6 engineering estimates. All cutoffs are **engineering placeholder thresholds pending clinical calibration**.

- Reading: 60%, because intelligibility is the primary official SARA Speech construct.
- Pa-ta-ka: 30%, because rate, rhythm, and articulatory coordination are relevant to ataxic dysarthria and PATA-derived features contributed strongly in the SARAspeech feasibility study.
- Sustained vowel: 10%, because phonatory stability is relevant but less directly tied to official intelligibility categories.

```text
weighted = reading × 0.60 + pa-ta-ka × 0.30 + vowel × 0.10
rounded = round(weighted)
```

An intelligibility-priority rule prevents a reading score of 4, 5, or 6 from being lowered below that value by stronger isolated-task performance. This is a provisional rule informed by the structure of the SARA rubric, not a validated algorithm. If reading ASR or reading quality is unavailable/low-confidence, the normal overall score is unavailable.

### Placeholder thresholds

Arrays correspond to successive severity boundaries from 0 toward 6.

| Component | Metric | Boundaries |
|---|---|---|
| Reading | WER, higher is worse | `0.05, 0.15, 0.28, 0.42, 0.60, 0.80` |
| Reading | Words/minute, lower is worse | `150, 125, 100, 75, 50, 25` |
| Pa-ta-ka | Estimated syllables/second, lower is worse | `6.0, 5.2, 4.4, 3.6, 2.8, 2.0` |
| Pa-ta-ka | Inter-onset CV, higher is worse | `0.10, 0.16, 0.23, 0.32, 0.44, 0.60` |
| Vowel | Valid phonation seconds, lower is worse | `4.5, 4.0, 3.4, 2.8, 2.0, 1.0` |
| Vowel | F0 CV, higher is worse | `0.025, 0.045, 0.070, 0.105, 0.16, 0.24` |
| Vowel | Dropouts, higher is worse | `0, 1, 2, 3, 5, 8` |

Within components: reading = WER 80% + rate 20%; pa-ta-ka = rate 65% + inter-onset CV 35%; vowel = duration 45% + F0 CV 35% + dropouts 20%.

## Audio and analysis

The requested audio constraints are mono with `echoCancellation`, `noiseSuppression`, and `autoGainControl` disabled. Requested constraints, actual track settings, sample rate, channel count, MIME type, codec label, browser/device user agent, microphone distance, quality flags, and detection details are exported.

MediaRecorder output is normally WebM/Opus or Ogg/Opus. Decoding occurs locally for analysis. Compression, browser resampling, device processing that cannot be disabled, microphone frequency response, gain, distance, room acoustics, and operating-system audio routing limit comparability. Fine acoustic results are browser-derived and are not Praat-equivalent or clinical-grade.

Active speech/phonation uses an adaptive RMS threshold based on an estimated lower-level noise distribution. Exports include the threshold, total/active/silent duration, pause measures, confidence, segments, and flags. F0 uses valid voiced frames from a normalized autocorrelation estimate. Mean F0 is exploratory and is not itself treated as severity.

Reading uses standard order-sensitive Levenshtein dynamic-programming WER with substitutions, deletions, and insertions. Browser speech recognition can vary with browser, OS, provider, model updates, network, accent, language, age, sex, microphone, and noise. Browser APIs may not provide confidence. If ASR is unavailable or fails, audio is preserved, retry remains possible, and no normal overall score is produced.

## Exports

The RESEARCH tab provides trial JSON, session CSV, full JSON, and accepted audio downloads. CSV values are quoted and escape quotes, commas, line breaks, Unicode, transcripts, and notes. Shared-header participant/session fields are read at export time rather than duplicated in SD.

## Required validation work

- Healthy-control distributions stratified where necessary by age, sex, language, accent, and device
- Same-day clinician-rated SARA Speech comparisons
- Test-retest reliability and smallest detectable change
- Manual review of voice activity, pa-ta-ka event detection, and ASR alignments
- Device/microphone and room-noise sensitivity analysis
- Bias and missingness analysis
- Replacement of placeholder rules with a clinically trained and externally validated ordinal model

## Scientific basis

- [Official SARA form](https://www.sralab.org/sites/default/files/2017-06/SARA.pdf)
- [Grobe-Einsler et al. (2023), SARAspeech feasibility study](https://doi.org/10.1038/s41746-023-00787-x)
- [Vogel et al. (2024), consensus recommendations](https://doi.org/10.1007/s12311-023-01623-4)

These sources support the protocol direction and measurement domains. They do **not** validate CeMoQu's exact tasks, weights, thresholds, implementation, or estimated score.
