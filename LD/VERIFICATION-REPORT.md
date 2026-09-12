# LD Verification Report

**Verification date:** 2026-09-12  
**Build reviewed:** `LD(3).zip`  
**Module:** LD — Line Drawing Test  
**Status:** Conditional research-prototype verification — not clinical validation

This report separates what has been checked from what still requires real-browser, device, participant, and clinical validation. A code review or successful local run is not clinical validation.

## 1. Scope

The reviewed LD build contains:

1. A browser-based line drawing canvas
2. Horizontal, vertical, and diagonal test modes
3. A five-trial guided horizontal sequence with recorded audio prompts
4. Physical on-screen calibration using an orange calibration bar
5. Live result display
6. CSV export
7. Current-trial submission through a configured Google Apps Script endpoint

## 2. Automatically checked from the current build

The following items were confirmed from the source structure and implementation:

- The LD folder contains `index.html`, `styles.css`, `app.js`, `ld-interface.png`, and the guided horizontal audio files.
- The page loads shared CeMoQu header and common style files from `../shared/`.
- The internal canvas coordinate system is `1000 × 700`.
- The current start/finish marker box size is `36` internal units.
- The available test modes are horizontal, vertical, diagonal 1, and diagonal 2.
- The guided recorded sequence is implemented for the horizontal test.
- Horizontal guided testing uses five trials.
- The visible countdown is synchronized to measured cue times from the audio files.
- Timer start is tied to the `GO` cue.
- Calibration must be verified before valid testing.
- Calibration computes `cmPerPixel` and `pixelsPerCm` from the measured calibration bar and current displayed canvas width.
- P95 deviation, max deviation, mean deviation, and deviation area are computed.
- Direction-change counting uses the tolerance value as a sustained-reversal threshold.
- Start fails, discontinuities, and out-of-bounds events are tracked.
- The current score is based on P95 deviation only.
- Incomplete trials or unverified calibration map to score `4 — Unable to perform`.
- CSV export includes metadata, calibration values, duration, deviation metrics, movement-event counts, score, label, and success status.
- The `Submit Data` path prepares and sends a Google-Sheets-style payload using the configured Apps Script URL.

## 3. Current scoring configuration confirmed

| Condition | Score | Label |
|---|---:|---|
| P95 deviation `< 0.5 cm` | 0 | Normal |
| P95 deviation `0.5–<2.0 cm` | 1 | Mild |
| P95 deviation `2.0–5.0 cm` | 2 | Moderate |
| P95 deviation `> 5.0 cm` | 3 | Severe |
| Incomplete trial or unverified calibration | 4 | Unable to perform |

Current scoring basis:

```text
P95 deviation in centimeters only
```

The following are exported but not currently used in the score:

- max deviation
- mean deviation
- deviation area
- discontinuities
- vertical turns
- horizontal reverses
- out-of-bounds
- start fails
- duration

## 4. Current implementation limitations confirmed by review

- The score thresholds are provisional engineering cutoffs, not validated clinical thresholds.
- The current score depends only on P95 deviation.
- Other potentially important movement features are not yet included in the score.
- Calibration depends on accurate physical measurement of an on-screen bar.
- Calibration may be affected by browser zoom, screen size, display scaling, and layout changes.
- Horizontal recorded guidance is implemented, but vertical and diagonal modes do not have the same complete audio-guided sequence.
- The app records pointer/touch movement, not direct limb kinematics.
- Pointer device type, touch latency, browser event frequency, and hardware sampling behavior may affect measurements.
- `localStorage` is used for calibration persistence in the current build; the project should decide whether calibration should be session-only or persistent.
- The Google Apps Script endpoint is hard-coded in the current source and should be handled carefully before public release.

## 5. Real-browser and device verification still required

Test over HTTPS or localhost. Do not rely only on `file://` opening.

