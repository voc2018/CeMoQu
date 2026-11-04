# LD Methodology

This document specifies **every method used to turn a line-drawing trial into numbers**, in two parts:

- **Part A** — how cursor/touch movement becomes raw measurements
- **Part B** — how those measurements become the current provisional 0–4 LD score

Everything described here follows the current browser implementation in `app.js`.

> **These thresholds and rules are engineering placeholders, not clinically validated cutoffs.** The current LD score should be treated as a provisional research estimate only.

---

## Part A — from drawing movement to measurements

### A1. Canvas coordinate system

The LD canvas uses a fixed internal coordinate system:

```text
Internal canvas width  = 1000
Internal canvas height = 700
```

The browser may display the canvas at a different physical size. Pointer coordinates are therefore converted from browser screen coordinates into the canvas's internal coordinate system before any measurement is calculated.

The conversion uses the current canvas bounding rectangle:

```text
scaleX = canvas.width  / displayedCanvasWidth
scaleY = canvas.height / displayedCanvasHeight

x_internal = (clientX - canvasLeft) × scaleX
y_internal = (clientY - canvasTop)  × scaleY
```

All drawing, deviation, start/finish detection, and export values are first computed in this internal coordinate space.

### A2. Calibration

The user measures the orange calibration bar with a physical ruler and enters the measured length in centimeters.

The app measures two displayed widths live:

```text
barCssWidth          = displayed width of the calibration bar in CSS pixels
canvasDisplayWidth   = displayed width of the canvas in CSS pixels
```

It then computes:

```text
cmPerCssPx = measuredCm / barCssWidth
canvasCssPxPerInternalUnit = canvasDisplayWidth / 1000

cmPerPixel = cmPerCssPx × canvasCssPxPerInternalUnit
pixelsPerCm = 1 / cmPerPixel
```

This is important because the canvas is responsive. The score is not based on raw CSS pixels alone; it is based on the canvas's internal coordinate units converted back to real-world centimeters through calibration.

![Calibration verification](docs/screenshots/ld-calibration-verified.png)

### A3. Test geometry

Each test places an **S** start box and an **F** finish box. The current box size is:

```text
BOX = 36 internal canvas units
```

The available test modes define the start and finish positions:

| Test mode | Start/finish geometry |
|---|---|
| Horizontal | Left-to-right line through the vertical center |
| Vertical | Top-to-bottom line through the horizontal center |
| Diagonal 1 | Upper-left to lower-right |
| Diagonal 2 | Lower-left to upper-right |

The current guided audio sequence is implemented for the horizontal test.

### A4. Trial start and timing

For the guided horizontal sequence, each trial begins only after the recorded prompt reaches the `GO` cue. The app uses cue timestamps measured from the supplied audio files and also displays the countdown visually.

At `GO`:

1. The trial state is reset.
2. The timer starts.
3. The participant may begin drawing.
4. Drawing must begin inside the **S** box.

The timer stops when the pointer first reaches the **F** box.

### A5. Pointer sampling and trace recording

During an active trial, pointer movement is recorded while the user is pressing and moving the pointer/touch input. Each continuous press creates a trace segment.

The app records:

- pointer coordinates
- line segments between consecutive points
- whether the trial started correctly
- whether the finish marker was reached
- whether the user released and restarted drawing
- whether the pointer left the canvas during the active trial

A new press after the first active press counts as a discontinuity.

### A6. Deviation from the ideal line

For every recorded movement point, the app computes the perpendicular distance from the point to the ideal line between the center of **S** and the center of **F**.

For non-vertical lines, the guide line is represented as:

```text
y = m(x - sx) + sy
```

The point-to-line distance is computed using the standard line-distance formula:

```text
deviationPx = |a×x + b×y + c| / sqrt(a² + b²)
```

For a vertical guide line, deviation is the horizontal distance from the line:

```text
deviationPx = |x - sx|
```

Each deviation value is stored in `deviationSamples`.

### A7. P95, mean, and maximum deviation

The module currently computes three deviation summaries:

```text
maxDeviationPx  = maximum of all deviation samples
meanDeviationPx = average of all deviation samples
p95DeviationPx  = 95th percentile of all deviation samples
```

Each is converted to centimeters using:

```text
deviationCm = deviationPx × cmPerPixel
```

The current score uses **P95 deviation** only.

### A8. Deviation area

The app estimates the accumulated area between the drawn trace and the guide line. For each movement segment, it multiplies the deviation at the new point by the segment length:

```text
segmentLengthPx = distance between consecutive pointer points
areaPx2 += deviationPx × segmentLengthPx
```

The area is converted to square centimeters:

