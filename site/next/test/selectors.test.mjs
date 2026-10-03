// Re-derives every selector and event topic the dashboard reads with, using cast. A wrong selector
// does not throw: eth_call returns empty and the page would show zeros, so drift has to be caught here.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "lib", "chain", "config.ts"), "utf8");

const SIGNATURES = {
  reg: "reg()",
  operatorOf: "operatorOf(bytes32)",
  bondOf: "bondOf(bytes32)",
  exposureOf: "exposureOf(bytes32)",
  peerOf: "peerOf(bytes32)",
  requiredBond: "requiredBond(bytes32)",
  priceable: "priceable(bytes32)",
  feedErrors: "feedErrors(bytes32)",
  minStake: "minStake()",
  bountyBps: "bountyBps()",
  escrowOf: "escrowOf(uint256)",
  challengeOf: "challengeOf(uint256)",
  lastReport: "lastReport(bytes32)",
  reportAt: "reportAt(bytes32,uint64)",
  recordReport: "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)",
  registerFeed: "registerFeed(bytes32,bytes32,uint8)",
  setPeerFeed: "setPeerFeed(bytes32,bytes32)",
  depositBond: "depositBond(bytes32,uint256)",
  withdrawBond: "withdrawBond(bytes32,uint256)",
  openChallenge: "openChallenge(uint256,uint8,bytes,uint256)",
  adjudicate: "adjudicate(uint256)",
  voidStaleChallenge: "voidStaleChallenge(uint256)",
  release: "release(uint256)",
  accountOf: "accountOf(address)",
  healthOf: "healthOf(address,uint256)",
  seizureOf: "seizureOf(uint256)",
  closeFactorBps: "closeFactorBps()",
  liquidationBonusBps: "liquidationBonusBps()",
  collateralValueOf: "collateralValueOf(address,uint256)",
  supply: "supply(uint256)",
  depositCollateral: "depositCollateral(uint256)",
  withdrawCollateral: "withdrawCollateral(uint256)",
  borrow: "borrow(uint256)",
  repay: "repay(uint256)",
  withdraw: "withdraw(uint256)",
  liquidate: "liquidate(address,uint256,uint64,uint256)",
  claim: "claim(uint256)",
  balanceOf: "balanceOf(address)",
  allowance: "allowance(address,address)",
  approve: "approve(address,uint256)",
  faucetClaim: "claim()",
  claimedAt: "claimedAt(address)",
  cooldown: "cooldown()",
  wrap: "deposit()",
  latestRoundData: "latestRoundData()",
};

const EVENTS = {
  LiquidationRecorded: "LiquidationRecorded(uint256,bytes32,uint256,uint64)",
  Liquidated: "Liquidated(uint256,address,address,uint256,uint256,uint256,uint256,uint64)",
  ChallengeOpened: "ChallengeOpened(uint256,address,uint8,uint256)",
  ChallengeUpheld: "ChallengeUpheld(uint256,uint8,uint256,uint256)",
  ChallengeRefused: "ChallengeRefused(uint256,uint256)",
  ChallengeVoided: "ChallengeVoided(uint256,uint256)",
  BonusReleased: "BonusReleased(uint256,address,uint256)",
  SeizureClaimed: "SeizureClaimed(uint256,uint8,address,uint256)",
};

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

function table(name) {
  const start = src.indexOf("export const " + name + " = {");
  const end = src.indexOf("} as const;", start);
  const block = src.slice(start, end);
  return Object.fromEntries([...block.matchAll(/(\w+):\s*"(0x[0-9a-f]{8,64})"/g)].map((m) => [m[1], m[2]]));
}

const sel = table("SEL");
const topics = table("TOPICS");

for (const [k, sig] of Object.entries(SIGNATURES)) {
  const want = execSync(`cast sig ${JSON.stringify(sig)}`, { encoding: "utf8" }).trim();
  ok(sel[k] === want, `selector ${k} (${sig}): config ${sel[k]} cast ${want}`);
}
const extraSel = Object.keys(sel).filter((k) => !SIGNATURES[k]);
ok(extraSel.length === 0, "selectors with no signature to check: " + extraSel.join(", "));

for (const [k, sig] of Object.entries(EVENTS)) {
  const want = execSync(`cast keccak ${JSON.stringify(sig)}`, { encoding: "utf8" }).trim();
  ok(topics[k] === want, `event ${k}: config ${topics[k]} cast ${want}`);
}
const extraTopics = Object.keys(topics).filter((k) => !EVENTS[k]);
ok(extraTopics.length === 0, "event topics with no signature to check: " + extraTopics.join(", "));

// CROSS_SOURCE is index 4 of Provenance.Rule; the surface sends that number
const provenance = readFileSync(join(here, "..", "..", "..", "src", "libraries", "Provenance.sol"), "utf8");
const names = provenance
  .slice(provenance.indexOf("enum Rule {") + 11, provenance.indexOf("}", provenance.indexOf("enum Rule {")))
  .split("\n").map((l) => l.replace(/\/\/.*/, "").replace(/[,\s]/g, "")).filter(Boolean);
ok(names.indexOf("CROSS_SOURCE") === 4, "CROSS_SOURCE index: " + names.join(","));
ok(/export const CROSS_SOURCE = 4;/.test(src), "config.ts CROSS_SOURCE is not 4");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
