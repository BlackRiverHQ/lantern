#!/usr/bin/env node
// watch.mjs: run the watcher.
//
//   node bin/watch.mjs                   watch forever, challenge what the contract will uphold
//   node bin/watch.mjs --once            one pass over every case, then exit
//   node bin/watch.mjs --dry-run --all   decide every case ever recorded, send nothing
//   node bin/watch.mjs --agree           re-derive every verdict already on chain and compare
//
// Flags: --release (also release bonuses whose window closed unchallenged), --history (allow
// SELF_HISTORY claims), --interval <s>. Env: RPC_URL (default the public Arbitrum Sepolia endpoint),
// WATCHER_PRIVATE_KEY or WATCHER_ACCOUNT_FILE (the key is never printed), LEDGER (default runs/ledger.jsonl).

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clients, loadAccount, wiring, liquidationIds, verdictEvents, caseState, DEPLOYMENT } from "../src/chain.mjs";
import { pass } from "../src/watcher.mjs";
import { evaluate, RULES } from "../src/rules.mjs";

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };

const here = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(process.env.LEDGER || resolve(here, "..", "runs", "ledger.jsonl"));
const RPC = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const dryRun = flag("--dry-run");

const stamp = () => new Date().toISOString();
function log(x) {
  const line = { at: stamp(), ...x };
  console.log(JSON.stringify(line, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  if (!dryRun && x.tx) {
    mkdirSync(dirname(LEDGER), { recursive: true });
    appendFileSync(LEDGER, JSON.stringify(line) + "\n");
  }
}

const fmt = (d) => {
  const base = `#${d.id} ${d.d ? d.d.act : "error"}`;
  if (!d.d) return `${base}: ${d.error}`;
  const extra = d.d.act === "challenge" ? ` stake=${d.d.stake} bounty=${d.d.bounty} left=${d.d.left}s` : "";
  return `${base}: ${d.d.why}${extra}${d.d.dry ? " [dry run]" : ""}`;
};

async function agree(ctx, w) {
  // Every verdict already on chain, recomputed from the same state with the mirror. A watcher that
  // stakes on its own prediction has to show it predicts the contract.
  const verdicts = await verdictEvents(ctx.pub);
  let same = 0, diff = 0;
  for (const [id, v] of verdicts) {
    const st = await caseState(ctx.pub, w, id);
    const mine = evaluate(st.c.rule, st.inputs);
    const ok = mine.upheld === v.upheld;
    ok ? same++ : diff++;
    console.log(`#${id} ${RULES[st.c.rule]}: chain ${v.upheld ? "upheld" : "refused"} (${v.tx}), mirror ${mine.upheld ? "upheld" : "refused"} ${ok ? "agree" : "DISAGREE"}`);
  }
  console.log(`agreement: ${same}/${same + diff}`);
  return diff === 0;
}

async function main() {
  const account = loadAccount();
  const ctx = clients(RPC, account);
  const w = await wiring(ctx.pub);
  console.log(`lantern ${DEPLOYMENT.lantern} window ${w.holdWindow}s, min stake ${w.minStake}, bounty ${w.bountyBps} bps`);
  console.log(account ? `signing as ${account.address}` : "no key: reading only");
  if (flag("--agree")) process.exit((await agree(ctx, w)) ? 0 : 1);

  const opts = { dryRun, log, release: flag("--release"), allowHistory: flag("--history") };
  const all = flag("--all");
  let from = DEPLOYMENT.fromBlock;
  const seen = new Set();
  const interval = Number(val("--interval", "12")) * 1000;

  for (;;) {
    const head = await ctx.pub.getBlockNumber();
    const found = await liquidationIds(ctx.pub, from);
    for (const f of found) seen.add(f.id);
    // a case stays on the list until it is settled; a settled one is skipped by `decide` for free
    const { now, out } = await pass(ctx, w, [...seen], opts);
    for (const d of out) if (all || !(d.d && d.d.act === "skip")) console.log(fmt(d));
    for (const d of out) if (d.d && d.d.act === "skip" && /already|closed/.test(d.d.why) && !all) seen.delete(d.id);
    if (flag("--once")) break;
    from = head > 50n ? head - 50n : 0n; // a little overlap so a reorg cannot hide a liquidation
    console.log(`${stamp()} block ${head}, watching ${seen.size} open case(s); next pass in ${interval / 1000}s (chain time ${now})`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((e) => { console.error(String((e && (e.shortMessage || e.message)) || e)); process.exit(1); });
