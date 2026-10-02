# Limits

Written down because a mechanism that overstates itself cannot be trusted with money.

## What this is

A falsification detector for the price a liquidation consumed. It answers one question: *can the value
that priced this liquidation be reconciled with what the feed itself has already published?* If it
cannot, the liquidator's profit is redirected. If it can, the bonus is paid.

## What this is not

- **Not a correctness oracle.** A value can be false and still consistent with the feed's own history,
  in which case no rule fires. Lantern catches contradictions, not lies that agree with themselves.
- **Not a cross-source check.** The band is built from one feed's realized moves. A promised extension
  - comparing two independent sources for the same asset - is *not* implemented. Only the four rules
  below exist.
- **Not exposure-sized.** Recovery is bounded by the held bonus plus what the bond can pay. Recovery
  sized to the notional at risk would need a bond sized to the notional, which this deployment does
  not require. A signer who wants to be trusted with a large book must post a large bond.
- **Not a way to pause a feed by decree.** A feed that cannot cover its exposure cannot price, and
  that is arithmetic, not authority. Nobody can silence a well-bonded feed.

## The four rules, and what each one can miss

| Rule | Fires when | Misses when |
|---|---|---|
| `SLOT_UNIQUENESS` | one round carries two different values | the second print never happens |
| `ROUND_ORDERING` | the print was already stale when it priced | the print is fresh but wrong |
| `SELF_HISTORY` | the value is outside the band the feed's own moves imply | the feed has been consistently wrong, or its history is thin |
| `PAYLOAD_PROVENANCE` | the payload was signed for another feed | the payload is genuine but the value is fabricated |

## Known sharp edges

- **A thin feed is forgiving.** With few samples the band approaches its ceiling, so early prints are
  hard to contradict. This is deliberate - there is no basis for a claim yet - but it means a brand new
  feed offers little protection until it has a history.
- **An outlier can widen the band, but only so far.** A print outside the band contributes at most the
  width of the band it contradicted, so one print cannot buy unlimited tolerance, and the ceiling
  binds at 50%. A determined signer can still widen the band up to that ceiling by escalating prints.
- **The market is trusted to report liquidations honestly.** Lantern cannot verify that a liquidation
  was real; it verifies the price it consumed. A market that fabricates liquidations is out of scope.
- **A challenge is a claim, not a proof of loss.** When it succeeds, the borrower is restored from the
  held bonus. If the borrower's actual loss exceeded the bonus, the rest is not recovered here.
