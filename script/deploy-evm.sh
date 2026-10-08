#!/usr/bin/env bash
#
# Deploy Lantern to another EVM testnet and run the whole lifecycle there, against that chain's own
# wrapped ether and that chain's own Chainlink ETH/USD aggregator:
#
#   deploy -> list, bond and warm up a feed -> a print 10%+ under Chainlink -> liquidation (bonus held)
#   -> Chainlink published as the peer source -> challenge -> adjudicate -> settle
#
# The Arbitrum Sepolia record (deployments.json, written by redeploy.sh) is left alone; each chain gets
# its own file under deployments/.
#
#   export PRIVATE_KEY=...                 # testnet key, gas only
#   ./script/deploy-evm.sh base-sepolia
#   ./script/deploy-evm.sh eth-sepolia

set -euo pipefail

: "${PRIVATE_KEY:?export PRIVATE_KEY - a testnet key with gas only}"
NETWORK="${1:?usage: deploy-evm.sh base-sepolia|eth-sepolia}"

case "$NETWORK" in
  base-sepolia)
    CHAIN_ID=84532
    RPC_URL="${RPC_URL:-https://sepolia.base.org}"
    COLLATERAL=0x4200000000000000000000000000000000000006   # WETH
    AGGREGATOR=0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1   # Chainlink ETH/USD
    EXPLORER=https://base-sepolia.blockscout.com
    ;;
  eth-sepolia)
    CHAIN_ID=11155111
    RPC_URL="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
    COLLATERAL=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14   # WETH
    AGGREGATOR=0x694AA1769357215DE4FAC081bf1f309aDC325306   # Chainlink ETH/USD
    EXPLORER=https://eth-sepolia.blockscout.com
    ;;
  *) echo "unknown network: $NETWORK" >&2; exit 1 ;;
esac

[ "$(cast chain-id --rpc-url "$RPC_URL")" = "$CHAIN_ID" ] || { echo "RPC is not chain $CHAIN_ID" >&2; exit 1; }

# One feed id, one round and one liquidation id for every step (see redeploy.sh for why).
FEED_LABEL="FEED:${NETWORK^^}-DEMO"
PEER_LABEL="FEED:ETH-USD-PEER"
FEED_ID="$(cast keccak "$FEED_LABEL")"
PEER_FEED_ID="$(cast keccak "$PEER_LABEL")"
SUBJECT_FEED_ID="$FEED_ID"
ROUND=5
LIQUIDATION_ID=9
BOND=100000
export FEED_ID SUBJECT_FEED_ID PEER_FEED_ID ROUND LIQUIDATION_ID BOND COLLATERAL AGGREGATOR

LOG="deployments/${NETWORK}.log"
mkdir -p deployments
: > "$LOG"
run() { forge script "$1" --rpc-url "$RPC_URL" --broadcast --slow --gas-estimate-multiplier "${GAS_MULT:-130}" -vv 2>&1 | tee -a "$LOG" | grep -vE '^\s*$' | tail -25; }
step() { printf '\n== %s\n' "$1" | tee -a "$LOG"; }

step "deploy"
run script/Deploy.s.sol

ART="broadcast/Deploy.s.sol/${CHAIN_ID}/run-latest.json"
read -r LANTERN MARKET ASSET REGISTRY HISTORY REPORTBOOK < <(python3 - "$ART" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
made = {t.get('contractName'): t.get('contractAddress') for t in d['transactions']}
extra = {}
for t in d['transactions']:
    for c in (t.get('additionalContracts') or []):
        extra[c.get('contractName')] = c.get('address')
print(made.get('Lantern',''), made.get('LendingMarket',''), made.get('FaucetToken',''),
      extra.get('FeedRegistry',''), extra.get('History',''), extra.get('ReportBook',''))
PY
)
export LANTERN MARKET
for addr in "$LANTERN" "$MARKET" "$REGISTRY"; do
  [ -n "$addr" ] && [ "$(cast code "$addr" --rpc-url "$RPC_URL" | wc -c)" -gt 4 ] \
    || { echo "deploy did not land ($addr) - refusing to continue" >&2; exit 1; }
done

step "lifecycle: list, bond, warm up, print low, liquidate"
run script/DemoRun.s.sol
step "Chainlink ETH/USD published as the peer source"
run script/ReportFromChainlink.s.sol
step "challenge and adjudicate"
run script/ChallengeWithChainlink.s.sol
step "settle"
run script/DemoSettle.s.sol

step "write deployments/${NETWORK}.json"
python3 - "$NETWORK" "$CHAIN_ID" "$RPC_URL" "$EXPLORER" "$AGGREGATOR" "$COLLATERAL" \
  "$LANTERN" "$MARKET" "$ASSET" "$REGISTRY" "$HISTORY" "$REPORTBOOK" "$FEED_ID" "$PEER_FEED_ID" <<'PY'
import json, subprocess, sys
(net, chain, rpc, explorer, agg, coll, lantern, market, asset, registry, history, book,
 feed, peer) = sys.argv[1:15]

def broadcast(script):
    try:
        return json.load(open(f"broadcast/{script}/{chain}/run-latest.json"))
    except FileNotFoundError:
        return {"transactions": [], "receipts": []}

def call(sig, *args):
    out = subprocess.run(["cast", "call", lantern, sig, *args, "--rpc-url", rpc],
                         capture_output=True, text=True).stdout.strip()
    return out.split()[0] if out else ""

txs = {}
for step, script in [("deploy", "Deploy.s.sol"), ("lifecycle", "DemoRun.s.sol"),
                     ("chainlinkReport", "ReportFromChainlink.s.sol"),
                     ("challenge", "ChallengeWithChainlink.s.sol"), ("settle", "DemoSettle.s.sol")]:
    b = broadcast(script)
    txs[step] = [{"fn": t.get("function") or ("create " + (t.get("contractName") or "")),
                  "hash": t.get("hash")} for t in b["transactions"]]
source = next((t.get("contractAddress") for t in broadcast("ReportFromChainlink.s.sol")["transactions"]
               if t.get("contractName") == "ChainlinkSource"), "")

record = {
    "chainId": int(chain), "network": net, "explorer": explorer,
    "note": "Written by script/deploy-evm.sh from the broadcast record and read back from the chain.",
    "lantern": lantern, "market": market, "asset": asset, "collateral": coll,
    "registry": registry, "history": history, "reportBook": book,
    "chainlinkSource": source, "chainlinkEthUsd": agg,
    "subjectFeed": feed, "peerFeed": peer, "liquidationId": 9,
    "readBack": {
        "bonusOutcome (2 = redirected to the borrower)": call("bonusOutcome(uint256)(uint8)", "9"),
        "bonusSettled": call("bonusSettled(uint256)(bool)", "9"),
        "subjectFeedErrors": call("feedErrors(bytes32)(uint256)", feed),
        "heldTotal": call("heldTotal()(uint256)"),
    },
    "transactions": txs,
}
json.dump(record, open(f"deployments/{net}.json", "w"), indent=2)
open(f"deployments/{net}.json", "a").write("\n")
print(json.dumps(record["readBack"], indent=2))
PY

step "done: deployments/${NETWORK}.json"
