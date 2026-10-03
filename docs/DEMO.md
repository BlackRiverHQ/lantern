# Demo

Seven acts, each a state change you can watch on chain. The caught acts are driven by scripts, so
anyone can reproduce them rather than take a video's word for it.

## Acts

1. **List and bond.** A feed is registered and a bond is posted. It cannot price until the bond covers
   what it is underwriting.
2. **Print.** Four prints establish a price, because a round cannot be priced with fewer behind it, and
   the band that surrounds it is snapshotted.
3. **A real position.** A borrower puts up wrapped ether as collateral and borrows the settlement asset
   against it, at a loan the market's own limit allows. The collateral is in the market's custody, not
   in a number.
4. **The lie.** The feed prints 18.2% below what it has been printing: inside the 20% a single report
   may move, and outside the 5% that two sources must agree within.
5. **Liquidate.** The market prices from that feed and nothing else, so by its own rule the position is
   now unhealthy, and it closes part of it - reporting the notional the close actually consumed. Only
   the profit above principal and fees is held, and the seized collateral sits in the market's escrow
   until Lantern says where it goes.
6. **Catch by comparison.** The source the feed named in advance is read on chain - the live Chainlink
   ETH/USD aggregator - and published through Lantern for the same round. A challenger opens
   `CROSS_SOURCE`; the contract compares the two and upholds it, because they disagree by more than the
   tolerance.
7. **Settle.** The verdict hands the seized collateral back to the borrower, and the profit with it,
   leaving the liquidator their principal and nothing else - the liquidation is undone rather than the
   liquidator robbed. A liquidation nobody contests releases its bonus to the liquidator once the window
   closes, and a challenge nobody defends is voided after the grace.

## Reproduce

```
export PRIVATE_KEY=...                          # testnet key, gas only
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

forge script script/Deploy.s.sol                  --rpc-url $RPC_URL --broadcast -vv

export LANTERN=0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54
export MARKET=0x290714d09f6d1ab50f7c31698eda92993ab01f95
# the collateral is the chain's wrapped ether; the deploy script defaults to it on this chain
export COLLATERAL=0x980B62Da83eFf3D4576C647993b0c1D7faf17c73

forge script script/DemoRun.s.sol                 --rpc-url $RPC_URL --broadcast -vv
export ROUND=5
forge script script/ReportFromChainlink.s.sol     --rpc-url $RPC_URL --broadcast -vv
export LIQUIDATION_ID=9
forge script script/ChallengeWithChainlink.s.sol  --rpc-url $RPC_URL --broadcast -vv
forge script script/DemoSettle.s.sol              --rpc-url $RPC_URL --broadcast -vv
```

None of these scripts take an address for the asset: they read `lantern.asset()`, so a redeployment
cannot leave them pointing at the old one. `script/redeploy.sh` runs all five in this order and reads
each address out of the broadcast record as it goes, so the round, the ids and the feeds cannot drift
apart - which is how a demo ends up replaying a previous deployment.

Nothing mints the settlement asset. The demo claims it from the faucet, one capped claim per address per
cooldown, and spends what it claimed.

The equivalent stories are also asserted in the test suite, where they run without a network:
`test/fixtures/Scenarios.t.sol`, `test/unit/CrossSource.t.sol`.

## The same acts on the dashboard

The scripts above are the contract's side, driven by a key. The same acts also exist as a surface,
where a visitor signs each step with their own wallet and watches the state it produced:

| page | act | what changes |
|---|---|---|
| `/dashboard/feeds/` | register a feed, post the bond the contract asks for, declare the second source | the registry gains a feed, and its bond reaches what it is underwriting - which is what lets it price |
| `/dashboard/run/` | hold the settlement asset, supply, borrow, liquidate | the market's custody, then the case's escrow |
| `/dashboard/prove/` | stake against a case you do not own | the escrow gains a challenger, and the chain holds the stake until the verdict |
| `/dashboard/cases/` | read the record | nothing - this view is a read |
| `/dashboard/` | the chain as one page | nothing |

The stake on `/dashboard/prove/` is the act aimed at another party's money: the prover is not the
borrower, not the liquidator and not the feed's operator. The contract asserts none of that - it asks
for evidence a rule can be checked against and for a stake that covers its floor - so this page is the
one to record if the point is that anyone can contest a price. It is offered only where the page's own
comparison of the two prints says the challenge holds, because a refused challenge costs the challenger
their whole stake.

A recording of that page needs something held at the moment of recording, and the window closes by
itself after five minutes. `docs/DASHBOARD.md` has the three calls that produce a case and the rounds
the server will tell you it needs. Registering a feed is the one act that cannot be repeated against
the same name: the contract refuses a feed that already exists.

## What to look at afterwards

`feedErrors` (how many prints were caught), `requiredBond` (what the feed must now carry),
`peerOf` (which source it is reconciled against), `bonusOutcome` (whether a bonus was paid, redirected
or still held). Those four reads are the whole story.
