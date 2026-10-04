#!/usr/bin/env bash
# Cut the raw recording into the demo timeline.
#
# The source is a VFR screen capture (r_frame_rate=90000/1) with no audio stream, so each clip is
# re-encoded at a constant 30fps and the audio is built separately in build_narration.sh.
#
# Each segment is extracted with an input seek (-ss before -i) and the pieces are joined by the
# concat demuxer with -c copy, which is exact here because every clip is written with the same codec,
# frame rate and geometry. Decoding the whole 16-minute capture once per segment, which is what a
# single trim filtergraph does, would cost about an hour of decoder time for nothing.
#
# What is kept is the product and its evidence. What is removed, and why:
#   0-36s     the landing page being scrolled end to end: the explainer already covers the idea, and
#             a scrolling page is not a readable shot. The hero is kept from the end of the
#             recording, where the page sits still
#   51-58s    the run page's "Your wallet has no test ETH on Arbitrum Sepolia for gas" note, a
#             blocker state while the faucet claim settles
#   103-432s  MetaMask's own windows: "Approving spending cap", "Imported Account 6", token
#             approvals. Another program's dialog, not the product
#   432-443s  the same dialog closing
#   628-673s  the feed-print notice under a MetaMask dialog, and the dialog itself
#   811-872s  a second transaction request dialog, and the settle confirmation
#   891-932s  Blockscout waiting on its own bundle ("Launch your own fully functioning blockchain
#             explorer in minutes"), a third-party page mid-load
#   950-963s  the cases list reloading and the browser returning to the landing page
set -euo pipefail

SRC=${SRC:-/home/arch/Videos/recording_2026-10-04_12.30.48.mp4}
OUT=${OUT:-$(dirname "$0")/media/lantern-demo.mp4}
PARTS=${PARTS:-${OUT%/*}/.cutparts}

# start:end, in source seconds. Kept in one place so the offsets in build_narration.sh can be
# re-derived from these numbers rather than guessed.
SEGMENTS=(
  "965.0:968.0"   # the landing page, still: holds the bonus, prove the price
  "44.0:46.8"     # the overview: bond against requirement, what needs a decision
  "47.5:51.5"     # the case list: every case, its verdict, the bond it paid
  "75.0:82.0"     # run a case: the case, the price the feed printed, the lie size
  "796.0:805.0"   # run a case: the steps, and the feed's own print in the ledger
  "872.0:878.0"   # run a case: every step done, verdict in
  "933.5:941.0"   # prove a price: this page's read beside the contract's recorded verdict
  "944.0:950.0"   # feeds and bonds: who posts the bond, and what it pays
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
