/* feeds.ts — one feed, as the contract holds it.

   A feed is the thing that stands behind a print: an operator, a bond that must cover its exposure,
   a second source declared once and never changed, and a count of how many times it has been caught.
   This reader asks the contract for each of those rather than deriving any of them, so a feed that
   cannot price says so for the reason the contract gives. */

import { config, SEL } from "./config";
import { b32, call, first, hexAddr, id32, report, type Report } from "./rpc";
import { registry } from "./read";

export const ZERO32 = "0x" + "0".repeat(64);

export type FeedView = {
  id: string;
  operator: string;
  registered: boolean;
  bond: bigint;
  required: bigint;
  exposure: bigint;
  errors: bigint;
  /** the zero word when no second source has been declared */
  peerId: string;
  priceable: boolean;
  last: Report | null;
};

export async function readFeed(id: string): Promise<FeedView> {
  const CFG = config();
  const REG = await registry();
  const [op, bond, req, exp, errs, peer, price, last] = await Promise.all([
    call(CFG.lantern, SEL.operatorOf + id32(id)),
    call(CFG.lantern, SEL.bondOf + id32(id)),
    call(CFG.lantern, SEL.requiredBond + id32(id)),
    call(CFG.lantern, SEL.exposureOf + id32(id)),
    call(CFG.lantern, SEL.feedErrors + id32(id)),
    call(CFG.lantern, SEL.peerOf + id32(id)),
    call(CFG.lantern, SEL.priceable + id32(id)),
    call(REG, SEL.lastReport + id32(id)),
  ]);
  const operator = hexAddr(first(op));
  const r = report(last);
  return {
    id,
    operator,
    registered: operator !== hexAddr(0n),
    bond: first(bond),
    required: first(req),
    exposure: first(exp),
    errors: first(errs),
    peerId: b32(first(peer)),
    priceable: first(price) === 1n,
    last: r.exists ? r : null,
  };
}

export async function readFeeds(ids: string[]): Promise<FeedView[]> {
  return Promise.all(ids.map(readFeed));
}
