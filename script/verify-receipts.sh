#!/usr/bin/env bash
#
# verify-receipts.sh: re-check every transaction the README quotes, and the counters it quotes,
# against Arbitrum Sepolia over the public RPC. No key, no API key.
#
#   ./script/verify-receipts.sh            exit 0 only when every receipt succeeded and was emitted by
#                                          the deployed Lantern, and every case reads the outcome the
#                                          README says it has
set -uo pipefail

RPC="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
L=$(python3 -c "import json;print(json.load(open('deployments.json'))['lantern'])" 2>/dev/null || echo 0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54)
SUBJECT=0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210

# case | outcome the README states (0 held, 1 released, 2 redirected) | liquidation | challenge | verdict
CASES=(
  "9  2 0xc58ff30a60775fd8f4484e4b547b26c147ba904f8e3e746d7a4f4b6e212befc9 0xfb2cc7fada2210dec7d493d8a586f14a31f976ceb59adcc36e7b12b3353fa43d 0x200b102bbd58dcc650e9f5a5709c0c447a67ca12b6376c70d5307d76c8e050cf"
  "37 2 0x6ec41f3345aa3daf629fec5a0f51359f60bfe1f961d88d9436f9464054caaaaf 0x2c6de9a4719e0b46e18c2e11cb638cf91565c1b2766121edf2ea8d2b7b2e0a14 0x531492d9ade067c6c8571403ec4e2a67d79e3320932aec68164e496c060b2bdd"
  "41 0 0x9df7e8cf27078846ae831e56175118f2c1f28b7c64a4fc21735b6f8cd903d719 - -"
  "42 2 0x0affe1f13ac30416857fedc904a88a7624a20a93e02aeaaca8af1731fefd39bb 0x8c65b7442575cb108f25c3f8ef41973d88a2158b62c2f1dbe01bab5d20233fe8 0x55e96586f9616c8524d80f21a407d5d728cf278db44a30b7631e21199a640c2d"
  "44 2 0xe5049fdddda794eb233e48d9e1b1c9718b65ceb6c28b394baefcfa6c61658cf2 0xe3f823fa3886ffaf2336dd8cac8148ba464ce93d07c1dadd9cf0686c12fd0510 0x4444c67ff998a5be2a0a6d943ab5f022fa920336035cee1eeff736fd4058cb5e"
  "45 2 0x58bcefb83ea4e172a6cf201f643074e5dbd818afbed6a6cdbfe07ce4de932ace 0x70955d6dd665623b7594e4f0ac4fff250372a9b37d2ebc4da97a3134c6ad1ba8 0x8ec981a9b71aafdea15416c4843d5458f4e088c279570f70b52e7c6d8578f2e2"
  "51 2 0xe0e19df188ea3fb4ac1a01f72982e2cdcd7cc063c395d5560d1f8a2759e8b9c2 0xdb096e3e1c6fd69048f5d7e04a199c2a56660f1e5b0c94f4d3ca6857ee0302bb 0x685aa8fe471161a88533c1e04ac40197eb036c42243283873d03eee55f6cbe83"
)

fail=0
check_tx() { # label hash
  local label=$1 h=$2
  [ "$h" = "-" ] && return
  local j status touches
  j=$(cast receipt "$h" --rpc-url "$RPC" --json 2>/dev/null) || { printf '%-28s MISSING\n' "$label"; fail=1; return; }
  status=$(printf '%s' "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["status"])')
  touches=$(printf '%s' "$j" | python3 -c "import json,sys;r=json.load(sys.stdin);print(any(l['address'].lower()=='${L,,}' for l in r['logs']))")
  if [ "$status" = "0x1" ] && [ "$touches" = "True" ]; then printf '%-28s OK\n' "$label"
  else printf '%-28s FAIL (status %s, lantern log %s)\n' "$label" "$status" "$touches"; fail=1; fi
}

for row in "${CASES[@]}"; do
  read -r id want liq chal verdict <<<"$row"
  check_tx "case #$id liquidation" "$liq"
  check_tx "case #$id challenge" "$chal"
  check_tx "case #$id verdict" "$verdict"
  got=$(cast call "$L" "bonusOutcome(uint256)(uint8)" "$id" --rpc-url "$RPC")
  if [ "$got" = "$want" ]; then printf '%-28s OK (outcome %s)\n' "case #$id outcome" "$got"
  else printf '%-28s FAIL (outcome %s, README says %s)\n' "case #$id outcome" "$got" "$want"; fail=1; fi
done

echo
num() { cast call "$L" "$@" --rpc-url "$RPC" | awk '{print $1}'; }
printf 'feedErrors       %s\n' "$(num 'feedErrors(bytes32)(uint256)' $SUBJECT)"
printf 'challengesOpened %s\n' "$(num 'challengesOpened()(uint256)')"
printf 'bondOf           %s\n' "$(num 'bondOf(bytes32)(uint256)' $SUBJECT)"
printf 'requiredBond     %s\n' "$(num 'requiredBond(bytes32)(uint256)' $SUBJECT)"
printf 'heldTotal        %s\n' "$(num 'heldTotal()(uint256)')"
printf 'priceable        %s\n' "$(num 'priceable(bytes32)(bool)' $SUBJECT)"
echo
if [ $fail -eq 0 ]; then echo "ALL RECEIPTS VERIFIED"; else echo "SOME RECEIPTS FAILED"; fi
exit $fail
