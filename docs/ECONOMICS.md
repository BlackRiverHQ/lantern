# Economics

Every number, all fixed at deploy or in `Constants.sol`.

| Number | Value | Where |
|---|---|---|
| Hold window | 30s - 1h, set at deploy | constructor |
| Bounty to a successful prover | 20% of the held bonus | `Constants.BOUNTY_BPS` |
| Prover's stake | 1% of the held bonus, floor 0.001 of the asset | `Constants.MIN_STAKE_BPS` |
| Minimum bond to list a feed | 0.1 of the asset | derived from the asset's decimals |
| Escalation per caught print | +20% of the requirement | `Constants.ERROR_BOND_PENALTY_BPS` |
| Escalation ceiling | 3x | `Constants.MAX_ERROR_STEPS` |
| Cross-source tolerance | 5% | `Constants.CROSS_SOURCE_TOLERANCE_BPS` |
| Grace before an abandoned challenge is void | 6 hours | `Constants.CHALLENGE_GRACE` |

## The floors follow the asset

The minimum bond and the minimum stake are derived from the asset's own decimals, read once at
construction: 0.1 and 0.001 of the asset. On an 18-decimal asset that is 1e17 and 1e15 as before. On a
six-decimal asset - USDC, USDG - it is 100000 and 1000 units, which is what makes the mechanism usable
with the stablecoins a payment or lending market actually settles in. An absolute 18-decimal floor
would have asked a six-decimal deployment for a billion dollars of bond.

## Who pays, and when

A liquidator's exposure to this mechanism is **the delay, never the debt**. The bonus is credited to an
escrow and released when the window closes. If a challenge succeeds, the liquidator does not pay the
borrower: the *report signer's bond* does, and the held bonus is redirected. The liquidator simply does
not receive it.

```
upheld:   escrow bonus ------> borrower
          signer's bond -----> prover (20% of the bonus), stake returned
refused:  prover's stake ----> liquidator
          escrow bonus stays held, then releases normally
void:     prover's stake ----> liquidator (the bonus was frozen for six hours)
```

## Why the stake exists

A challenge is cheap to make and expensive to make carelessly. A refused or abandoned challenge
forfeits the stake to the liquidator, so accusations carry a price that scales with the size of the
thing accused: 1% of the bonus at stake. A prover who is right is made whole and paid; a prover who is
guessing, or who walks away, pays for it.

## Why the bond is the binding constraint

A feed may only have reports recorded while its bond covers its outstanding exposure one for one,
escalated by how many times it has been caught. A market that wants its liquidations protected by
Lantern must therefore stand behind its price feed with capital proportional to the book it is pricing,
and a feed with a record must stand behind it with more.

A feed that cannot cover its own exposure cannot price. Nothing has to be paused or voted on; the
arithmetic refuses. That is the whole point: the trusted party is not bounded by a parameter someone
else chose, it is bounded by money it had to post.
