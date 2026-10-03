# The dashboard

Five views over the deployed contracts, in `site/next/`. It is a Next.js app exported to static
files; the same Convex deployment that serves the landing page serves it.

Nothing on it is mocked, mirrored or cached. Every number shown is read from the chain in the
browser at the block named on the page, and every control offered is a transaction the reader may
actually send.

## Routes

| Route | What it answers |
|---|---|
| `/dashboard` | whether the feed may price anything at all, and what money is waiting to be moved |
| `/dashboard/cases` | every liquidation on chain, and the transactions that decided it |
| `/dashboard/run` | the mechanism, drivable from a wallet in eight steps |
| `/dashboard/prove` | the bonuses somebody else's liquidation is holding, and the claim anyone may stake on them |
| `/dashboard/feeds` | what a feed must carry, and how an operator registers one, bonds it, and declares its second source |

## Overview

Four vitals, each a value that changes what the protocol will do:

- **Feed bond** against the bond the feed must carry. Below it, the feed is underbonded.
- **History depth**: the prints behind the last one, against the depth a challenge needs.
- **Held bonuses**: liquidation profits whose challenge window is still open.
- **Caught lies**: prints the feed was caught on.

Below them, a row per thing that needs a decision, drawn from chain state rather than from a
calendar. Two of those things are permissionless and get a button:

- a held bonus whose window has closed and which no challenge covers → `release(id)`
- a liquidation that has been decided and whose seizure nobody has claimed → `claim(id)`

Both checks are made against the contract's own guards: the row offers the button only where the
call cannot revert, and where the move instead belongs to the feed operator the row says so.

Every case is read, and every unsettled escrow with it — in bounded groups, but with no cap — because
a row missing from this panel is money a reader could have moved and did not know about. The rows
themselves are pinned by `test/attention.test.mjs`, which drives the panel with a closed window, a
running window, an unresolved challenge, a decided seizure and an unreadable escrow and asserts
exactly which of them carry a button.

## Cases

The full event log across both contracts, oldest state folded away: how it ended, what was held, the
rule that decided it, and the block each transaction landed in, each linking to its receipt.

## Prove a price

The page the protocol's argument rests on, and the only one whose subject is other people's money.
Every row is a case that was already liquidated and whose bonus the chain is still holding. For each
one the page reads the print the feed made for that case's own round and the print its declared
second source made for the same round, re-runs the comparison `Verdicts.evaluate` will run, and
offers the stake only where the contract's own arithmetic says the claim holds.

That last part is the point. A refused challenge costs the challenger their whole stake, so an
over-eager button here is the most expensive defect the dashboard could ship: `lib/case/prove.ts`
computes the verdict and `lib/chain/prove.ts` resolves the real reports to feed it, but neither is
the authority — the contract recomputes everything from the registry when the challenge lands, and
the page only shows the reader the sum before they pay to find out.

Beneath the held bonuses, the page lists the verdicts the deployment has already reached, with its
own read beside the verdict the contract recorded. A row where the two disagree says so. This is how
the page can be checked rather than trusted: `npm run live` asserts the same agreement against the
live chain, so a reader can see the page reproduce a verdict the contract actually reached.

A held bonus exists for the length of the challenge window and then it is gone, so the page is empty
of them most of the time and a recording has to make one first. `/dashboard/run` does that from a
browser wallet; the same three steps are also callable directly on the deployment, which is how a
held bonus can be produced without a wallet at all — the borrower only has to be a wallet with a
liquidatable position:

```
SITE=https://friendly-fennec-31.convex.site
BORROWER=0x...            # a position the market would liquidate at a false price
post() { curl -s -X POST -H 'content-type: application/json' -d "$1" "$SITE/api/print"; echo; }

post '{"kind":"honest","caseId":41,"r1":8,"r2":9,"borrower":"'$BORROWER'"}'
post '{"kind":"lie","caseId":41,"r1":8,"r2":9,"gap":1800,"borrower":"'$BORROWER'"}'
post '{"kind":"liquidate","caseId":41,"r1":8,"r2":9,"borrower":"'$BORROWER'"}'
```

The rounds are the two after the last print either feed made, and the server will tell you them
rather than you having to work them out: post the first call with any `r1`/`r2` and it refuses with
`{"error":"the feed has moved on; this case needs rounds N and N+1","r1":N,"r2":N+1}`. The case id is
whatever is free — the server refuses a taken one.

## Feeds and bonds

The operator's side. A feed is the thing that stands behind a print, so this page asks the contract
for each of those facts rather than deriving any of them: the operator, the bond against the bond the
contract requires, the exposure the bond must cover, how many times the feed has been caught, and the
second source it was reconciled against.

