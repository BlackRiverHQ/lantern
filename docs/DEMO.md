# Demo

Four acts, each a state change a judge can see.

1. **Normal.** Honest liquidation: bonus held, window passes, nothing contested, bonus releases.
2. **Caught.** A forged print drives a liquidation. Bonus held. A prover opens a self-history
   challenge; the adjudicator recomputes the band from on-chain history and upholds it. The borrower
   is restored, the prover paid, the signer's bond charged, the feed's realized error count += 1.
3. **Conflict.** The same feed prints two different values for one round. The disagreement is
   recorded, the liquidation that consumed the first print is contested on slot uniqueness, and the
   bonus is redirected. The next liquidation against that feed reverts on the exposure floor.
4. **Final.** After the window closes, a challenge against the same liquidation is refused.

