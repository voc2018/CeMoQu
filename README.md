# CeMoQu

**Cerebellar Motor Quantification for Ataxia Assessment**

CeMoQu is a web-based digital assessment platform designed to support objective and quantitative evaluation of selected SARA-related motor and speech functions. It allows users to perform browser-based self-assessment tasks and generates structured quantitative metrics that may support longitudinal tracking, research, and clinical decision-making for ataxia and cerebellar disorders.

## Live System

Access the live system here:

https://cemoqu.com

No installation is required. All assessment modules run directly in the browser.

## Current Modules

### SD — Speech Disturbance Test

SARA-related speech assessment module.

* Browser-based speech task
* Audio recording and speech feature analysis
* Metrics may include duration, loudness variation, pitch stability, and speech consistency
* Designed to support quantitative analysis of speech disturbance

### RT — Random Target Touch Test

SARA Test 5 Finger Chase / Finger-to-Finger related extension.

* Randomized target-touch task
* Measures reaction time, touch accuracy, target error, and movement smoothness
* Supports quantitative evaluation of upper-limb coordination
* Designed for structured CSV-style data export

### LD — Line Drawing Test

SARA Test 6 Nose-Finger / upper-limb coordination related extension.

* Line-tracing and deviation-based task
* Measures path deviation, smoothness, tremor-related movement instability, and drawing accuracy
* Supports pixel-based and calibrated measurement metrics
* Designed to estimate tremor amplitude and movement control

### ST — Sitting Balance Test

SARA Test 3 Sitting related extension.

* Webcam-based sitting balance assessment
* Uses body/pose tracking to estimate postural sway
* Measures shoulder midpoint movement, trunk stability, sway range, and balance-related instability
* Provides SARA-based 0–4 sitting balance score estimation
* Supports visual result review and data export

## Features

* Browser-based assessment system
* No installation required for users
* Works on standard computers with a webcam and microphone
* Modular structure for SD, RT, LD, and ST tests
* Shared global header for patient/session metadata
* Quantitative metrics for motor and speech assessment
* Designed for structured data collection and future longitudinal analysis
* Suitable for research, education, and prototype clinical workflow testing

## Repository Structure

```text
CeMoQu/
├── index.html
├── SD/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── RT/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── LD/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── ST/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── shared/
│   ├── header.html
│   ├── header.js
│   └── header.css
├── data/
├── draft/
├── LICENSE
└── README.md
```

## Quick Start

### For Users

1. Visit https://cemoqu.com
2. Enter patient and session information in the global header
3. Select an assessment module: SD, RT, LD, or ST
4. Follow the on-screen instructions
5. Review the generated results and export data if needed

### For Developers

This project can be run as a static website.

#### Option 1: Open with Live Server

1. Open the project folder in VS Code
2. Open `index.html`
3. Right-click and select **Open with Live Server**

#### Option 2: Run a local static server

If you have Node.js installed, you may run:

```bash
npx serve .
```

or

```bash
npx http-server -p 8000
```

Then open the local server address in your browser.

## Development Notes

* Each module is organized as an independent folder with its own `index.html`, `app.js`, and `styles.css`.
* The shared global header is loaded from the `shared/` folder.
* Patient and session metadata are designed to flow across modules through the shared header system.
* Additional modules can follow the same folder structure and navigation pattern.

## Project Goal

CeMoQu aims to make quantitative ataxia assessment more accessible by translating selected SARA-related tasks into browser-based digital modules. The long-term goal is to support repeatable, structured, and objective data collection for patients, caregivers, researchers, and clinicians.
