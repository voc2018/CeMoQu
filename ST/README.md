# ST — Sitting Balance Test

**SARA Item 3: Sitting**

A webcam-based sitting balance assessment that uses MediaPipe Pose to track upper-body movement and estimate a SARA sitting score (0–4).

## How It Works

1. The user activates their webcam and calibrates using shoulder width (measured or estimated from monitor size).
2. A 10-second test begins after a 3-second countdown.
3. The app tracks the midpoint between the user's shoulders frame-by-frame.
4. After 10 seconds, the system computes sway metrics and assigns a SARA-based score.

## SARA Scoring Logic

| Score | Meaning |
|-------|---------|
| 0 | Normal — no sway detected |
| 1 | Slight intermittent sway, no support needed |
| 2 | Constant sway, maintains position without support |
| 3 | Needs intermittent support or large deviation detected |
| 4 | Cannot maintain sitting for 10 seconds |

Scoring is behaviour-based per the SARA 2006 criteria, not raw centimetre thresholds alone. The decision factors include:

- Duration achieved (full 10 s or not)
- Tracking continuity (whether the subject stayed in frame)
- Sway presence and type (intermittent vs. constant)
- Large deviation events (>10 cm)
- Support events (sudden shifts >8 cm between frames)

## Metrics

- **Max Sway (cm)** — maximum displacement from the mean position
- **Mean Sway (cm)** — average displacement from the mean position
- **Sway SD (cm)** — standard deviation of displacement
- **Sway Duty (%)** — percentage of frames where sway exceeds the threshold (1 cm)
- **Max Shift (cm)** — largest single-frame movement (support detection)
- **Support Events** — count of sudden large shifts indicating external support

## Calibration

Two methods are available:

- **Shoulder calibration** — the user holds still for 3 seconds while the app measures shoulder width in pixels, then converts using a known shoulder width (default 40 cm) to determine pixels-per-centimetre.
- **Monitor estimation** — estimates pixels-per-centimetre from the monitor's diagonal size.

## Test Protocol

- Sit upright on a firm surface
- No feet support (feet off the ground)
- Arms outstretched
- Eyes open
- Hold position for 10 seconds

## Data Export

The Research tab provides downloadable data per run and for the full session:

- **Frames CSV** — per-frame position data (x, y in pixels, tracking status)
- **Summary CSV** — per-run metrics and SARA score
- **Final CSV** — session-level score summary
- **Sway Chart PNG** — trajectory visualization
- **Score History Chart PNG** — score trend across runs

## Dependencies

- [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose.html) — body landmark detection
- [MediaPipe Camera Utils](https://google.github.io/mediapipe/solutions/camera_utils.html) — webcam frame pipeline
- [Chart.js 4.x](https://www.chartjs.org/) — score history chart

All dependencies are loaded via CDN. No build step required.

## File Structure

```
ST/
├── index.html   — page layout, UI elements, CDN script tags
├── app.js       — all logic (pose tracking, scoring, calibration, export)
└── styles.css   — module-specific styling
```
