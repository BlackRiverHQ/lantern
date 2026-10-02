# Integrating a market

Lantern sits between a market's liquidation path and its liquidator payout. Two calls, one read.

## Before: register and bond

```solidity
lantern.registerFeed(FEED_ID, signerSetHash, decimals);
lantern.depositBond(FEED_ID, bondAmount);
```

A feed that is not bonded cannot have a report recorded, and a report is required before a liquidation
can be priced. The bond must cover the sum of all bonuses currently held against that feed, one for
one.

## During: report, then liquidate

```solidity
// the oracle path, unchanged except that the value flows through here
lantern.recordReport(FEED_ID, value, round, timestamp, payloadHash, signerAddress);

// the liquidation path: repay and close as you always did, then
lantern.recordLiquidation(liquidationId, FEED_ID, round, liquidatorBonus, borrower);
```

`recordLiquidation` is callable only by the market address fixed at deploy. It pulls **only the bonus**
from the market, so the market must approve Lantern for that amount. Debt repayment and the position
close are untouched by Lantern and remain yours.

## After: read the escrow, act on the outcome

```solidity
(uint8 outcome, uint256 bonus, address liquidator, address borrower) = lantern.escrowOf(id);
```

| `outcome` | Meaning | What the market should assume |
|---|---|---|
| 0 | held | the bonus is not yet the liquidator's |
| 1 | released | paid to the liquidator; keep it on your books |
| 2 | redirected | paid to the borrower; the signer's bond covered the bounty |

Integrators who need the old semantics can simply not read the escrow and treat the bonus as paid at
release time; nothing about the debt side changes either way.

## Failure modes to plan for

- **`UnderBonded` on a report.** The feed is under-capitalised for what it is pricing. Either top up
  the bond or route the report outside Lantern and accept that the liquidation is unprotected.
- **`DriftExceeded` on a report.** The value moved further than the feed's own guards allow. A genuine
  move of that size needs the feed's history to have moved with it, which is the point.
- **A live challenge at release time.** The bonus stays held until the challenge resolves. Nothing for
  the market to do; the liquidator waits instead of being paid.
