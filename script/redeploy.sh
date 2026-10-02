#!/usr/bin/env bash
#
# Redeploy the current source and replay the demo, in one order, against the addresses this run made.
#
# The deploy lands six contracts across three transactions: the asset, Lantern, and the market, with
# Lantern's constructor building the feed registry, the history store, and the report book. The scripts
# after the deploy take those addresses from the environment, so this wrapper reads them out of the
# broadcast record instead of asking anyone to copy them by hand - which is how a demo ends up running
# against a previous deployment.
#
#   export PRIVATE_KEY=...        # testnet key, gas only
#   ./script/redeploy.sh
#
# Env, all optional apart from PRIVATE_KEY: RPC_URL, COLLATERAL, AGGREGATOR, ROUND, LIQUIDATION_ID,
# BOND, FEED_ID, HOLD_WINDOW, BOUNTY_BPS, FAUCET_CLAIM, and the market's own knobs. See .env.example.

set -euo pipefail

: "${PRIVATE_KEY:?export PRIVATE_KEY - a testnet key with gas only}"
RPC_URL="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
CHAIN_ID=421614
ART="broadcast/Deploy.s.sol/421614/run-latest.json"

# One feed id for every step. Deploy and DemoRun default to FEED:DEMO while both Chainlink scripts
# default to FEED:ARB-SEPOLIA-DEMO, so a run with nothing exported would populate one feed and then
# police another. The label is hashed once here and handed to all four, as the bytes32 they expect.
FEED_LABEL="${FEED_LABEL:-FEED:ARB-SEPOLIA-DEMO}"
PEER_LABEL="${PEER_LABEL:-FEED:ETH-USD-PEER}"
FEED_ID="$(cast keccak "$FEED_LABEL")"
PEER_FEED_ID="$(cast keccak "$PEER_LABEL")"
SUBJECT_FEED_ID="$FEED_ID"

# Same reasoning for the round and the ids the two Chainlink steps share: the report step defaults to
# round 1 and the challenge step to round 7, and the comparison is by the subject's round, so left
# alone they publish the peer on one round and price another. One value for both.
# The demo prints its lying value on the fifth round, which is the first a feed may price at all
# (MIN_SAMPLES_FOR_PRICING is four), so the peer has to be reported on that same round.
ROUND="${ROUND:-5}"
LIQUIDATION_ID="${LIQUIDATION_ID:-9}"
# What the chainlink step backs its peer feed with: a feed below the floor cannot price at all.
BOND="${BOND:-100000}"

# Collateral is the chain's wrapped ether, because collateral nobody put up is not collateral.
COLLATERAL="${COLLATERAL:-0x980B62Da83eFf3D4576C647993b0c1D7faf17c73}"
export FEED_ID SUBJECT_FEED_ID PEER_FEED_ID ROUND LIQUIDATION_ID BOND COLLATERAL

step() { printf '\n== %s\n' "$1"; }

step "deploy"
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast -vv

step "read the addresses this run made"
read -r LANTERN MARKET ASSET REGISTRY HISTORY REPORTBOOK < <(python3 - "$ART" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
made = {t.get('contractName'): t.get('contractAddress') for t in d['transactions']}
extra = {}
for t in d['transactions']:
    for c in (t.get('additionalContracts') or []):
        extra[c.get('contractName')] = c.get('address')
out = ['lantern', 'market', 'asset', 'registry', 'history', 'reportbook']
vals = {
    'lantern': made.get('Lantern', ''),
    'market': made.get('LendingMarket', ''),
    'asset': made.get('FaucetToken', ''),
    'registry': extra.get('FeedRegistry', ''),
    'history': extra.get('History', ''),
    'reportbook': extra.get('ReportBook', ''),
}
print(' '.join(vals[k] for k in out))
PY
)
export LANTERN MARKET
printf '  lantern   %s\n  market    %s\n  asset     %s\n  registry  %s\n  history   %s\n  book      %s\n' \
  "$LANTERN" "$MARKET" "$ASSET" "$REGISTRY" "$HISTORY" "$REPORTBOOK"

step "assert the deploy is really on chain"
for addr in "$LANTERN" "$MARKET" "$REGISTRY"; do
  if [ -z "$addr" ]; then
    echo "the deploy reported no address for one of lantern/market/registry - refusing to continue" >&2
    exit 1
  fi
  code=$(cast code "$addr" --rpc-url "$RPC_URL")
  if [ "${#code}" -le 3 ]; then
    echo "$addr has no code: the deploy did not land (gas, most likely). Refusing to run the demo." >&2
    exit 1
  fi
done
echo "  all three answer with code"

step "demo"
forge script script/DemoRun.s.sol --rpc-url "$RPC_URL" --broadcast -vv

step "chainlink report"
forge script script/ReportFromChainlink.s.sol --rpc-url "$RPC_URL" --broadcast -vv

step "chainlink challenge"
forge script script/ChallengeWithChainlink.s.sol --rpc-url "$RPC_URL" --broadcast -vv

step "settle"
forge script script/DemoSettle.s.sol --rpc-url "$RPC_URL" --broadcast -vv

step "write deployments.json"
python3 - "$RPC_URL" "$CHAIN_ID" "$LANTERN" "$MARKET" "$ASSET" "$REGISTRY" "$HISTORY" "$REPORTBOOK" "$COLLATERAL" <<'PY'
import json, subprocess, sys
rpc, chain, lantern, market, asset, registry, history, book, collateral = sys.argv[1:10]

def cast(*a, chain=False):
    cmd = ["cast", *a] + (["--rpc-url", rpc] if chain else [])
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()

def deployed(source):
    try:
        d = json.load(open("broadcast/%s/%s/run-latest.json" % (source, chain)))
    except FileNotFoundError:
        return ""
    for t in d["transactions"]:
        if t.get("contractName") == "ChainlinkSource":
            return t.get("contractAddress", "")
    return ""

record = {
    "chainId": int(chain),
    "network": "arbitrum-sepolia",
    "note": "Written by script/redeploy.sh from the broadcast record. This supersedes every earlier address in docs/.",
    "lantern": lantern,
    "market": market,
    "asset": asset,
    "collateral": collateral,
    "registry": registry,
    "history": history,
    "reportBook": book,
    "chainlinkSource": deployed("ReportFromChainlink.s.sol"),
    "chainlinkEthUsd": "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
    "subjectFeed": cast("keccak", "FEED:ARB-SEPOLIA-DEMO"),
    "peerFeed": cast("keccak", "FEED:ETH-USD-PEER"),
    "marketParams": {
        "collateralFactorBps": 7000,
        "liquidationBonusBps": 500,
        "closeFactorBps": 5000,
        "note": "read them off the market itself if it matters: collateralFactorBps(), liquidationBonusBps(), closeFactorBps()",
    },
}
json.dump(record, open("deployments.json", "w"), indent=2)
open("deployments.json", "a").write("\n")
print(json.dumps(record, indent=2))
PY

step "done"
printf 'The addresses above are the live record. Re-run docs/DEPLOYMENTS.md reads against them,\n'
printf 'then update the table and the cast block if any value moved.\n'
