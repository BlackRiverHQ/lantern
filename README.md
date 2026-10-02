# Lantern

Held, bonded, provable: the liquidator's bonus becomes provisional.

A liquidation repays debt and closes a position immediately. Only the liquidator's **profit above
principal and fees** is credited to an escrow for a short window. Inside that window, anyone may prove
- from state that is already on-chain, with no reference price and no committee - that the value which
priced the liquidation cannot be reconciled with what the feed itself published. If the claim holds,
the held bonus goes to the borrower, the prover is paid out of the report signer's bond, and the
feed's error count moves. If nobody contests it, the bonus is paid in full.

The debt is never delayed. Only the profit becomes provisional, so integrating this costs patience and
not solvency.

## Live on Arbitrum Sepolia

| Contract | Address |
|---|---|
| Lantern | `0xF3e59109d72D052888B1Df97D82d8E920067b1C9` |
| Market | `0x504945EC11AD3CA5Bf4920496b3C613eb83a7A17` |
| Asset | `0x25939dB67A1bA238001444fad8D879f787A374e4` |

After the demo run, the chain says: one caught print (`feedErrors` 1), the bonus redirected rather than
paid (`bonusOutcome(1)` 2), 2e18 charged to the signer's bond, exposure back to zero, and the feed still
priceable. See [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) for the reads and the exact commands.

## The four rules a challenger can prove

1. `SLOT_UNIQUENESS` - two different values for one feed in one round. Conflicts are recorded, never
   hidden behind a revert.
2. `ROUND_ORDERING` - the print was already stale when the liquidation consumed it.
3. `SELF_HISTORY` - the value is outside the band implied by the feed's own realized moves. The band
   is never set by hand and has no external reference.
4. `PAYLOAD_PROVENANCE` - the payload was signed for another asset.

The verdict is recomputed from state at adjudication; a prover supplies a rule, not arithmetic.

## No owner

No pause, no parameter setter, no upgrade, no admin key. The hold window and the bounty share are
constructor arguments; `Lantern` builds its own registry, so nothing is trusted after deployment.

## Run it

```
forge build
forge test                                  # 533 tests: unit, fuzz, integration, invariants
forge test --match-path "test/invariants/*"  # stateful invariants over random action sequences
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
```

## Documentation

| Document | Contents |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | the mechanism, and why the bonus is the disputed object |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the modules, who may do what, and the flow of one liquidation |
| [docs/INVARIANTS.md](docs/INVARIANTS.md) | what must always hold, each with a test that attacks it |
| [docs/LIMITS.md](docs/LIMITS.md) | what this is not, and the sharp edges, stated plainly |
| [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) | the Sepolia deployment and its on-chain reads |
| [docs/TESTING.md](docs/TESTING.md) | the shape of the suite and what it covers |
| [docs/DEMO.md](docs/DEMO.md) | the six acts, and the commands that reproduce them |
| [GAS.md](GAS.md) | measured cost |
