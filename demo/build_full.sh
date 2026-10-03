#!/usr/bin/env bash
# Assemble the full demo: the HyperFrames explainer, then the screen recording, then the end card.
#
# The cards render at 1920x1080 and the recording is 1364x766. Those are the same aspect ratio
# (1.778 against 1.781), so the cards are scaled DOWN onto the recording's canvas, which keeps the
# site's own text pixel-exact and costs the cards nothing that upscaling the recording would not
# cost more. Concat needs one geometry, so both card inputs are scaled before they are joined.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
W=${W:-1364}
H=${H:-766}
INTRO=${INTRO:-$HERE/media/intro.mp4}
DEMO=${DEMO:-$HERE/media/lantern-demo.mp4}
OUTRO=${OUTRO:-$HERE/media/outro.mp4}
OUT=${OUT:-$HERE/media/lantern-demo-full.mp4}

for f in "$INTRO" "$DEMO" "$OUTRO"; do
  [ -s "$f" ] || { echo "missing input: $f" >&2; exit 1; }
done

ffmpeg -v error -y \
  -i "$INTRO" -i "$DEMO" -i "$OUTRO" \
  -filter_complex "[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30[v0];\
[1:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30[v1];\
[2:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30[v2];\
[v0][v1][v2]concat=n=3:v=1:a=0[out]" \
  -map "[out]" -r 30 -crf 20 -preset veryfast -pix_fmt yuv420p -an "$OUT"

ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" | \
  awk '{printf "assembled %s: %.2fs\n", "'"$OUT"'", $1}'
