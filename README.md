# CeMoQu (Cerebellum Motion Quantitative)

**Digital biomarkers for ataxia: CeMoQu goes beyond the traditional SARA scale, enabling patients to perform self-assessments that objectively evaluate motor and speech functions through a web-based system.**

---

## ✨ Features

* Self-assessment tasks for patients with ataxia and cerebellar disorders
* Quantitative motor & speech evaluation (line tracing, finger chase, speech clarity)
* Web-based, lightweight, and cross-platform (PC & tablet)
* Cloud-ready for secure, large-scale data storage

---

## 🧩 Modules

* **Vertical Test** – line tracing accuracy & deviation
* **Random Target Touch Test** – reaction time & precision
* **Speech Analysis Module** – clarity, rhythm, and fluency
* **Data Export** – CSV with millisecond & sub-millimeter precision

---

## 🎯 Goals

* Provide objective, digital biomarkers for clinical trials
* Reduce patient burden with remote monitoring
* Enable multi-site collaboration and data sharing
* Support regulatory-ready endpoints for drug development

---

## 🚀 Roadmap

* **Sep 2025** – Prototype (Vertical Test, data metrics, CSV export)
* **Oct 2025** – Random Target Touch Test, Speech Module
* **Dec 2025** – Pilot test with UCLA Ataxia Lab (20–30 participants)
* **2026** – Expand modules, automated reporting, multi-site collaboration

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.

---
## Code
* AtaxiaPt2 -> diagnostic test
  * No setup instructions needed.
  * Download the file and run it in a browser such as the google search engine.
* Test2 -> finger excercise
* SARA-Q -> audio recorder

---
## Setup Instructions
1. Install Python 3.10
 * Download Python 3.10 (higher versions are not supported).
* During installation:
 * Select Add Python 3.10 to PATH
 * In Advanced Options, select Install for all users
 * Choose and remember your installation path (e.g., C:\python310).
 * Verify installation in terminal:
  * python3.10 --version
2. Create Project Folder
* Example:
 * C:\Users\wonup\Documents\saraq
3. Create Virtual Environment
* Inside the project folder, run:
 * python3.10 -m venv saraq-env
 * If you get an error, ensure Python 3.10 is properly installed and accessible.
4. Activate Virtual Environment
* Run:
 * .\saraq-env\Scripts\Activate.ps1
 * If you encounter an activation error, adjust PowerShell execution policies.
 * Successful activation shows:
  * (saraq-env) PS C:\Users\wonup\Documents\saraq>
5. Install Required Packages
* pip install mediapipe opencv-python
