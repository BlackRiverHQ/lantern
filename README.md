# Lantern

**The liquidator's bonus is paid on the next block. Lantern pays it on the next window.**

Lantern makes a liquidation's profit provisional. The debt still clears, the position still
closes, the lender still gets paid — only the liquidator's profit above principal and fees is
credited to an escrow with a hold window. During that window anyone may prove, using on-chain
evidence alone, that the price report the liquidation consumed could not be true. Prove it and
the held bonus is redirected: the borrower is restored first, the prover is paid a bounty, and
the remainder is charged to the bond of the signer who carried the report.

## Why hold the profit and not the debt

Delaying solvency breaks a market. Delaying profit does not. The design keeps the part that
cannot wait immediate and makes the part that can wait provable.

## The evidence standard

No reference price. No committee. No owner. Four checks, all derivable from the feed's own
on-chain history:

1. **Slot uniqueness** — one value per feed per block; two different values in one block is proof.
2. **Round ordering** — strictly newer than the feed's last accepted round, inside its staleness
   bound.
3. **Self-history bound** — the value must sit inside a band derived from the feed's own realized
   moves, with both a per-report cap and a cumulative drift cap.
4. **Payload provenance** — a payload hash may never be reused across assets or rounds.

## What this does not do

Lantern is a falsification detector, not a correctness oracle. A price that is wrong but
plausible — every source agreeing, configuration self-consistent — passes every check above.
See `docs/LIMITS.md`; the limits are written down before they are found.

## Layout

```
src/core/       registry, history, bonds, escrow, challenges, adjudication, waterfall
src/libraries/  band math, provenance checks, escrow accounting, hashing
src/mocks/      driverable feed, market, token — for adversarial fixtures
fixtures/       scenario data
test/           unit, fuzz, invariant and integration suites
docs/           design, invariants, limits, architecture, testing, demo
```

## Build

```
forge build
forge test
forge test --match-path "test/invariants/*"
```

Deployment target: Arbitrum Sepolia (chain id 421614).
