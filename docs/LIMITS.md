# Limits

Written down because a mechanism that overstates itself cannot be trusted with money.

## What this is

A falsification detector for the value a liquidation consumed. It answers one question: *can the value
that priced this liquidation be reconciled with what the feed itself has already published, or with an
independent source declared in advance?* If it cannot, the liquidator's profit is redirected. If it
can, the bonus is paid.

## What this is not

- **Not a correctness oracle.** A value can be false and still consistent with the feed's own history
  and with its declared peer, in which case no rule fires. Lantern catches contradictions, not lies
  that agree with themselves.
- **Sized to the notional, but only to a share of it.** The market declares what the liquidation put at
  risk and the bond has to cover a fixed share of that, so recovery is no longer capped at the held
  bonus. The share is one per cent, which is a policy choice and not a derivation: a bond that covers a
  hundredth of a position is not a bond that makes the position whole.
- **Not a way to pause a feed by decree.** A feed that cannot cover its exposure cannot price, and that
  is arithmetic, not authority. Nobody can silence a well-bonded feed.
- **Not a mechanism for every token.** Fee-on-transfer and rebasing tokens are refused rather than
  accounted for, and an asset above 18 decimals is refused rather than rounded. Both refusals are
  explicit errors, not silent behaviour.

## One structural condition, before any rule is asked

A liquidation may only be priced on a print that had at least four prints behind it. Below that a band
is computed from almost nothing and is wide enough to excuse anything, so every rule above is
vacuously true. A feed may still print as freely as it likes below the floor — that is how it *builds*
the history — but it cannot price until it has one. This is the condition a fabricated first print
would otherwise walk through.

## The five rules, and what each one can miss

| Rule | Fires when | Misses when |
|---|---|---|
| `SLOT_UNIQUENESS` | one round carries two different values | the second print never happens |
| `ROUND_ORDERING` | the print was already stale when it priced | the print is fresh but wrong |
| `SELF_HISTORY` | the value is outside the band the feed's own moves imply | the feed has been consistently wrong, or its history is thin |
| `PAYLOAD_PROVENANCE` | the payload was signed for another feed | the payload is genuine but the value is fabricated |
| `CROSS_SOURCE` | a declared peer disagrees beyond tolerance for the same round | both sources are wrong together, the peer has no print for that round, or no peer was declared |

## Known sharp edges

- **A thin feed is forgiving.** With few samples the band approaches its ceiling, so early prints are
  hard to contradict. This is deliberate - there is no basis for a claim yet - but a brand new feed
  offers little protection until it has a history.
- **An outlier can widen the band, but only so far.** A print outside the band contributes at most the
  width of the band it contradicted, the per-report drift cap binds at 20%, and the ceiling binds at
  50%. A determined signer can still widen the band up to that ceiling by escalating prints.
- **The peer rule needs a round that both sources answered.** The comparison is by the subject feed's
  round number. A peer that has not published for that round is silence, and silence upholds nothing.
  A live aggregator's own round id is phase-encoded above 64 bits and is reported as zero rather than
  truncated into a different number.
- **A peer is declared once, and may never be declared at all.** The declaration is one-shot so that it
  cannot be swapped to suit a claim already made - but a feed that never declares one simply does not
  have the fifth rule.
- **The market is trusted to report liquidations honestly.** Lantern cannot verify that a liquidation
  was real; it verifies the value it consumed. A market that fabricates liquidations is out of scope.
- **A challenge is a claim, not a proof of loss.** When it succeeds, the borrower is restored from the
  held bonus. If the borrower's actual loss exceeded the bonus, the rest is not recovered here.
- **Escalation is capped.** A feed with ten or more caught prints is asked for three times its floor,
  not more. Beyond that the mechanism stops escalating and simply keeps charging the bond per incident.
