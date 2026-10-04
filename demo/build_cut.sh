#!/usr/bin/env bash
# Cut the raw recording into the demo timeline.
#
# The source is a VFR screen capture (r_frame_rate=90000/1) with no audio stream, so each clip is
# re-encoded at a constant 30fps and the audio is built separately in build_narration.sh.
#
# Each segment is extracted with an input seek (-ss before -i) and the pieces are joined by the
# concat demuxer with -c copy, which is exact here because every clip is written with the same codec,
# frame rate and geometry.
#
# The keep list is measured, not chosen by hand: propose.py differences the recording at one frame a
# second, keeps the seconds around every change (a click, a page load, a dialog opening) with two
# seconds of run-up and five of run-out, merges what overlaps, and caps any stretch that then sits
# still at five seconds. The landing page is kept whole, because the whole page is the point of it.
#
# So what survives is every step of the flow and every wallet confirmation, and what is dropped is
# waiting: the feed's own five-minute hold, MetaMask sitting on a blank panel while the chain catches
# up, and the explorer fetching its own bundle. Nothing that changes the state of the case is cut.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SRC=${SRC:-/home/arch/Videos/recording_2026-10-04_12.30.48.mp4}
OUT=${OUT:-$HERE/media/lantern-demo.mp4}
PARTS=${PARTS:-$HERE/media/.cutparts}

# start:end, in source seconds: 65 segments, 462.5s of the 968s recording.
SEGMENTS=(
  "0.0:40.0"
  "40.0:51.0"
  "51.0:56.0"
  "93.0:107.0"
  "159.0:166.0"
  "218.0:226.0"
  "259.0:266.0"
  "269.5:275.0"
  "279.0:289.0"
  "289.0:297.0"
  "297.0:298.0"
  "302.0:313.0"
  "341.0:347.0"
  "347.0:348.0"
  "357.0:369.0"
  "369.0:378.0"
  "402.0:405.0"
  "405.0:406.0"
  "407.0:416.0"
  "416.0:427.0"
  "437.0:444.0"
  "447.0:458.0"
  "458.0:459.0"
  "482.0:493.0"
  "496.0:502.0"
  "502.0:503.0"
  "507.0:514.0"
  "520.0:530.0"
  "530.0:531.0"
  "556.0:572.0"
  "572.0:573.0"
  "575.0:582.0"
  "585.0:591.0"
  "591.0:592.0"
  "620.0:631.0"
  "656.0:662.0"
  "662.0:663.0"
  "671.0:683.0"
  "683.0:689.0"
  "689.0:694.0"
  "725.0:731.0"
  "731.0:732.0"
  "735.0:744.0"
  "744.0:745.0"
  "750.0:756.0"
  "756.0:763.0"
  "763.0:769.0"
  "786.0:792.0"
  "792.0:799.0"
  "799.0:800.0"
  "811.0:817.0"
  "817.0:826.0"
  "826.0:827.0"
  "832.0:838.0"
  "838.0:848.0"
  "851.0:858.0"
  "862.0:871.0"
  "886.0:895.0"
  "919.0:937.0"
  "937.0:942.0"
  "942.0:948.0"
  "948.0:956.0"
  "956.0:961.0"
  "961.0:967.0"
  "967.0:968.0"
)

rm -rf "$PARTS"; mkdir -p "$PARTS"
list=$PARTS/list.txt
: > "$list"

i=0
for seg in "${SEGMENTS[@]}"; do
  s=${seg%%:*}; e=${seg##*:}
  dur=$(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.3f", b-a}')
  f=$PARTS/part$i.mp4
  ffmpeg -v error -y -ss "$s" -i "$SRC" -t "$dur" \
    -r 30 -crf 20 -preset veryfast -pix_fmt yuv420p -an "$f"
  printf "file '%s'\n" "$f" >> "$list"
  i=$((i + 1))
done

ffmpeg -v error -y -f concat -safe 0 -i "$list" -c copy "$OUT"

ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" | \
  awk '{printf "cut %s: %.2fs\n", "'"$OUT"'", $1}'
