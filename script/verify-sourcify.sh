#!/usr/bin/env bash
# Submit every contract in deployments/<network>.json to Sourcify, then read the match back.
#   ./script/verify-sourcify.sh base-sepolia
set -uo pipefail
NET="${1:?usage: verify-sourcify.sh base-sepolia|eth-sepolia}"
F="deployments/${NET}.json"
CHAIN=$(python3 -c "import json;print(json.load(open('$F'))['chainId'])")
ADDRS=()
while read -r key path; do
  addr=$(python3 -c "import json;print(json.load(open('$F'))['$key'])")
  ARBISCAN_API_KEY=unused forge verify-contract "$addr" "$path" --chain "$CHAIN" --verifier sourcify >/dev/null 2>&1
  ADDRS+=("$key $addr")
  continue
  printf '%-16s %s  %s\n' "$key" "$addr" \
    "$(curl -s "https://sourcify.dev/server/v2/contract/$CHAIN/$addr" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("match") or d.get("error") or d)' 2>/dev/null)"
done <<'MAP'
lantern src/core/Lantern.sol:Lantern
market src/market/LendingMarket.sol:LendingMarket
asset src/token/FaucetToken.sol:FaucetToken
registry src/core/FeedRegistry.sol:FeedRegistry
history src/core/History.sol:History
reportBook src/core/ReportBook.sol:ReportBook
chainlinkSource src/integrations/ChainlinkSource.sol:ChainlinkSource
MAP
sleep 45
for kv in "${ADDRS[@]}"; do set -- $kv
  printf '%-16s %s  %s\n' "$1" "$2" \
    "$(curl -s "https://sourcify.dev/server/v2/contract/$CHAIN/$2" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("match") or "not verified")')"
done
