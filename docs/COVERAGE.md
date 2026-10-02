# Coverage

The number, how it was produced, and what it leaves out.

## How to reproduce

```
make coverage        # writes lcov.info, excludes test/gas/* and the invariant campaign
```

The exclusions are by contract name and they exist for one reason: coverage counters are injected into
every branch, so an instrumented run executes different bytecode and burns more gas than the real one.
The ceilings in `test/gas/` are calibrated against an uninstrumented build and would fail here for a
reason that has nothing to do with a regression. `make gas` and `make invariants` cover those.

The run behind these numbers: **613 tests, 0 failures**, `lcov.info` at 1,590 lines.

## The numbers

| Scope | Lines | Branches | Functions |
|---|---|---|---|
| Everything under `src/` | 98.0% (594/606) | 88.5% (100/113) | 97.3% (143/147) |
| `src/` excluding `src/mocks/` | 98.7% (520/527) | 91.4% (96/105) | 98.3% (118/120) |

The mocks are excluded from the second row because they are test scaffolding that happens to live in
`src/`, and their uncovered lines say nothing about the mechanism. Both rows are printed because
quoting only the flattering one would be the same as quoting neither.

## By file

| File | Lines | Branches |
|---|---|---|
| libraries/Band.sol | 100.0% (26/26) | 100.0% (5/5) |
| libraries/BondMath.sol | 100.0% (17/17) | 100.0% (1/1) |
| libraries/Bytes32Set.sol | 100.0% (21/21) | 100.0% (3/3) |
| libraries/Hashing.sol | 100.0% (10/10) | n/a |
| libraries/Packing.sol | 100.0% (10/10) | n/a |
| libraries/Provenance.sol | 100.0% (10/10) | n/a |
| libraries/SafeTransfer.sol | 100.0% (20/20) | 100.0% (9/9) |
| libraries/TimeLib.sol | 100.0% (11/11) | 100.0% (2/2) |
| libraries/Verdicts.sol | 100.0% (18/18) | 100.0% (7/7) |
| libraries/WaterfallMath.sol | 100.0% (12/12) | n/a |
| libraries/FixedPoint.sol | 100.0% (39/39) | 66.7% (4/6) |
| core/History.sol | 100.0% (39/39) | 100.0% (6/6) |
| core/Lantern.sol | 98.8% (168/170) | 88.1% (37/42) |
| core/FeedRegistry.sol | 97.0% (65/67) | 100.0% (14/14) |
| core/ReportBook.sol | 94.6% (35/37) | 100.0% (5/5) |
| integrations/ChainlinkSource.sol | 95.0% (19/20) | 60.0% (3/5) |
| mocks/MockMarket.sol | 84.6% (11/13) | 0.0% (0/1) |
| mocks/MockToken6.sol | 83.3% (15/18) | 33.3% (1/3) |
| mocks/MockToken.sol | 100.0% (21/21) | 66.7% (2/3) |
| mocks/FeeToken.sol, MockAggregator.sol, ReentrantToken.sol | 100.0% | 100.0% |

## What is not covered

13 branches in `src/` are never taken. Naming them is more useful than rounding:

src/core/Lantern.sol lines [95, 102, 109, 302, 396]; src/integrations/ChainlinkSource.sol lines [42, 54]; src/libraries/FixedPoint.sol lines [19, 22]; src/mocks/MockToken6.sol lines [35, 43]; src/mocks/MockMarket.sol lines [27]; src/mocks/MockToken.sol lines [48]

Most of the remainder are the second arm of a two-way comparison in a library, and one guard inside
`ReentrantToken` that a hostile token would only reach by being called in a way the tests do not
arrange. None of them is a path a user can walk. A coverage run named the guards that were genuinely
untested when it was first written, and `test/unit/Guards.t.sol` now walks them: a zero asset, a zero
market, a bounty share above the whole, a print against an unregistered feed, and a print by someone
other than the feed's operator.
