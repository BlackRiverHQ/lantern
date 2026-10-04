# Questions a judge would ask

**Why not just use a better oracle?**
A better oracle is still a party you trust. Lantern changes who has to be trusted with the *profit*,
not just who is trusted with the *price*. The bonus becomes provisional and the signer's bond answers
for it. The two can be combined: a robust oracle can be the subject feed and post the bond, and
Lantern is what makes it pay when one of its prints is contradicted.

**Who pays for it?**
The feed operator posts the bond, and the liquidator waits out the window for the profit. The
borrower pays nothing. Whether a market would require its feeds to be bonded this way is not shown by a
testnet deployment; see [LIMITS.md](LIMITS.md#what-is-and-is-not-shown).

**What stops a griefing challenge?**
A refused challenge forfeits its stake to the liquidator, and the stake is 1% of the bonus at stake.
Accusing costs money that scales with the accusation's size.

**What stops me from printing whatever I want?**
Nothing, if the value agrees with the feed's own history and no second print for the round exists. That
is the honest boundary: this catches contradictions, not lies that agree with themselves.

**The band is self-referential. Isn't that circular?**
It is self-referential on purpose. There is no second source to compromise and no reference key to
steal. Circularity would be fatal if the band were the *only* guard; it is the weakest of the five
rules, and the pattern is checked against the per-report drift cap and the round's slot as well.

**Where does the money for a caught case come from?**
The held bonus is redirected to the borrower and the prover's bounty is charged to the report signer's
bond. The liquidator simply does not receive it; they are never out of pocket for the original debt,
which was already repaid.

**What happens to a feed that gets caught repeatedly?**
Its bond is charged each time, so it must keep topping up, and a feed whose bond no longer covers its
exposure cannot price at all. That is arithmetic, not governance.

**Why is there no admin?**
Because every admin function is a place where trust re-enters. The window and the bounty are constructor
arguments. The registry cannot be repointed because Lantern built it in its constructor.

**What did you not build?**
A correctness oracle. Lantern catches contradictions, not lies that agree with themselves; the bond
covers a fixed share of the notional, not all of it; and a borrower's loss beyond the held bonus is not
recovered here. Each is in [LIMITS.md](LIMITS.md) with the reason.