An operator registers a feed, bonds it, and declares its second source. The feed id is derived from
the reader's address and the name they type, so the same name in two wallets is two different feeds,
and the page recovers its own feed from the same derivation on the next visit. Declaring the second
source is one-way, and the page says so before the button is pressed.

## Run a case

The one page that signs. Eight steps, each a real transaction: claim test HOLD, print the honest
price, borrow, print a false price, be liquidated, challenge the print, take the verdict, settle.

Values are derived, never typed: the false price is the real price scaled by the gap the contract
enforces, the liquidation amount comes from the market's own health check, and the stake is the
contract's own floor — `WaterfallMath.stakeFloor(bonus, minStake)`, the larger of `minStake` and 1%
of the held bonus (`MIN_STAKE_BPS`). Every transaction is preflighted with `eth_call` before it is
offered for signature, so a revert arrives as a sentence instead of a receipt.

The feed's side is played by `/api/print`, a Convex HTTP action holding the feed operator's key. It
derives every value it prints from the chain and refuses to print anything a case does not need.

## Reading order

`lib/chain/config.ts` holds every address, selector and event topic. `lib/chain/abi.ts` is the
encoder, written out rather than imported. `lib/chain/rpc.ts` talks JSON-RPC from the page.
`lib/chain/read.ts` is the snapshot. `lib/chain/cases.ts` folds the event log into the cases the
other pages list. `lib/case/prove.ts` is the verdict arithmetic, kept pure so a test can pin it
against the Solidity; `lib/chain/prove.ts` resolves the real reports that arithmetic is fed.
`lib/chain/feeds.ts` is one feed as the contract holds it. `lib/case/plan.ts` turns the snapshot into
the step table. `components/protocol.tsx` owns the state and is the only place the surface talks to
the chain.

## Tests

```
npm test
npm run live
npm run verify:wallet -- --page prove --dry
```

Every selector and event topic the page uses is re-derived with `cast sig` / `cast keccak` and
diffed, because a wrong selector does not throw: `eth_call` returns empty and the page would show
zeros. `lib/chain/abi.ts` is executed and its calldata diffed against `cast calldata` for each action
the page can send, and the custom-error decoder is checked against real revert bytes.

`npm test` runs offline. `npm run live` compiles the chain layer and runs it against the real chain
outside the browser, which is where a reader that builds malformed calldata or mis-formats an id
fails with a stack trace instead of on the page. It also asserts the strongest thing the dashboard
claims: that the comparison this page makes on a decided case is the verdict the contract reached -
and that there is at least one decided case to make that assertion about, because a deployment with
none would otherwise report "agreed on 0 of 0" and exit zero.

`npm run verify:wallet` is the one check that ends in a signature. It drives the live deployment in a
real browser with `window.ethereum` injected before the first render, bridging every request to a
key read from `~/.lantern-deployer.json` at run time - the injected script holds nothing secret. A
wallet extension cannot be driven headlessly, and DOM assertions only show the surface; this shows
the page's own button producing its transactions and the chain accepting them. It is not part of
`npm test`, because it needs the network, cast and playwright (`PLAYWRIGHT_DIR`), and it sends
transactions: `--dry` connects and reports what the page offers without signing anything.

Three pages, each in the state it needs:

```
npm run verify:wallet -- --page prove --case 45
npm run verify:wallet -- --page feeds
npm run verify:wallet -- --page run --case 45 --r1 15 --r2 16 --do "Get the verdict"
```

`--page run` seeds the visitor's case into `localStorage`, which the page's own "start a case" would
otherwise have written, so the step table is built for a case the page did not create itself.

Two things about a stake are worth knowing before reading its output. The page approves HOLD only when
the allowance is short, so a wallet that already holds one sees a single transaction and not two:
counting to two waits on a transaction the page has no reason to send. And the run page offers a step
only once every step before it is done (the pass at the end of `plan.ts`), so a case assembled out of
band - whose chain state makes steps 2 to 6 read as done, but whose wallet is short of WETH - shows
the verdict as pending with no button at all. Run the fund step first, then the verdict.

### Producing something to stake against

`/dashboard/prove` offers its button only while a bonus is held, and a bonus exists only between a
liquidation and its verdict. On the live deployment the three calls in "Prove a price" above produce
one. The order matters, and it is not the obvious one: the market's borrow limit and its liquidation
check are the same function of the same price, so a position borrowed up to its limit can never be
liquidated at that price - the price has to move after the borrow. Practically that means printing a
real price at a new round, borrowing up to the limit at *that* price, and only then letting the feed
print below it and liquidating against the lower round.

## Build

```
npm install
npm test
npm run build              # static export into site/next/out
cd ../../convex-host
npm run build              # builds the site and copies it into dist/
npm run deploy             # pushes functions and uploads dist/
```

`site/index.html` and `site/assets/` remain the source of the landing page and are copied into
`public/` at build time, so the marketing surface is not committed twice.
