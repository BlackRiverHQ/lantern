# Testing

## Shape

| Directory | What it holds |
|---|---|
| `test/base/` | the shared harness: a real token, a real market, a predicted deploy order |
| `test/unit/` | one file per module, plus the read surface, events and interface conformance |
| `test/fuzz/` | band math, bond floors, waterfall splits, registry sequences, whole-mechanism properties |
| `test/integration/` | the lifecycle, the deployment wiring, and a hostile-token reentrancy suite |
| `test/invariants/` | a guarded handler driving random action sequences, with fifteen invariants over it |
| `test/gas/` | cost ceilings, asserted rather than tabulated |
| `test/fixtures/` | named scenarios, each a short story with a classification at the end |

510 tests pass. The suite runs in about fifteen seconds locally, most of it the invariant campaign.

## Run

```
forge test                                    # everything
forge test --no-match-path "test/invariants/*" # fast feedback
forge test --match-path "test/invariants/*"    # the stateful campaign
forge test --match-path "test/gas/*" --gas-report
```

## Adversarial cases the suite covers

Forged print, replayed payload within a feed and across feeds, the same round printed twice with two
values, a round moving backwards, a stale round, drift beyond the per-report cap, cumulative drift
across a window, a challenge after the window, a second challenge on one escrow, a release blocked by
a live challenge, a stake below the floor, a bond withdrawn to the floor, a liquidation beyond the
bond, re-entry through a hostile token, and an honest loss that must be classified as honest.

## Why the invariants matter more than the unit tests

Unit tests show that the paths the author thought of behave. The handler in `test/invariants/handlers/`
drives deposits, withdrawals, reports, liquidations, challenges, adjudications and releases in random
order and asserts, after every sequence, that exposure cannot pass the bond, that the balance equals
bonds plus held bonuses plus live stakes, that outcomes stay terminal, and that the configuration never
moves. That is the part that would catch a mistake in an ordering the author did not imagine.
