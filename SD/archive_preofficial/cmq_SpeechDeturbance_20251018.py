from jiwer import wer, cer, process_words
ref = "the quick brown fox jumps over the lazy dog"
hyp = result.text
print("WER: ", wer(ref, hyp))
print("CER: ", cer(ref, hyp))

# convert to intelligibility percentage
intelligibility_pct = (1.0 - cer(ref, hyp))* 100
print("Intelligibility: ", round(intelligibility_pct, 3))

def sara_speech_from_four(duration_sec, silence_ratio, tempo_bpm, intelligibility_pct,
                          mu_sil=0.20, sd_sil=0.10,
                          mu_tmp=105.0, sd_tmp=10.0,
                          mu_int=95.0, sd_int=5.0):
    # 1) quality gate
    if duration_sec < 4:
        return {"ok": False, "reason": "insufficient_duration"}

    # 2) z-scores (higher = worse)
    def clamp(x, lo, hi): return max(lo, min(hi, x))
    z_sil = clamp((silence_ratio - mu_sil) / (sd_sil or 1e-9), -3.0, 3.0)
    z_tmp = clamp(abs((tempo_bpm - mu_tmp) / (sd_tmp or 1e-9)), 0.0, 3.0)
    z_int = clamp(max(0.0, (mu_int - intelligibility_pct) / (sd_int or 1e-9)), 0.0, 3.0)

    # 3) impairment index (weights to be calibrated later)
    imp = 0.60*z_int + 0.25*z_sil + 0.15*z_tmp

    # 4) bucket to SARA 0–6
    cuts = [0.25, 0.75, 1.25, 1.75, 2.50, 3.50]
    sara = sum(imp >= c for c in cuts)  # 0..6

    # continuous 0–6
    import math
    sara_cont = 6.0/(1.0 + math.exp(-1.1*imp))

    return {
        "ok": True,
        "z_scores": {"intelligibility": z_int, "silence": z_sil, "tempo_dev": z_tmp},
        "impairment_index": round(imp, 3),
        "sara_speech_pred": int(sara),
        "sara_speech_cont": round(sara_cont, 2)
    }

print(sara_speech_from_four(duration, silence_ratio, tempo, intelligibility_pct))
