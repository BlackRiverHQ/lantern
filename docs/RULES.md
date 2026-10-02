# The rules, exactly

Each rule is a pure predicate over state that already exists. A prover supplies a rule; the
adjudicator supplies the state. Nothing in a challenge is trusted arithmetic.

## 1. `SLOT_UNIQUENESS`

Predicate: `ReportBook.slotOf(feedId, round).conflicted`.

A slot is one `(feed, round)` pair. The first print claims it. A second print of the same round with a
*different* value marks the slot conflicted and **returns without overwriting** - the first print stands
as the report, and the disagreement is the evidence. A second print with the *same* value is a
duplicate and reverts: there is nothing new to learn from it.

Tests: `test_conflicting_value_for_a_used_round_is_recorded`, `test_conflict_leaves_the_first_print_intact`,
`test_slotUniqueness_upheld_after_a_recorded_conflict`, `testFuzz_a_conflict_is_always_visible`.

## 2. `ROUND_ORDERING`

Predicate: `liquidationTime - report.timestamp > STALENESS_BOUND` (300 seconds).

The report's timestamp is compared with the moment the liquidation was recorded, both of which are
on-chain. A report that was already stale when it priced is contestable. A future-dated report clamps
to zero age rather than producing a negative one.

Tests: `test_roundOrdering_upheld_when_the_print_was_stale`,
`test_roundOrdering_refused_exactly_at_the_bound`, `test_roundOrdering_clamps_a_future_report_to_zero_age`.

## 3. `SELF_HISTORY`

Predicate: `value < prevBandLo || value > prevBandHi`, where the band comes from the feed's own
realized moves **as they stood before this value was folded in** - the registry snapshots that band on
every accepted report, so the comparison cannot be made against a band the print itself widened.

Tests: `test_selfHistory_upheld_below_the_band`, `test_selfHistory_upheld_above_the_band`,
`test_selfHistory_refused_inside`, `testFuzz_selfHistory_matches_its_bounds`.

## 4. `PAYLOAD_PROVENANCE`

Predicate: the payload hash has a recorded owner and that owner is a different feed.

A payload signed for one asset and presented for another is evidence, not a typo, so the second use is
recorded rather than reverted. A true replay for the same feed still reverts.

Tests: `test_cross_feed_payload_reuse_is_recorded`, `test_payloadProvenance_upheld_on_cross_feed_reuse`,
`test_payloadProvenance_refused_when_the_payload_is_its_own`.

## What happens on each verdict

| Verdict | Held bonus | Prover | Bond | Exposure | Error count |
|---|---|---|---|---|---|
| Upheld | to the borrower, in full | stake back plus 20% of the bonus | charged the bounty | released | +1 |
| Refused | stays held | stake forfeits to the liquidator | untouched | unchanged | unchanged |
| No challenge, window closed | to the liquidator, in full | - | untouched | released | unchanged |
