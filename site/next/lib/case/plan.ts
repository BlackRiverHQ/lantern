/* plan.ts — one liquidation case, as a table of steps.
   Each step is a function of chain state and returns what it is, what it is worth, and how to run
   it. The React surface renders this; it never decides anything about the case itself.

   Who does what: a price feed on Lantern only accepts prints from its operator, so the feed's side
   of the case (the real price, the false price, the market's liquidation) is played by the demo
   feed — a small server holding the operator key that derives every value from the chain. The
   visitor plays the borrower and the prover, from their own wallet. */

import { config, CROSS_SOURCE, TOLERANCE_BPS } from "../chain/config";
import { encode } from "../chain/abi";
import type { Snapshot, CaseKey, Health } from "../chain/read";
import { fx, hold, mmss, pct, usd, weth } from "../format";
import type { TxEntry } from "../chain/wallet";

const BPS = 10000n;
const NEED_HOLD = 20000n; // 0.02 HOLD covers the stake with room
const NEED_WETH = 20000000000000n; // 0.00002 WETH of collateral
const WRAP = 50000000000000n; // wrapped when the wallet holds less than that
const GAS_ROOM = 20000000000000n; // ether kept back for gas when wrapping

export type StepKey = "fund" | "honest" | "borrow" | "lie" | "liquidate" | "challenge" | "verdict" | "claim";
export type StepState = "done" | "ready" | "todo" | "wait" | "blocked";

export type StepView = {
  key: StepKey;
  title: string;
  who: string;
  preview: string;
  st: StepState;
  label?: string;
  vals: [string, string][];
  note?: string;
  link?: [string, string];
  run?: () => Promise<void>;
};

export type Runner = {
  s: Snapshot;
  k: CaseKey;
  account: string | null;
  chain: number | null;
  owner: string | null;
  tx(step: StepKey | "position", label: string, to: string, data: string, value?: bigint): Promise<TxEntry>;
  approve(step: StepKey | "position", token: string, spender: string, need: bigint, what: string): Promise<void>;
  server(step: StepKey, kind: string, labels: ((j: any) => string)[]): Promise<any>;
  refresh(): Promise<void>;
  now(): number;
};

export type Prices = { pH: bigint; L: bigint; peerV: bigint; spread: bigint };

/* ---------------------------------------------------------------- plain-language errors */
const PLAIN: Record<string, string> = {
  ClaimTooSoon: "The HOLD faucet allows one claim a minute. Wait a moment and try again.",
  WouldBeUnhealthy: "That borrow would go over your limit.",
  InsufficientLiquidity: "The market does not have enough HOLD to lend right now.",
  InsufficientBalance: "Not enough HOLD in your wallet for this.",
  InsufficientAllowance: "The token approval did not go through. Try again.",
  PositionIsHealthy: "Your loan is still healthy at that price, so it cannot be liquidated.",
  NothingToLiquidate: "There is no loan to liquidate.",
  WindowClosed: "The five-minute challenge window has closed.",
  WindowOpen: "The challenge window is still open.",
  ChallengeAlreadyOpen: "A challenge is already open for this case.",
  StakeBelowMinimum: "The stake is below the minimum.",
  UnderBonded: "The feed\u2019s bond is below what it must hold to price a liquidation.",
  FeedCannotPrice: "The feed\u2019s bond is below what it must hold to price a liquidation.",
  NotSettled: "There is no verdict for this case yet.",
  AlreadyClaimed: "This case is already settled.",
  DriftExceeded: "That price is too far from the last print for one step (the limit is 20%).",
  RoundNotMonotone: "Another case printed in the meantime. Start a new case.",
  SlotConflict: "Another case printed in the meantime. Start a new case.",
  LiquidationAlreadySettled: "This case already has a verdict.",
  InsufficientCollateral: "You do not have that much collateral posted.",
  ReportTooThin: "The feed needs a few more prints before it can price a liquidation.",
};

