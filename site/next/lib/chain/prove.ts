/* prove.ts — the held bonuses a stranger can still stake against, resolved to the numbers a verdict
   is made of.

   `Lantern.adjudicate` reads its report at the case's own feed and round, and the peer from
   `_peer[e.feedId]` at that same round. So this reader resolves each case's feed and round from the
   escrow and its peer from the contract with `peerOf`, rather than assuming every case belongs to the
   feed the dashboard happens to show. A case whose feed declares no peer cannot be challenged under
   CROSS_SOURCE at all, and is reported as such instead of quietly disappearing from the list. */

import { config, SEL } from "./config";
import { b32, call, first, id32, report, w32, type Report } from "./rpc";
import { registry } from "./read";
import { type CaseRecord } from "./cases";
import {
  canChallenge, crossSource, payout, stakeFloor,
  type Payout, type Verdict, type Window,
} from "../case/prove";

export type Provable = {
  c: CaseRecord;
  feedId: string;
  /** the zero word when the feed has declared no second source */
  peerId: string;
  round: number;
  subj: Report | null;
  peer: Report | null;
  /** null when there is no peer to compare against, which is a fact about the case, not an error */
  v: Verdict | null;
  stake: bigint;
  pay: Payout;
  bond: bigint;
  win: Window;
};

const ZERO32 = "0x" + "0".repeat(64);

/** Every case the chain still carries a record for, decided or not: a decided case is what the
 *  page holds its own comparison against, so it must be readable for the same reasons.
 *
 *  The cases are handed in rather than re-scanned: the provider has already loaded them, and a second
 *  event scan per refresh is what starved this page's first read. */
export async function provableCases(cases: CaseRecord[], now: number, minStake: bigint, bountyBps: bigint): Promise<Provable[]> {
  const CFG = config();
  const REG = await registry();
  const held = cases.filter((c) => (c.round ?? 0) > 0 && !!c.feedId);

  const out: Provable[] = [];
  for (let i = 0; i < held.length; i += 8) {
    const group = await Promise.all(held.slice(i, i + 8).map(async (c) => {
      const feedId = c.feedId as string;
      const round = c.round as number;
      const peerId = b32(first(await call(CFG.lantern, SEL.peerOf + id32(feedId))));
      const subj = report(await call(REG, SEL.reportAt + id32(feedId) + w32(round)));
      const hasPeer = peerId !== ZERO32;
      const peer = hasPeer ? report(await call(REG, SEL.reportAt + id32(peerId) + w32(round))) : null;
      const bond = first(await call(CFG.lantern, SEL.bondOf + id32(feedId)));
      const stake = stakeFloor(c.bonus, minStake);
      const p: Provable = {
        c, feedId, peerId, round,
        subj, peer,
        v: peer ? crossSource(subj.value, peer.value, peer.exists) : null,
        stake,
        pay: payout(stake, c.bonus, bountyBps, bond),
        bond,
        win: canChallenge(
          { exists: c.exists, outcome: c.outcome ?? 0, deadline: c.deadline, challengeOpen: c.challengeOpen },
          now,
        ),
      };
      return p;
    }));
    out.push(...group);
  }

  // what a visitor came for first: bonuses still open to a claim, best claim first, newest first
  const rank = (p: Provable) =>
    (p.c.exists && (p.c.outcome ?? 0) === 0 ? 0 : 4) + (p.win.open ? 0 : 2) + (p.v && p.v.upheld ? 0 : 1);
  out.sort((a, b) => rank(a) - rank(b) || b.c.id - a.c.id);
  return out;
}

/** Whether the chain is still holding this case's bonus — the thing that can be staked against. */
export const isHeld = (p: Provable) => p.c.exists && (p.c.outcome ?? 0) === 0;

/** How many of these a visitor could actually stake against right now. */
export const claimable = (rows: Provable[]) => rows.filter((p) => isHeld(p) && p.win.open && p.v && p.v.upheld);
