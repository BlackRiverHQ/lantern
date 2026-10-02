# Architecture

## The modules that exist

```
src/
  core/
    Lantern.sol        the state machine: feeds, bonds, escrows, challenges, settlement
    FeedRegistry.sol   records reports; gatekept by its controller (Lantern)
    History.sol        per-feed self-history: anchor, realized move, band
    ReportBook.sol     slot uniqueness and payload provenance
  libraries/
    Band.sol           width from realized moves, widening caps, drift guard
    BondMath.sol       exposure floors, charging, withdrawal safety
    FixedPoint.sol     bps arithmetic, overflow-safe mulDiv
    Hashing.sol        domain-separated digests
    Packing.sol        round, timestamp and move in one word
    Provenance.sol     the four rules as pure predicates
    SafeTransfer.sol   ERC20 pulls and pushes that check their result
    TimeLib.sol        window bounds and open/closed arithmetic
    Verdicts.sol       the recomputation: rule plus state in, verdict out
    WaterfallMath.sol  payout order and stake floors
    Bytes32Set.sol     membership used by payload provenance
    Constants.sol      every number a reviewer might argue with
  interfaces/          IWindfall, IFeedRegistry, IHistory, IChallenge, IERC20, ILanternErrors
  mocks/               MockToken, MockMarket - real behaviour, no simulation
script/                Deploy, DemoRun, DemoSettle
```

There is exactly one contract with state that matters: `Lantern`. The registry, history and report
book are separate addresses only because they hold different kinds of fact, and Lantern builds all
three in its constructor.

## Who may do what

| Actor | May | May not |
|---|---|---|
| Market | report a liquidation that consumes a recorded round | touch a feed's bond, settle an escrow, decide a challenge |
| Feed operator | register a feed, post and withdraw bond, report a value | report on someone else's feed, price while under-bonded |
| Anyone | open a challenge inside the window, adjudicate, release after it | act before the window closes, reopen a settled escrow |

`Lantern` holds the market address immutably; the market is the only address that can create an escrow.
There is no pause, no parameter setter, and no upgrade path: the hold window, the bounty share and the
band constants are constructor arguments or library constants.

## The flow of one liquidation

```
operator --report--> Lantern.recordReport --> FeedRegistry.recordReport
                                             |-- ReportBook.claimSlot         (conflicts recorded, not hidden)
                                             |-- ReportBook.claimPayload      (provenance kept)
                                             |-- History.checkDrift           (a jump is refused)
                                             '-- History.observe              (band moves; the pre-band is snapshotted)

market  --liquidation--> Lantern.recordLiquidation
                                             |-- pulls only the bonus
                                             |-- exposure += bonus
                                             '-- bond >= exposure, or it reverts

anyone  --challenge--> Lantern.openChallenge  (stake >= 1% of the bonus, inside the window)

anyone  --adjudicate--> Lantern.adjudicate --> Verdicts.evaluate(state)
                                             |-- upheld: bonus -> borrower, bounty from the bond,
                                             |           exposure released, error count +1
                                             '-- refused: stake forfeits to the liquidator

anyone  --release--> Lantern.release          (after the window, no live challenge)
```

## Why the debt is not the disputed object

Repayment and the position close happen immediately and unconditionally; only the liquidator's profit
above principal and fees is held. Adoption therefore costs patience, never solvency, and the market
that integrates Lantern does not have to change its risk logic to do it.
