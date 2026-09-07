# SD Verification Report

> **⚠️ Outdated — update pending.** This report reflects `sd-provisional-v1.1`. Since then the
> module has changed significantly (any-order task selection, top toolbar with Mic Test/Start
> Test/Stop Test, quality flags no longer gate scoring, pa-ta-ka scoring now accounts for pauses,
> two-stage F0 octave-error correction, three rotating reading passages, per-task plain-language
> score explanations, and more). None of that is covered below yet. A refreshed version against the
> current build (`sd-provisional-v1.8`) is planned before this is relied on for anything beyond
> historical reference.

## v1.1 fixes and how they were verified

- **`[hidden]` CSS override bug** (countdown overlay permanently visible and click-blocking): confirmed by grep — no `[hidden]` rule existed anywhere in `styles.css` prior to the fix, while `.countdown{display:grid}` and `.time-chip{display:flex}` both unconditionally set `display`. Fixed with `.sd-shell [hidden]{display:none!important}`, scoped to SD only. Still needs confirmation in an actual browser (`getComputedStyle(#countdown).display === 'none'` while the `hidden` attribute is present).
- **Sustained-vowel VAD always failing on valid recordings**: reproduced outside the browser by extracting the pure signal-analysis functions and running them in Node against a synthetic clean, continuous 130 Hz tone with no pauses (i.e., exactly what a compliant "ah" recording looks like). Before the fix, `activeDurationSeconds` was `0` and the attempt was flagged `empty_or_invalid` on every run. After the fix (noise floor = min of pre-task ambient measurement and in-recording percentile), the same synthetic recording produced `activeDurationSeconds ≈ 4.99` of 5, `voicedFramePercentage: 100`, and `quality.valid: true`. Pa-ta-ka and reading synthetic tests were re-run after the change and produced unchanged results (no regression).
- **Quality-gate thresholds not wired to config**: confirmed the analysis functions now read `PROVISIONAL_SCORING_CONFIG.<task>.qualityRequirements.*` directly rather than duplicating literals.
- **`reading.minActiveSeconds` unenforced**: confirmed the literal string `minActiveSeconds` now appears in `analyzeReading`'s quality check, not only in the config declaration.
- **Top-level and per-metric weights not wired to config**: confirmed by a Node sanity test — temporarily overriding `PROVISIONAL_SCORING_CONFIG.weights` at runtime changed the computed weighted score (0.6/0.3/0.1 → 0.9/0.05/0.05 changed `raw` from 0.2 to 0.1), proving the config object is now the actual source of the computation rather than a duplicated display value.

These fixes were verified through static analysis and isolated execution of the pure computation functions (Node.js), not a live browser with a real microphone. Real-browser confirmation of the `[hidden]` CSS fix, and real-microphone confirmation that natural (non-synthetic) sustained vowels no longer trip the VAD, remain open items below.

## Automatically verified

- JavaScript syntax passes `node --check`.
- HTML IDs referenced by JavaScript were checked programmatically.
- All local stylesheet/script references resolve in the supplied CeMoQu folder structure.
- Shared assets remain byte-identical to the uploaded `shared.zip` copies.
- No LD or RT reference file was modified.
- SD contains exactly three tasks in the required order with durations 5, 10, and 30 seconds.
- Requested audio-processing constraints are disabled and stored with actual browser settings.
- State transitions, timer cleanup, recorder guards, ASR stop, media release, and object-URL cleanup are present.
- Standard dynamic-programming WER, component weighting, rounding, intelligibility-priority rule, missing-reading behavior, and CSV quote escaping are implemented.
- Only accepted attempts enter results; re-recorded attempts remain marked unaccepted.
- Responsive CSS contains the 900 px single-column transition and overflow protections.

## Structurally reviewed without a live microphone

- Shared header and stylesheet paths resolve when the supplied parent folder is served over HTTP.
- TEST/RESEARCH switching, setup hierarchy, task presentation, disabled exports, calculation disclosure, and event wiring were inspected in source.
- Responsive desktop/mobile rules, countdown overlay, results placeholders, labels, and focusable native controls were inspected in source.
- A browser executable was not available in the automated environment, so pixel-level visual rendering is included in the remaining manual checks rather than claimed as passed.

## Still requires real participant/microphone testing (including v1.1 fixes)

- Confirm in real browser devtools that `#countdown` computes `display:none` while `hidden`, and that clicking "Start Recording" is no longer blocked
- Confirm a real, naturally-produced sustained vowel (not a synthetic tone) is correctly detected as active speech across a range of real microphones, voices, and quiet-room noise floors
- Confirm the ambient-noise reference from `checkMicrophone()` is reasonable across real rooms (a noisier setup room than the actual recording environment, or vice versa, could still mis-set the floor)


- Permission allow/deny flows on each target browser and operating system
- Pixel-level desktop and mobile visual inspection in a real browser, including overflow and shared-header integration
- Actual audio start alignment at `Go`, end preservation, playback, and codec compatibility
- Microphone check thresholds for quiet, clipping, and background noise
- Five-second vowel completion, ten-second pa-ta-ka completion, and early/automatic reading stop
- Re-record and accepted-attempt replacement with real audio
- ASR availability, transcript completion, provider/network behavior, and accented speech
- Pa-ta-ka peak-detection validity against manual syllable labels
- Vowel F0/voicing validity against reference acoustic software
- Audio downloads and exported data reviewed after a complete live session
- Reset/restart after permission changes and device switching
- Real participants, including users with hearing, visual, motor, speech, and cognitive access needs

## Manual microphone checklist

1. Serve CeMoQu through HTTPS or localhost; do not open `index.html` as `file://`.
2. Confirm header fields load and enter participant/session metadata.
3. Test permission Allowed, Blocked, and permission revoked mid-session.
4. Check default and alternate microphones; verify actual settings in JSON.
5. Run mic checks with silence, normal speech, distant speech, loud speech, and background audio.
6. For every task, confirm visible `3–2–1–Go`, optional beep behavior, start at Go, timer, safe stop, playback, re-record, and accept.
7. Confirm rejected attempts do not affect scores and accepted audio is the latest accepted attempt.
8. Test successful ASR, no-result ASR, offline/network loss, and an unsupported browser.
9. Inspect WER substitutions/deletions/insertions using known deliberate reading errors.
10. Compare pa-ta-ka detected events and vowel voiced frames with expert/manual labels.
11. Download trial JSON, session JSON, CSV, and each accepted audio file; inspect commas, quotes, Unicode, and multiline notes.
12. Verify missing/low-confidence reading displays “Estimated score unavailable,” never score 6.
13. Repeat on Chrome, Edge, Safari, Firefox, Windows, macOS, Android, and iOS where supported.

## Questions for neurologists and speech-language pathologists

- Is this reading passage appropriate across the intended adult clinical population and education levels?
- Should participants stop after finishing the passage, or should a fixed recording tail be retained for consistent pause analysis?
- Which same-day conversational speech sample should accompany official SARA Item 4 rating?
- Are the provisional intelligibility-floor rules clinically reasonable for physician review?
- Which task failures should require re-recording versus clinician adjudication?
- What minimum change would be clinically meaningful within each SARA Speech category?
- Which acoustic and timing metrics are most interpretable for longitudinal ataxic dysarthria monitoring?
- Should severe dysarthria, anarthria, reading difficulty, cognitive impairment, and non-native English be routed to distinct protocol paths?
- Which age, sex, language, accent, hearing, respiratory, and device covariates must be mandatory?
- What reference annotation protocol should be used for intelligibility, pa-ta-ka syllables, pauses, and vowel voicing?
