# CeMoQu RT — Methodology

**Module:** RT — Random Target Touch / Digital Finger Chase  
**Build reviewed:** `RT091226`  
**Scope:** Measurement, calibration, target generation, trial timing, and scoring methodology

---

## 1. Measurement Overview

The RT module measures point-to-target upper-limb movement using either direct pointer input or webcam-based finger tracking.

The module has two measurement pipelines:

1. **Cursor Mode** — measures screen pointer movement.
2. **Camera Mode** — measures webcam-tracked index fingertip movement.

After each mode produces standardized `x, y, t` movement samples, both modes use the same analysis pipeline.

```text
Mode-specific measurement
→ standardized movement samples
→ trial-level analysis
→ hand-level summary
→ final right/left combined result
```

---

## 2. Cursor Mode Calibration

Cursor Mode converts screen pixels to centimeters using the physical calibration bar displayed on screen.

The user measures the orange calibration bar with a physical ruler and enters the measured length in centimeters.

The program calculates:

```text
cursor pixels/cm = calibration bar pixel width ÷ measured bar length in cm
```

This value is then used for:

- target diameter conversion
- target spacing conversion
- movement distance calculations
- trajectory analysis
- score-related centimeter measurements

Cursor Mode calibration must be verified before the test can begin.

![Screenshot needed: Cursor calibration bar and input](./docs/screenshots/cursor-calibration-before-verify.png)

---

## 3. Camera Mode Calibration

Camera Mode uses MediaPipe Hands to detect hand landmarks. The participant enters the actual index finger length in centimeters.

The index finger is measured in image pixels using MediaPipe landmarks for the index finger chain. The pixel length is divided by the actual finger length.

```text
camera pixels/cm = measured index finger length in px ÷ actual index finger length in cm
```

### 3.1 Four-step Auto Calibration

A single camera measurement can be unstable because hand distance, angle, landmark detection, and frame noise can affect the measured pixel length. Therefore Camera Mode uses four calibration captures:

```text
1. Right hand
2. Left hand
3. Right hand
4. Left hand
```

Each capture produces one `pixels/cm` value. The final camera calibration value is the arithmetic mean of the four values.

```text
average camera pixels/cm = (cal1 + cal2 + cal3 + cal4) ÷ 4
```

Only the final averaged calibration value should be used for the test. Intermediate values are useful for verification logs.

![Screenshot needed: Camera Auto Calibration open-palm instruction](./docs/screenshots/camera-auto-calibration-open-palm.png)

![Screenshot needed: Log showing four calibration values and final average](./docs/screenshots/log-camera-calibration-values.png)

### 3.2 Camera Calibration Quality Check

After the average pixels/cm value is calculated, the program checks whether the camera view has enough usable movement space for the target task. If the participant is too close to the camera, the view may not contain enough real-world movement distance.

When the usable space is insufficient, the user should move farther away and repeat Auto Calibration.

---

## 4. Target Generation

Target sets are generated before each hand run.

```text
Right hand run starts → generate right-hand targets
Left hand run starts  → generate left-hand targets
```

The module does not reuse the same target set across hands. Each hand run receives its own newly generated target sequence.

### 4.1 Cursor Mode Target Rule

Cursor Mode uses the calibrated screen scale and requires consecutive targets to be at least 20 cm apart.

```text
minimum cursor target spacing = 20 cm
```

This avoids target placements that are too close together on a touchscreen or mouse-based test.

### 4.2 Camera Mode Target Rule

Camera Mode preserves the camera movement rule:

```text
camera target movement distance = 30 cm
```

Camera target generation should be changed only carefully, because this mode depends on the webcam frame, MediaPipe coordinate mapping, and calibration.

---

## 5. Trial Timing

Each target is displayed for the configured target interval. The current default is:

```text
target interval = 2.0 seconds
```

The target window does not wait for the participant to arrive. The program advances according to the schedule.

Default sequence:

```text
Right-hand start message: 3 seconds
Countdown: 3, 2, 1
Target 1: 2 seconds
Target 2: 2 seconds
Target 3: 2 seconds
Target 4: 2 seconds
Target 5: 2 seconds
Left-hand start message: 3 seconds
Countdown: 3, 2, 1
Target 1: 2 seconds
...
Final result
```

![Screenshot needed: Right-hand start message](./docs/screenshots/rt-phase-message-right.png)

![Screenshot needed: Countdown overlay](./docs/screenshots/rt-countdown.png)

---

## 6. Recorded Data

For each frame/sample, the module can record:

- timestamp
- x coordinate
- y coordinate
- target index
- whether the point is inside the target
- missing-frame state for camera tracking

For each target trial, the module calculates or stores:

- final distance from target
- reaction time
- percent time inside target
- arrival point
- arrival-point distance from target
- post-arrival hold instability / tremor estimate
- measured frame rate
- missed trial status

---

## 7. Arrival Detection

The module attempts to distinguish the reaching phase from the post-arrival hold phase.

Arrival is detected by looking for the point after peak movement velocity where velocity drops below a small fraction of peak velocity and remains low for a minimum duration.

This avoids using the final frame as the arrival point when the participant continues moving after reaching the target area.

Conceptually:

```text
movement starts
→ velocity rises
→ peak velocity
→ velocity drops and stays low
→ arrival point
→ hold phase / tremor capture
```

---

## 8. Dysmetria Measurement

Dysmetria is measured as the distance from the target center at the detected arrival point.

```text
dysmetria = distance(target center, arrival point)
```

If no reliable arrival point is detected, dysmetria may be unavailable for that trial rather than substituting an arbitrary endpoint.

---

## 9. Tremor / Hold Instability Measurement

After arrival, the remaining portion of the target window is treated as the hold phase.

The module estimates instability during this phase by measuring movement around the held position. This is a CeMoQu extension beyond the original SARA Finger Chase item.

This measure should be reported separately from the SARA-aligned dysmetria score.

---

## 10. Scoring

The code keeps scoring thresholds in `RT_SCORING_CONFIG` inside `app.js`.

Current scoring components include:

- dysmetria score
- tremor / hold instability score
- weighted combined RT score

The module also keeps a Research UI weight control so the optional tremor component can be reduced or excluded.

Important principle:

```text
SARA-aligned interpretation = dysmetria-centered
CeMoQu research extension = dysmetria + tremor / hold instability
```

---

## 11. Right and Left Hand Summary

The module supports right hand, left hand, or both hands. The current default is both hands.

When both hands are tested:

```text
right-hand result
left-hand result
final combined result
```

The right and left hand tests should be kept visually and procedurally consistent.

---

## 12. Limitations

Current limitations:

- Camera Mode depends on lighting, camera angle, hand visibility, and MediaPipe landmark stability.
- Cursor Mode depends on screen size, browser zoom, and accurate physical measurement of the calibration bar.
- Camera calibration can vary when the hand is placed closer or farther from the camera.
- The current scoring system is provisional and should be clinically validated before being treated as a diagnostic tool.
- The module is intended for research and development, not independent clinical diagnosis.

---

## 13. Screenshot Locations Needed

Screenshots should be added at the placeholders above and stored in:

```text
RT/docs/screenshots/
```

Minimum methodology screenshots:

1. Cursor calibration bar and measurement input.
2. Camera Auto Calibration hand-open instruction.
3. Four camera calibration values in the log.
4. Right-hand start message.
5. Countdown overlay.
6. Active target screen.
7. Final result screen.
