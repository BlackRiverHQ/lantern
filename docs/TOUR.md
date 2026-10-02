# A reading tour

Read in this order and the mechanism assembles itself.

1. **`src/libraries/Constants.sol`** - every number. Nothing is hidden elsewhere.
2. **`src/interfaces/IWindfall.sol`** - the calls a market or a prover can make.
3. **`src/core/Lantern.sol`**, top to bottom. This is the whole mechanism: a report is recorded and
   folded into the feed's own history; a liquidation holds only the bonus, and only if the bond covers
   it; a challenge supplies a rule; a verdict is recomputed from state; settlement moves money exactly
   once per escrow.
4. **`src/libraries/Verdicts.sol`** - the five rules, each about fifteen lines. This is what a judge
   should read if they read nothing else: the decision is derived, not asserted.
5. **`src/libraries/Band.sol`** - where the tolerance comes from, and the two ways it is bounded.
6. **`src/integrations/ChainlinkSource.sol`** - how a live source on this chain becomes a peer the
   fifth rule can compare against.
7. **`src/libraries/WaterfallMath.sol`** - payout order, once a verdict exists.
8. **`test/invariants/LanternInvariants.t.sol`** - what must be true after *any* sequence of actions.
9. **`docs/LIMITS.md`** - what this deliberately does not do.

## The lines that matter

```
f.exposure  guards who may price:   the escalated requirement, or nothing is recorded
escrow      guards what is paid:    only the profit above principal and fees
window      guards how long:        no challenge inside it means the bonus releases
grace       guards against silence: an undefended claim cannot freeze the bonus forever
verdict     guards who decides:     recomputed from state, supplied by nobody
```
