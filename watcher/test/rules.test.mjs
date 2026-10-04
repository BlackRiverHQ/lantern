// rules.test.mjs: the mirror against the Solidity it copies, and the decisions against fixed states.
// No chain needed. Run: node test/rules.test.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../src/rules.mjs";
import { decide } from "../src/watcher.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sol = (p) => readFileSync(resolve(root, p), "utf8");
let ok = 0, bad = 0;
const t = (name, cond) => { if (cond) ok++; else { bad++; console.log("FAIL", name); } };

/* ---- constants are read from the Solidity, never trusted from the copy ---- */
const C = sol("src/libraries/Constants.sol");
const num = (re) => { const m = C.match(re); if (!m) throw new Error("not found " + re); return BigInt(m[1].replace(/_/g, "")); };
t("BPS", num(/BPS = ([\d_]+);/) === R.BPS);
t("STALENESS_BOUND", num(/STALENESS_BOUND = ([\d_]+) minutes/) * 60n === R.STALENESS_BOUND);
t("CROSS_SOURCE_TOLERANCE_BPS", num(/CROSS_SOURCE_TOLERANCE_BPS = ([\d_]+)/) === R.CROSS_SOURCE_TOLERANCE_BPS);
t("MIN_STAKE_BPS", num(/MIN_STAKE_BPS = ([\d_]+)/) === R.MIN_STAKE_BPS);
t("CHALLENGE_GRACE is 6 hours", /CHALLENGE_GRACE = 6 hours/.test(C));

