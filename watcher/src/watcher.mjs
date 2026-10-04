// watcher.mjs: one pass over every liquidation Lantern holds a bonus for.
//
// For each case it reads the inputs Lantern.adjudicate will read and runs the same rules on them
// (rules.mjs). If a rule holds while the window is open, it stakes the minimum, opens the challenge
// and asks for the verdict in the same pass. Only predicted-upheld cases are challenged, so a wrong
// guess would cost the stake and nothing else. Every action is simulated before it is sent, and every
// sent transaction is written to the ledger with its hash.

import { DEPLOYMENT, LANTERN_ABI, ERC20_ABI, caseState, send, simulate } from "./chain.mjs";
import { evaluateAll, choose, stakeFloor, bounty, RULES } from "./rules.mjs";
import { encodeAbiParameters } from "viem";

const GRACE = 6n * 3600n; // Constants.CHALLENGE_GRACE

/** What to do with one case, decided from chain state alone. Pure, so it is tested without a chain. */
export function decide(st, now, w, opts = {}) {
  const { e, c } = st;
  if (!e.exists) return { act: "skip", why: "no escrow" };
  if (e.outcome !== 0) return { act: "skip", why: e.outcome === 2 ? "already upheld" : "already released" };

  const ZERO = "0x0000000000000000000000000000000000000000";
  const challenged = c.prover.toLowerCase() !== ZERO;
  if (challenged && !c.resolved) {
    // adjudicate has no deadline, so an abandoned challenge is decided on its merits rather than
    // voided: a void hands the stake to the liquidator without asking whether the claim was right
    const r = evaluateAll(st.inputs)[c.rule];
    const late = now > BigInt(e.deadline) + GRACE ? " (abandoned past the grace period)" : "";
    return { act: "adjudicate", why: `open ${RULES[c.rule]} challenge awaiting a verdict${late}; expected ${r.upheld ? "upheld" : "refused"}`, expect: r.upheld, rule: c.rule };
  }
  if (challenged && c.resolved) {
    // a refused challenge leaves the escrow to be released once the window is over
    if (now > BigInt(e.deadline) && opts.release) return { act: "release", why: "challenge refused, window over" };
    return { act: "skip", why: "challenge already decided" };
  }
  if (now > BigInt(e.deadline)) {
    return opts.release ? { act: "release", why: "window closed with no challenge" } : { act: "skip", why: "window closed" };
  }

  const results = evaluateAll(st.inputs);
  const pick = choose(results, { allowHistory: !!opts.allowHistory });
  if (!pick) return { act: "skip", why: "no rule holds; the liquidation stands", results };
  const stake = stakeFloor(e.bonus, w.minStake);
  const pay = bounty(e.bonus, w.bountyBps, st.bond);
  return {
    act: "challenge", rule: pick.rule, results, stake, bounty: pay,
    why: `${RULES[pick.rule]} holds (observed ${pick.observed}, bound ${pick.bound})`,
    left: BigInt(e.deadline) - now,
  };
}

/** Evidence is not read by adjudicate (it recomputes from state), but it must not be empty. It names
 *  what the claim rests on: the peer feed for CROSS_SOURCE, otherwise the feed and round. */
function evidenceFor(st, rule) {
  if (rule === 4) return encodeAbiParameters([{ type: "bytes32" }], [st.peer]);
  return encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [st.e.feedId, st.e.round]);
}

/** Make sure the watcher holds the stake and has approved it: the faucet is the only issuance. */
async function fund(ctx, stake, log) {
  const me = ctx.account.address;
  let bal = await ctx.pub.readContract({ address: DEPLOYMENT.asset, abi: ERC20_ABI, functionName: "balanceOf", args: [me] });
  if (bal < stake) {
    const t = await send(ctx, DEPLOYMENT.asset, ERC20_ABI, "claim", []);
    log({ step: "faucet-claim", tx: t.hash });
    bal = await ctx.pub.readContract({ address: DEPLOYMENT.asset, abi: ERC20_ABI, functionName: "balanceOf", args: [me] });
    if (bal < stake) throw new Error(`stake ${stake} exceeds balance ${bal} even after a claim`);
  }
  const allowed = await ctx.pub.readContract({ address: DEPLOYMENT.asset, abi: ERC20_ABI, functionName: "allowance", args: [me, DEPLOYMENT.lantern] });
  if (allowed < stake) {
    const t = await send(ctx, DEPLOYMENT.asset, ERC20_ABI, "approve", [DEPLOYMENT.lantern, stake]);
    log({ step: "approve", tx: t.hash, amount: stake.toString() });
  }
}

/** Carry out a decision. With `dryRun`, or without a key, nothing is sent. */
export async function act(ctx, st, d, { dryRun, log }) {
  const id = st.id;
  if (d.act === "skip") return d;
  if (dryRun || !ctx.wallet) return { ...d, dry: true };

  if (d.act === "challenge") {
    await fund(ctx, d.stake, (x) => log({ case: id.toString(), ...x }));
    const ev = evidenceFor(st, d.rule);
    // the contract has the last word on whether the challenge may open: simulate it first
    await simulate(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "openChallenge", [id, d.rule, ev, d.stake]);
    const o = await send(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "openChallenge", [id, d.rule, ev, d.stake]);
    log({ case: id.toString(), step: "openChallenge", rule: RULES[d.rule], stake: d.stake.toString(), tx: o.hash });
    const upheld = await simulate(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "adjudicate", [id]);
    if (upheld !== true) log({ case: id.toString(), step: "mismatch", note: "the mirror said upheld, the contract simulation says refused" });
    const a = await send(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "adjudicate", [id]);
    log({ case: id.toString(), step: "adjudicate", upheld, tx: a.hash, bounty: d.bounty.toString() });
    return { ...d, opened: o.hash, verdict: a.hash, upheld };
  }
  if (d.act === "adjudicate") {
    const upheld = await simulate(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "adjudicate", [id]);
    const a = await send(ctx, DEPLOYMENT.lantern, LANTERN_ABI, "adjudicate", [id]);
    log({ case: id.toString(), step: "adjudicate", upheld, expected: d.expect, tx: a.hash });
    return { ...d, verdict: a.hash, upheld };
  }
  if (d.act === "release" || d.act === "void") {
    const fn = d.act === "release" ? "release" : "voidStaleChallenge";
    await simulate(ctx, DEPLOYMENT.lantern, LANTERN_ABI, fn, [id]);
    const t = await send(ctx, DEPLOYMENT.lantern, LANTERN_ABI, fn, [id]);
    log({ case: id.toString(), step: fn, tx: t.hash });
    return { ...d, tx: t.hash };
  }
  return d;
}

/** One pass over the given case ids. Errors on one case never stop the others. */
export async function pass(ctx, w, ids, opts) {
  const block = await ctx.pub.getBlock({ blockTag: "latest" });
  const now = block.timestamp;
  const out = [];
  for (const id of ids) {
    try {
      const st = await caseState(ctx.pub, w, id);
      const d = decide(st, now, w, opts);
      out.push({ id, st, d: await act(ctx, st, d, opts) });
    } catch (err) {
      const msg = String((err && (err.shortMessage || err.message)) || err).split("\n")[0];
      opts.log({ case: id.toString(), step: "error", error: msg });
      out.push({ id, error: msg });
    }
  }
  return { now, out };
}
