#!/usr/bin/env bash
# Run a fresh, independent critic (new Claude Code session, no shared context).
# Usage: tools/critic.sh <prompt-file> <report-out>
set -euo pipefail
cd "$(dirname "$0")/.."
prompt="$(cat "$1")"
timeout 1800 claude -p "$prompt" --allowedTools "Bash Read Write Glob Grep" --permission-mode acceptEdits --output-format text > "$2.stdout" 2>&1 || true
[ -s "$2" ] || cp "$2.stdout" "$2"
echo "report: $2"
