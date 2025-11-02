# speech_pipeline.py
# MVP single-file pipeline for SARA Test 4 (Speech Disturbance)
# - Load/record audio
# - VAD & pauses
# - F0 (pyin) -> SD/range/slope
# - Jitter/Shimmer/HNR (Praat via parselmouth; optional)
# - Tremor (3–7 Hz)
# - Syllable rate & DDK
# - Auto-map to SARA 4 (0–6)
# - Export CSV/JSON

import os, json, math, argparse
from dataclasses import dataclass
from typing import List, Tuple, Dict

import numpy as np
import pandas as pd
import soundfile as sf

import librosa
from scipy.signal import butter, filtfilt, hilbert, find_peaks

# --- Optional deps (graceful fallback)
PARSELMOUTH_OK = True
try:
    import parselmouth  # Praat bridge
except Exception:
    PARSELMOUTH_OK = False

# -------------------------
# I/O
# -------------------------
def load_audio(path: str, sr: int = 44100):
    y, fs = librosa.load(path, sr=sr, mono=True)
    y = np.clip(y, -1.0, 1.0)
    return y, sr

def save_outputs(summary_dict: dict, all_metrics: dict):
    pd.DataFrame([summary_dict]).to_csv("speech_summary.csv", index=False)
    with open("speech_metrics.json", "w", encoding="utf-8") as f:
        json.dump(all_metrics, f, ensure_ascii=False, indent=2)

# -------------------------
# VAD & Pauses
# -------------------------
def stft_feats(y, sr, frame_ms=30, hop_ms=10):
    n_fft = int(sr*frame_ms/1000)
    hop = int(sr*hop_ms/1000)
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop))**2
    rms = librosa.feature.rms(S=S).flatten()
    zcr = librosa.feature.zero_crossing_rate(y, frame_length=n_fft, hop_length=hop).flatten()
    flux = np.diff(S, axis=1); flux = np.maximum(flux, 0).sum(axis=0)
    flux = np.hstack([[0], flux])
    return S, rms, zcr, flux, hop

def vad_segments(y: np.ndarray, sr: int, frame_ms=30, hop_ms=10,
                 rms_th=0.02, zcr_th=0.1, flux_mul=0.5) -> List[Tuple[int,int]]:
    S, rms, zcr, flux, hop = stft_feats(y, sr, frame_ms, hop_ms)
    # normalize
    def norm(v):
        return (v - v.min())/(v.max()-v.min()+1e-9)
    rms_n, zcr_n, flux_n = norm(rms), norm(zcr), norm(flux)

    voiced = ((rms_n > rms_th) & (zcr_n < 1.0 - zcr_th)) | (flux_n > flux_mul*rms_n)
    segs = []
    start = None
    for i, v in enumerate(voiced):
        if v and start is None:
            start = i
        if (not v) and (start is not None):
            segs.append((start, i))
            start = None
    if start is not None:
        segs.append((start, len(voiced)))
    return [(s*hop, e*hop) for s,e in segs]

def pause_metrics(y: np.ndarray, sr: int, segs: List[Tuple[int,int]]) -> Dict:
    dur_total = len(y)/sr
    voiced_dur = sum((e-s)/sr for s,e in segs)
    pause_dur = max(0.0, dur_total - voiced_dur)
    pauses = []
    last_end = 0
    for (s,e) in segs:
        if s>last_end: pauses.append((last_end, s))
        last_end = e
    if last_end < len(y): pauses.append((last_end, len(y)))
    pauses_sec = [(e-s)/sr for s,e in pauses if (e-s)/sr > 0.05]
    return dict(
        total_sec=dur_total,
        pause_ratio=(pause_dur/dur_total if dur_total>0 else 0.0),
        pause_mean=float(np.mean(pauses_sec)) if pauses_sec else 0.0,
        pause_median=float(np.median(pauses_sec)) if pauses_sec else 0.0,
        pause_count=len(pauses_sec)
    )

# -------------------------
# F0 & Pitch features
# -------------------------
def hz_to_semitone(f0_hz: np.ndarray, ref=440.0) -> np.ndarray:
    f = f0_hz.copy()
    f[f<=0] = np.nan
    return 12.0*np.log2(f/ref)

