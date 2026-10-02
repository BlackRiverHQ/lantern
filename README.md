# Lantern

A liquidator's bonus is paid on a price. Lantern holds that bonus back for a few minutes and lets
anyone prove, from state that is already on chain, that the price behind the liquidation was one the
feed could not honestly have published. When the proof holds, the held money goes to the borrower, the
signer's bond pays the prover and absorbs the penalty, and the feed has to carry more collateral before
it prints again. When nobody contests the window, the liquidator is paid in full.

The debt is not held back. Repayment and the closing of the position still happen at the moment of
liquidation, exactly as they did before. What becomes provisional is the profit.

## Why the price needs a second look

A liquidation consumes a price and produces a payment. If the price was fabricated, the payment is real
anyway, and the borrower is the one left short. Checking a price before the liquidation runs means
knowing what the true price was, and that is the hard part. Afterwards is easier. By then the feed has
published a history, and its signer has put collateral behind it. Lantern asks the
question at the only point where an answer can be produced as evidence, which is afterwards.

## What a challenger can prove

Five rules. Each one is a predicate over state, and the verdict is recomputed in the contract at
adjudication, so a challenger supplies the rule and the evidence rather than an answer.

1. `SLOT_UNIQUENESS`: one feed printed two different values for one round. The conflict is recorded
   instead of hidden behind a revert, so the record outlives the transaction that made it.
2. `ROUND_ORDERING`: the print was already stale when the liquidation consumed it.
3. `SELF_HISTORY`: the value falls outside the band that the feed's own realized moves imply. That band
   is computed from the feed's history and nothing else. No reference price is set by hand, and no
   committee signs off on it.
4. `PAYLOAD_PROVENANCE`: the signed payload was issued for a different asset or a different slot.
5. `CROSS_SOURCE`: a second feed, named by the operator in advance and impossible to change afterwards,
   disagrees beyond tolerance for the same round. The disagreement itself is the evidence, so the rule
   works without trusting either source.

## Printing is free, pricing is not

A band built from one print is wide enough to excuse nearly any number, and that is the state an
attacker would arrange before printing one they invented. So a liquidation may only be priced on a print
that had at least four prints behind it, and the count is snapshotted on the report itself rather than
recomputed later. A feed below the floor keeps printing as freely as it likes, because printing is how
it builds the history it needs.

## The bond answers for the position

A bond sized against the bonus can only ever give back the bonus. The market reports what the
liquidation put at risk, and the bond has to cover a fixed share of it, so recovery is not capped by the
profit that happens to be held. The share is a policy choice, written in `Constants` and tested at its
boundary rather than asserted in a comment.

## The floors follow the asset

The minimum bond and the minimum stake come from the asset's own decimals, read once at construction. A
six-decimal stablecoin is usable, and an asset above 18 decimals is refused instead of rounded. A token
that keeps a cut of every transfer is refused as well. Crediting an amount that never arrived would
corrupt every balance the mechanism depends on, and it is cheaper to say no than to account for it.

## No owner

No pause, no setter, no upgrade, no admin key. The hold window and the bounty share are constructor
arguments, and the registry is built by the contract itself, so there is nothing left to trust once the
deployment lands. The one operator-controlled value that can still be written is the one-shot peer
declaration, and after it is set it cannot be changed.

## Live on Arbitrum Sepolia

| Contract | Address |
|---|---|
| Lantern | `0x83b4E869a471638c374De4Bcf4Ab6Ba2396f9040` |
| Market | `0x4b41D14D0aD565E1135676af0aD270227Bf879dF` |
| Asset | `0xf00Ffe2F1e3f49F225124107b7f8218255F722eE` |
| Second source | `0xf7Bb2294b01D5ADb2470cad3F856A4C4C49Cf4d9` |

Lantern's constructor builds the feed registry and, under it, the history store and the report book; all
three addresses are in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) with the block they landed at.

Machine-readable in [deployments.json](deployments.json); the ABI in [abi/](abi/); every read and
command in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

The chain currently says two caught prints (`feedErrors` 2). The second was decided by comparing the
feed's own print against a live price aggregator on the same round, with the verdict recomputed in the
contract. The feed's required bond has escalated to 1.4x its floor as a result.

This deployment is the current source. `script/verify-source.sh` checks it the way it has to be checked:
deployed runtime code cannot be byte-identical to the artifact, because the constructor substitutes the
immutables into it, so the check is that the two are the same length, that the metadata trailer is
identical - which pins compiler, sources and settings - and that every differing byte is a slot the
artifact leaves zero. Lantern passes with 30 such slots, the registry with 22. And
`FeedRegistry.samplesOf`, the depth accessor the pricing floor reads through, absent from the previous
deployment, answers with 6. The floor and the notional requirement are live, not merely in the tests.

All six contracts verify on Sourcify with an exact match on creation and runtime bytecode
(`make verify-source` for the bytecode check), and the source is readable on the public explorer with
no key at `arbitrum-sepolia.blockscout.com/address/<address>`.

## Run it

```
forge build
forge test                                      # 637 tests: unit, fuzz, integration, invariants
forge test --match-path "test/invariants/*"      # stateful invariants over random action sequences
forge test --match-path "test/gas/*" --gas-report
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/DemoRun.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/ReportFromChainlink.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
forge script script/ChallengeWithChainlink.s.sol --rpc-url arbitrum_sepolia --broadcast -vv
```

The four scripts run in order and each later one needs the addresses the first printed, so
`make redeploy` runs the whole sequence against the addresses it just made and refuses to run the demo
against a deploy that did not land. `make deploy`, `make demo`, `make report`, and `make challenge` run
them one at a time; `.env.example` lists every variable they read.

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
| [docs/COVERAGE.md](docs/COVERAGE.md) | line and branch coverage, and what it leaves out |
| [docs/DEMO.md](docs/DEMO.md) | the acts, and the commands that reproduce them |
| [GAS.md](GAS.md) | measured cost |
