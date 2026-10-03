# Lantern

A liquidator's bonus is paid on a price. Lantern holds that bonus back for a few minutes and lets
anyone prove, from state that is already on chain, that the price behind the liquidation was one the
feed could not honestly have published. When the proof holds, the held money goes to the borrower, the
signer's bond pays the prover and absorbs the penalty, and the feed has to carry more collateral before
it prints again. When nobody contests the window, the liquidator is paid in full.

The debt is not held back. Repayment and the closing of the position still happen at the moment of
liquidation, exactly as they did before. What becomes provisional is the profit.

**Try it: [friendly-fennec-31.convex.site/dashboard](https://friendly-fennec-31.convex.site/dashboard).**
Three views, each reading the chain rather than a mirror of it.

- **Overview** holds the four facts that decide whether the feed may price anything at all: the bond
  it carries against the bond it must carry, the depth of its print history, the bonuses still held,
  and the prints it was caught on. Below them, every held bonus whose window has closed and every
  decided seizure is listed with the one transaction that moves it. Both are permissionless, so the
  page offers the button rather than a paragraph about it. Where the move belongs to the feed
  operator and not the visitor, the row says so instead of failing.
- **Cases** is every liquidation on chain, newest first, with how it ended and the transactions that
  decided it.
- **Run a case** takes a visitor from no position to a proven lie: take out a loan, watch the feed
  print a false price and the market liquidate you on it, then prove the price was false and take
  your collateral back. Every step is a real transaction you sign. Your wallet plays the borrower and
  the prover; the feed's side is played by a small server that holds the feed operator's key, derives
  every value from the chain, and only makes the prints a case needs.

The dashboard is a Next.js app under `site/next/`, exported to static files and served by the same
Convex deployment as the landing page. The landing page and its assets under `site/` are the source of
the marketing surface; the dashboard's encoder, formatters and selector tables are diffed against
`cast` by the test suite in `site/next/`.

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
| Lantern | `0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54` |
| Market (a lending market) | `0x290714d09f6d1ab50f7c31698eda92993ab01f95` |
| Collateral | `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73` (Arbitrum's wrapped ether) |
| Asset (settlement) | `0x185690fb4d3c765bac544423a34953b2b8b03a22` |
| Second source (Chainlink) | `0xe682D11a014E82D62eb0fAaCb1bc60E12ce2De6c` |

Lantern's constructor builds the feed registry and, under it, the history store and the report book; all
three addresses are in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md) with the block they landed at.

Machine-readable in [deployments.json](deployments.json); the ABI in [abi/](abi/); every read and
command in [docs/DEPLOYMENTS.md](docs/DEPLOYMENTS.md).

The chain currently says one caught print (`feedErrors` 1), on a market that is a real one. A borrower
put up wrapped ether, borrowed the settlement asset against it, and the feed then printed 18.2% below
what both sources agree on - inside the 20% a single report may move, outside the 5% two sources must
agree within. The market prices from that feed and nothing else, so by its own rule the position was
unhealthy and it closed part of it, reporting the notional it actually consumed. The verdict compared
the print with a live aggregator on the same round, upheld the challenge, handed the seized collateral
back to the borrower, and redirected the liquidator's profit to them: the liquidator kept their
principal and nothing else. As a result the feed's required bond is 120,000 against a 100,000 floor -
twenty per cent more, which is what a caught print costs it until it tops up.

The collateral is Arbitrum's own wrapped ether, so a position is backed by something a borrower really
parted with. The settlement asset is a faucet token because on a testnet a stablecoin cannot be minted
on demand, and a test double with an open `mint` would let anyone conjure a bond out of nothing; this one
is claimed, one capped claim per address per cooldown. On mainnet that constructor argument is a
stablecoin and nothing else about the system moves.

This deployment is the current source. `script/verify-source.sh` checks it the way it has to be checked:
deployed runtime code cannot be byte-identical to the artifact, because the constructor substitutes the
immutables into it, so the check is that the two are the same length, that the metadata trailer is
identical - which pins compiler, sources and settings - and that every differing byte is a slot the
artifact leaves zero. Lantern passes with 38 such slots, the market with 66, the asset with 7, the
registry with 15, the history store with 6 and the report book with 6 - all six read from
`deployments.json` rather than typed into the script, so a redeploy cannot leave the check proving an
instance nobody is using. The floor and the notional requirement are live, not merely in the tests.

All six contracts verify on Sourcify with an exact match on creation and runtime bytecode
(`make verify-source` for the bytecode check), and the source is readable on the public explorer with
no key at `arbitrum-sepolia.blockscout.com/address/<address>`.

## Run it

```
forge build
forge test                                      # 648 tests: unit, fuzz, integration, invariants
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

The dashboard is a separate build:

```
cd site/next && npm install
npm test                              # diffs the encoder, the selectors and the panel rows
cd ../../convex-host && npm run deploy
```

`npm run deploy` does the whole deploy: it builds the site, copies the export into `dist/`, pushes the
functions, and uploads the files — in that order, one command. It targets this repository's production
deployment (`prod:friendly-fennec-31`) rather than whatever `.env.local` points at, because
`convex deploy` refuses to choose a production target without being told and cannot be asked in a
non-interactive shell. Deploy only the site or only the functions with
`npm run build && npx @convex-dev/static-hosting deploy --no-spa --skip-build --skip-convex` and
`npx convex deploy` respectively.

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
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | the three views, what each reads, and how it is tested |
| [GAS.md](GAS.md) | measured cost |
