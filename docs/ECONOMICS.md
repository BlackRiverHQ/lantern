# Economics

Three numbers, all fixed at deploy or in `Constants.sol`.

| Number | Value | Where |
|---|---|---|
| Hold window | 30s - 1h, set at deploy | constructor |
| Bounty to a successful prover | 20% of the held bonus | `Constants.BOUNTY_BPS` |
| Prover's stake | 1% of the held bonus, floor 0.001 unit | `Constants.MIN_STAKE_BPS` |
| Minimum bond to list a feed | 0.1 unit | `Constants.MIN_BOND` |

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
```

## Why the stake exists

A challenge is cheap to make and expensive to make carelessly. A refused challenge forfeits the stake
to the liquidator, so accusations carry a price that scales with the size of the thing accused: 1% of
the bonus at stake. A prover who is right is made whole and paid; a prover who is guessing pays for the
guess.

## Why the bond is the binding constraint

A feed may only have reports recorded while its bond covers its outstanding exposure one for one. A
market that wants its liquidations protected by Lantern must therefore stand behind its price feed with
capital proportional to the book it is pricing. That is the whole point: the trusted party is not
bounded by a parameter someone else chose, it is bounded by money it had to post.

A feed that cannot cover its own exposure cannot price. Nothing has to be paused or voted on; the
arithmetic refuses.
