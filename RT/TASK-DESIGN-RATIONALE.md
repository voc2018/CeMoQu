# CeMoQu RT — Task Design Rationale

**Module:** RT — Random Target Touch / Digital Finger Chase  
**Build reviewed:** `RT091226`  
**Purpose:** Explain why the task is designed this way and document current design decisions.

---

## 1. Why This Task Exists

Traditional ataxia motor assessment often depends on in-person clinical observation. CeMoQu RT is designed to move part of this assessment into a browser-based quantitative format.

The task asks the participant to move toward visual targets using either:

- direct cursor/touch input, or
- webcam-tracked index finger movement.

This allows repeated measurement of coordination, reaction, accuracy, and movement stability without specialized clinical hardware.

---

## 2. Why There Are Two Modes

RT supports both Cursor Mode and Camera Mode because the two modes serve different testing contexts.

| Mode | Main use | Strength | Limitation |
|---|---|---|---|
| Cursor Mode | Touchscreen, mouse, trackpad | Simple, stable, no camera needed | Depends on screen calibration |
| Camera Mode | Webcam-based finger tracking | More similar to hand movement in space | Depends on camera distance, lighting, and hand detection |

The modes should not share measurement-specific logic because their coordinate systems and calibration sources are different.

---

## 3. Why Measurement Is Separated but Analysis Is Shared

Cursor Mode and Camera Mode are separated for calibration and target generation, but the final analysis pipeline is shared.

This is intentional.

```text
Different input methods
→ same standardized movement sample format
→ same analysis method
```

This design reduces accidental cross-mode bugs while preserving comparable output metrics.

---

## 4. Why Cursor Mode Uses 20 cm Target Spacing

Camera Mode originally used a 30 cm movement distance. This is often too large for Cursor Mode because the usable touchscreen or browser area may be limited.

Therefore Cursor Mode uses:

```text
minimum target spacing = 20 cm
```

This distance is large enough to avoid targets appearing immediately next to each other, but more practical for screen-based interaction.

Cursor Mode uses “at least 20 cm” rather than “exactly 20 cm” because the available screen area may restrict possible placements.

---

## 5. Why Camera Mode Keeps 30 cm Movement

Camera Mode retains the 30 cm target movement rule because the webcam task is intended to approximate a larger physical pointing motion.

Changing Camera Mode distance should be done carefully because it affects:

- field-of-view requirements
- participant distance from camera
- calibration pass/fail behavior
- comparability with previous Camera Mode tests

Camera Mode was built through extensive iteration and should be treated as a protected pipeline.

---

## 6. Why Camera Calibration Uses Four Captures

A single webcam-based finger measurement can be unreliable. The measured pixel length of the finger changes when:

- the hand is closer or farther from the camera
- the palm angle changes
- landmarks jitter
- part of the hand leaves the frame
- the participant moves during capture

For this reason, Camera Mode uses four captures:

```text
Right → Left → Right → Left
```

The final calibration value is the average of the four `pixels/cm` values.

This provides a more stable scale than relying on one measurement.

![Screenshot needed: Camera calibration log with four captures and average](./docs/screenshots/log-camera-calibration-values.png)

---

## 7. Why Intermediate Calibration Values Are Logged

Intermediate Camera calibration values are logged so developers and researchers can verify whether the measured hand scale changes when the hand is moved closer or farther from the camera.

Example log fields:

```text
measured finger length: ___ px
actual finger length: ___ cm
pixels/cm: ___
samples: ___
range: ___–___ px
```

This is useful for debugging, but the user-facing flow should not overload the participant with unnecessary technical details.

---

## 8. Why Start Test Requires Calibration

The module must not start testing before calibration is complete.

Without calibration:

- target diameter in cm cannot be displayed correctly
- target spacing in cm cannot be enforced
- movement error in cm cannot be calculated reliably
- final scores may be misleading

Therefore:

```text
Cursor Mode: Verify Calibration first
Camera Mode: Auto Calibration first
Then Start Test
```

---

## 9. Why Calibration Is Session-specific

Calibration should not be trusted permanently across sessions.

Reasons:

- monitor size can change
- browser zoom can change
- window size can change
- camera position can change
- participant distance from camera can change
- operating system display scaling can change

The safest policy is:

```text
Newly opened RT page → recalibrate
Same open page/session → may reuse calibration while switching modes
```

---

## 10. Why Right and Left Hands Are Tested Sequentially

The default protocol tests both hands because ataxia symptoms and coordination deficits can differ between sides.

The module runs:

```text
Right hand test
→ Left hand test
→ final combined result
```

The target set is regenerated for each hand run so that one side is not simply repeating the exact same screen locations.

---

## 11. Why the Start Message Is Short

The hand-start message is intentionally simple:

```text
The right-hand test will begin.
The left-hand test will begin.
```

Earlier versions included “Please use your right hand,” but this was removed to reduce visual clutter. The right/left meaning is already communicated by the test sequence.

The current phase message design:

```text
font size: 13px
visible duration: 3 seconds
```

---

## 12. Why Countdown Is Visual

The 3, 2, 1 countdown is shown visually so the task is usable even when audio is unavailable or the participant has hearing difficulty.

The countdown also standardizes the start moment across trials.

![Screenshot needed: Countdown overlay](./docs/screenshots/rt-countdown.png)

---

## 13. Why Results Separate SARA-aligned and CeMoQu Extension Concepts

SARA Finger Chase is primarily concerned with dysmetria. CeMoQu RT also captures post-arrival instability/tremor-like behavior during the target window.

These should be conceptually separated:

```text
SARA-aligned measure: dysmetria / target accuracy
CeMoQu extension: tremor or hold instability after arrival
```

This separation helps avoid overstating the clinical validity of the experimental digital extension.

---

## 14. Future Design Questions

The following items should be discussed with clinicians or validated experimentally:

1. Whether Cursor Mode 20 cm spacing should remain fixed or become configurable.
2. Whether Camera Mode should keep 30 cm distance for all screen/camera setups.
3. Whether Camera calibration should use mean, median, or outlier-rejected average across the four captures.
4. Whether right and left hand calibration should be averaged together or tracked separately.
5. Whether target generation should avoid repeated visual patterns more aggressively.
6. Whether post-arrival instability should contribute to a SARA-like score or remain a separate CeMoQu metric.
7. Whether the current arrival-detection threshold is robust across patients with severe tremor or very slow movement.

---

## 15. Required Screenshots for This Document

Add these screenshots:

1. `log-camera-calibration-values.png` — four-step calibration log.
2. `rt-countdown.png` — visual countdown.
3. `rt-running-target-test.png` — active target display.
4. `final-result-overlay.png` — final result screen.
