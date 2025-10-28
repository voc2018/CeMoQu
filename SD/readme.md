Here’s a professional **README** draft for your team’s repository:

---

# 🧠 Speech Disturbance Test (SARA-4 Compatible) — Browser MVP

A browser-based prototype that implements and extends **SARA Test 4 (Speech Disturbance)** using microphone input and real-time signal analysis.
The tool quantifies articulation, rhythm, and phonation stability through objective acoustic features.

---

## 🚀 Overview

**Purpose:**
To provide an **objective and reproducible** measure of speech disturbance in cerebellar ataxia and related disorders — replacing subjective clinician ratings with quantitative metrics.

**Key Features**

* 🎙️ Real-time microphone monitoring (RMS + F₀ estimation)
* 📖 Reading test with 5 fixed sentences (configurable)
* ⏱ 8-second recording window per test
* 🧩 Automatic feature extraction:

  * Mean RMS (intensity)
  * RMS coefficient of variation (CV)
  * Mean F₀ (fundamental frequency)
  * F₀ coefficient of variation (CV)
* 📊 Auto-mapping to SARA 0–6 scale using heuristic thresholds
* 💾 Export results as **CSV** or **JSON**
* 🎧 Noise suppression / echo cancellation supported (WebRTC)

---

## 🧩 Test Protocol

| Step | Description                                             |
| ---- | ------------------------------------------------------- |
| 1    | Participant sits in a quiet room (≤45 dB).              |
| 2    | Set microphone distance (default 12 cm).                |
| 3    | Each of 5 sentences is read aloud for ~8 seconds.       |
| 4    | The system records, analyzes, and scores each segment.  |
| 5    | Results (RMS CV, F₀ CV, Score) are saved automatically. |

Example sentences:

1. The quick brown fox jumps over the lazy dog.
2. We were away a year ago, and we saw a wide view of the valley.
3. Please pack my box with five dozen liquor jugs.
4. She sells sea shells by the sea shore.
5. Many men, many minds; every voice tells a different story.

---

## ⚙️ Installation & Run

### 1️⃣ Clone Repository

```bash
git clone https://github.com/<your-org>/<repo-name>.git
cd <repo-name>
```

### 2️⃣ Run Locally

Simply open the HTML file in a modern browser (Chrome, Edge, Firefox):

```bash
open index.html
# or drag the file into a browser window
```

No server setup required — all processing runs client-side.

---

## 🧮 Scoring Logic

| Metric | Definition           | Stable → Unstable Thresholds                      |
| ------ | -------------------- | ------------------------------------------------- |
| RMS CV | Loudness variability | [≤0.20, ≤0.30, ≤0.40, ≤0.55, ≤0.75, ≤1.00, >1.00] |
| F₀ CV  | Pitch variability    | [≤0.08, ≤0.12, ≤0.18, ≤0.25, ≤0.35, ≤0.50, >0.50] |

The two scores are averaged and rounded to yield a **SARA 4-equivalent score (0–6)**.

---

## 🧠 Technical Notes

* Implemented in **pure JavaScript + WebAudio API**
* Uses browser’s **MediaRecorder** (WebM/Opus) for audio capture
* Simple **autocorrelation F₀ estimator** (sufficient for clean vowels)
* Frame window: 30 ms; hop size: 15 ms
* Noise suppression & echo cancellation enabled via `getUserMedia` constraints
* Compatible with modern Chromium-based browsers

---

## 📁 Output Format

### CSV Columns

```
participant,session,test,duration_s,mean_rms,rms_cv,mean_f0_hz,f0_cv,score_0_6,
sample_rate,mic_cm,recorded_at,device_caps,text
```

### Example

```
P001,S1,Test1,7.98,0.019,1.567,387.1,0.295,5,48000,12,2025-10-24T19:00:00Z,
"Intel® Smart Sound Audio", "The quick brown fox jumps over the lazy dog."
```

---

## 🧪 Example Run (Screenshot)

<img width="2268" height="1298" alt="image" src="https://github.com/user-attachments/assets/84f220ad-d5e9-4feb-ad1d-6ccd2421fb57" />


---


---

## 📜 License

MIT License — open for non-commercial research and educational use.

---

Would you like me to make it more **research-paper style** (with background + methods + discussion sections) or **developer-friendly** (setup + API details + code structure)?


