#!/usr/bin/env bash
#
# Prove the deployed bytecode is this source.
#
# A deployed contract is not byte-identical to the artifact: the constructor substitutes its immutable
# values into the runtime code, and those values are zero in the artifact. So the check is not "the
# hashes match" but "every difference is an immutable slot":
#
#   - the two are the same length
#   - the metadata trailer is identical, which pins compiler, sources and settings
#   - every differing 32-byte word is zero in the local artifact, so no logic differs
#
# Usage: ./script/verify-source.sh [lantern|registry|all]

set -euo pipefail

RPC_URL="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
WHICH="${1:-all}"

check() {
  local name="$1" src="$2" addr="$3"
  printf '\n%s  %s\n' "$name" "$addr"

  local local_hex chain_hex
  local_hex="$(forge inspect "$src" deployedBytecode 2>/dev/null | tr -d '\n' | sed 's/^0x//')"
  chain_hex="$(cast code "$addr" --rpc-url "$RPC_URL" | tr -d '\n' | sed 's/^0x//')"

  if [ -z "$chain_hex" ]; then
    echo "  no code at that address"; return 1
  fi
  printf '  local %s bytes, chain %s bytes\n' "$(( ${#local_hex} / 2 ))" "$(( ${#chain_hex} / 2 ))"

  python3 - "$name" "$local_hex" "$chain_hex" <<'PY'
import sys
name, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
if len(a) != len(b):
    print(f"  DIFFER: lengths differ by {abs(len(a)-len(b))//2} bytes"); sys.exit(1)

# Immutables are not grid-aligned in the runtime code - a 20-byte address can straddle any boundary -
# so compare byte runs rather than 32-byte words.
def runs(x, y):
    out, start = [], None
    for i in range(0, len(x), 2):
        if x[i:i+2] != y[i:i+2]:
            if start is None: start = i
        elif start is not None:
            out.append((start, i)); start = None
    if start is not None: out.append((start, len(x)))
    return out

diff = runs(a, b)
same_meta = a[-106:] == b[-106:]

if not diff:
    print("  identical, immutables included"); sys.exit(0)

print(f"  {len(diff)} differing runs across {len(a)//2} bytes")
print(f"  metadata trailer identical: {same_meta}")

bad = []
for s, e in diff:
    local_bytes, chain_bytes = a[s:e], b[s:e]
    n = len(local_bytes) // 2
    value = int(chain_bytes, 16)
    kind = "address" if n == 20 else "number"
    shown = "0x" + chain_bytes if kind == "address" else str(value)
    empty = set(local_bytes) == {"0"}
    if not empty: bad.append((s // 2, n, shown))
    print(f"    byte {s//2:6}  {n:2} bytes  {kind:8} {shown}{'' if empty else '   <- NOT EMPTY IN THE ARTIFACT'}")

if bad or not same_meta:
    print(f"  VERDICT: {name} differs beyond its immutables")
    sys.exit(1)
print(f"  VERDICT: {name} on chain is this source, with its {len(diff)} immutable values filled in")
PY
}

# The defaults are the live deployment. They are read from the record the deploy wrote rather than
# typed here, so a redeploy cannot leave this proving the wrong instance: a verification that checks
# an address nobody is using passes while the live one goes unchecked.
RECORD="deployments.json"
if [ -f "$RECORD" ]; then
  read -r R_LANTERN R_MARKET R_ASSET R_REGISTRY R_HISTORY R_BOOK < <(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
print(" ".join(d.get(k, "") for k in ("lantern", "market", "asset", "registry", "history", "reportBook")))
' "$RECORD")
fi

if [ "$WHICH" = "all" ] || [ "$WHICH" = "lantern" ]; then
  check "Lantern"      "src/core/Lantern.sol:Lantern"           "${LANTERN:-${R_LANTERN:-0x83b4E869a471638c374De4Bcf4Ab6Ba2396f9040}}"
fi
if [ "$WHICH" = "all" ] || [ "$WHICH" = "market" ]; then
  check "LendingMarket" "src/market/LendingMarket.sol:LendingMarket" "${MARKET:-${R_MARKET:-0x290714D09f6d1AB50F7c31698EDa92993ab01F95}}"
fi
if [ "$WHICH" = "all" ] || [ "$WHICH" = "asset" ]; then
  check "FaucetToken"  "src/token/FaucetToken.sol:FaucetToken"  "${ASSET:-${R_ASSET:-0x185690fb4D3c765bAc544423A34953B2b8b03A22}}"
fi
if [ "$WHICH" = "all" ] || [ "$WHICH" = "registry" ]; then
  check "FeedRegistry" "src/core/FeedRegistry.sol:FeedRegistry" "${REGISTRY:-${R_REGISTRY:-0x8a57442AC47d2ceC7D3B9cE6E1323603012EF57B}}"
fi
if [ "$WHICH" = "all" ] || [ "$WHICH" = "history" ]; then
  check "History"      "src/core/History.sol:History"           "${HISTORY:-${R_HISTORY:-0x60bac9cae4551e4e1900898b29bece48b6cac9e4}}"
fi
if [ "$WHICH" = "all" ] || [ "$WHICH" = "book" ]; then
  check "ReportBook"   "src/core/ReportBook.sol:ReportBook"     "${BOOK:-${R_BOOK:-0xcc12b22e7ce416eec9f5f5b1d68c02cc8252da5a}}"
fi
