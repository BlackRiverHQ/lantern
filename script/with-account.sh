#!/usr/bin/env bash
#
# Run a command with PRIVATE_KEY loaded from the account file, so the key never has to be exported by
# hand, pasted into a shell, or typed into a transcript.
#
#   ./script/with-account.sh ./script/redeploy.sh
#   ./script/with-account.sh forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
#
# The file is created once, outside the repository, by:
#
#   cast wallet new --json > ~/.lantern-deployer.json && chmod 600 ~/.lantern-deployer.json
#
# ACCOUNT_FILE overrides the path. The value is read from the file and passed straight into the
# environment: it is never echoed, never written to the repository, and never printed.

set -euo pipefail

ACCOUNT_FILE="${ACCOUNT_FILE:-$HOME/.lantern-deployer.json}"

if [ ! -f "$ACCOUNT_FILE" ]; then
  echo "no account file at $ACCOUNT_FILE" >&2
  echo "create one with: cast wallet new --json > $ACCOUNT_FILE && chmod 600 $ACCOUNT_FILE" >&2
  exit 1
fi

PRIVATE_KEY="$(python3 - "$ACCOUNT_FILE" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
a = d[0] if isinstance(d, list) else d
key = a["private_key"]
if not key.startswith("0x"):
    key = "0x" + key
print(key)
PY
)"

export PRIVATE_KEY
exec "$@"
