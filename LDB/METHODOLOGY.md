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

### A10. Start fails, discontinuities, and out-of-bounds

The app records three task-quality or motor-control events:

| Event | How it is counted |
|---|---|
| Start fail | Pointer press occurs outside **S** before the trial is active |
| Discontinuity | New pointer press occurs after drawing has already started |
| Out-of-bounds | Pointer leaves the canvas during an active, unfinished trial |

These values are displayed and exported but do not currently affect the score.

---

## Part B — from measurements to the provisional 0–4 LD score

### B1. Current scoring basis

The current LD score is calculated from:

```text
p95DeviationCm
```

Only P95 deviation is used because it reflects sustained tracing error while reducing the effect of a single extreme outlier.

### B2. Score mapping

```text
if trial incomplete or calibration not verified:
    score = 4
else if p95DeviationCm < 0.5:
    score = 0
else if p95DeviationCm < 2.0:
    score = 1
else if p95DeviationCm <= 5.0:
    score = 2
else:
    score = 3
```

| P95 deviation | Score | Label |
|---:|---:|---|
| `< 0.5 cm` | 0 | Normal |
| `0.5–<2.0 cm` | 1 | Mild |
| `2.0–5.0 cm` | 2 | Moderate |
| `> 5.0 cm` | 3 | Severe |
| Incomplete trial or unverified calibration | 4 | Unable to perform |

### B3. Worked examples

**Example 1 — accurate tracing**

```text
p95DeviationCm = 0.32
score = 0 — Normal
```

**Example 2 — moderate deviation**

```text
p95DeviationCm = 3.40
score = 2 — Moderate
```

**Example 3 — incomplete or uncalibrated trial**

```text
success = false
or calibrationVerified = false
score = 4 — Unable to perform
```

### B4. Metrics not currently used in scoring

The following values are displayed and exported but do not currently change the score:

- max deviation
- mean deviation
- deviation area
- discontinuities
- vertical turns
- horizontal reverses
- out-of-bounds count
- start fails
- duration

This is an intentional prototype design decision. These metrics may later be added to a multi-metric LD score after validation against clinician-reviewed data.

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
- LD score and label
- success flag

The current `Submit Data` path packages the current trial in a Google-Sheets-compatible payload using the configured Google Apps Script URL.