const P = sol("src/libraries/Provenance.sol");
const order = [...P.slice(P.indexOf("enum Rule")).matchAll(/^\s*([A-Z_]+),?\s*\/\//gm)].map((m) => m[1]).slice(0, 5);
t("rule order matches Provenance.Rule", JSON.stringify(order) === JSON.stringify(R.RULES));

/* ---- the arithmetic ---- */
t("absDiffBps divides by the peer", R.absDiffBps(214658n, 268270n) === 1998n); // the film's 19.98%
t("absDiffBps zero divisor is max", R.absDiffBps(1n, 0n) === (1n << 256n) - 1n);
t("stake floor proportional", R.stakeFloor(1_000_000n, 1000n) === 10_000n);
t("stake floor absolute", R.stakeFloor(1500n, 1000n) === 1000n);
t("bounty capped by bond", R.bounty(1_000_000n, 2000n, 50_000n) === 50_000n);
t("bounty 20%", R.bounty(1500n, 2000n, 10n ** 9n) === 300n);

/* ---- each rule, both sides of its boundary ---- */
const F = "0x" + "aa".repeat(32), G = "0x" + "bb".repeat(32), Z = "0x" + "0".repeat(64);
const rep = (o = {}) => ({ value: 2_146_580_000n, prevBandLo: 0n, prevBandHi: 0n, timestamp: 1000n, payloadHash: Z, ...o });
const inp = (o = {}) => ({ report: rep(o.report), slotConflicted: false, otherValueForRound: 0n, payloadFeed: Z, thisFeed: F,
  liquidationTime: 1000n, peerValue: 0n, peerExists: false, ...o, report: rep(o.report) });

t("cross: 5.00% is inside", !R.evaluate(4, inp({ report: { value: 95n }, peerValue: 100n, peerExists: true })).upheld);
t("cross: 5.01% is outside", R.evaluate(4, inp({ report: { value: 94_990n }, peerValue: 100_000n, peerExists: true })).upheld);
t("cross: no peer print refuses", !R.evaluate(4, inp({ peerValue: 0n, peerExists: false })).upheld);
t("cross: zero peer refuses", !R.evaluate(4, inp({ peerValue: 0n, peerExists: true })).upheld);
t("slot: conflicted upholds", R.evaluate(0, inp({ slotConflicted: true, otherValueForRound: 7n })).upheld);
t("slot: clean refuses", !R.evaluate(0, inp()).upheld);
t("ordering: 300s is not stale", !R.evaluate(1, inp({ liquidationTime: 1300n })).upheld);
t("ordering: 301s is stale", R.evaluate(1, inp({ liquidationTime: 1301n })).upheld);
t("ordering: future print is age 0", !R.evaluate(1, inp({ liquidationTime: 900n })).upheld);
t("history: below band", R.evaluate(2, inp({ report: { value: 9n, prevBandLo: 10n, prevBandHi: 20n } })).upheld);
t("history: above band", R.evaluate(2, inp({ report: { value: 21n, prevBandLo: 10n, prevBandHi: 20n } })).upheld);
t("history: inside band", !R.evaluate(2, inp({ report: { value: 15n, prevBandLo: 10n, prevBandHi: 20n } })).upheld);
t("history: empty band refuses", !R.evaluate(2, inp({ report: { value: 1n } })).upheld);
t("payload: another feed upholds", R.evaluate(3, inp({ payloadFeed: G })).upheld);
t("payload: own feed refuses", !R.evaluate(3, inp({ payloadFeed: F })).upheld);
t("payload: unseen refuses", !R.evaluate(3, inp()).upheld);

/* ---- which rule is staked on ---- */
const all = (o) => R.evaluateAll(inp(o));
t("prefers CROSS_SOURCE", R.choose(all({ slotConflicted: true, peerValue: 300n, peerExists: true, report: { value: 100n } })).rule === 4);
t("history alone is not staked by default", R.choose(all({ report: { value: 9n, prevBandLo: 10n, prevBandHi: 20n } })) === null);
t("history staked when allowed", R.choose(all({ report: { value: 9n, prevBandLo: 10n, prevBandHi: 20n } }), { allowHistory: true }).rule === 2);
t("nothing holds, nothing chosen", R.choose(all()) === null);

/* ---- decisions ---- */
const W = { minStake: 1000n, bountyBps: 2000n };
const NOONE = "0x0000000000000000000000000000000000000000";
const esc = (o = {}) => ({ exists: true, outcome: 0, deadline: 2000n, bonus: 1500n, feedId: F, round: 5n, ...o });
const ch = (o = {}) => ({ prover: NOONE, resolved: false, upheld: false, rule: 0, ...o });
const lie = inp({ report: { value: 2_146_580n }, peerValue: 2_682_700n, peerExists: true });
const fair = inp({ report: { value: 2_682_000n }, peerValue: 2_682_700n, peerExists: true });
const st = (e, c, inputs) => ({ id: 1n, e, c, inputs, bond: 10n ** 9n, peer: G });

const d1 = decide(st(esc(), ch(), lie), 1500n, W);
t("open window + contradiction -> challenge", d1.act === "challenge" && d1.rule === 4);
t("stake is the floor", d1.stake === 1000n);
t("bounty is 20% of the bonus", d1.bounty === 300n);
t("honest price -> no challenge", decide(st(esc(), ch(), fair), 1500n, W).act === "skip");
t("closed window -> no challenge", decide(st(esc(), ch(), lie), 2001n, W).act === "skip");
t("at the deadline it is still open", decide(st(esc(), ch(), lie), 2000n, W).act === "challenge");
t("closed window + --release -> release", decide(st(esc(), ch(), fair), 2001n, W, { release: true }).act === "release");
t("settled -> skip", decide(st(esc({ outcome: 2 }), ch(), lie), 1500n, W).act === "skip");
t("someone else's challenge -> adjudicate", decide(st(esc(), ch({ prover: G.slice(0, 42), rule: 4 }), lie), 1500n, W).act === "adjudicate");
const late = decide(st(esc(), ch({ prover: G.slice(0, 42), rule: 4 }), lie), 2000n + 6n * 3600n + 1n, W);
t("abandoned challenge is adjudicated, not voided", late.act === "adjudicate" && late.expect === true);
t("decided challenge -> skip", decide(st(esc(), ch({ prover: G.slice(0, 42), resolved: true }), lie), 1500n, W).act === "skip");
t("no escrow -> skip", decide(st(esc({ exists: false }), ch(), lie), 1500n, W).act === "skip");

console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
