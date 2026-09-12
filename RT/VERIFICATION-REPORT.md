# RT Verification Report

**Verification date:** 2026-09-12  
**Reviewed build:** `RT091226.zip`  
**Scoring configuration:** `rt-scoring-v1`  
**Status:** Conditional research-prototype verification — not clinical validation

This report separates checks that can be confirmed from the current build from checks that still require browser testing, device testing, participant testing, and clinician-rated reference data.

---

## 1. Scope

The reviewed RT build contains a browser-based Random Target Touch Test with two measurement modes:

1. **Cursor Mode** — mouse, trackpad, or touchscreen input
2. **Camera Mode** — webcam-based fingertip tracking using MediaPipe Hands

The default protocol uses five movements per hand and can run right hand, left hand, or both hands.

---

## 2. Structural checks completed

The following checks are suitable for static or code-level review:

- JavaScript syntax check should pass before deployment.
- HTML should contain no duplicate IDs.
- The module should load `index.html`, `styles.css`, `app.js`, and `test_scoring.js` from the RT directory.
- Documentation files should be present:
  - `README.md`
  - `METHODOLOGY.md`
  - `TASK-DESIGN-RATIONALE.md`
  - `VERIFICATION-REPORT.md`
- Screenshot placeholders should point to `docs/screenshots/`.
- Cursor Mode and Camera Mode should remain in one `app.js` file but be separated by function-level boundaries.

---

## 3. Behavior implemented in the current design

The current design includes:

- Cursor Mode calibration using a physical screen calibration bar.
- Camera Mode calibration using actual index-finger length.
- Four-step Camera Auto Calibration: Right, Left, Right, Left.
- Camera calibration average calculated from four measurements.
- User-facing camera calibration result shown only after the four measurements are complete.
- Cursor target generation separated from Camera target generation.
- Cursor Mode consecutive target distance set to at least 20 cm.
- Camera Mode consecutive target distance set to 30 cm.
- New targets generated at the beginning of each hand run.
- Right-hand and left-hand runs handled as separate hand runs.
- Right/left phase message before each hand test.
- Visual countdown before each run.
- Frame-timestamp-based time-inside calculation.
- Velocity-based arrival detection.
- Arrival-distance dysmetria score.
- Experimental post-arrival tremor score.
- SARA-aligned score based on last three valid dysmetria movements.
- Missing tracking not automatically converted into SARA score 4.
- Low camera FPS flag for tremor-confidence caution.
- CSV export of raw and summary values.

---

## 4. Manual development observations reported during testing

The following observations were made during development and should be treated as useful regression evidence, not formal validation:

- Camera Mode was reported to remain functional after the first function-level separation of Cursor and Camera logic.
- Camera calibration logs showed that measured index-finger pixel length changes with hand distance when tracking is stable.
- A sample four-step camera calibration produced a correct arithmetic average from individual pixels-per-centimeter values.
- Cursor Mode target spacing required separation from the original Camera Mode 30 cm logic.
- UI text size and phase-message wording required adjustment for readability.

These checks should be repeated in a clean browser session before release.

---

## 5. Current implementation limitations confirmed by review

- RT is not clinically validated.
- Current dysmetria and tremor thresholds are provisional engineering cutoffs.
- Camera and Cursor Mode values are not yet proven equivalent.
- Camera calibration depends on user-entered finger length and visible hand tracking.
- Camera pixels-per-centimeter changes with distance from the camera.
- Cursor calibration depends on display size, browser zoom, window size, and monitor scaling.
- Reaction time, time-inside, final-frame distance, tracking spikes, and measured FPS are exported but not clinically calibrated as SARA scoring inputs.
- Smoothness is currently present as a field but not a validated scored metric in the current SARA-aligned score.
- The experimental CeMoQu weighted score is distinct from the SARA-aligned dysmetria score.
- The current Camera Auto Calibration average does not by itself prove correct physical scaling across the full camera field.
- A successful target run does not prove clinical validity.

---

## 6. Browser and device verification still required

The following tests are required before treating the build as stable for supervised research use:

### General browser checks

1. Load the module over HTTPS or localhost.
2. Confirm all shared header fields load correctly.
3. Confirm mode switching does not leave old results visible.
4. Confirm settings are applied to the active test.
5. Confirm Start Test cannot run before required calibration.
6. Confirm CSV export works after Cursor Mode and Camera Mode runs.
7. Confirm layout on different screen sizes.
8. Confirm keyboard focus, contrast, and readability.

