# Economics

Every number, all fixed at deploy or in `Constants.sol`.

| Number | Value | Where |
|---|---|---|
| Hold window | 30s - 1h, set at deploy | constructor |
| Bounty to a successful prover | 20% of the held bonus | `Constants.BOUNTY_BPS` |
| Prover's stake | 1% of the held bonus, floor 0.001 of the asset | `Constants.MIN_STAKE_BPS` |
| Minimum bond to list a feed | 0.1 of the asset | derived from the asset's decimals |
| Escalation per caught print | +20% of the requirement | `Constants.ERROR_BOND_PENALTY_BPS` |
| Escalation ceiling | 3x | `Constants.MAX_ERROR_STEPS` |
| Cross-source tolerance | 5% | `Constants.CROSS_SOURCE_TOLERANCE_BPS` |
| Grace before an abandoned challenge is void | 6 hours | `Constants.CHALLENGE_GRACE` |

## The floors follow the asset

The minimum bond and the minimum stake are derived from the asset's own decimals, read once at
construction: 0.1 and 0.001 of the asset. On an 18-decimal asset that is 1e17 and 1e15 as before. On a
six-decimal asset - USDC, USDG - it is 100000 and 1000 units, which is what makes the mechanism usable
with the stablecoins a payment or lending market actually settles in. An absolute 18-decimal floor
would have asked a six-decimal deployment for a billion dollars of bond.

## Who pays, and when

A liquidator's exposure to this mechanism is **the delay, never the debt**. The bonus is credited to an
escrow and released when the window closes. If a challenge succeeds, the liquidator does not pay the
borrower: the *report signer's bond* does, and the held bonus is redirected. The liquidator simply does
not receive it.

```
upheld:   escrow bonus ------> borrower
          signer's bond -----> prover (20% of the bonus), stake returned
refused:  prover's stake ----> liquidator
          escrow bonus stays held, then releases normally
void:     prover's stake ----> liquidator (the bonus was frozen for six hours)
```

## Why the stake exists

A challenge is cheap to make and expensive to make carelessly. A refused or abandoned challenge
forfeits the stake to the liquidator, so accusations carry a price that scales with the size of the
thing accused: 1% of the bonus at stake. A prover who is right is made whole and paid; a prover who is
guessing, or who walks away, pays for it.

## Why the bond is the binding constraint

A feed may only have reports recorded while its bond covers its outstanding exposure one for one,
escalated by how many times it has been caught. A market that wants its liquidations protected by
Lantern must therefore stand behind its price feed with capital proportional to the book it is pricing,
and a feed with a record must stand behind it with more.

A feed that cannot cover its own exposure cannot price. Nothing has to be paused or voted on; the
arithmetic refuses. That is the whole point: the trusted party is not bounded by a parameter someone
else chose, it is bounded by money it had to post.

## Worked numbers

Everything below uses the deployed constants: bounty 20% of the bonus, stake 1% of the bonus, a
liquidation bonus of 5% of what is repaid, and gas measured on this deployment.

**Gas, measured on Arbitrum Sepolia.**

| Call | Gas | Transaction |
|---|---|---|
| Liquidation, including `recordLiquidation` | 452,297 | case #9, `0xc58ff30a…` |
| `openChallenge` | 177,963 to 191,003 | case #45 `0x70955d6d…`, case #9 `0xfb2cc7fa…` |
| `adjudicate`, upheld | 154,850 to 162,123 | case #45 `0x8ec981a9…`, case #9 `0x200b102b…` |

A challenger spends about 340,000 gas for a challenge and its verdict. At 0.02 gwei, the Arbitrum
One gas price read on the day of submission, that is 0.0000068 ETH, about two cents at $2,700. The same
340,000 gas on Ethereum L1 is 340,000 × the L1 price: about $0.07 at the unusually low 0.07 gwei read the
same day, $9 at 10 gwei, $46 at 50 gwei. Arbitrum's price is what makes a challenge worth filing on a
small bonus every day, not only on quiet days.

**Challenger, per case.** The challenger gets back its stake plus 20% of the bonus when upheld, and loses
its 1% stake when refused. On Arbitrum the gas is a rounding error, so a challenge pays whenever the
rule holds:

| Held bonus | Bounty if upheld | Stake at risk if refused | Gas (Arbitrum) |
|---|---|---|---|
| $10 | $2 | $0.10 | about $0.02 |
| $1,000 | $200 | $10 | about $0.02 |
| $10,000 | $2,000 | $100 | about $0.02 |
| $100,000 | $20,000 | $1,000 | about $0.02 |

Break-even on Arbitrum is a bonus of about ten cents. The watcher only files rules it has computed will
hold, so its expected loss on the stake is zero unless its computation disagrees with the contract's,
which `node bin/watch.mjs --agree` checks against every verdict on chain (6 of 6).

**Liquidator, per case.** The bonus arrives 300 seconds later than it would without Lantern. At a 10%
annual cost of capital that delay costs 0.0001% of the bonus: one cent on a $10,000 bonus. The principal
and the repayment are never delayed. What the liquidator gives up is the bonus on liquidations whose
price is contradicted, which is the point.

**Feed operator.** At each liquidation the bond must cover the higher of two floors
(`Lantern._requiredBond`): the bonuses held against the feed including this one, never below the 0.1
minimum, then raised 20% per caught print up to 3×; and 1% of the notional this liquidation put at
risk. The bond covers 1% of the position, not the position. On this deployment the feed has been
caught 6 times, so `requiredBond` reads 220,000 units against the 100,000 minimum, and it carries
298,477.

## What is recovered, exactly

Lantern is not insurance. On an upheld verdict it moves exactly these amounts and nothing else:

- **To the borrower:** the held bonus, in full. The market this is deployed with also returns the
  collateral it seized, which it kept in its own escrow until the verdict.
- **To the challenger:** its stake, plus 20% of the bonus, charged to the operator's bond.
- **From the bond:** that 20% only. The bond is not paid to the borrower.

So the most a borrower can recover through Lantern is `bonus + seized collateral`. Anything beyond that,
such as a position they would have kept or a loss elsewhere, is not recovered here.

- **If the loss is larger than the bond:** irrelevant to the payout. The borrower's recovery comes from
  the held bonus, which is already in Lantern, not from the bond.
- **If the bonus is larger than the bond:** cannot happen. `recordLiquidation` reverts when the
  feed's bond would not cover its held exposure one for one, so the 20% bounty is always payable.
- **If the operator stops forever:** held cases still settle. Challenge, adjudication and release need
  nothing from the operator. A feed below its requirement cannot price new liquidations.
- **If the challenger disappears after staking:** anyone may adjudicate on the merits at any time, and
  the bounty still goes to the staker. If nobody does, anyone may void it after the window plus six
  hours; the stake goes to the liquidator and the bonus becomes releasable.
- **If the liquidator or borrower disappears:** nothing changes. Every payout is a push to the address
  recorded at liquidation.