```text
areaCm2 = areaPx2 × cmPerPixel × cmPerPixel
```

This value is currently research/export only.

### A9. Direction changes

The module records sustained direction reversals separately for horizontal and vertical movement.

The current direction-change threshold is controlled by the **Tolerance (cm)** input:

```text
thresholdPx = toleranceCm × pixelsPerCm
```

A direction reversal is counted only after movement in the opposite direction accumulates at least this threshold. Small fluctuations below the threshold are ignored so minor pointer noise is less likely to be counted as a turn.

Current outputs:

- `verticalTurns`
- `horizontalTurns` / `horizontalReverses`

These values are currently research/export only.

### A10. Start fails, discontinuities, out-of-bounds, and ending a trial

- **Start fail:** a press outside S before the trial begins.
- **Discontinuity:** a press after a lift during the trial. Each stroke is measured on its own for scoring.
- **Out-of-bounds:** the hand leaves the canvas while pressed. A lift or a released mouse leaving the canvas is not counted.
- **Rejoin:** after a lift or after leaving the canvas, drawing continues from the new touch. No attempt is voided.
- **Rejoin jump:** the distance from the end of one stroke to the start of the next is stored in `rejoin_jumps_cm` and `rejoin_jump_max_cm`. It is not used in the score. It is not scored and the same test runs again. Voids are stored in `voided_attempts`.
- **End boundary:** the dashed line across the guide line at the near edge of the F box. Crossing it anywhere ends the trial, so the path does not need to enter F.
- **Clock:** the horizontal test starts timing at GO. Other modes start timing when S is pressed.

### A11. Raw data

Each trial keeps `t_ms`, `x`, `y` and `event` (`down`, `move`, `up`, `leave`) in canvas units. **Export Raw** downloads them with `test_mode`, start and finish positions, `pixels_per_cm`, tolerance and scoring version, which is enough to recalculate the score.

---

## Part B — from measurements to the provisional 0–4 LD score

Scoring lives in `scoring.js` (`ld-scoring-v2`) and is tested by `test_scoring.js`.

### B1. Scoring basis

The score uses **turn amplitude** only, which is the closest digital measure to the tremor size a clinician judges in SARA Nose-Finger. SARA defines the 2 cm and 5 cm cut-offs. It does not define a turn amplitude, so this mapping is a CeMoQu adaptation to be compared with clinician scores.

A distance from the guide line was not used because a path that runs steadily beside the line shows distance without tremor.

### B2. Turn amplitude

1. Each point becomes a signed distance across the guide line.
2. A turn is a reversal of that distance by at least the Tolerance. Smaller movements are not turns.
3. Each stroke is measured on its own, so a jump after a lift is never an amplitude. Amplitude is the height from one turn to the next. With one turn, the two legs on each side of it are used, keeping those that reach the Tolerance.
4. With 3 or more amplitudes, the largest 5% are removed, rounded up.
5. Mean and median are both stored. The mean sets the score.

Tolerance is held for the whole trial and stored with it.

### B3. Score mapping

```text
if a reason code applies:  score = 4
else if no turn:           score = 0
else if mean < 2 cm:       score = 1
else if mean < 5 cm:       score = 2
else:                      score = 3
```

| Code | Meaning | Limit |
|---|---|---|
| SF | Start Fail | 3 failed presses in a row |
| TO | Time Out | End boundary not crossed in 30 s |
| OB | Out of Bounds | 3 or more |
| DC | Discontinuity | 10 or more |

The Tolerance and the limits in this table are provisional, to be set by a clinician. DC can also appear with small tremor, so those trials need review. Forward-and-back tremor cannot be measured on a flat screen; lifts are recorded so it can enter the score if depth becomes measurable.

Calibration is required before Start Test, so a missing calibration cannot produce a score.

### B4. Metrics not used in scoring

These are calculated and stored for later comparison with clinician ratings:

- P95, mean and max deviation
- deviation area
- turn amplitude median
- vertical turns and horizontal reverses
- discontinuity, out-of-bounds and start fail counts below their limits
- rejoin jump distances
- duration

### B5. Data export

The CSV export includes:

- participant/session metadata
- test mode and trial number
- timestamp
- duration
- calibration values
- tolerance
- discontinuities
- vertical turns
- horizontal reverses
- out-of-bounds
- start fails
- max/mean/P95 deviation in px and cm
- deviation area in px² and cm²
- CMQ score and label
- success flag
- scoring version, tolerance, turn count, turn amplitude mean and median, reason code, rejoin jumps, start and end times

`Submit Data` sends every completed trial through `shared/upload.js`. Each trial becomes one row in the `LD_v2` tab, with its raw CSV and trajectory PNG stored in Google Drive.