### Cursor Mode checks

1. Verify calibration bar measurement with a physical ruler.
2. Enter a known bar length and confirm pixels/cm changes accordingly.
3. Confirm Start Test is blocked before calibration verification.
4. Confirm target diameter appears physically reasonable after calibration.
5. Confirm consecutive targets are at least 20 cm apart where screen size permits.
6. Confirm target generation fails gracefully when the screen cannot fit the requested spacing.
7. Test mouse, trackpad, and touchscreen input separately.
8. Test browser zoom changes and window resizing.

### Camera Mode checks

1. Confirm camera permission allowed, denied, and revoked states.
2. Confirm Camera Mode starts and displays video correctly.
3. Confirm hand landmarks are detected.
4. Confirm index-finger length input affects pixels/cm calculation.
5. Confirm Auto Calibration runs four captures in the intended order.
6. Confirm the final average pixels/cm matches the four logged values.
7. Confirm intermediate values are not over-presented as final results.
8. Confirm Start Test is blocked until Camera Auto Calibration completes.
9. Confirm Camera Mode target distance remains 30 cm.
10. Confirm low FPS flag appears when frame rate is too low.
11. Test close-hand and far-hand calibration conditions.
12. Test lighting, camera angle, left/right hand visibility, and background clutter.

---

## 7. Measurement validation still required

- Compare Cursor Mode physical target size against ruler measurements.
- Compare Cursor Mode target spacing against ruler measurements.
- Compare Camera Mode pixels/cm against known physical distances at different camera depths.
- Confirm camera calibration repeatability across repeated Right/Left/Right/Left captures.
- Quantify how camera distance affects target size and movement scaling.
- Compare fingertip trajectories against manually annotated video.
- Compare arrival detection against human-reviewed movement offset.
- Evaluate tracking-spike filtering on real camera errors.
- Quantify frame-rate effects on tremor and hold-phase measures.
- Test healthy-control participants and ataxia participants separately.

---

## 8. Clinical and statistical validation still required

RT must not be presented as validated SARA scoring until the following are completed:

- Same-day clinician-rated official SARA Finger Chase scores.
- Blinded clinical reference ratings.
- Test–retest reliability.
- Inter-device reliability.
- Cursor-vs-Camera agreement analysis.
- Right-vs-left reliability and clinical interpretation.
- Healthy-control distribution.
- Cerebellar-ataxia severity distribution.
- Threshold calibration or replacement.
- Sensitivity to longitudinal change.
- Definition of clinically meaningful change.
- External validation on an independent cohort.

---

## 9. Questions requiring clinician/researcher decisions

- Should Cursor Mode and Camera Mode be reported together or separately?
- Should Camera Mode remain the primary research mode for SARA-aligned claims?
- Should Cursor Mode be interpreted as a separate touchscreen/cursor biomarker rather than a direct SARA proxy?
- Should reaction time become part of a future composite score?
- Should time-inside target become part of a future composite score?
- How should failed tracking be handled in clinical datasets?
- Should right and left hands be averaged, reported separately, or interpreted asymmetrically?
- Should target size and target distance be fixed or adjusted by device/screen constraints?
- Should Camera Auto Calibration reject high-variance captures automatically?
- What variance threshold should trigger re-calibration?

---

## 10. Screenshot checklist

The following screenshots should be added under `docs/screenshots/`:

- `rt-main-cursor-mode.png` — main RT screen with Cursor Mode selected
- `cursor-calibration-bar.png` — Cursor Mode calibration before verification
- `cursor-calibration-verified.png` — Cursor Mode verified state
- `camera-finger-length-input.png` — Camera Mode finger-length input
- `camera-auto-calibration-progress.png` — Auto Calibration progress/log
- `camera-calibration-average.png` — final average camera calibration result
- `right-hand-test-message.png` — right-hand phase message
- `countdown-overlay.png` — countdown screen
- `target-running.png` — active target trial
- `final-result.png` — final result screen
- `research-details.png` — RESEARCH tab scoring/config details
- `csv-export.png` — export buttons or exported CSV example

---

## 11. Current verification decision

The current RT build is suitable for supervised prototype testing and internal research-development use. It is **not verified for diagnostic use, clinical decision-making, or claims of validated SARA scoring accuracy**.

Advancement beyond provisional status requires browser/device testing, physical calibration checks, signal/trajectory validation, accessibility review, and clinical/statistical validation against clinician-rated SARA Finger Chase scores.
