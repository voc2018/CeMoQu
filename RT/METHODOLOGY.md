# RT Methodology

This document specifies **how RT turns cursor or camera movement into numerical measurements and scores**.

It is organized in two parts:

- **Part A** — how raw cursor/camera samples become movement measurements
- **Part B** — how those measurements become the provisional RT CMQ Score

> **These thresholds are engineering placeholders, not clinically validated cutoffs.** Current scoring configuration: `rt-scoring-v2`.

---

## Part A — from movement input to measurements

### A1. Mode-specific measurement pipelines

RT supports Cursor Mode and Camera Mode. They do not use the same measurement pipeline.

| Stage | Cursor Mode | Camera Mode |
|---|---|---|
| Input source | Mouse, trackpad, touchscreen pointer | Webcam fingertip tracking |
| Calibration source | On-screen calibration bar | Actual index-finger length |
| Coordinate source | Screen/canvas coordinates | Camera frame / MediaPipe landmarks |
| Movement distance | At least 20 cm between consecutive targets | Exactly 30 cm between consecutive targets |
| Target generation | Cursor-specific generator | Camera-specific exact-distance generator |

After either mode produces standardized `(x, y, timestamp)` samples, the same analysis functions are used.

### A2. Cursor Mode calibration

Cursor Mode uses a visible calibration bar on the screen.

1. The user measures the calibration bar with a physical ruler.
2. The user enters the measured value in centimeters.
3. The app calculates the screen scale:

```text
cursorPixelsPerCm = calibrationBarPixelWidth / enteredBarLengthCm
```

4. The value is used to convert all Cursor Mode distances between pixels and centimeters.

The verified Cursor Mode calibration is retained only during the current browser session. It is not intended to be trusted across a reopened page, changed browser zoom, changed monitor, changed window size, or changed display scaling.

### A3. Camera Mode calibration

Camera Mode uses the participant's actual index-finger length.

1. The user enters the actual index-finger length in centimeters.
2. The user clicks **Auto Calibration**.
3. The app asks the participant to open the palm and show the hand to the camera.
4. The app performs four calibration captures:

```text
1. Right hand
2. Left hand
3. Right hand
4. Left hand
```

For each calibration capture, the app collects MediaPipe hand-landmark samples and estimates the index-finger length in pixels. The capture returns a pixels-per-centimeter value:

```text
pixelsPerCmForCapture = measuredIndexFingerLengthPx / actualIndexFingerLengthCm
```

The four capture values are then averaged:

```text
cameraPixelsPerCm = (capture1 + capture2 + capture3 + capture4) / 4
```

Only the final average is shown to the user. Intermediate values are logged for development/debugging but are not intended to be the user-facing calibration result.

### A4. Target size

The setting labeled **Target diameter (cm)** is converted internally into a radius:

```text
targetRadiusCm = targetDiameterCm / 2
```

At runtime, the target radius is converted to pixels using the active mode's calibration scale:

```text
Cursor Mode: targetRadiusPx = targetRadiusCm × cursorPixelsPerCm
Camera Mode: targetRadiusPx = targetRadiusCm × cameraPixelsPerCm
```

The displayed circle should therefore reflect the current calibration and the selected target diameter.

### A5. Target generation

Targets are generated at the start of each hand run.

```text
Start Test
→ generate right-hand targets
→ run right-hand test
→ generate left-hand targets
→ run left-hand test
```

Targets are not meant to be reused across a new hand run.

#### Cursor Mode target generation

Cursor Mode uses `generateCursorTargets(...)`.

- Consecutive targets must be at least 20 cm apart.
- The algorithm uses the cursor/touchscreen working area.
- If the requested number of targets cannot fit at the required spacing, target generation fails instead of silently accepting shorter distances.

```text
minimumCursorDistancePx = 20 cm × cursorPixelsPerCm
```

#### Camera Mode target generation

Camera Mode uses `generateCameraTargets(...)`, which wraps the existing exact-distance target generator.

- Consecutive targets are generated at exactly 30 cm.
- Camera Mode preserves the original camera target-generation behavior as much as possible.
- Target centers are restricted to the upper portion of the frame so that the task remains visible and reachable within the camera layout.

```text
cameraDistancePx = 30 cm × cameraPixelsPerCm
```

### A6. Sampling and trial windows

Each target is active for the configured target interval, usually 2 seconds.

During each target window, the app records frame-level information:

```text
timestamp
x position
y position
inside target or outside target
hand
trial index
```

The target window is capped at the scheduled end time so that frame/timer jitter does not lengthen a trial beyond the configured interval.

### A7. Time inside target

Time inside target is calculated from actual frame timestamps, not by assuming a fixed frame rate.

