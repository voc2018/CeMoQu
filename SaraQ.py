import sounddevice as sd
from scipy.io.wavfile import write

fs = 16000        # sampling rate (Hz)
seconds = 5       # recording duration (sec)

print("Recording started...")
audio = sd.rec(int(seconds * fs), samplerate=fs, channels=1, dtype='int16')
sd.wait()         # wait until complete
print("Recording finished!")

write("output.wav", fs, audio)  # creates output.wav in current folder
print("Saved to output.wav")
# audio_features.py
import librosa
import numpy as np

y, sr = librosa.load("output.wav", sr=16000, mono=True)