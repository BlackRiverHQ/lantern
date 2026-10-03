#!/usr/bin/env bash
# Cut the raw recording into the demo timeline.
#
# The source is a VFR screen capture (r_frame_rate=90000/1) with no audio stream, so the picture is
# re-encoded at a constant 30fps and the audio is built separately in build_narration.sh.
#
# What is kept is the product and its evidence. What is removed, and why:
#   6-8s      idle between the landing page and the dashboard
#   20-29s    explorer tab, a bridge status screen, and a wallet confirmation: not the product
#   34-52s    the run page's "Your wallet has no test ETH" state, which is a blocker, not a feature
#   54-145s   MetaMask's own window, stuck on "Loading is taking longer than usual. Restart MetaMask
#             if the problem persists." Ninety seconds of another program's error dialog
#   170-196s  the run page's "demo feed is low on test ETH for gas, so it is not starting new cases"
#             notice, which is a degraded deployment state and not what the demo is about
#   199-241s  explorer waiting screens and the same notice on the prove page before it clears
#   250-261s  the same notice across the feeds view
set -euo pipefail

SRC=${SRC:-/home/arch/Videos/recording_2026-10-03_17.27.38.mp4}
OUT=${OUT:-$(dirname "$0")/media/lantern-demo.mp4}

# start:end, in source seconds. Kept in one place so the offsets in build_narration.sh can be
# re-derived from these numbers rather than guessed.
SEGMENTS=(
  "1.2:5.5"      # the landing page: what is held back and why. Starts past the browser's own
                 # "Waiting for friendly-fennec-31.convex.site..." overlay painted over the page
  "8.0:14.5"     # the overview: bond against requirement, history depth, held bonuses
  "15.0:20.0"    # the case list and one case's ledger, step by step, with blocks
  "30.0:32.5"    # the same list, six cases on this deployment. Ends at 32.5 because 33.5 is already
                 # the next page's first paint, and that one carries the wallet note
  "154.0:168.0"  # run a case: the step table, the gap, and a confirmed transaction. Starts at 154:
                 # the run page's first seconds flicker the wallet's "no test ETH" note in and out
                 # as the wallet is polled, and 153.75-170 is the longest stretch with it absent
  "242.0:249.75" # prove a price: this page's read beside the contract's recorded verdict. Runs to
                 # 249.75 because the deployment notice appears on the next page at 250.25
  "262.0:266.0"  # the landing page again, closing, out to the end of the recording
)

parts=()
for seg in "${SEGMENTS[@]}"; do
  s=${seg%%:*}; e=${seg##*:}
  parts+=(-i "$SRC")
  filter_parts+=("[${#filter_parts[@]}:v]trim=start=${s}:end=${e},setpts=PTS-STARTPTS[v${#filter_parts[@]}]")
done

filter="$(printf '%s;' "${filter_parts[@]}")"
filter+="$(for i in $(seq 0 $((${#SEGMENTS[@]} - 1))); do printf '[v%d]' "$i"; done)"
filter+="concat=n=${#SEGMENTS[@]}:v=1:a=0[out]"

ffmpeg -v error -y "${parts[@]}" \
  -filter_complex "$filter" -map "[out]" \
  -r 30 -crf 20 -preset veryfast -pix_fmt yuv420p -an "$OUT"

ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" | \
  awk '{printf "cut %s: %.2fs\n", "'"$OUT"'", $1}'