For each interval between two samples:

```text
if the starting sample is inside the target:
    add that interval duration to timeInside
```

The final interval from the last sample to the scheduled end of the target window is handled the same way.

```text
percentTimeInside = timeInsideSeconds / totalTrialSeconds × 100
```

This is exported as a research metric. It is not currently part of the RT CMQ Score.

### A8. Reaction time

Reaction time is the time from target onset to the first valid sample inside the target.

```text
reactionTime = firstInsideTimestamp - targetStartTimestamp
```

If the pointer/fingertip never enters the target during the target window, reaction time is unavailable.

Reaction time is exported and displayed, but it is not currently part of the RT CMQ Score.

### A9. Arrival detection

Cursor Mode does not use arrival detection. Its point is the first press in the target window. A window with no press is a missed movement, and the trajectory image shows only the press point on the target.

Camera Mode uses the method below.

The scoring pipeline does not use the last frame as the primary dysmetria point. It estimates an **arrival point**: the moment when the movement stops reaching toward the target and enters the hold phase. If no stop is detected, the last frame of the target window is used and the trial is marked `arrivalDetected = 0`.

The current implementation finds arrival by velocity:

```text
arrival = first point after peak velocity where velocity falls to <= 8% of peak velocity
          and stays low for at least 100 ms
```

If no such point is detected, the last frame of the target window is used and `arrival_detected` is 0.

### A10. Dysmetria measurement

Dysmetria is measured at the arrival point:

```text
arrivalDistanceCm = distance(arrivalPoint, targetCenter) converted to cm
```

This value is the primary SARA-aligned Finger Chase metric in the current scoring configuration.

### A11. Post-arrival tremor measurement

After arrival is detected, the app analyzes the hold phase from the arrival point to the scheduled end of the target window.

The current tremor-related measure is the P95 radial deviation from the median hold position:

1. Collect post-arrival hold positions.
2. Compute the median hold `x` and median hold `y`.
3. Compute radial distance of each hold sample from that median hold position.
4. Use the 95th percentile radial distance.
5. Convert that pixel distance to centimeters.

This is exported as `tremor_cm`. It includes any slow correction toward the target. It is stored only and is not used in any score.

Two more values are stored and not scored: `hold_turn_count`, the number of direction reversals of at least 0.25 cm after the stop on the axis with more reversals, and `target_found`, whether the fingertip was inside the target at the stop or later in the window.

### A12. Tracking-spike filtering

Raw positions are retained for audit/export, but a filtered position sequence is used for measurement. Tracking spikes are removed before velocity, arrival, and tremor calculations.

The export records how many tracking outliers were removed and what percent of the usable sequence they represent.

### A13. Low-FPS flag in Camera Mode

Camera Mode records the measured frame rate. If measured camera FPS falls below the configured reliability threshold, tremor-related values are flagged as lower confidence rather than hidden.

Current threshold:

```text
minReliableFps = 20
```

---

## Part B — from measurements to the score

### B1. Current scoring configuration

Current configuration:

```text
version: rt-scoring-v2
arrival velocity threshold: 8% of peak velocity
arrival sustain time: 100 ms
hold turn tolerance: 0.25 cm
minimum reliable camera FPS: 20
```

### B2. Dysmetria severity conversion

Arrival distance in centimeters is converted to a 0–3 dysmetria score.

| Arrival distance | Dysmetria score |
|---|---:|
| < 1 cm | 0 |
| 1 to < 5 cm | 1 |
| 5 to < 15 cm | 2 |
| ≥ 15 cm | 3 |
| Missing / no arrival detected | Unavailable |

### B5. RT CMQ Score

The current RT CMQ Score is based on dysmetria from the last three tracked movements.

```text
RT CMQ Score = average(lastThreeDysmetriaScores)
```

The run is marked unavailable only if it is incomplete.

A finished run scores from the last three tracked movements. If 50% or more of the movements were not tracked, the hand scores 4 and `missed_count` is recorded. The app cannot tell a patient who could not move from a camera that lost the hand, so review these runs.

### B6. Worked example

Assume the final three tracked movements have arrival distances:

```text
Movement 3: 0.8 cm → dysmetria score 0
Movement 4: 3.2 cm → dysmetria score 1
Movement 5: 6.5 cm → dysmetria score 2
```

Then:

```text
RT CMQ Score = (0 + 1 + 2) / 3 = 1.00
```

### B7. Quality flags are not clinical validation

The module can detect technical conditions such as low FPS, missing tracking, and tracking spikes. These checks improve transparency, but they do not establish clinical validity.

Clinical validation still requires comparison with blinded Clinician-rated SARA Scores and repeated testing across participants, devices, and sessions.