1. Verify shared-header loading and all participant/session fields.
2. Verify the canvas, right-side panel, scrolling, and responsive layout on different screen sizes.
3. Test browser zoom levels such as 80%, 100%, 125%, and 150%.
4. Test calibration with physical rulers on multiple displays.
5. Confirm that recalibration changes `pixelsPerCm`, `cmPerPixel`, and displayed cm metrics correctly.
6. Confirm that Start Test is blocked when calibration is not verified.
7. Confirm timer start occurs at visible/audible `GO`.
8. Confirm five horizontal trials run in order with the correct audio prompts.
9. Confirm drawing begins only from the **S** marker and completes only at **F**.
10. Confirm start fails, discontinuities, and out-of-bounds counts under deliberate test cases.
11. Confirm P95, max, mean, and area values change as expected for known drawn paths.
12. Export CSV and inspect commas, Unicode, quotation marks, line endings, filenames, and numeric precision.
13. Test mouse, trackpad, touch screen, and stylus if they are intended supported inputs.
14. Test current Chrome and Edge on Windows/macOS and any Safari, Firefox, Android, or iOS environments the project intends to claim.

## 6. Suggested manual verification cases

| Test case | Expected behavior |
|---|---|
| Press Start Test before calibration | Testing blocked; calibration warning shown |
| Enter invalid calibration length | Calibration rejected |
| Draw close to the line | Low P95 deviation and lower score |
| Draw far from the line | Higher P95 deviation and higher score |
| Make one brief spike but otherwise trace well | Max deviation high; P95 less affected |
| Release and press again mid-trial | Discontinuity count increases |
| Press outside S before starting | Start fail count increases |
| Move pointer outside canvas mid-trial | Out-of-bounds count increases |
| Draw with repeated up/down corrections | Vertical turn count increases after tolerance threshold |
| Complete all five horizontal trials | Sequence ends and controls unlock |

## 7. Signal and measurement validation still required

- Compare exported traces against manually reviewed traces.
- Confirm P95 deviation implementation using known synthetic or hand-drawn paths.
- Quantify effect of pointer device type and event sampling rate.
- Quantify effect of screen size, browser zoom, and display scaling.
- Determine whether P95, mean, max, area, discontinuities, turns, reverses, and duration are reliable across repeated trials.
- Estimate within-session and between-session measurement error.

## 8. Clinical and statistical validation still required

- Healthy-control and cerebellar-ataxia cohorts across intended age and severity ranges
- Same-day clinician-rated comparison using the agreed SARA upper-limb coordination reference protocol
- Test–retest reliability
- Left/right hand reliability if hand-specific scoring is added
- Concurrent validity against clinician-rated motor impairment
- Sensitivity to longitudinal change
- Calibration or replacement of current P95 thresholds
- Decision on whether additional metrics should be included in the score
- External validation on an independent cohort

## 9. Questions requiring clinician and research-team decisions

- Is P95 deviation the correct primary measure for this task?
- Should max deviation, mean deviation, deviation area, discontinuities, turns, reverses, or duration affect the score?
- Should thresholds be fixed, age-adjusted, device-adjusted, or task-mode-specific?
- Should horizontal, vertical, and diagonal tasks share one score model or use separate scoring models?
- Should right and left hands be tested separately and then combined?
- Should calibration be stored persistently, session-only, or always repeated?
- What tolerance value best separates intentional/sustained correction from pointer noise?
- How should incomplete trials be handled: score 4, unavailable, or separate failure label?

## 10. Screenshots needed

Place final screenshots in `docs/screenshots/` using these filenames:

```text
docs/screenshots/ld-interface-overview.png
docs/screenshots/ld-calibration-panel.png
docs/screenshots/ld-calibration-verified.png
docs/screenshots/ld-countdown-go.png
docs/screenshots/ld-running-trace.png
docs/screenshots/ld-results-panel.png
docs/screenshots/ld-export-csv.png
docs/screenshots/ld-definition-popup.png
```

## 11. Current verification decision

The current LD build is suitable for supervised research-prototype testing and internal development review. It is **not verified for diagnostic use, clinical decision-making, or claims of validated SARA scoring accuracy**. Advancement beyond provisional status requires the real-browser, device, signal-measurement, accessibility, and clinical/statistical validation work listed above.
