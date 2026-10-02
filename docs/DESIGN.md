# Design

## The object under dispute

A liquidation has two transfers: capital (the debt repaid, the collateral seized) and profit (the
liquidator's bonus). Lantern touches only the second. Capital settles on the block; profit settles
after a window. That split is the whole trick — Lantern can never delay a lender, never leave a
position open, and never touch a borrower's collateral.

## Lifecycle

1. `Lantern.recordLiquidation(...)` is called by the market. The bonus is credited to `EscrowBook`
   against a `liquidationId`, and a window opens at `block.timestamp + holdWindow`.
2. `FeedRegistry` has already recorded the report the liquidation consumed: value, round, timestamp,
   signer, payload hash.
3. During the window, `ChallengeBook.open(...)` accepts a challenge carrying a rule kind plus the
   data needed to prove it.
4. `Adjudicator.verdict(...)` re-derives the claim from on-chain state only. No inputs are trusted;
   the challenge supplies a claim, the adjudicator recomputes it.
5. Upheld: `Waterfall.distribute(...)` pays borrower, then prover, then charges the signer bond.
   Refused: the prover's stake is forfeited to the liquidator.
6. Window closes with no upheld challenge: the bonus releases to the liquidator.

## Bonds sized to exposure

`BondVault` tracks per-feed outstanding exposure = the sum of bonuses currently held on liquidations
that consumed that feed. A feed may only have a report recorded while
`bond >= exposureFloor(exposure)`. Exposure grows as liquidations happen, so a feed that has
underwritten more must bond more. A feed that cannot cover its own exposure cannot price — it fails
closed rather than silently taking more risk.

## Why there is no deferral queue

An earlier draft parked a payout that exceeded the bond in a FIFO queue. That path is unreachable:
exposure can never exceed the bond (a liquidation that would break the 1:1 rule reverts), and the
bounty is a fraction of the bonus already inside that exposure. So the bond can always pay, and the
queue was deleted rather than kept as decoration. Payments here are immediate or they do not exist.

## Why no owner

Every discretionary lever is a place where the guarantee can be withdrawn. No pause, no parameter
setter, no upgrade path. The hold window and band constants are constructor arguments, immutable
thereafter.

