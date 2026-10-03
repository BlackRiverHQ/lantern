/* live-check — the dashboard's readers run against the real chain, outside the browser.

   The tests next to this file pin the arithmetic; this runs the chain layer itself, so a reader that
   builds malformed calldata, mis-formats a feed id, or reads a report that does not exist fails here
   with a stack trace instead of on the page. `npm run live` compiles lib/ and runs it. */

const { createRequire } = require("node:module");
const { join } = require("node:path");

const build = join(__dirname, "..", ".probe-build");
const req = createRequire(join(build, "anchor.cjs"));

const { config, CROSS_SOURCE, TOLERANCE_BPS } = req("./chain/config.js");
const { provableCases, isHeld, claimable } = req("./chain/prove.js");
const { loadCases } = req("./chain/cases.js");
const { readFeeds } = req("./chain/feeds.js");

let fail = 0;
const check = (cond, msg) => {
  console.log((cond ? "  ok   " : "  FAIL ") + msg);
  if (!cond) fail++;
};

(async () => {
  const CFG = config();
  console.log("chain     " + CFG.lantern);
  console.log("subject   " + CFG.subject);
  console.log("peer      " + CFG.peer);

  const cases = await loadCases();
  console.log("\ncases " + cases.length);
  for (const c of cases) {
    console.log(
      `  #${c.id} round=${c.round} outcome=${c.outcome} result=${c.result} feed=${String(c.feedId).slice(0, 10)}…`,
    );
  }

  console.log("\nthe reader produces a verdict for every case it carries a round for");
  const rows = await provableCases(cases, Math.floor(Date.now() / 1000), 1000n, 2000n);
  check(rows.length === cases.length, rows.length + " rows for " + cases.length + " cases");

  // A case nobody has adjudicated has no verdict to reproduce: the page saying "this one would hold"
  // is a claim about a challenge that has not happened, not a disagreement with the contract.
  const decidedIds = new Set(cases.filter((c) => c.outcome !== 0).map((c) => c.id));

  let agree = 0;
  let comparable = 0;
  const compared = new Set();
  for (const r of rows) {
    const held = isHeld(r);
    const said = r.v ? (r.v.upheld ? "upheld" : "refused") : "n/a";
    const got = r.c.result;
    const same =
      r.v && decidedIds.has(r.c.id) ? (r.v.upheld ? got === "upheld" : got !== "upheld") : null;
    console.log(
      `  #${r.c.id} round=${r.round} held=${held} printed=${r.subj && r.subj.exists ? r.subj.value : "none"}` +
        ` second=${r.peer && r.peer.exists ? r.peer.value : "none"} says=${said}${r.v ? " (" + r.v.spread + "bps)" : ""} recorded=${got}`,
    );
    if (same !== null) {
      comparable++;
      compared.add(r.c.id);
      if (same) agree++;
      check(same, `#${r.c.id}: the page's read matches the verdict the contract recorded`);
    } else if (r.v) {
      console.log(`       undecided: the page would have this ${r.v.upheld ? "upheld" : "refused"}`);
    }
    // a verdict strung from a missing print would be the page inventing a number
    if (r.v) check(r.subj.exists && r.peer.exists, `#${r.c.id}: both prints exist, so the comparison is real`);
  }
  console.log("  agreed on " + agree + " of " + comparable + " comparable cases");

  // Without this, a deployment whose cases are all undecided reports "agreed on 0 of 0" and exits 0,
  // which reads as a pass: the one thing this check exists to prove would go unproven and unnoticed.
  const decided = cases.filter((c) => c.outcome !== 0);
  const missed = decided.filter((c) => !compared.has(c.id)).map((c) => "#" + c.id);
  check(
    missed.length === 0,
    `${decided.length} decided case(s) on this deployment, each one reproduced` +
      (missed.length ? " — nothing to compare for " + missed.join(", ") : ""),
  );

  console.log("\nfeeds");
  const feeds = await readFeeds([CFG.subject, CFG.peer]);
  for (const f of feeds) {
    check(f.id.length === 66, "a feed id is a full 32 bytes: " + f.id);
    check(f.peerId.length === 66, "its declared second source is a full 32 bytes: " + f.peerId);
    check(f.operator.length === 42, "its operator is an address: " + f.operator);
    console.log(
      `  ${f.id.slice(0, 10)}… op=${f.operator.slice(0, 8)} bond=${f.bond} needs=${f.required}` +
        ` priceable=${f.priceable} second=${f.peerId.slice(0, 10)}… errors=${f.errors}`,
    );
  }

  check(claimable(rows).every((r) => isHeld(r) && r.win.open), "everything offered is held and inside its window");
  check(CROSS_SOURCE !== undefined && TOLERANCE_BPS > 0, "the tolerance the page prints is the configured one");

  console.log(fail ? "\n" + fail + " failed" : "\nlive check passed");
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("live check could not complete:", e.message);
  console.error(e.stack.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
});
