# Testing

## Shape

| Directory | What it holds |
|---|---|
| `test/base/` | the shared harness: a real token, a real market, a predicted deploy order |
| `test/unit/` | one file per module, plus the read surface, events, decimals, fee tokens, cross-source, escalation, liveness and interface conformance |
| `test/fuzz/` | band math, bond floors, waterfall splits, registry sequences, verdict totality, whole-mechanism properties |
| `test/integration/` | the lifecycle, the deployment wiring, and a hostile-token reentrancy suite |
| `test/invariants/` | a guarded handler driving random action sequences, with fifteen invariants over it |
| `test/gas/` | cost ceilings, asserted rather than tabulated |
| `test/fixtures/` | named scenarios, each a short story with a classification at the end |

617 tests pass. The suite runs in about fifteen seconds locally, most of it the invariant campaign.

## What the newer suites pin

- **`test/unit/Decimals.t.sol`** - the mechanism at six decimals: the floors scale to the asset, a feed
  may not disagree with the asset about decimals, a token that will not answer is treated as 18, one
  above 18 is refused, and a six-decimal prover can afford to accuse.
- **`test/unit/FeeOnTransfer.t.sol`** - a token that keeps a cut is refused at the first interaction
  rather than allowed to corrupt the books, in both directions.
- **`test/unit/CrossSource.t.sol`** - the fifth rule: upheld on a real disagreement, refused when the
  sources agree, refused exactly at tolerance, refused when the peer answered a different round, and
  refused when no peer was declared.
- **`test/unit/ChainlinkSource.t.sol`** - an eight-decimal answer scaled to eighteen, the round and
  timestamp carried through, staleness refused when freshness is asked for, non-positive answers
  refused, and a round id too large to carry reported as absent.
- **`test/unit/Escalation.t.sol`** - a caught feed's requirement rises 20%, a refused challenge leaves
  no mark, a thin feed that cannot meet the escalated requirement cannot price, and topping up restores
  it.
- **`test/unit/StaleChallenge.t.sol`** - an abandoned challenge cannot be voided early, can be voided
  after the grace, pays the stake to the liquidator whose bonus was frozen, unblocks the release, and
  cannot then be adjudicated.

## Run

```
forge test                                     # everything
forge test --no-match-path "test/invariants/*"  # fast feedback
forge test --match-path "test/invariants/*"     # the stateful campaign
forge test --match-path "test/gas/*" --gas-report
```

## A note on coverage

Coverage counters are injected into every branch, so a run under `forge coverage` executes different
bytecode and burns more gas. The ceilings in `test/gas/` are calibrated for a normal run and will
report failures under instrumentation that have nothing to do with a regression. `make coverage`
therefore excludes the gas suite and the invariant campaign; the gas suite is checked by `make gas` on
an uninstrumented build, and the invariants by `make invariants`.

## Why the invariants matter more than the unit tests

Unit tests show that the paths the author thought of behave. The handler in `test/invariants/handlers/`
drives deposits, withdrawals, reports, liquidations, challenges, adjudications and releases in random
order and asserts, after every sequence, that exposure cannot pass the bond, that the balance equals
bonds plus held bonuses plus live stakes, that outcomes stay terminal, and that the configuration never
moves. That is the part that would catch a mistake in an ordering the author did not imagine.
