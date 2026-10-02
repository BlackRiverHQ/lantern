# Architecture

```
src/
  interfaces/  IFeed, IFeedRegistry, IWindfall, IBond, IWindfallMarket, IChallenge,
               IHistory, IVerdict, IBounty, ILanternErrors
  libraries/   Errors, FixedPoint, Band, Provenance, Escrow, WaterfallMath, TimeLib,
               Bytes32Set, Hashing, Constants
  core/        FeedRegistry, History, ReportBook, BondVault, EscrowBook, ChallengeBook,
               Adjudicator, Waterfall, Window, Lantern
  mocks/       MockFeed, MockMarket, MockToken
  fixtures/    ScenarioBook
```

## Data flow

```
market --recordLiquidation--> Lantern --holds bonus--> EscrowBook
                               |                          |
                    FeedRegistry (report)            Window (deadline)
                               |                          |
                        History (self-band)        ChallengeBook (claims)
                               |                          |
                        ReportBook (slots)         Adjudicator (verdict)
                                                          |
                                           Waterfall (borrower, prover, bond)
```

## Rules

- Libraries hold math, core holds the state machine, the facade holds no state.
- Calls that must fail closed revert loudly rather than degrade.
- External calls last; checks-effects-interactions wherever a token moves.
- No delegatecall, no upgrade proxy, no assembly beyond mulDiv.

