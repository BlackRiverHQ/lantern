# Security

## Threat model

| | |
|---|---|
| **Assets at risk** | the held bonus, the feed operator's bond, a challenger's stake, the seized collateral the market keeps until a verdict |
| **Actors** | the market (one address, fixed at deploy), feed operators, liquidators, borrowers, challengers, anyone who calls `adjudicate`, `release` or `voidStaleChallenge` |
| **Trusted** | the market contract to report liquidations it really made (Lantern verifies the price, not the liquidation); the asset to be a plain ERC-20 (fee-taking and >18-decimal assets are refused) |
| **Not trusted** | the operator, the liquidator, the challenger, the watcher, the peer feed, and every page and server in this repository. The verdict is recomputed by the contract from stored state |
| **Attack surface** | `recordReport`, `recordLiquidation`, `openChallenge`, `adjudicate`, `voidStaleChallenge`, `release`, `depositBond`, `withdrawBond`, `setPeerFeed` |
| **Properties** | exposure never exceeds the bond; the contract's balance equals bonds + held bonuses + live stakes; every escrow ends in exactly one outcome; configuration cannot move; an abandoned challenge cannot hold money forever |

## What "proven" means here

A challenger never supplies a number. It names a rule, and `adjudicate` reads every input from state
that was written before the challenge existed: the report, the slot, the payload's owner, the peer's
print for the same round. So "proven" means *the contract recomputed a predicate over its own records
and it held*. It does not mean the true market price was established. `CROSS_SOURCE` upheld means the
feed and the source its operator named in advance disagree by more than 5% for one round; it does not
mean the peer is right. `SELF_HISTORY` upheld means the print left the band the feed's own history
implies; a real market can do that. [LIMITS.md](LIMITS.md#what-a-verdict-means-and-what-it-does-not)
says what each verdict does not establish.

Every row below is an attempt that was made against the implementation, and the artefact that shows
what happened. Nothing in this table is a claim about intent; each one is a test that runs in CI.

## Attempts that are refused

| Attempt | Outcome | Test |
|---|---|---|
| Price a liquidation while the bond is below the (escalated) floor | reverts `UnderBonded` | `test_report_on_under_bonded_feed_reverts` |
| Report a liquidation that would push exposure past the bond | reverts: fail closed | `test_liquidation_beyond_bond_reverts` |
| Price after being caught, without topping up | reverts, and `isPriceable` says so | `test_a_caught_thin_feed_cannot_price_until_it_tops_up` |
| Report a value that jumps more than 20% | reverts `DriftExceeded` | `test_large_jump_beyond_drift_reverts` |
| Walk a feed 50% inside an hour in small steps | reverts `DriftExceeded` | `test_cumulative_drift_reverts_after_repeated_creep` |
| Report an old or future timestamp | reverts `ReportTooOld` | `test_stale_timestamp_reverts` |
| Replay a payload for the same feed | reverts `PayloadReused` | `test_same_feed_payload_replay_reverts` |
| Repeat the same round with the same value | reverts `SlotConflict` | `test_duplicate_round_same_value_is_refused` |
| Move a round backwards | reverts `RoundNotMonotone` | `test_round_going_backwards_reverts` |
| Deposit or pay out through a token that keeps a cut | reverts `TransferFromShort` / `TransferShort` | `test/unit/FeeOnTransfer.t.sol` |
| Use an asset above 18 decimals | reverts `BadDecimals` at construction | `test_a_token_above_eighteen_decimals_is_refused` |
| Register a feed that disagrees with the asset about decimals | reverts `DecimalsMismatch` | `test_a_six_decimal_feed_may_not_claim_eighteen` |
| Swap a declared peer after the fact | reverts `PeerAlreadyDeclared`; declaring one is one-shot | `test_a_peer_can_only_be_declared_once` |
| Declare an unregistered or self peer | reverts `BadPeer` | `test_a_peer_must_already_be_registered` |
| Void a challenge that is still fresh | reverts `ChallengeStillFresh` | `test_a_fresh_challenge_cannot_be_voided` |
| Report or liquidate from the wrong caller | reverts `NotMarket` | `test_only_market_may_report_a_liquidation` |
| Withdraw the bond below the exposure floor | capped at the floor | `test_withdraw_at_floor_reverts` |
| Challenge with less than 1% of the bonus | reverts `StakeBelowMinimum` | `test_stake_below_floor_reverts` |
| Challenge after the window closed | reverts `WindowClosed` | `test_after_window_reverts` |
| Open a second challenge on one escrow | reverts `ChallengeAlreadyOpen` | `test_second_challenge_reverts` |
| Release while a challenge is live | reverts `ChallengeAlreadyOpen` | `test_unresolved_challenge_blocks_release` |
| Adjudicate twice, or adjudicate a voided challenge | reverts `LiquidationAlreadySettled` / `ChallengeAlreadyResolved` | `test_adjudicate_twice_reverts` |
| Re-enter through a hostile token | refused by the mutex and by the ordering; cannot duplicate escrows, challenges or stakes | `test/integration/Reentrancy.t.sol` |
| Make the verdict computation revert by choosing an odd rule or state | cannot: the fuzz suite proves adjudication is total | `test/fuzz/VerdictsFuzz.t.sol` |
| Change the window, the bounty, the market or the registry | no such function exists | `invariant_configurationIsImmutable` |

## Races, boundaries and parties that disappear

`test/integration/Adversarial.t.sol`, 14 tests.

| Attempt | Outcome | Test |
|---|---|---|
| Two challengers race for one liquidation | the first wins; the second reverts `ChallengeAlreadyOpen` before its stake moves | `test_two_challengers_race_and_the_loser_keeps_its_stake` |
| Two watchers race to adjudicate | one verdict; the borrower, the bond and the error count move once | `test_two_adjudicators_race_and_the_verdict_happens_once` |
| Challenge one second before the deadline | accepted | `test_a_challenge_one_second_before_the_deadline_is_accepted` |
| Challenge exactly at the deadline | reverts `WindowClosed` | `test_a_challenge_exactly_at_the_deadline_is_refused` |
| Release one second before the deadline | reverts `WindowOpen` | `test_release_one_second_before_the_deadline_is_refused` |
| Release exactly at the deadline | succeeds: challenging stops and releasing starts at the same instant | `test_the_deadline_is_one_instant_for_both_sides` |
| Release an escrow that was upheld | reverts `LiquidationAlreadySettled` | `test_an_upheld_escrow_cannot_also_be_released` |
| Adjudicate an escrow that was released | reverts `LiquidationAlreadySettled` | `test_a_released_escrow_cannot_then_be_challenged_or_adjudicated` |
| The operator disappears after the liquidation | strangers challenge and adjudicate; the case settles | `test_an_operator_who_vanishes_cannot_stop_a_case_settling` |
| Liquidator and borrower never return | payouts are pushes to recorded addresses; nobody needs their signature | `test_settlement_needs_no_signature_from_liquidator_or_borrower` |
| The challenger stakes and disappears | anyone adjudicates on the merits; the bounty goes to the staker, not the caller | `test_an_absent_challenger_is_still_paid_when_a_stranger_adjudicates` |
| A wrong challenger tries to reach the bonus or the bond | loses its stake; bond and held bonus untouched | `test_a_wrong_challenge_cannot_reach_the_bonus_or_the_bond` |
| An operator withdraws below its requirement | reverts; the feed stays exactly priceable | `test_a_feed_that_will_not_top_up_cannot_price_again` |
| A liquidator files a losing rule against itself to use up the one challenge slot | **succeeds** (known gap, pinned) | `test_KNOWN_GAP_a_liquidator_can_spend_the_one_challenge_slot_on_itself` |

The last row is a real weakness in the deployed contract. There is one challenge per liquidation, so a
liquidator can open a challenge under a rule that does not hold, adjudicate it, get its own stake back
as the forfeit, and lock out the rule that does hold. It costs the liquidator gas. The fix is one
challenge per (liquidation, rule): filing the rule that holds would be upheld against the liquidator,
so the slot can no longer be spent harmlessly. It is designed, not deployed, because the contract has no
upgrade path. The test fails the day the fix lands, so it cannot be forgotten.

## Attempts that succeed, and are supposed to

| Attempt | Outcome | Why it is allowed |
|---|---|---|
| Print two values for one round | the conflict is recorded, the first print stands | a rule that cannot leave evidence can never be proven |
| Reuse a payload across assets | recorded; a provenance challenge can fire | a copy is evidence, not a spelling mistake |
| Print a value inside the band that is nevertheless false | not contested | see [LIMITS.md](LIMITS.md): this is a falsification detector, not a correctness oracle |
| Declare no peer at all | the fifth rule simply is not available to that feed | forcing a declaration would force a choice of source |

## Static analysis

Slither 0.11.6 over `src/` (mocks excluded), informational and optimisation detectors off: 27 results,
none exploitable. Each is triaged here rather than suppressed in the code.

| Detector | Where | Verdict |
|---|---|---|
| `incorrect-exp` | `FixedPoint.mulDiv`: `(3 * denominator) ^ 2` | intended. It is the Newton-iteration seed of the standard full-precision `mulDiv`, where `^` is XOR on purpose |
| `divide-before-multiply` (8) | `FixedPoint.mulDiv` | intended. Same algorithm; the divisions are exact by construction |
| `reentrancy-no-eth` | `Lantern.adjudicate`, `Lantern.depositBond` | not reachable. Both carry the `nonReentrant` mutex, and `test/integration/Reentrancy.t.sol` drives a hostile token through every transfer |
| `reentrancy-no-eth`, `-benign`, `-events` | `FeedRegistry.recordReport` | not reachable. The external calls go to the report book and history store, which Lantern built in its constructor and which call nothing back |
| `unused-return` | `BondMath.chargeable`'s shortfall, `Bytes32Set.add`, Chainlink's unused fields, the market's `approve` | intended. The shortfall is zero by the exposure rule; the others are ignored by design. The market's asset is the faucet token, whose `approve` returns true or reverts |
| `incorrect-equality` | `FaucetToken.claim` | intended. `claimedAt == 0` means "never claimed" |
| `shadowing-local` | `Lantern._requiredBond` | cosmetic. A local named like a view function; no behaviour change |
| `timestamp` (5) | windows, grace, staleness, faucet cooldown | intended. The windows are minutes to hours; a sequencer's timestamp latitude is seconds |

Rerun with `pip install slither-analyzer && slither . --filter-paths "lib/|test/|script/|src/mocks/" --exclude-informational --exclude-optimization`.

## Campaign configuration

From `foundry.toml`: fuzz `runs = 256`, `max_test_rejects = 200000`; invariants `runs = 64`,
`depth = 32`, `fail_on_revert = false`. That is 64 random sequences of 32 calls each per invariant,
15 invariants. The handler bounds every input to values the contract can accept, so the campaign
spends its calls on reachable states rather than on reverts.

## Properties held under random sequences

`test/invariants/LanternInvariants.t.sol` drives guarded random actions and asserts, after every
sequence, that exposure never exceeds the bond, that the balance equals bonds plus held bonuses plus
live stakes, that a settled escrow is not still contributing exposure, that outcomes stay in their
defined range, and that the configuration cannot move. Fifteen invariants, several hundred calls each.

## Reporting

This is testnet software written for a hackathon and reviewed by its own tests. If you find something,
open an issue with the sequence that reproduces it.
