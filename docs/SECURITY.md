# Security

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

## Attempts that succeed, and are supposed to

| Attempt | Outcome | Why it is allowed |
|---|---|---|
| Print two values for one round | the conflict is recorded, the first print stands | a rule that cannot leave evidence can never be proven |
| Reuse a payload across assets | recorded; a provenance challenge can fire | a copy is evidence, not a spelling mistake |
| Print a value inside the band that is nevertheless false | not contested | see [LIMITS.md](LIMITS.md): this is a falsification detector, not a correctness oracle |
| Declare no peer at all | the fifth rule simply is not available to that feed | forcing a declaration would force a choice of source |

## Properties held under random sequences

`test/invariants/LanternInvariants.t.sol` drives guarded random actions and asserts, after every
sequence, that exposure never exceeds the bond, that the balance equals bonds plus held bonuses plus
live stakes, that a settled escrow is not still contributing exposure, that outcomes stay in their
defined range, and that the configuration cannot move. Fifteen invariants, several hundred calls each.

## Reporting

This is testnet software written for a hackathon and reviewed by its own tests. If you find something,
open an issue with the sequence that reproduces it.