export function plain(e: unknown): string {
  const err = e as any;
  const m = (err && (err.message || err.reason)) || String(e || "");
  if (err && err.server) return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? "" : ".");
  const code = err && (err.code || (err.info && err.info.error && err.info.error.code));
  if (code === 4001 || code === "ACTION_REJECTED" || /user (rejected|denied)|rejected the request/i.test(m)) {
    return "You cancelled the transaction in your wallet.";
  }
  if (/insufficient funds/i.test(m)) return "Not enough test ETH in your wallet to pay for gas.";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Could not reach the network. Check your connection and try again.";
  if (/timeout/i.test(m)) return "The transaction is taking longer than usual. It may still land, and the page will pick it up.";
  if (/chain ?id|wrong network|does not match the target chain/i.test(m)) return "Your wallet is on a different network. Switch it to Arbitrum Sepolia.";
  for (const k of Object.keys(PLAIN)) {
    if (m.indexOf(k + "(") >= 0 || m.indexOf(k + " ") >= 0 || m.slice(-k.length) === k) return PLAIN[k];
  }
  return m.length > 180 ? m.slice(0, 180) + "\u2026" : m;
}

/* ---------------------------------------------------------------- derived facts */
export const liquidated = (s: Snapshot) => !!s.sz && s.sz.state !== 0;

export function limitAtLie(s: Snapshot, d: { pH: bigint; L: bigint }): bigint | null {
  if (s.r2 && s.r2.exists && s.hL) return s.hL.limit;
  if (!s.hP || d.pH === 0n) return null;
  return (s.hP.limit * d.L) / d.pH;
}
export function exposed(s: Snapshot, d: { pH: bigint; L: bigint }): boolean {
  const lim = limitAtLie(s, d);
  return lim !== null && s.acct.debt > lim;
}
export function stakeFor(s: Snapshot, bonus: bigint): bigint {
  const p = (bonus * 100n) / BPS;
  return p > s.minStake ? p : s.minStake;
}
export const bondTopUpNeeded = (s: Snapshot) => s.bond < s.required + s.required / 5n;

export type Gate =
  | { kind: "nowallet"; why: string; link: [string, string] }
  | { kind: "connect"; why: string; link: [string, string]; label: string }
  | { kind: "chain"; why: string; label: string }
  | { kind: "gas"; why: string; link: [string, string]; label: string }
  | { kind: "owner"; why: string };

export function gate(r: Runner): Gate | null {
  const CFG = config();
  const s = r.s;
  if (typeof window !== "undefined" && !(globalThis as any).ethereum) {
    return { kind: "nowallet", why: "You need a browser wallet such as MetaMask to run a case.", link: ["https://metamask.io/download/", "Get MetaMask"] };
  }
  if (!r.account) {
    return {
      kind: "connect",
      why: "Connect a wallet to start. Step 1 also needs a little test ETH for gas, which is free from a faucet.",
      link: [CFG.faucet, "Get test ETH"],
      label: "Connect wallet",
    };
  }
  if (r.chain !== null && r.chain !== CFG.chainId) {
    return { kind: "chain", why: "Your wallet is on another network. The case runs on Arbitrum Sepolia.", label: "Switch network" };
  }
  if (s.eth === 0n) {
    return { kind: "gas", why: "Your wallet has no test ETH on Arbitrum Sepolia for gas. It is free from a faucet.", link: [CFG.faucet, "Get test ETH"], label: "" };
  }
  if (r.owner && r.account && r.owner.toLowerCase() !== r.account.toLowerCase() && s.r1 && s.r1.exists) {
    return { kind: "owner", why: "This case belongs to " + r.owner.slice(0, 6) + "\u2026" + r.owner.slice(-4) + ". Switch back to that wallet or start a new case." };
  }
  return null;
}

