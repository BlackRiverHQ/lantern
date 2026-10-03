# The dashboard

Three views over the deployed contracts, in `site/next/`. It is a Next.js app exported to static
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
`lib/chain/read.ts` is the snapshot. `lib/case/plan.ts` turns the snapshot into the step table.
`components/protocol.tsx` owns the state and is the only place the surface talks to the chain.

## Tests

```
npm test
```

Every selector and event topic the page uses is re-derived with `cast sig` / `cast keccak` and
diffed, because a wrong selector does not throw: `eth_call` returns empty and the page would show
zeros. `lib/chain/abi.ts` is executed and its calldata diffed against `cast calldata` for each action
the page can send, and the custom-error decoder is checked against real revert bytes.

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
