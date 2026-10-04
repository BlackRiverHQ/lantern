# Lantern watcher

"Anyone can challenge" is only a permission. This is the program that actually does it.

The watcher reads every liquidation Lantern holds a bonus for. For each one it reads exactly the
state `Lantern.adjudicate` will read, runs the same five rules on it, and, while the window is
open, stakes the minimum and challenges the liquidations the contract will uphold. It asks for the
verdict in the same pass. Liquidations whose price held up are left alone.

It needs no price data of its own. Every input is a read from contracts that are already
deployed, so a pass costs a handful of RPC calls per open case.

## What it has done on the live chain

Arbitrum Sepolia, Lantern `0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54`.

| case | what the watcher found | transaction |
| --- | --- | --- |
| #42 | a `CROSS_SOURCE` challenge opened and never decided, past the grace period. Decided on its merits: upheld | [`0x55e96586…`](https://arbitrum-sepolia.blockscout.com/tx/0x55e96586f9616c8524d80f21a407d5d728cf278db44a30b7631e21199a640c2d) |
| #44 | the same: upheld, so the held bonus went to the borrower | [`0x4444c67f…`](https://arbitrum-sepolia.blockscout.com/tx/0x4444c67ff998a5be2a0a6d943ab5f022fa920336035cee1eeff736fd4058cb5e) |

The other way out for those two challenges was `voidStaleChallenge`, which anyone may call after
the grace period. It hands the stake to the liquidator and releases the bonus without asking
whether the claim was right. The watcher always adjudicates instead, because `adjudicate` has no
deadline.

## Does it predict the contract?

A watcher that stakes on its own prediction has to show that the prediction matches the
contract. `--agree` takes every verdict already on chain, recomputes it from the same state with
the watcher's rule code, and compares:

```
$ node bin/watch.mjs --agree
#9  CROSS_SOURCE: chain upheld, mirror upheld agree
#37 CROSS_SOURCE: chain upheld, mirror upheld agree
#45 CROSS_SOURCE: chain upheld, mirror upheld agree
#42 CROSS_SOURCE: chain upheld, mirror upheld agree
#44 CROSS_SOURCE: chain upheld, mirror upheld agree
agreement: 5/5
```

Before every challenge it also simulates `openChallenge` and `adjudicate` against the chain. If the
contract's own simulation disagrees with the watcher's rule code, the disagreement is logged.

## The end-to-end test

`npm run fork` forks the live deployment locally and makes two new liquidations through the real
market. Each one has a borrower, a feed print, a second-source print and an ordinary liquidator.
Then the watcher runs once, with a key that has never touched the deployment:

- **A:** the feed prints 18% under Chainlink. The watcher must challenge, and the bonus must go to the borrower.
- **B:** the feed prints 4% under Chainlink, which is enough to liquidate a 99% loan but inside the
  5% tolerance. The watcher must leave it alone.

The result is checked from chain state, not from the watcher's output:

```
== case A: printed 2208149811 vs chainlink 2692865624 (gap 1800 bps), liquidated, bonus 2238
== case B: printed 2585150999 vs chainlink 2692865624 (gap 400 bps), liquidated, bonus 2332
#900090275 challenge: CROSS_SOURCE holds (observed 1800, bound 500) stake=1000 bounty=447 left=151s
  ok   case A outcome is 2 (bonus redirected to the borrower)
  ok   case A was challenged by the watcher
  ok   case B is still held (outcome 0)
  ok   case B was not challenged
```

`npm test` runs the rule code against the Solidity it copies. Every constant is re-read from
`Constants.sol` and the rule order from `Provenance.sol`, and each rule is checked on both sides of
its boundary (5.00% vs 5.01%, 300 s vs 301 s, …). 44 checks.

## Which rule it stakes on

All five rules are evaluated for every case. It stakes on the strongest one that holds, in this order:

1. `CROSS_SOURCE`: a second source, named in advance, disagrees by more than 5% for the same round
2. `SLOT_UNIQUENESS`: the feed printed two values for one round
3. `PAYLOAD_PROVENANCE`: the payload was signed for another feed
4. `ROUND_ORDERING`: the print was older than five minutes when it priced the liquidation
5. `SELF_HISTORY`: only with `--history`

`SELF_HISTORY` is opt-in because a value outside the feed's own band shows that the move was
abnormal, not that the price was wrong. Real markets do move that fast sometimes.

## Run it

```
npm install
node bin/watch.mjs --dry-run --once --all   # decide every case, send nothing, no key needed
node bin/watch.mjs --agree                  # the agreement check above
WATCHER_ACCOUNT_FILE=~/.watcher.json node bin/watch.mjs          # watch every 12 s, forever
```

- `--release` also releases bonuses whose window closed with no challenge.
- `--interval <s>` sets the poll interval.
- `RPC_URL` overrides the public endpoint.

The key is read from `WATCHER_PRIVATE_KEY`, or from a `cast wallet new --json` file named by
`WATCHER_ACCOUNT_FILE`. It is never printed or written. Every transaction the watcher sends is
appended to `runs/ledger.jsonl` with its hash.

## What it costs and earns

- **Cost:** one faucet claim if needed, one approval, then two transactions per case: open the
  challenge and adjudicate. On the live chain a challenge plus its verdict used 177,963 gas,
  about 0.0000089 test ETH.
- **Return:** the stake comes back, plus 20% of the held bonus, paid from the feed's bond.
- **Limit:** whether that is worth doing depends on the bonus. On a small bonus it may not be,
  which is the economic limit `docs/LIMITS.md` describes.
