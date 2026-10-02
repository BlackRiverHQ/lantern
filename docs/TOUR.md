# A reading tour

Read in this order and the mechanism assembles itself.

1. **`src/libraries/Constants.sol`** - every number. Nothing is hidden elsewhere.
2. **`src/interfaces/IWindfall.sol`** - the five things a market or a prover can call.
3. **`src/core/Lantern.sol`**, top to bottom. This is the whole mechanism: a report is recorded and
   folded into the feed's own history; a liquidation holds only the bonus; a challenge supplies a rule;
   a verdict is recomputed from state; settlement moves money exactly once per escrow.
4. **`src/libraries/Verdicts.sol`** - the four rules, each about fifteen lines. This is what a judge
   should read if they read nothing else: the decision is derived, not asserted.
5. **`src/libraries/Band.sol`** - where the tolerance comes from, and the two ways it is bounded.
6. **`src/libraries/WaterfallMath.sol`** - payout order, once a verdict exists.
7. **`test/invariants/LanternInvariants.t.sol`** - what must be true after *any* sequence of actions.
8. **`docs/LIMITS.md`** - what this deliberately does not do.

## The four lines that matter

```
f.exposure  guards who may price:   exposure <= bond or nothing is recorded
escrow      guards what is paid:    only the profit above principal and fees
window      guards how long:        no challenge inside it means the bonus releases
verdict     guards who decides:     recomputed from state, supplied by nobody
```