def f0_features(y: np.ndarray, sr: int) -> Dict:
    f0, _, _ = librosa.pyin(y, fmin=50, fmax=500, frame_length=2048, hop_length=256)
    idx = np.arange(len(f0))
    m = np.isfinite(f0)
    f0_interp = np.interp(idx, idx[m], f0[m]) if m.any() else np.zeros_like(f0)
    st = hz_to_semitone(f0_interp)
    st_valid = st[np.isfinite(st)]
    f0_sd_st = float(np.nanstd(st_valid)) if len(st_valid) else float("nan")
    f0_range_st = float(np.nanmax(st_valid)-np.nanmin(st_valid)) if len(st_valid) else float("nan")
    # slope (semitone/sec)
    if len(st) > 2:
        t = np.arange(len(st)) / (sr/256.0)
        m2 = np.isfinite(st)
        slope = float(np.polyfit(t[m2], st[m2], 1)[0]) if m2.any() else float("nan")
    else:
        slope = float("nan")
    return dict(f0_hz=f0_interp, f0_sd_st=f0_sd_st, f0_range_st=f0_range_st, f0_slope_stps=slope)

# -------------------------
# Perturbation: Jitter/Shimmer/HNR (optional)
# -------------------------
def perturbation_features(y: np.ndarray, sr: int) -> Dict:
    if not PARSELMOUTH_OK:
        return dict(jitter_percent=np.nan, shimmer_percent=np.nan, hnr_db=np.nan, note="parselmouth not available")
    try:
        snd = parselmouth.Sound(y, sampling_frequency=sr)
        point_proc = parselmouth.praat.call(snd, "To PointProcess (periodic, cc)", 50, 500)
        jitter_local = parselmouth.praat.call(point_proc, "Get jitter (local)", 0, 0, 50, 500, 1.3)
        shimmer_local = parselmouth.praat.call([snd, point_proc], "Get shimmer (local)", 0, 0, 50, 500, 1.3, 1.6)
        hnr = parselmouth.praat.call(snd, "To Harmonicity (cc)", 0.01, 50, 0.1, 1.0)
        hnr_mean_db = parselmouth.praat.call(hnr, "Get mean", 0, 0)
        return dict(
            jitter_percent=float(jitter_local*100.0),
            shimmer_percent=float(shimmer_local*100.0),
            hnr_db=float(hnr_mean_db)
        )
    except Exception as e:
        return dict(jitter_percent=np.nan, shimmer_percent=np.nan, hnr_db=np.nan, error=str(e))

# -------------------------
# Tremor (3–7 Hz band)
# -------------------------
def bandpass(series: np.ndarray, sr_hz: float, lo=3.0, hi=7.0, order=4):
    nyq = 0.5*sr_hz
    b,a = butter(order, [lo/nyq, hi/nyq], btype='band')
    return filtfilt(b,a, series)

def tremor_features(f0_curve: np.ndarray, sr_frames: float) -> Dict:
    if f0_curve is None or len(f0_curve) < 8:
        return dict(tremor_peak_hz=np.nan, tremor_rms=0.0)
    f0_detrend = f0_curve - np.nanmean(f0_curve)
    f0_detrend[np.isnan(f0_detrend)] = 0.0
    f0_bp = bandpass(f0_detrend, sr_frames, 3.0, 7.0)
    spec = np.fft.rfft(f0_bp)
    freqs = np.fft.rfftfreq(len(f0_bp), d=1.0/sr_frames)
    band = (freqs>=3.0) & (freqs<=7.0)
    amp_spec = np.abs(spec)
    if band.any() and np.any(amp_spec[band]>0):
        peak_idx = np.argmax(amp_spec[band])
        peak_freq = float(freqs[band][peak_idx])
        rms = float(np.sqrt(np.mean(f0_bp**2)))
    else:
        peak_freq, rms = float('nan'), 0.0
    return dict(tremor_peak_hz=peak_freq, tremor_rms=rms)

