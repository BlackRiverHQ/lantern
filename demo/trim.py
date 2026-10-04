#!/usr/bin/env python3
"""Drop, from the keep list, every second the source scan flagged.

The demo must not show the browser's own loading status or the app's wallet-slowness toast. Both are
found by reading the recording itself, one frame a second, cropped to the lower left where they render.
This removes the seconds that carry them, splitting the kept runs around them, and rewrites
build_cut.sh's segment list.
"""
import re, subprocess, sys

SRC_HITS = "/home/arch/.hermes/cache/scratch/lvid/sscan_hits.txt"
KEEP = "/home/arch/.hermes/cache/scratch/lvid/keep.txt"
CUT = "/home/arch/lantern/demo/build_cut.sh"
PAD_BEFORE, PAD_AFTER = 1.0, 2.5

hits = []
with open(SRC_HITS) as fh:
    for line in fh:
        p = line.split()
        if p and p[0].isdigit():
            hits.append(float(p[0]))
if not hits:
    print("no hits; nothing to trim")
    sys.exit(0)

segs = [(float(m.group(1)), float(m.group(2)))
        for m in re.finditer(r'\s*"([\d.]+):([\d.]+)"', open(KEEP).read())]

dropped = []
out = []
for a, b in segs:
    cuts = sorted((h - PAD_BEFORE, h + PAD_AFTER) for h in hits if b > h - PAD_BEFORE and a < h + PAD_AFTER)
    cur = a
    for ca, cb in cuts:
        ca, cb = max(ca, a), min(cb, b)
        if ca > cur and ca - cur >= 0.5:
            out.append((cur, ca))
        dropped.append((ca, cb))
        cur = max(cur, cb)
    if b - cur >= 0.5:
        out.append((cur, b))

total = sum(b - a for a, b in out)
body = "\n".join(f'  "{a:g}:{b:g}"' for a, b in out)
t = open(CUT).read()
t = re.sub(r'# start:end, in source seconds: .*?\nSEGMENTS=\(.*?\n\)',
           f'# start:end, in source seconds: {len(out)} segments, {total:.1f}s of the 968s recording.\n'
           f'# The browser\'s own loading status and the app\'s wallet-slowness toast are out: their\n'
           f'# seconds were found by reading the recording rather than by eye.\nSEGMENTS=(\n{body}\n)',
           t, flags=re.S)
open(CUT, "w").write(t)
open(KEEP, "w").write(f'# {len(out)} segments, {total:.1f}s over 968s of recording\n' + body + "\n")
print(f"dropped {sum(b - a for a, b in dropped):.1f}s at {len(dropped)} places")
print(f"{len(out)} segments, {total:.1f}s")
print("hit seconds:", " ".join(f"{h:g}" for h in hits))
