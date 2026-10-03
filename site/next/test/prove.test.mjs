// The prover console offers a stake ONLY where the contract's own arithmetic says the claim holds:
// a refused challenge costs the challenger their whole stake, so an over-eager button on this page is
// the most expensive defect the dashboard can ship. Every constant below is re-derived from the
// Solidity source and every branch of Verdicts.evaluate's CROSS_SOURCE path is pinned here, including
// the asymmetry that the tolerance is measured against the PEER's value and not the subject's.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { crossSource, stakeFloor, payout, canChallenge, MIN_STAKE_BPS } =
  require(join(here, "..", ".test-build", "case", "prove.js"));
const { TOLERANCE_BPS } = require(join(here, "..", ".test-build", "chain", "config.js"));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

/* ---------------------------------------------------------------- the source is the ruler */
const root = join(here, "..", "..", "..");
const constants = readFileSync(join(root, "src", "libraries", "Constants.sol"), "utf8");
const sol = (name) => BigInt(new RegExp(name + "\\s*=\\s*([0-9]+)").exec(constants)[1]);

ok(sol("CROSS_SOURCE_TOLERANCE_BPS") === TOLERANCE_BPS,
  "CROSS_SOURCE_TOLERANCE_BPS: sol " + sol("CROSS_SOURCE_TOLERANCE_BPS") + " vs dashboard " + TOLERANCE_BPS);
ok(sol("MIN_STAKE_BPS") === MIN_STAKE_BPS,
  "MIN_STAKE_BPS: sol " + sol("MIN_STAKE_BPS") + " vs dashboard " + MIN_STAKE_BPS);

const verdicts = readFileSync(join(root, "src", "libraries", "Verdicts.sol"), "utf8");
ok(/spread\s*>\s*Constants\.CROSS_SOURCE_TOLERANCE_BPS/.test(verdicts),
  "Verdicts.evaluate must uphold on spread > tolerance, not >=");
