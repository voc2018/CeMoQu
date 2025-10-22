# CeMoQu (Cerebellum Motion Quantitative)

Digital biomarkers for ataxia. CeMoQu extends selected SARA subtests and lets patients perform objective self-assessments of motor and speech functions through a web-based system.

---

## Features
- Self-assessment tasks for ataxia and cerebellar disorders
- Quantitative metrics (reaction time, accuracy, smoothness, tremor, intelligibility)
- Browser-based, lightweight, cross-platform (PC & tablet)
- Optional JavaScript modules (browser/Node) for analysis and CSV aggregation
- Cloud-ready for secure, large-scale data storage

---

## Repository Structure

```text
CeMoQu/
├── index.html
├── LD/                               # Line Drawing Test (SARA Test 6 Finger-to-Nose extension)
│   ├── cmq_LineDrawing.html
│   └── data/
│       └── LD_P003_20251026.csv      # CSV outputs, format: MOD_PID_YYYYMMDD.csv
├── RTT/                              # Random Target Touch Test (SARA Test 5 Finger-to-Finger extension)
│   ├── cmq_RandomTarget.html
│   └── data/
│       └── RTT_P003_20251026.csv     # CSV outputs, format: MOD_PID_YYYYMMDD.csv
├── SD/                               # Speech Disturbance Test (SARA Test 4 Speech extension)
│   ├── cmq_SpeechDisturbance.html
│   └── data/
│       └── SD_P003_20251026.csv      # CSV outputs, format: MOD_PID_YYYYMMDD.csv
├── common/                           # Shared utils (unit conversion, scoring, logging)
├── draft/                            # Experimental / WIP code
├── LICENSE
└── README.md

---

## 🧩 Modules
- **LD** — *Line Drawing (SARA Test 6 Finger-to-Nose extension)*  
  Path deviation, smoothness (CV), tremor (RMS)
- **RT** — *Random Target Touch Test (SARA Test 5 Finger-to-Finger extension)*  
  Reaction time, accuracy, smoothness, tremor, distance→SARA(0–4) mapping
- **SD** — *Speech Disturbance Test (SARA Test 4 Speech Disturbance extension)*  
  WER/CER, duration, intelligibility %
- **common/** — Shared utilities for calibration, scoring, and logging
- **draft/** — Experimental or early-stage code

---

## 🚀 Quick Start

### A) Browser-Based Tests
1. Open the corresponding `.html` file (e.g., `SD/cmq_SpeechDisturbance.html`)
2. Follow on-screen instructions  
3. The output CSV will be saved under each module’s `data/` folder

>💡 If your browser blocks saving:
> Run a local server using Node.js:
> ```
> npx serve .
> ```
> or
> ```
> npx http-server -p 8000
> ```
> Then open [http://localhost:3000](http://localhost:3000) or [http://localhost:8000](http://localhost:8000)

---

### B) Optional: Node.js Environment (for analysis or ASR)
Some modules (especially SD) can be extended with Node.js scripts for data analysis, file management, or ASR (Automatic Speech Recognition).

```bash
# 1. Verify Node.js installation
node -v
# (Recommended: v18 or higher)

# 2. Initialize project and install dependencies
npm init -y

# 3. Install required packages
npm install csv-writer csv-parser mathjs

# For speech analysis (optional):
# npm install openai whisper-speech or faster-whisper-js

# 4. (Optional) Install a lightweight static server for testing
npm install -g serve http-server

