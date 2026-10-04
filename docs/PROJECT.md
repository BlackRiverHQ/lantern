# Lantern

A liquidator's bonus is paid on a price. Lantern holds that bonus back for five minutes and lets
anyone prove, from state that is already on chain, that the price behind the liquidation was one the
feed could not honestly have published.

## The problem

When a position is liquidated, the liquidator's profit is computed from a price the feed published.
The debt and the collateral move at that moment, and the profit moves with them. If the price was
false, the borrower has already lost the bonus and has no way to get it back: the feed that published
it is the only party that knows what it printed, and the market has already acted.

The price cannot be checked before the liquidation, because checking it means knowing what the true
price was. Afterwards is easier. The feed has published a history and has put collateral behind its
prints, so there is an answer that can be evidence.

## The mechanism

Every feed posts a bond before it may price anything, and the contract tracks that feed's outstanding
exposure, so the bond can always cover what the feed has signed. A liquidation that is priced on a
feed's print moves the bonus into a hold instead of paying it out. Anyone may then open a challenge
against that price, inside the window, by posting a stake.

If the challenge is upheld, the held bonus goes to the borrower, the signer's bond pays the prover and
absorbs the penalty, and the feed's bond requirement rises. If nobody contests it, the liquidator is
paid in full when the window closes.

The debt is never held back. Repayment and the closing of the position still happen at the moment of
liquidation. What becomes provisional is the profit.

Printing is free, pricing is not. A band built from a single print would excuse almost any number, so
a liquidation may only be priced on a band that had four prints behind it.

## The five rules

The contract adjudicates five rules, each one a predicate over state it already holds:

1. One feed published two values for one round.
2. A print was already stale when it was consumed.
3. The value fell outside the band the feed's own history realised.
4. The payload was signed for another slot, or by a signer that was not the feed's.
5. A declared second source disagrees with the print beyond tolerance.

A challenger supplies the rule and the evidence, never an answer. The contract recomputes the verdict
itself, so an upheld challenge is a fact about state rather than a claim about intent.

## What is live

Six contracts on Arbitrum Sepolia, with no owner. No pause, no setter, no upgrade, no admin key. The
hold window and the bounty share are constructor constants, so the deployed bytecode cannot be
retuned afterwards.

- Lantern: 0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54
- Dashboard: https://friendly-fennec-31.convex.site/dashboard
- Video walkthrough: https://youtu.be/cZGxXNKqNvk
- Repository: https://github.com/subheeksh5599/lantern

The dashboard reads the chain rather than a mirror of it: five views covering the overview, the case
list, the run a case flow, the prove a price flow and the feeds and bonds. The run a case flow takes a
visitor from no position through a false print, a liquidation and a proven challenge, and every step
is a real transaction that visitor signs.

## Evidence

- 648 forge tests across 47 suites, including stateful invariants over random action sequences and
  the guards that refuse a challenge the contract would reject.
- A visitor with their own wallet ran the whole case on the live deployment: thirteen transactions,
  the verdict upheld, the collateral returned to the borrower.
- The demonstration recording is sixteen minutes of that flow on the live domain, cut to eight
  minutes with nothing that changes the state of the case removed, and published on YouTube.
- Every number the dashboard shows is a chain read, and the settlement and verdict paths are
  recomputed in the contract rather than reported by the page.

## What this is not

This is infrastructure rather than an application. A market wires Lantern in around its own
liquidation path, and the repository carries the integration guide: what that costs, where the seams
are, and how it fails.

What is not real is stated plainly rather than dressed up. This is testnet software and the
settlement asset is a faucet token. The watcher that contests windows is run by us, so whether third
parties would run one for a twenty per cent bounty is an open question. Nothing here is deployed to
mainnet.
