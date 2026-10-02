# Demo

Six acts, each a state change you can watch on chain. The caught acts are driven by scripts, so anyone
can reproduce them rather than take a video's word for it.

## Acts

1. **List and bond.** A feed is registered and a bond is posted. It cannot price until the bond covers
   what it is underwriting.
2. **Print.** A value is reported. It is folded into the feed's own history, and the band that
   surrounded it is snapshotted.
3. **Liquidate.** A market reports a liquidation that consumed that round. Debt repayment and the
   position close are untouched; only the profit above principal and fees is held.
4. **Contest.** The same round is printed a second time with a different value. The disagreement is
   recorded on chain. A prover opens a challenge on the held bonus.
5. **Adjudicate.** The verdict is recomputed from state: the value cannot be reconciled with the
   round's first print. The bonus goes to the borrower, the prover is paid from the signer's bond, and
   the feed's error count moves.
6. **Settle.** A liquidation nobody contests releases its bonus to the liquidator once the window
   closes.

## Reproduce

```
export PRIVATE_KEY=...                        # testnet key, gas only
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv

export TOKEN=0x25939dB67A1bA238001444fad8D879f787A374e4
export LANTERN=0xF3e59109d72D052888B1Df97D82d8E920067b1C9
export MARKET=0x504945EC11AD3CA5Bf4920496b3C613eb83a7A17
forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv   # acts 1-5
forge script script/DemoSettle.s.sol --rpc-url arbitrum_sepolia --broadcast -vv # act 6, after the window
```

The equivalent stories are also asserted in the test suite, where they run without a network:
`test/fixtures/Scenarios.t.sol`.

## What to look at afterwards

`feedErrors` on the feed, `bonusOutcome` on the escrow, and `bondOf` on the signer. Those three reads
are the whole story: something was caught, the profit was redirected rather than paid, and the party
who produced the price paid for it.
