#!/usr/bin/env bash
# tools/sheet.sh <name> <times-csv> [--v]  → review/sheet-<name>.jpg (frames in time order)
set -e
cd "$(dirname "$0")/.."
export CHROME=$(ls -d ~/.cache/ms-playwright/chromium-1234/*/chrome)
d=review/st-$1; rm -rf $d; mkdir -p $d
timeout 600 node tools/stills.mjs $d/x "$2" $3 2>&1 | grep -v "^ok$" || true
i=0; for t in ${2//,/ }; do f=$(printf "%s/x-%.2f.png" $d $t); [ -f "$f" ] && mv "$f" $(printf "%s/f%03d.png" $d $i); i=$((i+1)); done
cols=4; [ "$3" = "--v" ] && cols=8
ffmpeg -loglevel error -y -i "$d/f%03d.png" -vf "scale=640:-1,drawtext=text='%{n}':x=8:y=8:fontsize=28:fontcolor=white:box=1:boxcolor=black,tile=${cols}x$(( (i+cols-1)/cols )):padding=6:color=white" -frames:v 1 review/sheet-$1.jpg
echo review/sheet-$1.jpg
