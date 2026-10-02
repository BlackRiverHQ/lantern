#!/usr/bin/env bash
#
# Rehearse the whole redeploy on a fork of the live chain, without touching the repo or spending
# anything: the same four scripts, the same order, a throwaway copy of the tree, and a local chain
# forked from the real one so the Chainlink aggregator answers with its real value.
#
# This exists because the sequence has to agree with itself in three places - one feed id, one round,
# one set of ids - and a mismatch only shows up as a failed step after the deploy has already been
# paid for. Run this first.
#
#   ./script/rehearse-fork.sh
#
# Env: RPC (the chain to fork, default Arbitrum Sepolia), PORT (default 8547).
#
# The key below is anvil's first default account. It is published in anvil's own documentation, it is
# what every local chain starts with, and it holds nothing on any real network. It signs only against
# the throwaway fork this script starts. No real key is ever needed or read by this script.

set -euo pipefail

RPC="${RPC:-https://sepolia-rollup.arbitrum.io/rpc}"
PORT="${PORT:-8547}"
REHEARSAL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
REHEARSAL_ACCT="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
FORK="http://127.0.0.1:$PORT"

cleanup() {
  if [ -n "${ANVIL_PID:-}" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT

printf '== copy the tree to %s (the real one is never written to)\n' "$WORK"
rsync -a --exclude .git --exclude node_modules "$ROOT/" "$WORK/"

printf '== fork %s on port %s\n' "$RPC" "$PORT"
anvil --silent --fork-url "$RPC" --chain-id 421614 --port "$PORT" &
ANVIL_PID=$!
for _ in $(seq 1 30); do
  if cast chain-id --rpc-url "$FORK" >/dev/null 2>&1; then break; fi
  sleep 1
done
fork_block="$(cast block-number --rpc-url "$FORK")"

# the fork inherits the real balances, but the rehearsal signs with a local key, so give it gas
cast rpc anvil_setBalance "$REHEARSAL_ACCT" 0x21e19e0c9bab2400000 --rpc-url "$FORK" >/dev/null
printf '  forked at block %s, rehearse account funded\n' "$fork_block"

printf '== run the sequence against the fork\n'
cd "$WORK"
PRIVATE_KEY="$REHEARSAL_KEY" RPC_URL="$FORK" ./script/redeploy.sh

printf '\n== what the rehearsal spent\n'
GAS_PRICE="$(cast gas-price --rpc-url "$FORK" 2>/dev/null || echo 0)"
python3 - "$GAS_PRICE" <<'PY'
import json, os, sys
total = txs = 0
for name in ['Deploy.s.sol', 'DemoRun.s.sol', 'ReportFromChainlink.s.sol', 'ChallengeWithChainlink.s.sol', 'DemoSettle.s.sol']:
    f = 'broadcast/%s/421614/run-latest.json' % name
    if not os.path.exists(f):
        continue
    d = json.load(open(f))
    g = sum(int(r['gasUsed'], 16) for r in (d.get('receipts') or []))
    n = len(d.get('receipts') or [])
    total += g
    txs += n
    print('  %-30s %3d txs %12s gas' % (name, n, format(g, ',')))
print('  %-30s %3d txs %12s gas' % ('total', txs, format(total, ',')))
price = int(sys.argv[1] or 0) / 1e9
if price:
    print('  at the fork\'s %.6f gwei that is %.9f ETH' % (price, total / 1e9 * price))
else:
    print('  (gas price was not readable; multiply the total by the chain\'s price yourself)')
PY

printf '\n== the fork exits with this script. Nothing above touched %s or any real chain.\n' "$ROOT"