ok(/if\s*\(!in_\.peerExists\s*\|\|\s*in_\.peerValue\s*==\s*0\)\s*return\s*\(false/.test(verdicts),
  "a missing or zero peer must refuse before any arithmetic");

/* ---------------------------------------------------------------- the comparison itself */
const T = TOLERANCE_BPS;

// exactly at the tolerance is REFUSED: the contract is strictly greater-than
{
  const peer = 2000000000n; // $2,000.00
  const subject = (peer * (10000n + T)) / 10000n; // exactly T bps away
  const v = crossSource(subject, peer, true);
  ok(v.spread === T, "exactly at the tolerance reports spread " + T + ", got " + v.spread);
  ok(v.upheld === false, "exactly at the tolerance must be refused");
}
// one basis point past it is upheld
{
  const peer = 2000000000n;
  const subject = (peer * (10000n + T + 1n)) / 10000n;
  const v = crossSource(subject, peer, true);
  ok(v.upheld === true, "one bps past the tolerance must be upheld, spread was " + v.spread);
}
// agreement refuses
ok(crossSource(2000000000n, 2000000000n, true).upheld === false, "identical prints must refuse");
ok(crossSource(2000000000n, 2000000000n, true).spread === 0n, "identical prints are 0 apart");

// the denominator is the PEER, so the same absolute gap can land on either side of the tolerance
{
  const peer = 1000000000n;
  const subject = 1100000000n; // +10% of the peer
  const up = crossSource(subject, peer, true);
  const down = crossSource(peer, subject, true); // symmetric gap, but now measured against 1.1e9
  ok(up.spread === 1000n, "10% of the peer is 1000 bps, got " + up.spread);
  ok(down.spread === 909n, "the mirror gap measured against the larger value is 909 bps, got " + down.spread);
  ok(up.upheld && down.upheld, "both directions of a 10% gap are provable");
}
// a gap that is provable one way and not the other: 5.20% of the peer, 4.94% of the subject
{
  const lo = 1000000000n;
  const hi = 1052000000n;
  ok(crossSource(hi, lo, true).upheld === true, "5.2% of the peer is past the limit");
  ok(crossSource(lo, hi, true).upheld === false, "the same gap is only 4.94% of the subject, and refuses");
}

// no peer, or a zero peer, refuses and reports nothing observed
{
  const v = crossSource(2675680000n, 0n, true);
  ok(!v.upheld && v.spread === 0n && v.bound === 0n, "a zero peer refuses with no numbers");
  ok(!crossSource(2675680000n, 2225300000n, false).upheld, "a peer that does not exist refuses");
}

/* ---------------------------------------------------------------- stakeFloor */
// WaterfallMath.stakeFloor: max(1% of the held profit, the absolute floor)
ok(stakeFloor(0n, 1000n) === 1000n, "no profit means the absolute floor");
ok(stakeFloor(100000n, 1000n) === 1000n, "1% of 0.1 HOLD is 0.001, the floor itself");
ok(stakeFloor(1000000n, 1000n) === 10000n, "1% of 1.0 HOLD is 0.01, above the floor");
ok(stakeFloor(199265n, 1000n) === 1992n, "1% of the live bonus 0.199265 is 0.00199265");

/* ---------------------------------------------------------------- payout */
// an upheld challenge pays the stake back plus the bounty, and BondMath.chargeable caps it at the bond
{
  const p = payout(1992n, 199265n, 2000n, 1000000n); // 20% bounty of the held bonus
  ok(p.bounty === 39853n, "20% of 0.199265 HOLD is 0.039853, got " + p.bounty);
  ok(p.total === 41845n, "stake + bounty, got " + p.total);
}
{
  const p = payout(1992n, 199265n, 2000n, 1000n); // bond thinner than the bounty
  ok(p.bounty === 1000n, "the bond caps the bounty at what it holds, got " + p.bounty);
  ok(p.total === 2992n, "the prover still gets the stake back, got " + p.total);
}

/* ---------------------------------------------------------------- openChallenge's guards, in order */
const base = { exists: true, outcome: 0, deadline: 1800000000, challengeOpen: false };
ok(canChallenge(base, 1799999000).open === true, "an existing, undecided, unchallenged, open window");
ok(canChallenge({ ...base, exists: false }, 1799999000).why.indexOf("no escrow") > 0,
  "a missing escrow is named first");
ok(canChallenge({ ...base, outcome: 2 }, 1799999000).why.indexOf("verdict") > 0,
  "a decided escrow is refused before the window is even considered");
ok(canChallenge({ ...base, challengeOpen: true }, 1799999000).why.indexOf("already staked") > 0,
  "an existing challenge is refused");
// the window is the last guard, and the boundary is inclusive on the closed side
ok(canChallenge(base, 1800000000).open === false, "the deadline itself is closed");
ok(canChallenge(base, 1799999999).open === true, "one second before the deadline is open");
ok(canChallenge(base, 1799999999).left === 1, "the countdown is the deadline minus now");

/* ---------------------------------------------------------------- calldata width */

// A feed id is 32 bytes; hexAddr is the address helper. It pads to 20 bytes and does NOT truncate, so
// a bytes32 routed through it comes back with its leading nibble dropped — 63 usable hex characters,
// which is what made the RPC reject the prove page's peer read as odd-length. The id below is the one
// that did it.
const { b32, id32, w32, hexAddr } = require(join(here, "..", ".test-build", "chain", "rpc.js"));
const ZERO32 = "0x" + "0".repeat(64);

ok(b32(0n) === ZERO32, "a zero word is the zero feed id, so peerOf's empty case compares equal");
ok(b32(1n).length === 66 && id32(b32(1n)).length === 64, "a small id is padded to a full word");
ok(w32(0).length === 64 && w32(5).length === 64 && w32(7).length === 64, "a round always fills a word");

const peer = BigInt("0xbf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2");
ok(id32(b32(peer)).length === 64, "a real peer id survives id32 at full width");
ok(id32(hexAddr(peer)).length !== 64, "hexAddr on a bytes32 is short — the trap this test exists for");

for (const d of [
  "0x9730d3e5" + id32(b32(peer)),
  "0x50da588b" + id32(b32(peer)) + w32(7),
  "0x50da588b" + id32(ZERO32) + w32(0),
]) {
  ok(d.slice(2).length % 2 === 0, "even calldata: " + d.slice(2).length + " chars");
}

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
