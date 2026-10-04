#!/usr/bin/env bash
# Build the voice track and mux it onto the cut.
#
# The voice is a male English narration at the voice's own pace, placed line by line at the second
# each line's subject is on screen. Line starts come from narration.tsv; durations are measured after
# synthesis rather than assumed, and the script refuses to ship a track where a line overruns the
# segment it belongs to or collides with the next one.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
VIDEO=${VIDEO:-$HERE/media/lantern-demo-full.mp4}
SCRIPT=${SCRIPT:-$HERE/narration.tsv}
VOICE=${VOICE:-en-US-AndrewMultilingualNeural}
RATE=${RATE:-+0%}
WORK=${WORK:-$HERE/narration}
OUT=${OUT:-$HERE/media/lantern-demo-narrated.mp4}

# End of each page segment on the assembled timeline, in seconds: the explainer's own scene lengths
# (25s total), then the recording's segment boundaries measured from the cut by scene detection
# (3.0 5.8 9.77 16.77 25.77 31.77 39.27 45.23) shifted by 25, then the end card's 12s.
SEGMENT_ENDS=(5.0 10.5 15.5 20.0 25.0 28.0 30.8 34.8 41.8 50.8 56.8 64.3 70.3 82.3)

mkdir -p "$WORK"
rm -f "$WORK"/line*.mp3 "$WORK"/line*.wav "$WORK/measured.tsv"

echo "synthesising with $VOICE at $RATE"
i=0
while IFS='|' read -r start text; do
  case "$start" in [0-9]*) ;; *) continue ;; esac
  i=$((i + 1))
  ok=0
  for attempt in 1 2 3 4; do
    edge-tts --voice "$VOICE" --rate="$RATE" --text "$text" \
      --write-media "$WORK/line$i.mp3" >/dev/null 2>&1 || true
    if [ -s "$WORK/line$i.mp3" ]; then ok=1; break; fi
    echo "  line $i: synthesis came back empty, retry $attempt"
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    echo "  line $i: synthesis failed after 4 tries: $text" >&2
    exit 1
  fi
  ffmpeg -v error -y -i "$WORK/line$i.mp3" -ar 48000 -ac 1 "$WORK/line$i.wav"
  dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$WORK/line$i.wav")
  printf '%s\t%s\t%s\t%s\n' "$i" "$start" "$dur" "$text" >> "$WORK/measured.tsv"
done < "$SCRIPT"

echo
echo "line  start   ends   gap-to-next  window-end  text"
if ! awk -v SEG="${SEGMENT_ENDS[*]}" -F'\t' '
  BEGIN { nwin = split(SEG, S, " ") }
  { idx[NR]=$1; st[NR]=$2; du[NR]=$3; tx[NR]=$4; n=NR }
  END {
    fail=0
    for (k=1; k<=n; k++) {
      end = st[k] + du[k]
      gap = (k < n) ? st[k+1] - end : -1
      window = 9999
      for (w=1; w<=nwin; w++) if (st[k] < S[w]) { window = S[w]; break }
      flag = ""
      if (end > window) { flag = flag " OVERRUNS-WINDOW"; fail=1 }
      if (k < n && gap < 0.35) { flag = flag " TOO-TIGHT"; fail=1 }
      printf "%4d  %5.1f  %5.1f  %8.1f  %9.1f  %s%s\n", idx[k], st[k], end, (k<n?gap:-1), window, substr(tx[k],1,44), flag
    }
    if (fail) { print "\nREFUSING TO BUILD: fix the timing above"; exit 1 }
  }' "$WORK/measured.tsv"; then
  exit 1
fi

N=$(wc -l < "$WORK/measured.tsv")
vdur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO")

# One silent bed the length of the cut, each line delayed to its start, then the usual chain for
# spoken word: roll off the low rumble, even out the level, and limit the peaks.
inputs=(-f lavfi -t "$vdur" -i anullsrc=r=48000:cl=mono)
filter="[0:a]atrim=0:${vdur},asetpts=PTS-STARTPTS[bed]"
mix="[bed]"
for k in $(seq 1 "$N"); do
  start=$(awk -F'\t' -v k="$k" '$1==k {print $2}' "$WORK/measured.tsv")
  ms=$(awk -v s="$start" 'BEGIN{printf "%d", s*1000}')
  inputs+=(-i "$WORK/line$k.wav")
  filter+=";[${k}:a]adelay=${ms}:all=1[L$k]"
  mix+="[L$k]"
done
filter+=";${mix}amix=inputs=$((N + 1)):normalize=0:duration=first[mixed]"
filter+=";[mixed]highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=10:release=250,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.85,volume=-1.5dB[out]"

ffmpeg -v error -y "${inputs[@]}" -filter_complex "$filter" -map "[out]" \
  -t "$vdur" -c:a aac -b:a 160k "$WORK/voice.m4a"

ffmpeg -v error -y -i "$VIDEO" -i "$WORK/voice.m4a" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest "$OUT"

echo
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name -of default=noprint_wrappers=1 "$OUT"
