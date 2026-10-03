/* read.ts — the snapshot. One function reads everything the surface shows, from the chain, in one
   round trip where the calls are independent. Nothing is mirrored and nothing is cached across
   calls: a page that displays a financial state reads that state at the moment it renders. */

import { config, SEL } from "./config";
import { call, first, hexAddr, id32, rpc, report, words, w32, type Report } from "./rpc";
import { encAddress } from "./abi";

export type Health = { debt: bigint; limit: bigint };
export type Escrow = {
  deadline: number; bonus: bigint; liquidator: string; borrower: string;
  outcome: number; exists: boolean;
};
export type Challenge = { prover: string; open: boolean; stake: bigint; resolved: boolean; upheld: boolean };
export type Seizure = { borrower: string; liquidator: string; collateral: bigint; repay: bigint; state: number };

export type CaseKey = { id: number; r1: number; r2: number; gap: number };

export type Snapshot = {
  block: number;
  now: number;
  cl: bigint;
  subj: Report;
  peerLast: Report;
  bond: bigint;
  required: bigint;
  priceable: boolean;
  errors: bigint;
  minStake: bigint;
  bounty: bigint;
  closeBps: bigint;
  bonusBps: bigint;
  idle: bigint;
  cooldown: number;
  eth: bigint;
  hold: bigint;
  weth: bigint;
  acct: { posted: bigint; debt: bigint; supplied: bigint };
  claimedAt: number;
  hP: Health | null;
  hL: Health | null;
  hNow: Health | null;
  r1: Report | null;
  r2: Report | null;
  p2: Report | null;
  esc: Escrow | null;
  ch: Challenge | null;
  sz: Seizure | null;
};

// the registry is written into Lantern at construction and cannot move; read it once
let REG_CACHE: string | null = null;
export async function registry(): Promise<string> {
  if (!REG_CACHE) REG_CACHE = hexAddr(first(await call(config().lantern, SEL.reg)));
  return REG_CACHE;
}