# -------------------------
# Syllable rate (approx) & DDK
# -------------------------
def syllable_rate(y: np.ndarray, sr: int, segs: List[Tuple[int,int]]) -> Dict:
    # onset strength를 간이 음절핵 근사로 사용
    env = np.abs(librosa.onset.onset_strength(y=y, sr=sr))
    # 최소 간격(대략 60ms) 제한
    peaks, _ = find_peaks(env, distance=3)
    # 유성 구간 마스크
    hop = 512
    mask = np.zeros_like(env, dtype=bool)
    for s,e in segs:
        mask[(s//hop):(e//hop)] = True
    syllables = int(np.sum(mask[peaks]))
    voiced_sec = sum((e-s)/sr for s,e in segs)
    rate = syllables/voiced_sec if voiced_sec>0 else 0.0
    return dict(syllables=syllables, speech_rate_sps=float(rate))

def ddk_metrics(y: np.ndarray, sr: int) -> Dict:
    # DDK용 간단 필터 + Hilbert env → peak 간격
    b,a = butter(4, [80/(sr/2), 1000/(sr/2)], btype='band')
    yb = filtfilt(b,a,y)
    env = np.abs(hilbert(yb))
    thr = np.percentile(env, 70)
    peaks, _ = find_peaks(env, height=thr, distance=int(0.05*sr))
    if len(peaks) < 3:
        return dict(ddk_rate_sps=0.0, ddk_interval_sd_ms=np.nan)
    intervals = np.diff(peaks)/sr
    rate = 1.0/np.mean(intervals)
    sd_ms = float(np.std(intervals)*1000.0)
    return dict(ddk_rate_sps=float(rate), ddk_interval_sd_ms=sd_ms)

# -------------------------
# SARA 4 autoscore
# -------------------------
@dataclass
class SpeechSummary:
    pause_ratio: float
    speech_rate: float
    f0_sd_st: float
    jitter_percent: float
    shimmer_percent: float
    tremor_peak_hz: float
    tremor_rms: float
    ddk_rate_sps: float
    ddk_interval_sd_ms: float

def sara4_autoscore(s: SpeechSummary) -> int:
    score = 0
    if s.speech_rate < 4.5: score += 1
    if s.pause_ratio > 0.25: score += 1
    if s.f0_sd_st > 1.0: score += 1
    if not math.isnan(s.jitter_percent) and s.jitter_percent > 1.0: score += 1
    if not math.isnan(s.shimmer_percent) and s.shimmer_percent > 3.0: score += 1
    if (not math.isnan(s.tremor_peak_hz)) and (3.0 <= s.tremor_peak_hz <= 7.0) and (s.tremor_rms > 0.05):
        score += 1
    return min(score, 6)

# -------------------------
# Pipeline
# -------------------------
def run_pipeline(audio_path: str, sr: int = 44100) -> Dict:
    y, sr = load_audio(audio_path, sr=sr)

    # 기본 노이즈 억제(아주 약하게): DC 제거 + 하이패스
    y = y - np.mean(y)
    b,a = butter(2, 40/(sr/2), btype='highpass')
    y = filtfilt(b,a,y)

    segs = vad_segments(y, sr)
    pmet = pause_metrics(y, sr, segs)
    f0met = f0_features(y, sr)
    pert = perturbation_features(y, sr)
    trem = tremor_features(f0met['f0_hz'], sr_frames=sr/256.0)
    rate = syllable_rate(y, sr, segs)
    ddk  = ddk_metrics(y, sr)

    summary = SpeechSummary(
        pause_ratio=pmet['pause_ratio'],
        speech_rate=rate['speech_rate_sps'],
        f0_sd_st=f0met['f0_sd_st'],
        jitter_percent=pert['jitter_percent'],
        shimmer_percent=pert['shimmer_percent'],
        tremor_peak_hz=trem['tremor_peak_hz'],
        tremor_rms=trem['tremor_rms'],
        ddk_rate_sps=ddk['ddk_rate_sps'],
        ddk_interval_sd_ms=ddk['ddk_interval_sd_ms']
    )
    sara4 = sara4_autoscore(summary)

    out = dict(
        pause=pmet, f0=f0met, perturbation=pert, tremor=trem,
        rate=rate, ddk=ddk, summary=summary.__dict__, sara4_auto=sara4
    )
    save_outputs(summary.__dict__, out)
    return out

# -------------------------
# CLI
# -------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Speech Test pipeline (single-file MVP)")
    parser.add_argument("audio", help="input audio file (wav/mp3)")
    parser.add_argument("--sr", type=int, default=44100, help="target sample rate")
    args = parser.parse_args()

    result = run_pipeline(args.audio, sr=args.sr)
    print("=== SUMMARY ===")
    for k,v in result["summary"].items():
        print(f"{k}: {v}")
    print("SARA4(auto):", result["sara4_auto"])
    print("Saved: speech_summary.csv, speech_metrics.json")
