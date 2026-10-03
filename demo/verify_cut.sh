#!/usr/bin/env bash
# Verify a shipped demo file, by reading what is actually on screen rather than trusting the edit.
#
# Two checks:
#   BANNED    states the demo must not show (other programs' error dialogs, loaders, blockers,
#             and the deployment's own out-of-gas notice). Any hit is a failure.
#   REQUIRED  the moments the demo's claim rests on. Each must appear at least once.
# It also prints the measured page map, so the narration can be timed against the picture that
# actually shipped instead of against the arithmetic that produced the edit.
set -uo pipefail

FILE=${1:?usage: verify_cut.sh <video>}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

BANNED_FILE="$WORK/banned"
REQUIRED_FILE="$WORK/required"
cat > "$BANNED_FILE" <<'PATTERNS'
low on test ETH
not starting new cases
no test ETH
Restart MetaMask
Loading is taking
Waiting for
Transferring data
Imported Account
Use at your own risk
PATTERNS
cat > "$REQUIRED_FILE" <<'PATTERNS'
Hold the bonus
Lie caught
upheld
openChallenge
provable
PATTERNS

ffmpeg -v error -y -i "$FILE" -vf fps=2 "$WORK/f_%03d.png"
ls "$WORK"/f_*.png | xargs -P 6 -I{} sh -c 'tesseract "$1" "$1.txt" --psm 6 >/dev/null 2>&1' _ {}

banned_hits=0
echo "BANNED states found on screen:"
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  for hit in $(grep -ril "$pat" "$WORK"/*.txt 2>/dev/null); do
    n=${hit##*f_}; n=${n%%.*}
    t=$(awk -v n="$n" 'BEGIN{printf "%.1f", (n-1)*0.5}')
    printf '  FAIL  t=%ss  "%s"\n' "$t" "$(grep -i "$pat" "$hit" | head -1 | tr -s ' ' | cut -c1-70)"
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
  t=$(awk -v n="$n" 'BEGIN{printf "%4.1f", (n-1)*0.5}')
  pg=$(grep -oE "Lantern [A-Za-z ]+" "$f" | head -1)
  [ -z "$pg" ] && pg=$(grep -oiE "Hold the bonus|Prove the price|Overview" "$f" | head -1)
  echo "$t|$pg"
done | awk -F'|' '{if ($2 != prev) {printf "  t=%-6ss %s\n", $1, $2; prev=$2}}'

echo
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$FILE" | \
  awk '{printf "duration: %.2fs\n", $1}'
exit $( [ "$banned_hits" -eq 0 ] && echo 0 || echo 1 )
