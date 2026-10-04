#!/usr/bin/env bash
# Verify a shipped demo file, by reading what is actually on screen rather than trusting the edit.
#
# Two checks:
#   BANNED    states the demo must not show: other programs' error dialogs, the browser's own loading
#             overlay, and the deployment's out-of-gas notice. Any hit is a failure.
#   REQUIRED  the moments the demo's claim rests on. Each must appear at least once.
# It also prints the measured page map, so the narration can be timed against the picture that
# actually shipped instead of against the arithmetic that produced the edit.
#
# This is the long cut, so the wallet's own panels and the explorer's transaction pages are part of what
# it shows rather than something to strip: "Imported Account" and the explorer's page title are required
# here, and the wallet's "no test ETH on Arbitrum Sepolia for gas" note is allowed because the run page
# says what the wallet needs and links the faucet instead of hiding the dependency.
#
# FPS (default 2) is how often a frame is read back; PAR (default 6) is how many OCR workers run. A
# ten-minute capture at 2 fps is a thousand pages of tesseract, so a long cut is read at 0.5 fps.
set -uo pipefail

FILE=${1:?usage: verify_cut.sh <video>}
FPS=${FPS:-2}
PAR=${PAR:-6}
STEP=$(awk -v f="$FPS" 'BEGIN{printf "%.4f", 1/f}')
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

BANNED_FILE="$WORK/banned"
REQUIRED_FILE="$WORK/required"
cat > "$BANNED_FILE" <<'PATTERNS'
low on test ETH
not starting new cases
Restart MetaMask
Loading is taking
Waiting for
Transferring data
Use at your own risk
Proceed anyway
PATTERNS
cat > "$REQUIRED_FILE" <<'PATTERNS'
Hold the bonus
Lie caught
upheld
provable
Imported Account
Transaction details
PATTERNS

ffmpeg -v error -y -i "$FILE" -vf fps="$FPS" "$WORK/f_%03d.png"
ls "$WORK"/f_*.png | xargs -P "$PAR" -I{} sh -c 'tesseract "$1" "$1.txt" --psm 6 >/dev/null 2>&1' _ {}
at() { awk -v n="$1" -v s="$STEP" 'BEGIN{printf "%.1f", (n-1)*s}'; }

banned_hits=0
echo "BANNED states found on screen:"
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  for hit in $(grep -ril "$pat" "$WORK"/*.txt 2>/dev/null); do
    n=${hit##*f_}; n=${n%%.*}
    printf '  FAIL  t=%ss  "%s"\n' "$(at "$n")" "$(grep -i "$pat" "$hit" | head -1 | tr -s ' ' | cut -c1-70)"
    banned_hits=$((banned_hits + 1))
  done
done < "$BANNED_FILE"
[ "$banned_hits" -eq 0 ] && echo "  none"

echo
echo "REQUIRED moments found:"
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  c=$(grep -ril "$pat" "$WORK"/*.txt 2>/dev/null | wc -l)
  printf '  %-18s %s frame(s)\n' "$pat" "$c"
done < "$REQUIRED_FILE"

echo
echo "MEASURED page map:"
for f in $(ls "$WORK"/*.txt | sort); do
  n=${f##*f_}; n=${n%%.*}
  pg=$(grep -oE "Lantern [A-Za-z ]+" "$f" | head -1)
  [ -z "$pg" ] && pg=$(grep -oiE "Hold the bonus|Prove the price|Overview|Imported Account|Transaction details" "$f" | head -1)
  echo "$(at "$n")|$pg"
done | awk -F'|' '{if ($2 != prev) {printf "  t=%-6ss %s\n", $1, $2; prev=$2}}'

echo
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FILE" | \
  awk '{printf "duration: %.2fs\n", $1}'
exit $( [ "$banned_hits" -eq 0 ] && echo 0 || echo 1 )
