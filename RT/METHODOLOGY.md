# RT Methodology

This document specifies **how RT turns cursor or camera movement into numerical measurements and scores**.

It is organized in two parts:

- **Part A** — how raw cursor/camera samples become movement measurements
- **Part B** — how those measurements become the provisional SARA Finger Chase estimate

> **These thresholds and weights are engineering placeholders, not clinically validated cutoffs.** Current scoring configuration: `rt-scoring-v1`.

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

This is exported as a research metric. It is not currently part of the final SARA Finger Chase score.

### A8. Reaction time

Reaction time is the time from target onset to the first valid sample inside the target.

```text
reactionTime = firstInsideTimestamp - targetStartTimestamp
```

If the pointer/fingertip never enters the target during the target window, reaction time is unavailable.

Reaction time is exported and displayed, but it is not currently part of the final SARA Finger Chase score.

### A9. Arrival detection

The scoring pipeline does not use the last frame as the primary dysmetria point. Instead, it estimates an **arrival point**: the moment when the movement stops reaching toward the target and enters the hold phase.

The current implementation finds arrival by velocity:

```text
arrival = first point after peak velocity where velocity falls to <= 8% of peak velocity
          and stays low for at least 100 ms
```

If no such point is detected, arrival-based dysmetria is unavailable for that target.

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

This is exported as `tremor_cm` and contributes to the experimental weighted CeMoQu score when available.

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
version: rt-scoring-v1
arrival velocity threshold: 8% of peak velocity
arrival sustain time: 100 ms
dysmetria weight: 60%
tremor weight: 40%
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

### B3. Tremor severity conversion

Post-arrival P95 radial deviation is converted to a 0–3 tremor score.

| P95 radial deviation | Tremor score |
|---|---:|
| < 1 cm | 0 |
| 1 to < 2 cm | 1 |
| 2 to < 5 cm | 2 |
| ≥ 5 cm | 3 |
| Missing hold phase | Unavailable |

### B4. Experimental CeMoQu weighted target score

When both dysmetria and tremor are available:

```text
weightedTargetScore = round(dysmetriaScore × 0.60 + tremorScore × 0.40)
```

If tremor is unavailable but dysmetria is available, the target can still retain the dysmetria score rather than failing the entire target.

### B5. SARA-aligned Finger Chase score

The current SARA-aligned Finger Chase score is based on dysmetria from the last three valid movements.

```text
SARA Finger Chase Score = average(lastThreeDysmetriaScores)
```

The run is marked unavailable if:

- the run is incomplete,
- hand tracking is missing,
- or arrival cannot be detected for all required final movements.

Missing automated measurements are **not** automatically converted into SARA score 4. That category should not be assigned by the browser solely because tracking failed.

### B6. Worked example

Assume the final three valid movements have arrival distances:

```text
Movement 3: 0.8 cm → dysmetria score 0
Movement 4: 3.2 cm → dysmetria score 1
Movement 5: 6.5 cm → dysmetria score 2
```

Then:

```text
SARA Finger Chase Score = (0 + 1 + 2) / 3 = 1.00
```

If the same movements have tremor scores:

```text
Movement 3: tremor score 0
Movement 4: tremor score 1
Movement 5: tremor score 2
```

Then the experimental weighted scores for each target are:

```text
Movement 3: round(0×0.60 + 0×0.40) = 0
Movement 4: round(1×0.60 + 1×0.40) = 1
Movement 5: round(2×0.60 + 2×0.40) = 2
```

These weighted scores are useful for research comparison but must not be presented as clinically validated SARA scoring.

### B7. Quality flags are not clinical validation

The module can detect technical conditions such as low FPS, missing tracking, and tracking spikes. These checks improve transparency, but they do not establish clinical validity.

Clinical validation still requires comparison with blinded clinician-rated SARA Finger Chase scores and repeated testing across participants, devices, and sessions.
