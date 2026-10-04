# FACTS — the only source for anything on screen

Every number, name or claim in the film must appear here. Source in brackets.
Chain reads: Arbitrum Sepolia, `cast call` at block 315,370,333 and 315,374,894 (2026-10-03).

## Product
- Name: Lantern. Tagline: "Hold the bonus. Prove the price." [site/index.html title, README]
- What it does: a liquidator's bonus is held until someone proves the price behind it was false. [README h3]
- The debt is not held back. Repayment and the closing of the position happen at the moment of
  liquidation. What becomes provisional is the profit. [README]
- Anyone can prove, from state already on chain, that the price was one the feed could not honestly
  have published. [README]
- When the proof holds: the held money goes to the borrower, the signer's bond pays the prover, and the
  feed has to carry more collateral before it prints again. [README]
- When nobody contests the window, the liquidator is paid in full. [README]
- The verdict is recomputed in the contract at adjudication (`adjudicate`). No reference price is set by
  hand, no committee signs off. [README, src/core/Lantern.sol:327]
- No owner: no pause, no setter, no upgrade, no admin key. [README "No owner"]
- Five rules. CROSS_SOURCE: a second feed, named by the operator in advance, disagrees beyond tolerance for
  the same round. [README]
- EFFECTED ≠ JUSTIFIED ≠ FINAL [README]
- Wording: a verdict shows the price contradicted the feed's own record or the declared second source
  ("out of line", "contradicted"). It does not establish the true price. [docs/LIMITS.md "Not a correctness oracle"]

## Numbers
- Hold window: 300 s = five minutes [chain: holdWindow() = 300]
- Cross-source tolerance: 5% [Constants.CROSS_SOURCE_TOLERANCE_BPS = 500]
- Bounty to a successful prover: 20% of the held bonus [Constants.BOUNTY_BPS; docs/ECONOMICS.md]
- Each caught print raises the required bond 20% [Constants.ERROR_BOND_PENALTY_BPS]
- Market: collateral factor 70%, liquidation bonus 5%, close factor 50% [chain: market reads]
- Feed caught: 3 prints [chain: feedErrors(subjectFeed) = 3]
- Required bond: 160,000 units = 0.16 HOLD (1.6× the 0.1 HOLD minimum) [chain: requiredBond = 160000; README]
- Bond carried: 199,204 units = 0.1992 HOLD [chain: bondOf = 199204; dashboard "0.1992 HOLD"]
- Challenges opened: 5 [chain: challengesOpened() = 5]; liquidations recorded: 6 [chain: recorded() = 6]

## Case #45 (the case shown in the film) [dashboard /prove "Verdicts this deployment has reached", 2026-10-03]
- Round 16. Lantern feed printed $2,146.58. Second source, same round: $2,682.70.
- Apart: 19.98% (limit 5%). This page says: upheld. Contract recorded: Lie caught. Borrower made whole.
- Arithmetic check: (2682.70 − 2146.58) / 2682.70 = 19.985% → 19.98% (truncated, as the page shows).

## Money flow on one liquidation [src/market/LendingMarket.sol:22-33, src/core/Lantern.sol adjudicate]
- The liquidator pays the debt they repay plus their own contingent profit; the bonus is escrowed with
  Lantern and the seized collateral is held by the market until Lantern says who it belongs to.
- Upheld (redirect): collateral goes back to the borrower, the market refunds the liquidator's repayment,
  Lantern pays the bonus to the borrower. The liquidator is down exactly the profit, not the principal.
- The bounty (20% of the bonus) is paid to the prover out of the feed's bond; the prover's stake is returned.
- Second source for this deployment: Chainlink ETH/USD aggregator via ChainlinkSource [deployments.json];
  dashboard labels it "ETH price · Second source".

## Deployment / verification
- Live on Arbitrum Sepolia, testnet only, no real funds. [dashboard footer, README]
- Six contracts, exact Sourcify match. [README live status]
- Test suite: 648 tests, 15 stateful invariants. [README; 15 = count of invariant_ functions in test/invariants; verified 2026-10-03: `forge test` → "Ran 47 test suites: 648 tests passed, 0 failed, 0 skipped"]
- Dashboard: friendly-fennec-31.convex.site/dashboard — "Run a case": take a loan, watch the feed print a
  false price, get liquidated on it, prove it, take your collateral back. [README]

## Never claim
- Mainnet, real users, TVL, audits, partners, savings, "secure"/"guaranteed".
- Any collateral or loan size for case #45 (not read). Bars in the film are proportional only.
