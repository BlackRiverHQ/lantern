# The rules, exactly

Each rule is a pure predicate over state that already exists. A prover supplies a rule; the adjudicator
supplies the state. Nothing in a challenge is trusted arithmetic - the verdict is recomputed, and the
fuzz suite proves the computation is total, meaning no input a prover can point at makes it revert.

## 1. `SLOT_UNIQUENESS`

Predicate: `ReportBook.slotOf(feedId, round).conflicted`.

A slot is one `(feed, round)` pair. The first print claims it. A second print of the same round with a
*different* value marks the slot conflicted and **returns without overwriting** - the first print stands
as the report, and the disagreement is the evidence. A second print with the *same* value is a
duplicate and reverts: there is nothing new to learn from it.

## 2. `ROUND_ORDERING`

Predicate: `liquidationTime - report.timestamp > STALENESS_BOUND` (300 seconds).

The report's timestamp is compared with the moment the liquidation was recorded, both of which are
on-chain. A report that was already stale when it priced is contestable. A future-dated report clamps
to zero age rather than producing a negative one.

## 3. `SELF_HISTORY`

Predicate: `value < prevBandLo || value > prevBandHi`, where the band comes from the feed's own realized
moves **as they stood before this value was folded in** - the registry snapshots that band on every
accepted report, so the comparison cannot be made against a band the print itself widened. A bound of
zero encodes "no bound".

## 4. `PAYLOAD_PROVENANCE`

Predicate: the payload hash has a recorded owner and that owner is a different feed.

A payload signed for one asset and presented for another is evidence, not a typo, so the second use is
recorded rather than reverted. A replay for the same feed still reverts.

## 5. `CROSS_SOURCE`

Predicate: the feed has a declared peer, the peer published for the same round, and
`absDiffBps(value, peerValue) > CROSS_SOURCE_TOLERANCE_BPS` (5%). The bound is exclusive: exactly at
tolerance is not beyond it.

The peer is declared once, by the operator, and can never be changed. This is the only value an
operator can set after deployment, and it is one-shot precisely so that it cannot be chosen to suit a
claim that has already been made. Neither source is privileged: the rule reports that they disagree,
which is evidence about both of them.

`ChainlinkSource` turns a live aggregator into such a peer, scaling its answer to the asset's decimals
and refusing an answer that is not positive, or - when freshness is asked for - one that is too old.

## What happens on each verdict

| Verdict | Held bonus | Prover | Bond | Exposure | Error count | Feed's requirement |
|---|---|---|---|---|---|---|
| Upheld | to the borrower, in full | stake back plus 20% of the bonus | charged the bounty | released | +1 | rises 20%, capped at 3x |
| Refused | stays held | stake forfeits to the liquidator | untouched | unchanged | unchanged | unchanged |
| Void (abandoned) | stays held, then releases | stake forfeits to the liquidator | untouched | unchanged | unchanged | unchanged |
| No challenge, window closed | to the liquidator, in full | - | untouched | released | unchanged | unchanged |

## Liveness

Adjudication is permissionless, so a challenge can always be resolved by anyone at any time. If nobody
does, `voidStaleChallenge` becomes callable after the window plus a six-hour grace: the stake goes to
the liquidator whose bonus was frozen, and the escrow becomes releasable. A claim that is never
defended therefore cannot freeze someone else's money forever.
