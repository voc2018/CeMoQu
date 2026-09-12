# CeMoQu — Cerebellar Motor Quantification

**CeMoQu** is a browser-based research platform for quantitative assessment of movement, speech, and coordination features relevant to **cerebellar ataxia**.

The platform extends selected concepts from the **Scale for the Assessment and Rating of Ataxia (SARA)** into standardized digital tasks that can be performed with common consumer devices. Each module records continuous quantitative measurements that can support repeated assessment, longitudinal research, and future digital-biomarker development.

> **Research use only.** CeMoQu is not a diagnostic tool and does not replace clinician-administered SARA assessment or medical judgment. Current scoring methods are provisional and require clinical validation.

![CeMoQu Home](langding.png)

## Live System

**https://cemoqu.com**

No installation is required for participants. The tests run directly in a modern web browser.

## Current Modules

CeMoQu currently includes four browser-based assessment modules.

| Module | Test | Input | Main measurements |
|---|---|---|---|
| **SD** | Speech Disturbance Test | Microphone | Sustained phonation, pitch stability, speech rhythm, pause ratio, reading accuracy, speaking rate |
| **RT** | Random Target Touch Test | Mouse, touch, or webcam | Reaction time, final positional error, time inside target, tremor, movement smoothness |
| **LD** | Line Drawing Test | Mouse or touch | Completion time, path deviation, discontinuities, corrective turns, out-of-bounds events, start failures |
| **ST** | Sitting Balance Test | Webcam | Upper-body sway, maximum/mean sway, sway variability, sway duty, tracking continuity |

### SD — Speech Disturbance Test

The Speech Disturbance module uses three standardized tasks:

- **Sustained “Ah”**
- **Pa-ta-ka repetition**
- **Reading passage**

The module extracts quantitative speech features and produces a provisional **0–6 speech severity estimate**. Accepted recordings and session measurements can be reviewed and exported for research.

### RT — Random Target Touch Test

The Random Target Touch module is inspired by the movement logic of the **SARA Finger Chase** item.

It supports:

- **Cursor Mode** — mouse, trackpad, or touchscreen
- **Camera Mode** — webcam-based fingertip tracking

The current workflow tests the **right hand and left hand sequentially** and records movement features including final error, reaction time, time inside the target, tremor, and smoothness. The module produces a provisional **SARA Finger Chase Score** and preserves the underlying measurements for research analysis.

### LD — Line Drawing Test

The Line Drawing module asks the participant to trace a guide line from **S (Start)** to **F (Finish)**.

The current guided workflow uses repeated horizontal trials with audio instructions and a visible countdown. The module measures:

- Duration
- Start failures
- Mean deviation
- P95 deviation
- Maximum deviation
- Deviation area
- Discontinuities
- Corrective turns/reversals
- Out-of-bounds events

The current provisional score is primarily based on **P95 path deviation**.

### ST — Sitting Balance Test

The Sitting Balance module uses a standard webcam and pose tracking to follow shoulder position during unsupported sitting.

It measures upper-body sway over time, including:

- Maximum sway
- Mean sway
- Sway standard deviation
- Sway duty
- Maximum positional shift
- Tracking loss and support-related events

The module produces a provisional **0–4 sitting-balance score** and supports per-run and session-level research exports.

## Design Principles

CeMoQu is being developed around several core principles:

- **Accessible** — runs in a web browser without specialized laboratory equipment
- **Quantitative** — preserves continuous measurements rather than only categorical ratings
- **Repeatable** — supports standardized tasks that can be repeated over time
- **Transparent** — exposes the measurements used to generate provisional scores
- **Modular** — movement, speech, and balance tasks are maintained as separate modules with a shared interface
- **Research-oriented** — raw and derived measurements can be exported for validation and future analysis

## Repository Structure

```text
CeMoQu/
├── index.html
├── langding.png
│
├── shared/
│   ├── common.css
│   ├── header.css
│   ├── header.html
│   └── header.js
│
├── LD/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── README.md
│   ├── METHODOLOGY.md
│   ├── TASK-DESIGN-RATIONALE.md
│   ├── VERIFICATION-REPORT.md
│   └── audio/
│
├── RT/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── README.md
│   ├── METHODOLOGY.md
│   ├── TASK-DESIGN-RATIONALE.md
│   └── VERIFICATION-REPORT.md
│
├── SD/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── README.md
│   ├── METHODOLOGY.md
│   ├── TASK-DESIGN-RATIONALE.md
│   └── VERIFICATION-REPORT.md
│
├── ST/
│   ├── index.html
│   ├── app.js
│   └── styles.css
│
├── LICENSE
└── README.md
```

The files in `shared/` are used across multiple CeMoQu modules. Changes to shared assets should therefore be made carefully to avoid unintended effects on other tests.

## Running CeMoQu

### Online

Open:

**https://cemoqu.com**

Choose one of the four assessment modules and follow the on-screen instructions.

### Local Development

Clone or download the repository and serve the project from its root directory.

For example:

```bash
npx serve .
```

or:

```bash
npx http-server -p 8000
```

Then open the local address shown by the server and start from `index.html`.

A local server is recommended because browser security policies can restrict microphone, webcam, file, or module behavior when pages are opened directly with `file://`.

## Data and Export

CeMoQu is designed to retain both **interpretable summary measurements** and, where supported by the module, more detailed task-level data.

Current modules may provide:

- Session CSV export
- Per-trial or per-run CSV export
- Raw or accepted audio download
- Movement trajectory data
- Research metrics
- Score summaries
- Module-specific visualizations

The exact export fields differ by module because each task measures a different motor or speech function.

## Scoring and Validation

CeMoQu scores are currently **research estimates**, not validated clinical replacements for SARA.

The present scoring logic is intended to:

1. Convert continuous digital measurements into an interpretable severity range.
2. Preserve the original quantitative measurements used to generate that estimate.
3. Support comparison with clinician-rated SARA data during future validation.
4. Allow scoring rules to be revised as patient data and clinical evidence accumulate.

Thresholds, weighting rules, calibration methods, and derived metrics may therefore change as the project is validated.

## Technology

CeMoQu is built primarily with standard browser technologies:

- HTML
- CSS
- JavaScript
- Web Audio / browser microphone APIs
- Webcam-based computer vision where required
- MediaPipe-based tracking in camera-enabled modules
- CSV and browser-based research export workflows

The platform is designed to remain lightweight and accessible without requiring dedicated clinical hardware.

## Research Direction

CeMoQu is being developed as part of the broader **AtaxiaV** research effort led by **Voice of Calling NPO**.

The long-term goal is to develop accessible, objective digital measurements that can help characterize changes in cerebellar ataxia across repeated assessments and support larger-scale longitudinal research.

Clinical validation, reliability testing, device comparability, healthy-control reference data, and clinician-rated comparison studies remain necessary before CeMoQu measurements can be interpreted as validated clinical outcomes.

## License

See [`LICENSE`](./LICENSE) for repository license information.
