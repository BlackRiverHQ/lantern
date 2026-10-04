#!/usr/bin/env python3
"""Read back a shipped demo file: what is on screen, and whether any banned state is.

Two passes over the same file, both read from pixels rather than trusted from the edit:

  map    one frame every three seconds, full width, downscaled: what page is on screen, when
  banned one frame a second, cropped to the lower left where the browser's own loading status and the
         app's wallet-slowness toast render: any second carrying them is a failure

Usage: readback.py <file> [outdir]
"""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

FILE = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/arch/.hermes/cache/scratch/lvid/rb"
BANNED = ["waiting for", "transferring data", "taking longer", "relaunch metamask", "problem persists"]
REQUIRED = ["hold the bonus", "lie caught", "upheld", "provable", "imported account", "transaction details"]

os.makedirs(OUT, exist_ok=True)


def extract(sub, vf, pattern):
    d = f"{OUT}/{sub}"
    os.makedirs(d, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", FILE, "-vf", vf, f"{d}/{pattern}"], check=True)
    return d


def ocr(path, psm="6"):
    try:
        return subprocess.run(["tesseract", path, "-", "--psm", psm],
                              capture_output=True, text=True, timeout=90).stdout.lower()
    except Exception:
        return ""


md = extract("map", "fps=1/3,scale=900:-1", "m_%04d.png")
bd = extract("banned", "fps=1,crop=700:280:0:486,scale=1050:-1", "b_%04d.png")

with ThreadPoolExecutor(max_workers=2) as ex:
    maps = list(ex.map(lambda f: (f, ocr(f"{md}/{f}")), sorted(os.listdir(md))))

lines = []
for f, txt in maps:
    n = int(f.split("_")[1].split(".")[0])
    words = [l.strip() for l in txt.splitlines() if len(l.strip()) > 5]
    lines.append((round((n - 1) * 3, 1), " | ".join(words[:3])[:110]))
with open(f"{OUT}/map.txt", "w") as fh:
    for t, txt in lines:
        fh.write(f"{t:6.1f}  {txt}\n")

with ThreadPoolExecutor(max_workers=2) as ex:
    bres = list(ex.map(lambda f: (f, ocr(f"{bd}/{f}")), sorted(os.listdir(bd))))

hits = [(int(f.split("_")[1].split(".")[0]) - 1, [p for p in BANNED if p in txt]) for f, txt in bres]
hits = [(n, h) for n, h in hits if h]
req = {}
for w in REQUIRED:
    req[w] = sum(1 for _, txt in maps if w in txt)

print(f"file {FILE}")
print(f"\nbanned states: {len(hits)} second(s)")
for n, h in hits:
    print(f"  t={n}s {h}")
print("\nrequired moments (frames in which each is readable)")
for w, c in req.items():
    print(f"  {c:>4}  {w}")
print(f"\npage map written to {OUT}/map.txt")
