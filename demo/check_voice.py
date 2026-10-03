#!/usr/bin/env python3
"""Measure the fundamental frequency of a voice track, to check a male voice is what shipped.

An F0 estimate is the honest way to state "male": typical adult male speech sits around 85-155 Hz,
female around 165-255 Hz. The estimate is autocorrelation over voiced windows, which is crude but
adequate for a range check. Reports the median over windows that look voiced, plus the share of the
file that carries speech at all.
"""
import statistics
import subprocess
import sys
import wave
import array
import math

path = sys.argv[1]
raw = "/tmp/f0_probe.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", "16000", raw], check=True)

with wave.open(raw, "rb") as w:
    rate = w.getframerate()
    samples = array.array("h")
    samples.frombytes(w.readframes(w.getnframes()))

window = int(0.04 * rate)
hop = int(0.02 * rate)
f0s = []
voiced = 0
total = 0
for start in range(0, len(samples) - window, hop):
    frame = samples[start:start + window]
    total += 1
    energy = sum(s * s for s in frame) / len(frame)
    if energy < 200:
        continue
    voiced += 1
    frame = [s - sum(frame) / len(frame) for s in frame]
    best_lag, best_corr = 0, 0.0
    lo, hi = int(rate / 320), int(rate / 70)          # search 70-320 Hz
    for lag in range(lo, hi):
        corr = sum(frame[i] * frame[i + lag] for i in range(len(frame) - lag))
        if corr > best_corr:
            best_corr, best_lag = corr, lag
    if best_lag:
        f0s.append(rate / best_lag)

if not f0s:
    print("no voiced audio found")
    sys.exit(1)

med = statistics.median(f0s)
print(f"frames with speech: {voiced}/{total} ({100 * voiced / total:.0f}%)")
print(f"median F0: {med:.0f} Hz")
print(f"F0 range (10th-90th pct): {sorted(f0s)[len(f0s)//10]:.0f}-{sorted(f0s)[9*len(f0s)//10]:.0f} Hz")
if med < 160:
    print("-> in the adult male range")
elif med < 255:
    print("-> in the adult female range")
else:
    print("-> above both ranges; check the voice choice")
print(f"speech occupies {voiced * hop / rate:.1f}s of {len(samples) / rate:.1f}s")