/* ---------------------------------------------------------------- the steps */
export function steps(r: Runner, d: Prices): StepView[] {
  const s = r.s;
  const out: StepView[] = [];

  /* 1. fund */
  {
    const vals: [string, string][] = [["HOLD", fx(s.hold, 6, 4)], ["WETH", fx(s.weth, 18, 6)], ["ETH", fx(s.eth, 18, 6)]];
    const needHold = s.hold < NEED_HOLD;
    const needWeth = s.weth + s.acct.posted < NEED_WETH;
    if (!needHold && !needWeth) out.push({ key: "fund", title: "Fund your wallet", who: "you", preview: PREVIEW.fund, st: "done", vals });
    else if (needWeth && s.eth < WRAP + GAS_ROOM) {
      out.push({ key: "fund", title: "Fund your wallet", who: "you", preview: PREVIEW.fund, st: "blocked", vals,
        note: "Your wallet needs about " + fx(WRAP + GAS_ROOM, 18, 5) + " test ETH.", link: [config().faucet, "Get test ETH"] });
    } else {
      const wait = needHold && s.claimedAt ? s.claimedAt + s.cooldown - r.now() : 0;
      if (needHold && wait > 0) {
        out.push({ key: "fund", title: "Fund your wallet", who: "you", preview: PREVIEW.fund, st: "wait", vals, note: "The HOLD faucet opens again in " + mmss(wait) + "." });
      } else {
        out.push({ key: "fund", title: "Fund your wallet", who: "you", preview: PREVIEW.fund, st: "ready", vals,
          label: [needHold ? "Claim 1 HOLD" : "", needWeth ? "Wrap ETH" : ""].filter(Boolean).join(" + "),
          run: async () => {
            if (needWeth) await r.tx("fund", "Wrap " + fx(WRAP, 18, 5) + " ETH", config().collateral, encode("wrap", [], []), WRAP);
            if (needHold) await r.tx("fund", "Claim 1 HOLD", config().asset, encode("faucetClaim", [], []));
          } });
      }
    }
  }

  /* 2. honest print */
  {
    if (s.r1 && s.r1.exists) {
      out.push({ key: "honest", title: "Feed prints the real price", who: "demo feed", preview: PREVIEW.honest, st: "done",
        vals: [["printed", usd(s.r1.value)], ["Chainlink", usd(s.cl)]] });
    } else if (s.subj.round >= r.k.r1) {
      out.push({ key: "honest", title: "Feed prints the real price", who: "demo feed", preview: PREVIEW.honest, st: "blocked",
        vals: [["Chainlink now", usd(s.cl)]], note: "Another case printed first. Start a new case." });
    } else {
      out.push({ key: "honest", title: "Feed prints the real price", who: "demo feed", preview: PREVIEW.honest, st: "ready",
        vals: [["Chainlink now", usd(s.cl)]], label: "Print the real price",
        run: async () => { await r.server("honest", "honest", [(j) => "Feed prints " + usd(BigInt(j.value))]); } });
    }
  }

  /* 3. borrow */
  {
    const a = s.acct;
    const lim = limitAtLie(s, d);
    const vals: [string, string][] = [["collateral", weth(a.posted)], ["debt", hold(a.debt)]];
    if (s.hP) vals.push(["limit at " + usd(d.pH), hold(s.hP.limit)]);
    const base = { key: "borrow" as StepKey, title: "Take out a loan", who: "you", preview: PREVIEW.borrow, vals };
    if (liquidated(s)) out.push({ ...base, st: "done" });
    else if (!s.r1 || !s.r1.exists) out.push({ ...base, st: "todo" });
    else if (exposed(s, d)) out.push({ ...base, st: "done" });
    else if (s.r2 && s.r2.exists) out.push({ ...base, st: "blocked", note: "The false price landed before the loan. Start a new case." });
    else if (s.subj.round !== r.k.r1) out.push({ ...base, st: "blocked", note: "Another case printed since. Start a new case." });
    else out.push({ ...base, st: "ready", label: "Borrow 95% of the limit", run: async () => {
      if (r.s.acct.posted < NEED_WETH) {
        const put = r.s.weth;
        if (put === 0n) throw new Error("You have no WETH to post. Fund the wallet first.");
        await r.approve("borrow", config().collateral, config().market, put, "WETH");
        await r.tx("borrow", "Post " + weth(put), config().market, encode("depositCollateral", ["uint256"], [put]));
        await r.refresh();
      }
      const h = r.s.hP as Health;
      const target = (h.limit * 95n) / 100n;
      if (h.debt >= target) return;
      const amt = target - h.debt;
      // every case brings its own liquidity: lend part of the HOLD claimed in step 1, keeping the
      // stake for step 6, so the shared market never runs dry however many cases are run
      if (r.s.idle < amt * 2n) {
        let lend = r.s.hold - NEED_HOLD;
        if (lend > amt * 4n) lend = amt * 4n;
        if (lend + r.s.idle < amt) throw new Error(PLAIN.InsufficientLiquidity);
        await r.approve("borrow", config().asset, config().market, lend, "HOLD");
        await r.tx("borrow", "Lend " + hold(lend), config().market, encode("supply", ["uint256"], [lend]));
      }
      await r.tx("borrow", "Borrow " + hold(amt), config().market, encode("borrow", ["uint256"], [amt]));
    } });
  }

  /* 4. the lie */
  {
    const vals: [string, string][] = [["false price", usd(d.L)], ["Chainlink", usd(d.peerV)], ["off by", pct(d.spread)]];
    const lim = limitAtLie(s, d);
    if (lim !== null && !(s.r2 && s.r2.exists)) vals.push(["your limit at it", hold(lim)]);
    const base = { key: "lie" as StepKey, title: "Feed prints a false price", who: "demo feed", preview: PREVIEW.lie, vals };
    if (s.r2 && s.r2.exists && s.p2 && s.p2.exists) out.push({ ...base, st: "done" });
    else if (s.subj.round >= r.k.r2 || s.peerLast.round >= r.k.r2) out.push({ ...base, st: "blocked", note: "Another case printed first. Start a new case." });
    else out.push({ ...base, st: "ready", label: "Print the false price", run: async () => {
      await r.server("lie", "lie", [
        (j) => "Feed prints " + usd(BigInt(j.value)),
        (j) => "Chainlink feed prints " + usd(BigInt(j.peer)),
      ]);
    } });
  }

  /* 5. liquidate */
  {
    const repay = (s.acct.debt * s.closeBps) / BPS;
    const bonus = (repay * s.bonusBps) / BPS;
    const vals: [string, string][] = [["repays", hold(repay)], ["profit", hold(bonus)]];
    const base = { key: "liquidate" as StepKey, title: "Market liquidates you", who: "liquidator", preview: PREVIEW.liquidate, vals };
    if (liquidated(s)) {
      out.push({ ...base, st: "done", vals: [["repaid", hold(s.sz!.repay)], ["collateral taken", weth(s.sz!.collateral)], ["profit held", hold(s.esc?.bonus ?? 0n)]] });
    } else if (!(s.r2 && s.r2.exists)) out.push({ ...base, st: "todo" });
    else if (!exposed(s, d)) out.push({ ...base, st: "blocked", note: "Your loan is still healthy at " + usd(d.L) + ". Start a new case with a bigger lie." });
    else out.push({ ...base, st: "ready", label: "Liquidate my loan", run: async () => {
      await r.server("liquidate", "liquidate", [() => "Market liquidates case #" + r.k.id]);
    } });
  }

  /* 6. challenge */
  {
    const base = { key: "challenge" as StepKey, title: "Prove the price contradicted the record", who: "you", preview: PREVIEW.challenge };
    if (s.ch && s.ch.open) {
      out.push({ ...base, st: "done", vals: [["rule", "two sources disagree"], ["stake", hold(s.ch.stake)]] });
    } else if (s.esc && s.esc.outcome !== 0) {
      out.push({ ...base, st: "done", vals: [["result", "window ran out, profit released"]] });
    } else if (!liquidated(s)) {
      out.push({ ...base, st: "todo", vals: [["rule", "two sources disagree"], ["stake", "from " + hold(s.minStake)]] });
    } else {
      const left = (s.esc?.deadline ?? 0) - r.now();
      const stake = stakeFor(s, s.esc?.bonus ?? 0n);
      const vals: [string, string][] = [["window", left > 0 ? mmss(left) + " left" : "closed"], ["stake", hold(stake)], ["off by", pct(d.spread)]];
      if (left <= 0) {
        out.push({ ...base, st: "ready", vals, label: "Release to liquidator",
          note: "Nobody challenged in time, so the liquidator keeps the profit.",
          run: async () => { await r.tx("challenge", "Release case #" + r.k.id, config().lantern, encode("release", ["uint256"], [r.k.id])); } });
      } else {
        out.push({ ...base, st: "ready", vals, label: "Prove the price contradicted the record", run: async () => {
          await r.approve("challenge", config().asset, config().lantern, stake, "stake");
          await r.tx("challenge", "Challenge case #" + r.k.id, config().lantern,
            encode("openChallenge", ["uint256", "uint8", "bytes", "uint256"], [r.k.id, CROSS_SOURCE, config().peer, stake]));
        } });
      }
    }
  }

  /* 7. verdict */
  {
    const base = { key: "verdict" as StepKey, title: "Verdict", who: "you", preview: PREVIEW.verdict };
    if (s.ch && s.ch.resolved) {
      out.push({ ...base, st: "done", vals: [["verdict", s.ch.upheld ? "upheld" : "refused"], ["profit goes to", s.esc?.outcome === 2 ? "you" : "liquidator"]] });
    } else if (s.esc && s.esc.outcome !== 0) {
      out.push({ ...base, st: "done", vals: [["profit goes to", "liquidator"]] });
    } else if (!s.ch || !s.ch.open) {
      out.push({ ...base, st: "todo", vals: [["decided by", "the contract"]] });
    } else {
      out.push({ ...base, st: "ready", label: "Get the verdict",
        vals: [["off by", pct(d.spread)], ["limit", pct(TOLERANCE_BPS)], ["expected", d.spread > TOLERANCE_BPS ? "upheld" : "refused"]],
        run: async () => { await r.tx("verdict", "Verdict on case #" + r.k.id, config().lantern, encode("adjudicate", ["uint256"], [r.k.id])); } });
    }
  }

  /* 8. settle */
  {
    const base = { key: "claim" as StepKey, title: "Settle", who: "you", preview: PREVIEW.claim };
    if (!liquidated(s) || (s.esc && s.esc.outcome === 0)) {
      out.push({ ...base, st: "todo", vals: [["collateral", liquidated(s) ? weth(s.sz!.collateral) : "\u2014"]] });
    } else {
      const to = s.esc!.outcome === 2 ? "you" : "liquidator";
      const vals: [string, string][] = [["collateral", weth(s.sz!.collateral)], ["goes to", to]];
      if (s.sz!.state === 2) out.push({ ...base, st: "done", vals: [["collateral went to", to], ["amount", weth(s.sz!.collateral)]] });
      else out.push({ ...base, st: "ready", vals, label: to === "you" ? "Take my collateral back" : "Settle",
        run: async () => { await r.tx("claim", "Settle case #" + r.k.id, config().market, encode("claim", ["uint256"], [r.k.id])); } });
    }
  }

  // a step is only actionable once every step before it is done
  let blockedBefore = false;
  return out.map((v) => {
    let next = v;
    if (blockedBefore && v.st !== "done") next = { ...v, st: "todo", label: undefined, run: undefined };
    if (next.st !== "done") blockedBefore = true;
    return next;
  });
}

export const PREVIEW: Record<StepKey, string> = {
  fund: "Claim test HOLD, wrap a little ETH.",
  honest: "The feed prints Chainlink\u2019s real price.",
  borrow: "Post WETH, borrow close to your limit.",
  lie: "The feed prints a false, lower price.",
  liquidate: "The market closes your loan on it. The profit is held.",
  challenge: "Point at the two prints. Stake on it.",
  verdict: "The contract recomputes the gap and decides.",
  claim: "Collateral back, held profit to you.",
};

export const STEP_TITLE: Record<StepKey, string> = {
  fund: "Fund your wallet", honest: "Feed prints the real price", borrow: "Take out a loan",
  lie: "Feed prints a false price", liquidate: "Market liquidates you", challenge: "Prove the price contradicted the record",
  verdict: "Verdict", claim: "Settle",
};
