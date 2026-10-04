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
  The market this is deployed with is a real one - collateral in custody, priced from the feed, closing
  a position only when its own rule says the position is unhealthy - but that makes the trust concrete
  rather than removing it: the address is fixed in Lantern's constructor, so the trust is exactly one
  contract, and the notional it declares is the number the hold and the bond are computed from.
- **A challenge is a claim, not a proof of loss.** When it succeeds, the borrower is restored from the
  held bonus. If the borrower's actual loss exceeded the bonus, the rest is not recovered here.
- **One challenge per liquidation, and a liquidator can spend it.** A liquidator can file a rule that
  does not hold against its own liquidation, get its stake back as the forfeit, and lock out the rule
  that does. It costs gas and nothing else. The fix is one challenge per (liquidation, rule); it is not
  deployed because the contract has no upgrade path. Pinned by
  `test_KNOWN_GAP_a_liquidator_can_spend_the_one_challenge_slot_on_itself`.
- **Escalation is capped.** A feed with ten or more caught prints is asked for three times its floor,
  not more. Beyond that the mechanism stops escalating and simply keeps charging the bond per incident.

## What a verdict means, and what it does not

- **"Upheld" means contradicted, not false.** Each rule establishes that the value is inconsistent
  with something the feed already committed to (its own round, its own timing, its own payload, its
  own history) or with a second source the operator named in advance. None of them establishes the
  true price. That is why the page says "contradicted the record" and not "was false".
- **`CROSS_SOURCE` does not make the peer right.** A disagreement beyond 5% for the same round shows that
  the two sources cannot both be right, and the subject feed is the one that consumed the
  liquidation. If the peer is the one that is wrong (late, thin, a different market, or manipulated),
  the verdict is still upheld against the subject. The operator chose that peer and cannot change it,
  so the operator is the one exposed to that risk. Two methodologies that legitimately differ by more
  than 5% should not be declared peers.
- **`SELF_HISTORY` shows an abnormal move, not a false price.** A real market can leave the band. The band is
  widened by each move it sees, capped by the per-report drift limit, and a fast real move upheld
  under this rule costs the liquidator the bonus and nothing else, because the debt was already settled.
- **The rules are public, so a feed can stay inside them.** A value that agrees with the feed's own
  history and with its peer passes every rule. Lantern raises the cost of a lie from "publish it" to
  "publish it consistently, and get a second, independently operated source to agree". It does not
  make a consistent lie detectable.

## Recovery, not prevention

- The liquidation, the repayment and the close all happen at the moment of liquidation. Lantern only
  decides who keeps the profit afterwards. A borrower whose position was closed on a contradicted price
  gets the collateral and the bonus back, but the position itself stays closed, and losses beyond
  those amounts (a missed move, a cascade elsewhere) are not recovered here.

## Who watches, and why they would

- "Anyone can challenge" is a permission, not a guarantee that someone will. A challenge is worth
  making when 20% of the held bonus is larger than the gas plus the risk on a 1% stake. On small
  bonuses that may not pay, and such cases can go unchallenged.
- The checks a challenger runs are reads of state that is already on chain, so a watcher is a few RPC calls
  per liquidation and does not need its own price data. The person with the most reason to run one is the
  borrower who was liquidated.
- The hold window is a deploy-time choice between 30 seconds and one hour (`TimeLib.validateWindow`).
  Five minutes is the value this deployment uses, not a derived optimum. Longer windows give watchers
  more time and delay the liquidator's profit by the same amount.

## What is and is not shown

- The deployment is on Arbitrum Sepolia with a test asset. The 664 tests and the recorded
  transactions show that the mechanism behaves as written. They say nothing about whether anyone wants it.
- A feed operator has to choose to post a bond. The intended pressure comes from the market side: a
  lending market that only accepts Lantern-bonded feeds makes the bond the operator's cost of being
  listed there. Whether markets would require it is an open question, not something shown here.
- Escalating the bond 20% per caught print is a policy that makes repeat offences expensive. It is not a
  model of expected loss.
