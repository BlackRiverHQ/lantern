# Lantern

Held, bonded, provable: the liquidator's bonus becomes provisional.

A liquidation repays debt and closes a position immediately. Only the liquidator's **profit above
principal and fees** is credited to an escrow for a short window. Inside that window anyone may prove -
from state already on-chain, with no reference price and no committee - that the value which priced the
liquidation cannot be reconciled with what the feed itself published, or with an independent source
declared in advance. If the claim holds, the held bonus goes to the borrower, the prover is paid from
the report signer's bond, and the feed must carry more collateral for its next print. If nobody
contests it, the bonus is paid in full.

The debt is never delayed. Only the profit becomes provisional, so integrating this costs patience and
not solvency.

## Live on Arbitrum Sepolia

| Contract | Address |
|---|---|
| Lantern | `0x9420b6B3e5Cc8FC028b34206F9C0388230a6B772` |
| Market | `0x53fFF340f1e6796F905985E43e7a784b0e687066` |
| Asset | `0xfF062343892989373F422F7543F0587581594249` |
| Chainlink source | `0x3Fba7aBB9f393446917c9cAA5BD99b40FC85DF98` |

Machine-readable in [deployments.json](deployments.json); the ABI in [abi/](abi/); every read and
command in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

The chain currently says: **two caught prints** (`feedErrors` 2), the second decided by comparing the
feed's own print against the live Chainlink ETH/USD aggregator on the same round - a real source, on
this chain, with the verdict recomputed in the contract. The feed's required bond has escalated to
1.4x its exposure as a result.

## The five rules a challenger can prove

1. `SLOT_UNIQUENESS` - two different values for one feed in one round. Conflicts are recorded, never
   hidden behind a revert.
2. `ROUND_ORDERING` - the print was already stale when the liquidation consumed it.
3. `SELF_HISTORY` - the value is outside the band implied by the feed's own realized moves. The band is
   never set by hand and has no external reference.
4. `PAYLOAD_PROVENANCE` - the payload was signed for another asset.
5. `CROSS_SOURCE` - an independent source, declared in advance, disagrees beyond tolerance for the same
   round. Neither source is trusted; the disagreement is the evidence.

The verdict is recomputed from state at adjudication; a prover supplies a rule, not arithmetic.

## The floors follow the asset

The minimum bond and the minimum stake are derived from the asset's own decimals, read once at
construction: 0.1 and 0.001 of the asset, whatever it is. A six-decimal stablecoin - the shape of USDC
and USDG - is usable, and is covered by its own tests. Above 18 decimals is refused rather than
rounded.

## No owner

No pause, no parameter setter, no upgrade, no admin key. The hold window and the bounty share are
constructor arguments; `Lantern` builds its own registry, so nothing is trusted after deployment. The
only operator-controlled value that can be written after deployment is the one-shot peer declaration,
and it can never be changed once set.

## Run it

```
forge build
forge test                                     # 617 tests: unit, fuzz, integration, invariants
forge test --match-path "test/invariants/*"     # stateful invariants over random action sequences
forge test --match-path "test/gas/*" --gas-report
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/ChallengeWithChainlink.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
```

## Documentation

| Document | Contents |
|---|---|
| [docs/TOUR.md](docs/TOUR.md) | a reading order for someone with ten minutes |
| [docs/DESIGN.md](docs/DESIGN.md) | the mechanism, and why the bonus is the disputed object |
| [docs/RULES.md](docs/RULES.md) | each rule as a predicate, with the tests that pin it |
| [docs/BAND.md](docs/BAND.md) | where the tolerance comes from, and its two guards |
| [docs/ECONOMICS.md](docs/ECONOMICS.md) | the numbers, who pays whom, and the escalation |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the modules, who may do what, and the flow of one liquidation |
| [docs/INVARIANTS.md](docs/INVARIANTS.md) | what must always hold, each with a test that attacks it |
| [docs/LIMITS.md](docs/LIMITS.md) | what this is not, and the sharp edges, stated plainly |
| [docs/SECURITY.md](docs/SECURITY.md) | every attack attempted, and the test that shows the outcome |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | how a market wires it in, and the failure modes |
| [docs/FAQ.md](docs/FAQ.md) | the objections, answered without hedging |
| [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) | the Sepolia deployment and its on-chain reads |
| [docs/TESTING.md](docs/TESTING.md) | the shape of the suite and what it covers |
| [docs/DEMO.md](docs/DEMO.md) | the acts, and the commands that reproduce them |
| [GAS.md](GAS.md) | measured cost |
