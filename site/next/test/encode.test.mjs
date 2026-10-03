// Diffs the page's own encoder against cast, for every action it can send, plus the hashing helper
// and the custom-error decoder. With no ethers or viem in the page the encoder is ours: this test is
// what catches drift before it becomes a wrong transaction.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const abi = require(join(here, "..", ".test-build", "chain", "abi.js"));
const { encode, keccak256, decodeError, encBytes32 } = abi;

const SUBJECT = "0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210";
const PEER = "0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2";
const BOB = "0x0000000000000000000000000000000000000b0b";

const castCalldata = (sig, args) => execSync(`cast calldata ${JSON.stringify(sig)} ${args.join(" ")}`, { encoding: "utf8" }).trim();

const cases = [
  ["registerFeed", ["bytes32", "bytes32", "uint8"], [SUBJECT, "0x" + "11".repeat(32), "18"],
    "registerFeed(bytes32,bytes32,uint8)", [SUBJECT, "0x" + "11".repeat(32), 18]],
  ["setPeerFeed", ["bytes32", "bytes32"], [SUBJECT, PEER], "setPeerFeed(bytes32,bytes32)", [SUBJECT, PEER]],
  ["depositBond", ["bytes32", "uint256"], [SUBJECT, "1000000000000000000"],
    "depositBond(bytes32,uint256)", [SUBJECT, "1000000000000000000"]],
  ["withdrawBond", ["bytes32", "uint256"], [SUBJECT, "500000000000000000"],
    "withdrawBond(bytes32,uint256)", [SUBJECT, "500000000000000000"]],
  ["recordReport", ["bytes32", "uint256", "uint64", "uint64", "bytes32", "address"],
    [SUBJECT, "100000000000000000000", "7", "1790933158", "0x" + "ab".repeat(32), BOB],
    "recordReport(bytes32,uint256,uint64,uint64,bytes32,address)",
    [SUBJECT, "100000000000000000000", 7, 1790933158, "0x" + "ab".repeat(32), BOB]],
  ["openChallenge", ["uint256", "uint8", "bytes", "uint256"], ["10", "4", "peer disagreed 96.35%", "10000000000000000"],
    "openChallenge(uint256,uint8,bytes,uint256)", [10, 4, "0x" + Buffer.from("peer disagreed 96.35%").toString("hex"), "10000000000000000"]],
  ["adjudicate", ["uint256"], ["10"], "adjudicate(uint256)", [10]],
  ["voidStaleChallenge", ["uint256"], ["9"], "voidStaleChallenge(uint256)", [9]],
  ["release", ["uint256"], ["1"], "release(uint256)", [1]],
  ["liquidate", ["address", "uint256", "uint64", "uint256"], [BOB, "9", "5", "30000"],
    "liquidate(address,uint256,uint64,uint256)", [BOB, 9, 5, "30000"]],
  ["claim", ["uint256"], ["9"], "claim(uint256)", [9]],
  ["supply", ["uint256"], ["500000"], "supply(uint256)", ["500000"]],
  ["borrow", ["uint256"], ["88000"], "borrow(uint256)", ["88000"]],
  ["repay", ["uint256"], ["30000"], "repay(uint256)", ["30000"]],
  ["withdrawCollateral", ["uint256"], ["50000000000000"], "withdrawCollateral(uint256)", ["50000000000000"]],
  ["depositCollateral", ["uint256"], ["50000000000000"], "depositCollateral(uint256)", ["50000000000000"]],
  ["approve", ["address", "uint256"], [BOB, "1000000000000000000"], "approve(address,uint256)", [BOB, "1000000000000000000"]],
];

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL", msg); } };

for (const [name, types, values, sig, castArgs] of cases) {
  const mine = encode(name, types, values).toLowerCase();
  const theirs = castCalldata(sig, castArgs).toLowerCase();
  ok(mine === theirs, `${name}\n  page: ${mine}\n  cast: ${theirs}`);
}

// hashing: a readable label lands where an id is expected
const mine = "0x" + Buffer.from(keccak256([...Buffer.from("FEED:ARB-SEPOLIA-DEMO")]).slice(2), "hex").toString("hex");
const theirs = execSync(`cast keccak "FEED:ARB-SEPOLIA-DEMO"`, { encoding: "utf8" }).trim();
ok(mine === theirs, `keccak: page ${mine} cast ${theirs}`);
ok(encBytes32("FEED:ARB-SEPOLIA-DEMO") === theirs.slice(2), "encBytes32 did not hash a readable label");
ok(encBytes32(SUBJECT) === SUBJECT.slice(2), "encBytes32 did not pass a bytes32 through");

// the error decoder, against selectors cast produces for the interface's own errors
const names = [
  ["UnderBonded(bytes32,uint256,uint256)", "UnderBonded"],
  ["StakeBelowMinimum(uint256,uint256)", "StakeBelowMinimum"],
  ["FeedCannotPrice(bytes32)", "FeedCannotPrice"],
  ["TransferFromFailed()", "TransferFromFailed"],
];
for (const [sig, want] of names) {
  const sel = execSync(`cast sig ${JSON.stringify(sig)}`, { encoding: "utf8" }).trim();
  ok(decodeError(sel + "00".repeat(32))?.startsWith(want),
    `decodeError(${sig}) -> ${decodeError(sel + "00".repeat(32))}`);
}
ok(decodeError("0x") === null, "decodeError accepted an empty response");
ok(decodeError(null) === null, "decodeError accepted null");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
