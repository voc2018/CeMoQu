# 🖐️ RT Finger Chase — Clinic Dashboard  
### Random Target Touch Test (CeMoQu Module)

A **browser-based motor coordination test** that quantifies finger or cursor movement.  
It allows patients and researchers to evaluate coordination, smoothness, and reaction speed **without any specialized hardware**, using only a **mouse or webcam**.

This test is based on the **SARA (Scale for the Assessment and Rating of Ataxia)** and automatically analyzes performance metrics to produce objective numerical results and estimated SARA scores.

---

## 📁 Project Structure
```

.
├── index.html      # Main app (entry point)
├── styles.css      # UI and theme styles
└── app.js          # Core logic, calibration, data recording, CSV export

````

---

## ⚡ Quick Start

### 1️⃣ Run locally
1. Place all three files in the same folder.  
2. Open `index.html` in your browser.  
3. For **Camera Mode**, use `https://` or `http://localhost` — browser security requires a secure context for camera access.

### 2️⃣ (Optional) Run a local web server
```bash
python -m http.server 8000
# Then open http://localhost:8000 in your browser
````

---

## 🎮 How to Use

1. **Participant Metadata**

   * Enter `Participant ID` and select `Hand (R/L)`.
   * Click **Save Metadata**.

2. **Settings**

   * Adjust target count, radius, interval, and other parameters.
   * Click **Save Settings**.

3. Use the **Mode Toggle** to switch between:

   * `Cursor Test` — uses mouse/touchpad.
   * `Camera Test (Beta)` — uses webcam + MediaPipe Hands.

4. Optionally enable **Countdown / Sound**.

5. Click **Start Test**

   * Move toward each target as accurately and quickly as possible.
   * Each target runs for a fixed time before moving to the next.

6. When the session is complete, click **Export CSV** to download results.

---

## ⚙️ Core Settings

| Setting               | Description                  | Default |
| --------------------- | ---------------------------- | ------- |
| Targets               | Number of targets            | 5       |
| Target Interval (s)   | Duration per target          | 2.0     |
| Target Radius (cm)    | Target circle size           | 5.0     |
| Minimum Distance (cm) | Minimum gap between targets  | 20.0    |
| Edge Width (px)       | Circle border width          | 20      |
| Center Dot            | Show 1 cm dot at center      | Yes     |
| Trail Animation       | Animate line between targets | Yes     |
| Countdown / Sound     | 3-2-1 sound cue              | Off     |
| Pixels per cm         | Screen calibration value     | 30.0    |
| Finger Length (cm)    | Used for camera calibration  | 7.5     |

> All settings are saved automatically in the browser’s **LocalStorage**.

---

## 📏 Calibration

### 🖱️ Cursor Mode

* Select your **monitor size (inches)** and click **Estimate ppc**.
* Verify the **green 8.5 cm bar** with a physical ruler.
* Adjust pixels/cm manually if needed.

### 📸 Camera Mode

* Enter **Finger length (cm)** (e.g., 7.5 cm).
* Click **Calibrate** and hold your index finger steady for 3 seconds.
* The system samples fingertip–MCP pixel distance and calculates px/cm automatically.

---

## 📊 Measured Metrics

| Metric                      | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| **Final Error (cm)**        | Distance between finger/cursor and target center at the end   |
| **Reaction Time (s)**       | Time until the first valid touch inside the target            |
| **Percent Time Inside (%)** | Portion of frames where contact was maintained                |
| **Tremor (cm)**             | Radial standard deviation of movement (hand tremor amplitude) |
| **Smoothness**              | Mean absolute velocity change (movement consistency)          |
| **SARA Bucket (0–3)**       | Simplified ataxia severity scale                              |

### SARA Bucket Mapping (Simplified)

| Condition                 | Score |
| ------------------------- | ----- |
| Error < 3 cm and RT < 2 s | 0     |
| 3 ≤ Error < 7 cm          | 1     |
| 7 ≤ Error < 15 cm         | 2     |
| Error ≥ 15 cm or RT > 4 s | 3     |

> Final test score = average of valid target scores
> (If ≥ 5 targets, best + worst are excluded before averaging)

---

## 💾 CSV Exports

When you click **Export CSV**, three files are saved locally:

| File                       | Description                              |
| -------------------------- | ---------------------------------------- |
| `RT_touches_*.csv`         | Frame-by-frame raw data                  |
| `RT_targets_summary_*.csv` | Per-target summary and metrics           |
| `RT_final_summary_*.csv`   | Session metadata and averaged SARA score |

### Example headers

```
# RT_touches_*.csv
trial_idx,frame_idx,timestamp,x_px,y_px,inside

# RT_targets_summary_*.csv
trial_global_index,target_x_px,target_y_px,radius_cm,radius_px,
final_error_cm,final_error_px,tremor_cm,smoothness,time_inside_s,
percent_time_inside,reaction_time_s,frames_recorded,missed,sara_score

# RT_final_summary_*.csv
run_ts,participant,session,date,hand,notes,mode,num_targets,final_score
```

---

## 🔊 Feedback & Visuals

* Optional **3-2-1 countdown** with beep cues
* Visual **trail animation** between targets
* **Calibration success overlay** after camera-based calibration

---

## 🧩 Dependencies

* **Browser:** Latest Chrome / Edge / Firefox
* **Libraries (via CDN):**

  * `@mediapipe/hands`
  * `@mediapipe/camera_utils`
  * `@mediapipe/drawing_utils`
  * `@mediapipe/control_utils`

---

## 🔐 Data Privacy

* All data are processed **locally in your browser**.
* No information is uploaded or transmitted to any server.
* CSV files are generated and downloaded directly to your device.

---

## ⚠️ Disclaimer

> This tool is a **research and educational prototype**, not a certified medical device.
> It should **not** be used for clinical diagnosis or treatment decisions.
> Results are for reference and experimental validation only.

---

## 🧠 About

**RT Finger Chase** is part of the **CeMoQu (Cerebellum Motion Quantitative)** project —
a browser-based digital biomarker suite designed to objectively measure motor and speech coordination for ataxia research.

---

## 🪪 License

MIT License — free to use, modify, and distribute with attribution.

---
