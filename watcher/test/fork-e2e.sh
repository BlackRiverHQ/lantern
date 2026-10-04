#!/usr/bin/env bash
#
# fork-e2e.sh: the watcher against the real deployment, on a local fork of Arbitrum Sepolia.
#
# Two fresh liquidations are made through the market, exactly as the dashboard makes them:
#   A  the feed prints 18% under Chainlink, the market liquidates on it   -> the watcher must challenge and win
#   B  the feed prints 2% under Chainlink, the market liquidates on it    -> the watcher must leave it alone
# Then the watcher runs once with a key that has never touched the deployment, and the script checks
# the outcome from chain state rather than from the watcher's own output.
#
# Nothing here touches the live chain. The feed operator is impersonated on the fork (anvil's
# --unlocked), and the other three keys are anvil's published default accounts, which hold nothing
# on any real network.

set -eEuo pipefail
cd "$(dirname "$0")/.."

RPC_LIVE="${RPC_LIVE:-https://sepolia-rollup.arbitrum.io/rpc}"
PORT="${PORT:-8549}"
FORK="http://127.0.0.1:$PORT"

LANTERN=0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54
MARKET=0x290714d09f6d1ab50f7c31698eda92993ab01f95
ASSET=0x185690fb4d3c765bac544423a34953b2b8b03a22
WETH=0x980B62Da83eFf3D4576C647993b0c1D7faf17c73
AGG=0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165
SUBJ=0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210
PEER=0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2

# anvil's default accounts 1..3 (public test keys)
BORROWER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
LIQ_KEY=0x5de4111afa1a4b94908f83f6e1f53ab72fdbea5b7f6ac7b0b9b2ab6f5bbbc2a8
WATCHER_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
LIQ=$(cast wallet address $LIQ_KEY)
WATCHER=$(cast wallet address $WATCHER_KEY)

anvil --silent --fork-url "$RPC_LIVE" --chain-id 421614 --port "$PORT" &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do cast chain-id --rpc-url "$FORK" >/dev/null 2>&1 && break; sleep 1; done
echo "== forked Arbitrum Sepolia at block $(cast block-number --rpc-url "$FORK")"

OP=$(cast call $LANTERN "operatorOf(bytes32)(address)" $SUBJ --rpc-url "$FORK")
cast rpc anvil_impersonateAccount "$OP" --rpc-url "$FORK" >/dev/null
for a in "$OP" "$LIQ" "$WATCHER" "$(cast wallet address $BORROWER_KEY)"; do
  cast rpc anvil_setBalance "$a" 0x8AC7230489E80000 --rpc-url "$FORK" >/dev/null
done

tx()  { cast send --rpc-url "$FORK" "$@" >/dev/null; }
asop(){ tx --unlocked --from "$OP" "$@"; }
num() { cast call --rpc-url "$FORK" "$@" | awk '{print $1}'; }
REG=$(cast call $LANTERN "reg()(address)" --rpc-url "$FORK")
now(){ cast block latest -f timestamp --rpc-url "$FORK"; }
lastround(){ cast call $REG "lastReport(bytes32)((uint256,uint256,uint256,uint256,uint64,uint64,bytes32,address,uint64,bool))" "$1" --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $5}'; }

# Chainlink's ETH/USD on six decimals: the honest price, and what the second feed prints
CL=$(( $(cast call $AGG "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$FORK" | sed -n 2p | awk '{print $1}') / 100 ))
echo "   chainlink ETH/USD $CL"

