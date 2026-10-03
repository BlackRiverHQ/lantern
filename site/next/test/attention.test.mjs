// The overview promises a button for every thing it can move and only for those. Two of the rows on
// it are permissionless calls - releasing a held bonus whose window closed with no unresolved
// challenge, and settling a decided seizure - and one is explicitly not ours to send. A row that
// offers a button the contract would reject is worse than no row, so the three cases are pinned
// here rather than reasoned about on the page.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { attention } = require(join(here, "..", ".test-build", "attention.js"));

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

const NOW = 1_800_000_000;

/** A snapshot of a healthy feed, so only the case under test can produce a row. */
const snap = (over = {}) => ({
  block: 1, now: NOW, cl: 2_500_000_000n,
  subj: { value: 2_500_000_000n, prevValue: 2_500_000_000n, round: 10, ts: NOW, samples: 6, exists: true },
  peerLast: { value: 0n, prevValue: 0n, round: 10, ts: NOW, samples: 0, exists: false },
  bond: 190_000n, required: 140_000n, priceable: true, errors: 2n,
  minStake: 1_000n, bounty: 100n, closeBps: 5000n, bonusBps: 500n,
  idle: 398_476n, cooldown: 60,
  eth: 0n, hold: 0n, weth: 0n,
  acct: { posted: 0n, debt: 0n, supplied: 0n }, claimedAt: 0,
  hP: null, hL: null, hNow: null, r1: null, r2: null, p2: null, esc: null, ch: null, sz: null,
  ...over,
});

const cas = (over = {}) => ({
  id: 1, block: 100, ts: NOW - 60, bonus: 2_100n, borrower: null, liquidator: null,
  rule: 4, gap: null, result: "open", settled: false, challengeOpen: false,
  deadline: null, outcome: null, ev: [],
  ...over,
});

ok(attention(snap(), [], NOW, null).length === 0, "a healthy feed with no cases produces no rows");

// a window that closed with nothing contesting it: anyone may release, so the row carries the call
{
  const rows = attention(snap(), [cas({ id: 7, outcome: 0, deadline: NOW - 1 })], NOW, null);
  ok(rows.length === 1, "a closed window produces exactly one row, got " + rows.length);
  ok(rows[0] && rows[0].action && rows[0].action.kind === "release" && rows[0].action.id === 7,
    "the closed window offers release(7), got " + JSON.stringify(rows[0] && rows[0].action));
}

// a window still running: the move is a challenge, and it is constructible from the page (the
// evidence blob is opaque and the peer is read on-chain), but a challenge that the contract then
// refuses costs the challenger their whole stake. So the row states the clock rather than putting
// the reader's money behind a verdict this page has not recomputed.
{
  const rows = attention(snap(), [cas({ id: 8, outcome: 0, deadline: NOW + 90 })], NOW, null);
  ok(rows.length === 1 && !rows[0].action, "a running window states its clock and offers no button");
  ok(rows[0].when === "1:30 left", "the running window shows what is left, got " + rows[0].when);
}

// an open challenge has not been ruled on, so release would revert on its own guard
{
  const rows = attention(snap(), [cas({ id: 9, outcome: 0, deadline: NOW - 1, challengeOpen: true })], NOW, null);
  ok(rows.length === 1 && !rows[0].action, "a closed window with an unresolved challenge offers no release");
  ok(rows[0].what === "Challenge awaiting a ruling", "it names the real state, got " + rows[0].what);
}

// a decided seizure nobody has claimed: the collateral has not moved yet
{
  const rows = attention(snap(), [cas({ id: 10, outcome: 2, deadline: NOW - 500, result: "upheld", settled: false })], NOW, null);
  ok(rows.length === 1 && rows[0].action && rows[0].action.kind === "claim" && rows[0].action.id === 10,
    "a decided unclaimed seizure offers claim(10), got " + JSON.stringify(rows[0] && rows[0].action));
}

// an escrow the reader could not load has no outcome: never offer a settle against an unknown state
{
  const rows = attention(snap(), [cas({ id: 11, outcome: null, deadline: null })], NOW, null);
  ok(rows.length === 0, "a case whose escrow did not load produces no row, got " + rows.length);
}

// a seizure already settled is done, not actionable
{
  const rows = attention(snap(), [cas({ id: 12, outcome: 2, deadline: NOW - 500, settled: true })], NOW, null);
  ok(rows.length === 0, "a settled case produces no row, got " + rows.length);
}

// the feed's own faults are stated, and they are not the reader's to fix
{
  const rows = attention(snap({ bond: 10n }), [], NOW, null);
  ok(rows.length === 1 && !rows[0].action, "an underbonded feed is a row with no button");
  ok(rows[0].what === "Feed under its required bond", "it names the bond, got " + rows[0].what);
}
{
  const rows = attention(snap({ priceable: false }), [], NOW, null);
  ok(rows.length === 1 && !rows[0].action, "a thin feed is a row with no button");
}

// the borrower's own unclaimed collateral is named as theirs
{
  const rows = attention(snap(), [cas({ id: 13, outcome: 2, deadline: NOW - 500, borrower: "0xAbC0000000000000000000000000000000000001" })],
    NOW, "0xabc0000000000000000000000000000000000001");
  ok(rows.length === 1 && rows[0].what === "Your collateral is unclaimed", "the borrower sees it as theirs, got " + rows[0].what);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
