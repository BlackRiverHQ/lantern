#!/usr/bin/env python3
"""For each kept segment, read the screen in its middle second and report it on the new timeline."""
import os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

SRC = "/home/arch/Videos/recording_2026-10-04_12.30.48.mp4"
SEGS = []
for line in open("/home/arch/.hermes/cache/scratch/lvid/keep.txt"):
    m = re.match(r'\s*"([\d.]+):([\d.]+)"', line)
    if m:
        SEGS.append((float(m.group(1)), float(m.group(2))))

t = 0.0
print(f"{'new':>7} {'src':>7} {'len':>5}  screen")
for a, b in SEGS:
    t += b - a
for i, (a, b) in enumerate(SEGS):
    pass

def mid_ocr(i, a, b):
    m = (a + b) / 2
    f = f"/home/arch/.hermes/cache/scratch/lvid/mid/{i:03d}_{m:.0f}.png"
    if not os.path.exists(f):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(m), "-i", SRC, "-frames:v", "1", f],
                       check=True)
    try:
        out = subprocess.run(["tesseract", f, "-", "--psm", "6"], capture_output=True, text=True,
                             timeout=180).stdout
    except Exception:
        return "(ocr failed)"
    lines = [l.strip() for l in out.splitlines() if len(l.strip()) > 5]
    return " ~ ".join(lines[:6])[:220]

os.makedirs("/home/arch/.hermes/cache/scratch/lvid/mid", exist_ok=True)
with ThreadPoolExecutor(max_workers=2) as ex:
    res = list(ex.map(lambda ab: mid_ocr(ab[0], ab[1][0], ab[1][1]), enumerate(SEGS)))

t = 0.0
with open("/home/arch/.hermes/cache/scratch/lvid/newmap.txt", "w") as fh:
    for (a, b), txt in zip(SEGS, res):
        row = f"{t:7.1f} {a:7.1f} {b - a:5.1f}  {txt}"
        print(row, flush=True)
        fh.write(row + "\n")
        t += b - a
print(f"# total {t:.1f}s, {len(SEGS)} segments")
with open("/home/arch/.hermes/cache/scratch/lvid/segends.txt", "w") as fh:
    t = 0.0
    ends = []
    for a, b in SEGS:
        t += b - a
        ends.append(f"{t:.1f}")
    fh.write(" ".join(ends) + "\n")
print("ends written")
