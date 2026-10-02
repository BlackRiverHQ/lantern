# Demo

Seven acts, each a state change you can watch on chain. The caught acts are driven by scripts, so
anyone can reproduce them rather than take a video's word for it.

## Acts

1. **List and bond.** A feed is registered and a bond is posted. It cannot price until the bond covers
   what it is underwriting.
2. **Print.** A value is reported. It is folded into the feed's own history, and the band that
   surrounded it is snapshotted.
3. **Liquidate.** A market reports a liquidation that consumed that round. Debt repayment and the
   position close are untouched; only the profit above principal and fees is held.
4. **Contest.** A rule is offered as a claim. The verdict is recomputed from state.
5. **Declare a peer.** The feed names an independent source - on Arbitrum Sepolia, the live Chainlink
   ETH/USD aggregator.
6. **Catch by comparison.** The aggregator's answer is published through Lantern for the same round, a
   liquidation consumes the feed's print, and a challenger opens `CROSS_SOURCE`. The contract compares
   the two and redirects the bonus.
7. **Settle.** A liquidation nobody contests releases its bonus to the liquidator once the window
   closes. A challenge nobody defends is voided after the grace, and its stake answers for the delay.

## Reproduce

```
export PRIVATE_KEY=...                          # testnet key, gas only
export RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

forge script script/Deploy.s.sol                  --rpc-url $RPC_URL --broadcast -vv

export LANTERN=0x83b4E869a471638c374De4Bcf4Ab6Ba2396f9040
export MARKET=0x4b41D14D0aD565E1135676af0aD270227Bf879dF

forge script script/DemoRun.s.sol                 --rpc-url $RPC_URL --broadcast -vv
export ROUND=7
forge script script/ReportFromChainlink.s.sol     --rpc-url $RPC_URL --broadcast -vv
export LIQUIDATION_ID=9
forge script script/ChallengeWithChainlink.s.sol  --rpc-url $RPC_URL --broadcast -vv
forge script script/DemoSettle.s.sol              --rpc-url $RPC_URL --broadcast -vv
```

None of these scripts take an address for the asset: they read `lantern.asset()`, so a redeployment
cannot leave them pointing at the old one.

The equivalent stories are also asserted in the test suite, where they run without a network:
`test/fixtures/Scenarios.t.sol`, `test/unit/CrossSource.t.sol`.

## What to look at afterwards

`feedErrors` (how many prints were caught), `requiredBond` (what the feed must now carry),
`peerOf` (which source it is reconciled against), `bonusOutcome` (whether a bonus was paid, redirected
or still held). Those four reads are the whole story.