# one borrower per case, each a fresh anvil-derived key so their loans do not interfere
make_case() { # $1 case id, $2 gap in bps, $3 borrower key
  local id=$1 gap=$2 bkey=$3
  local b; b=$(cast wallet address "$bkey")
  cast rpc anvil_setBalance "$b" 0x8AC7230489E80000 --rpc-url "$FORK" >/dev/null
  local t
  # the per-print drift guard (20%) means the feed has to walk back to the real price in steps if
  # its last print was far from it; each step is an ordinary honest print at the next round
  local last r s p
  for _ in 1 2 3 4 5 6; do
    s=$(lastround $SUBJ); p=$(lastround $PEER); r=$(( (s > p ? s : p) + 1 ))
    last=$(cast call $REG "lastReport(bytes32)((uint256,uint256,uint256,uint256,uint64,uint64,bytes32,address,uint64,bool))" $SUBJ --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $1}' | awk '{print $1}')
    local lo=$(( last * 85 / 100 )) hi=$(( last * 115 / 100 )) v=$CL
    [ "$v" -lt "$lo" ] && v=$lo; [ "$v" -gt "$hi" ] && v=$hi
    [ "$v" = "$CL" ] && break
    t=$(now)
    asop $LANTERN "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)" $SUBJ $v $r "$t" "$(cast keccak "E2E:$id:WALK:$r")" "$OP"
  done
  s=$(lastround $SUBJ); p=$(lastround $PEER)
  local r1=$(( (s > p ? s : p) + 1 )); local r2=$(( r1 + 1 ))
  t=$(now)
  # keep the bond above what one more liquidation will need, as the live operator service does
  local need; need=$(num $LANTERN "requiredBond(bytes32)(uint256)" $SUBJ)
  asop $ASSET "approve(address,uint256)" $LANTERN $(( need * 3 ))
  local bal; bal=$(num $ASSET "balanceOf(address)(uint256)" "$OP")
  if [ "$bal" -lt "$need" ]; then cast rpc anvil_increaseTime 120 --rpc-url "$FORK" >/dev/null; asop $ASSET "claim()"; fi
  asop $LANTERN "depositBond(bytes32,uint256)" $SUBJ "$need"

  asop $LANTERN "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)" $SUBJ $CL $r1 "$t" "$(cast keccak "E2E:$id:HONEST")" "$OP"
  # the borrower posts wrapped ether and borrows 95% of the limit at the honest price
  tx --private-key "$bkey" $WETH "deposit()" --value 50000000000000
  tx --private-key "$bkey" $WETH "approve(address,uint256)" $MARKET 50000000000000
  tx --private-key "$bkey" $MARKET "depositCollateral(uint256)" 50000000000000
  local val lim; val=$(num $MARKET "collateralValueOf(address,uint256)(uint256)" "$b" $CL)
  lim=$(num $MARKET "borrowLimitFor(uint256)(uint256)" "$val")
  tx --private-key "$bkey" $MARKET "borrow(uint256)" $(( lim * ${4:-95} / 100 ))

  local lie=$(( CL * (10000 - gap) / 10000 ))
  t=$(now)
  asop $LANTERN "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)" $SUBJ $lie $r2 "$t" "$(cast keccak "E2E:$id:LIE")" "$OP"
  asop $LANTERN "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)" $PEER $CL $r2 "$t" "$(cast keccak "E2E:$id:PEER")" "$OP"

  # an ordinary liquidator, with its own faucet claim, liquidates on the printed price
  local debt; debt=$(cast call $MARKET "accountOf(address)((uint256,uint256,uint256))" "$b" --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $2}')
  local repay=$(( debt / 2 ))
  tx --private-key $LIQ_KEY $ASSET "claim()" || { cast rpc anvil_increaseTime 120 --rpc-url "$FORK" >/dev/null; tx --private-key $LIQ_KEY $ASSET "claim()"; }
  tx --private-key $LIQ_KEY $ASSET "approve(address,uint256)" $MARKET 1000000000
  tx --private-key $LIQ_KEY $MARKET "liquidate(address,uint256,uint64,uint256)" "$b" "$id" $r2 $repay
  echo "   case $id: printed $lie vs chainlink $CL (gap ${gap} bps) at round $r2, liquidated, bonus $(cast call $LANTERN 'escrowOf(uint256)((bytes32,uint64,uint64,uint64,uint256,address,address,uint8,bool))' "$id" --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $5}')"
}

BASE=$(( $(date +%s) % 1000000 + 900000000 ))
A=$BASE; B=$(( BASE + 1 ))
echo "== case A ($A): an 18% lie"
make_case $A 1800 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
echo "== case B ($B): a 4% gap, inside the 5% tolerance, on a 99% loan"
make_case $B 400 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba 99

WB0=$(num $ASSET "balanceOf(address)(uint256)" "$WATCHER")
echo "== the watcher, once, with a key that has never touched the deployment"
RPC_URL="$FORK" WATCHER_PRIVATE_KEY=$WATCHER_KEY LEDGER="$(mktemp)" node bin/watch.mjs --once

esc(){ cast call $LANTERN "escrowOf(uint256)((bytes32,uint64,uint64,uint64,uint256,address,address,uint8,bool))" "$1" --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $8}'; }
prover(){ cast call $LANTERN "challengeOf(uint256)((address,uint256,uint8,bytes32,bool,bool,uint64))" "$1" --rpc-url "$FORK" | sed -E 's/ \[[^]]*\]//g' | tr -d '()' | awk -F', ' '{print $1}'; }
WB1=$(num $ASSET "balanceOf(address)(uint256)" "$WATCHER")

fail=0
check(){ if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (got $2, want $3)"; fail=1; fi; }
echo "== checked from chain state"
check "case A outcome is 2 (bonus redirected to the borrower)" "$(esc $A)" 2
check "case A was challenged by the watcher" "$(prover $A | tr A-F a-f)" "$(echo $WATCHER | tr A-F a-f)"
check "case B is still held (outcome 0)" "$(esc $B)" 0
check "case B was not challenged" "$(prover $B)" 0x0000000000000000000000000000000000000000
echo "  watcher asset balance $WB0 -> $WB1 (stake back plus the bounty, net of any faucet claim)"
exit $fail
