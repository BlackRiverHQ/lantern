# Demo

Four acts, each a state change a judge can see.

1. **Normal.** Honest liquidation: bonus held, window passes, nothing contested, bonus releases.
2. **Caught.** A forged print drives a liquidation. Bonus held. A prover opens a self-history
   challenge; the adjudicator recomputes the band from on-chain history and upholds it. The borrower
   is restored, the prover paid, the signer's bond charged, the feed's realized error count += 1.
3. **Shortfall.** The bond cannot cover the payout. The remainder is queued FIFO, the feed is
   under-bonded, and the next pricing attempt reverts.
4. **Final.** After the window closes, a challenge against the same liquidation is refused.

