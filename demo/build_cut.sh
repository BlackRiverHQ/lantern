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

# start:end, in source seconds: 64 segments, 443.0s of the 968s recording.
# The browser's own loading status and the app's wallet-slowness toast are out: their
# seconds were found by reading the recording rather than by eye.
SEGMENTS=(
  "0:33"
  "40.5:51"
  "51:56"
  "93:107"
  "159:166"
  "218:226"
  "259:265"
  "279.5:289"
  "289:297"
  "297:298"
  "302:313"
  "341:347"
  "347:348"
  "357:369"
  "369:378"
  "403.5:405"
  "405:406"
  "407:416"
  "416:427"
  "437:444"
  "447:458"
  "458:459"
  "485.5:493"
  "496:502"
  "502:503"
  "507:514"
  "520:530"
  "530:531"
  "556:572"
  "572:573"
  "575:582"
  "585:591"
  "591:592"
  "620:631"
  "656:662"
  "662:663"
  "671:683"
  "683:689"
  "689:694"
  "725:731"
  "731:732"
  "735:744"
  "744:745"
  "750:756"
  "756:763"
  "763:769"
  "786:792"
  "792:799"
  "799:800"
  "811:817"
  "817:826"
  "826:827"
  "832:838"
  "838:848"
  "851:858"
  "862:871"
  "886:895"
  "919:937"
  "937:942"
  "942:948"
  "948:956"
  "956:961"
  "961:967"
  "967:968"
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
