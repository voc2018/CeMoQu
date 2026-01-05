# Line Drawing Test
A browser-based application for **quantitative motor function assessment**, designed to evaluate coordination and tremor severity in patients with **cerebellar ataxia**.  
This app simulates clinical movement tests such as line-tracing and directional control, automatically generating **SARA-compatible subscores** based on deviation, discontinuity, and turn metrics.

## Live Demo
<img width="3822" height="1919" alt="image" src="https://github.com/user-attachments/assets/1df2daf5-723a-42ea-adf0-74f4b2a5562e" />

## Overview
The **Ataxia Diagnostic Suite** allows clinicians or researchers to run upper-limb coordination tests remotely using only a computer and camera or touchscreen.  
Each test involves tracing between targets on a canvas while the system tracks movement precision and stability. Results are automatically analyzed and presented as **quantitative scores** that correspond to the **SARA (Scale for the Assessment and Rating of Ataxia)**.

## Features
- **Four Built-In Tests**
  - Vertical, Horizontal, and two Diagonal Line Tests.
- **Real-Time Scoring**
  - Tracks deviation, discontinuity, turn count, and out-of-bounds frequency.
- **SARA-Based Evaluation**
  - Computes and displays a subscore (0–4) for each movement dimension.
- **Patient Management**
  - Register and recall patient profiles (stored locally in the browser).
- **Data Export**
  - Save results as structured `.json` files for further analysis.
- **Dark Mode**
  - Easily toggle between light and dark themes.
- **Offline Support**
  - Runs fully offline; no server required.


## File Structure
```
ataxia-diagnostic-suite/
├── index.html       # Main application layout
├── styles.css       # UI styling and layout
└── app.js           # Core logic and test computation
````

## How to Run
1. **Clone or download** this repository.
2. Open `index.html` in any web browser (Chrome, Edge, Safari, or Firefox).
3. Register a patient.
4. Choose a test (e.g., *Vertical Test*).
5. Use your mouse or touchscreen to trace from **S** (Start) to **F** (Finish).
6. Review results in the **Clinical Score Mapping** section.
7. Export your data if desired.

## Output Format
Exported JSON example:

```json
{
  "patient": { "name": "John Doe", "id": "JD001" },
  "test": "Horizontal Test",
  "timestamp": "2025-10-27T21:45:00Z",
  "stats": {
    "deviationArea": 252.3,
    "verticalTurns": 18,
    "horizontalTurns": 10,
    "discontinuities": 2,
    "outOfBounds": 1,
    "clinical": {
      "score_dev": 0.51,
      "score_turn": 0.48,
      "score_dis": 0.25,
      "score_bounds": 0.20,
      "sara_score": 0.36,
      "description": "Slight tremor or inaccuracy, but target achieved"
    }
  }
}
````


## Tech Stack
* **Frontend:** HTML5, CSS3, Vanilla JavaScript
* **Graphics:** HTML Canvas API
* **Storage:** LocalStorage (patient records)
* **Export:** JSON file generation using Blob API


## Clinical Relevance
The **SARA Subscore** calculation is inspired by the official **SARA motor coordination assessment**, offering a digital alternative to manual observation.
This enables remote monitoring, self-assessment, and clinical research on motor control.

## License
This project is released under the **MIT License**.
You are free to use, modify, and distribute it with attribution.

## Authors
Developed as part of the **CeMoQu (Cerebellum Motion Quantitative)** research ecosystem for digital biomarkers.
Maintained by the **Voice of Calling Life and Research Center** initiative.