export async function readSnapshot(k: CaseKey | null, account: string | null): Promise<Snapshot> {
  const CFG = config();
  const REG = await registry();

  const r = await Promise.all([
    rpc("eth_getBlockByNumber", ["latest", false]),
    call(CFG.aggregator, SEL.latestRoundData),
    call(REG, SEL.lastReport + id32(CFG.subject)),
    call(REG, SEL.lastReport + id32(CFG.peer)),
    call(CFG.lantern, SEL.bondOf + id32(CFG.subject)),
    call(CFG.lantern, SEL.requiredBond + id32(CFG.subject)),
    call(CFG.lantern, SEL.priceable + id32(CFG.subject)),
    call(CFG.lantern, SEL.feedErrors + id32(CFG.subject)),
    call(CFG.lantern, SEL.minStake),
    call(CFG.lantern, SEL.bountyBps),
    call(CFG.market, SEL.closeFactorBps),
    call(CFG.market, SEL.liquidationBonusBps),
    call(CFG.asset, SEL.balanceOf + encAddress(CFG.market)),
    call(CFG.asset, SEL.cooldown),
  ]);

  const s: Snapshot = {
    block: parseInt(r[0].number, 16),
    now: parseInt(r[0].timestamp, 16),
    cl: (words(r[1])[1] || 0n) / 100n, // the aggregator's eight decimals onto the asset's six
    subj: report(r[2]),
    peerLast: report(r[3]),
    bond: first(r[4]),
    required: first(r[5]),
    priceable: first(r[6]) === 1n,
    errors: first(r[7]),
    minStake: first(r[8]),
    bounty: first(r[9]),
    closeBps: first(r[10]),
    bonusBps: first(r[11]),
    idle: first(r[12]),
    cooldown: Number(first(r[13])),
    eth: 0n, hold: 0n, weth: 0n,
    acct: { posted: 0n, debt: 0n, supplied: 0n },
    claimedAt: 0,
    hP: null, hL: null, hNow: null,
    r1: null, r2: null, p2: null,
    esc: null, ch: null, sz: null,
  };

  if (account) {
    const m = await Promise.all([
      rpc("eth_getBalance", [account, "latest"]),
      call(CFG.asset, SEL.balanceOf + encAddress(account)),
      call(CFG.collateral, SEL.balanceOf + encAddress(account)),
      call(CFG.market, SEL.accountOf + encAddress(account)),
      call(CFG.asset, SEL.claimedAt + encAddress(account)),
    ]);
    s.eth = BigInt(m[0]);
    s.hold = first(m[1]);
    s.weth = first(m[2]);
    const a = words(m[3]);
    s.acct = { posted: a[0] || 0n, debt: a[1] || 0n, supplied: a[2] || 0n };
    s.claimedAt = Number(first(m[4]));
    if (s.subj.exists) {
      const hn = words(await call(CFG.market, SEL.healthOf + encAddress(account) + w32(s.subj.value)));
      s.hNow = { debt: hn[0] || 0n, limit: hn[1] || 0n };
    }
  }

  if (k) {
    const c = await Promise.all([
      call(REG, SEL.reportAt + id32(CFG.subject) + w32(k.r1)),
      call(REG, SEL.reportAt + id32(CFG.subject) + w32(k.r2)),
      call(REG, SEL.reportAt + id32(CFG.peer) + w32(k.r2)),
      call(CFG.lantern, SEL.escrowOf + w32(k.id)),
      call(CFG.lantern, SEL.challengeOf + w32(k.id)),
      call(CFG.market, SEL.seizureOf + w32(k.id)),
    ]);
    s.r1 = report(c[0]);
    s.r2 = report(c[1]);
    s.p2 = report(c[2]);

    // feedId, round, recordedAt, deadline, bonus, liquidator, borrower, outcome, exists
    const e = words(c[3]);
    s.esc = {
      deadline: Number(e[3] || 0n),
      bonus: e[4] || 0n,
      liquidator: hexAddr(e[5]),
      borrower: hexAddr(e[6]),
      outcome: Number(e[7] || 0n),
      exists: e[8] === 1n,
    };

    // prover, stake, rule, evidenceHash, resolved, upheld, openedAt
    const h = words(c[4]);
    s.ch = {
      prover: hexAddr(h[0]),
      open: (h[0] || 0n) !== 0n,
      stake: h[1] || 0n,
      resolved: h[4] === 1n,
      upheld: h[5] === 1n,
    };

    // borrower, liquidator, collateralAmount, repayAmount, state
    const z = words(c[5]);
    s.sz = {
      borrower: hexAddr(z[0]),
      liquidator: hexAddr(z[1]),
      collateral: z[2] || 0n,
      repay: z[3] || 0n,
      state: Number(z[4] || 0n),
    };

    if (account) {
      const d = deriveHonest(s, k);
      const hh = await Promise.all([
        call(CFG.market, SEL.healthOf + encAddress(account) + w32(d.pH)),
        call(CFG.market, SEL.healthOf + encAddress(account) + w32(d.L)),
      ]);
      const p = words(hh[0]);
      const l = words(hh[1]);
      s.hP = { debt: p[0] || 0n, limit: p[1] || 0n };
      s.hL = { debt: l[0] || 0n, limit: l[1] || 0n };
    }
  }

  return s;
}

/** The two prices a case is built on, derived from the chain rather than typed: the honest print is
 *  Chainlink's own answer held inside the contract's per-print drift guard, and the lie is that
 *  value minus the gap the visitor chose. */
export function deriveHonest(s: Snapshot, k: CaseKey): { pH: bigint; L: bigint; peerV: bigint } {
  const pH = s.r1 && s.r1.exists ? s.r1.value : honestGuess(s);
  const L = s.r2 && s.r2.exists ? s.r2.value : (pH * (10000n - BigInt(k.gap))) / 10000n;
  const peerV = s.p2 && s.p2.exists ? s.p2.value : s.cl;
  return { pH, L, peerV };
}

/** Chainlink's answer, pulled into the band the feed's own last print allows, so the honest print is
 *  a value the contract will accept rather than one it will refuse as a drift. */
export function honestGuess(s: Snapshot): bigint {
  const a = s.subj.exists ? s.subj.value : 0n;
  const v = s.cl;
  if (!a) return v;
  const DRIFT = 2000n;
  const BPS = 10000n;
  const lo = (a * (BPS - DRIFT + 100n)) / BPS;
  const hi = (a * (BPS + DRIFT - 100n)) / BPS;
  return v < lo ? lo : v > hi ? hi : v;
}
