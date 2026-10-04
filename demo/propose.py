#!/usr/bin/env python3
"""Propose a keep-list for the recording: every action and its result, none of the waiting.

Two inputs, both measured:
  diff   frame-to-frame difference at 1 fps (a click, a page load or a dialog opening spikes it)
  static  spans where the screen does not change at all are waiting time, and are capped
Everything else is kept whole, so the landing page's scroll and each page's first paint survive.
"""
import subprocess, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/arch/Videos/recording_2026-10-04_12.30.48.mp4"
LEAD = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0     # seconds of screen before an action
TAIL = float(sys.argv[3]) if len(sys.argv) > 3 else 7.0     # seconds after it, to show the result
STATIC_CAP = float(sys.argv[4]) if len(sys.argv) > 4 else 6.0
ACTION = float(sys.argv[5]) if len(sys.argv) > 5 else 5.0
ALWAYS = [(0.0, 37.0), (933.0, 942.0), (944.0, 950.0)]   # the landing page whole, the prove page, feeds and bonds

W, H, FPS = 96, 54, 1.0
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", SRC, "-vf", f"fps={FPS},scale={W}:{H},format=gray",
                      "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
size = W * H
prev = None
diffs = []
while True:
    b = p.stdout.read(size)
    if len(b) < size:
        break
    if prev is not None:
        s = sum(abs(b[i] - prev[i]) for i in range(0, size, 3))
        diffs.append(s / (size // 3))
    prev = b
p.stdout.close(); p.wait()
n = len(diffs)

# 1. windows around every action
marks = [i for i, d in enumerate(diffs) if d > ACTION]
spans = []
for m in marks:
    a, b = max(0.0, m - LEAD), min(n, m + TAIL)
    if spans and a <= spans[-1][1] + 0.5:
        spans[-1] = (spans[-1][0], b)
    else:
        spans.append((a, b))
spans.extend(ALWAYS)
spans.sort()

# 2. merge, then cap what is left that never changes
merged = []
for a, b in spans:
    if merged and a <= merged[-1][1] + 0.5:
        merged[-1] = (merged[-1][0], max(merged[-1][1], b))
    else:
        merged.append((a, b))

out = []
for a, b in merged:
    i, j = int(a), int(min(b, n))
    run_start = i
    for k in range(i + 1, j + 1):
        still = k < j and all(diffs[x] < 1.2 for x in range(max(i, k - 3), k))
        if still and k - run_start >= STATIC_CAP:
            out.append((run_start, k))
            run_start = k
    if j > run_start:
        out.append((run_start, j))

total = sum(b - a for a, b in out)
print(f"# {len(out)} segments, {total:.1f}s over {n}s of recording")
print("SEGMENTS=(")
for a, b in out:
    print(f'  "{a}.0:{b}.0"')
print(")")
