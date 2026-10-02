// The feed operator, as a service. A print on Lantern can only come from the operator of the feed
// (onlyOperator in the contract), so a visitor with their own wallet cannot make one. This module
// makes the three prints a case needs, and nothing else:
//
//   honest  the subject feed prints Chainlink's ETH/USD at the case's first round
//   lie     the subject feed prints that value minus the visitor's chosen gap at the second round
//   peer    the second feed prints Chainlink's ETH/USD at the second round
//
// Every value is derived here from the chain. The caller chooses only the gap, inside the range
// the contract's own per-print drift guard allows, so the key cannot be made to print an arbitrary
// number. The same module is imported by the Convex action and by the local fork harness.

import { createPublicClient, createWalletClient, http, keccak256, toHex, encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia } from "viem/chains";

export const ADDR = {
  lantern: "0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54",
  market: "0x290714d09f6d1ab50f7c31698eda92993ab01f95",
  asset: "0x185690fb4d3c765bac544423a34953b2b8b03a22",
  aggregator: "0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165",
  subject: "0xf7ed0c5000d57be8bb1723e1298ee49e6a076692f4ef68d27dd00db178f57210",
  peer: "0x0bf35ab8318649a0b126cdc6fb6c89b2ebbb1659b37fbd0b3aca12e6eefa71a2",
  weth: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
};
const VISITOR_MIN_ETH = 30_000_000_000_000n; // what step 1 of a case needs: the wrap and the gas

const BPS = 10000n;
const DRIFT = 2000n;              // MAX_REPORT_DRIFT_BPS
export const GAP_MIN = 200;       // a 2% lie: inside tolerance, so the challenge is refused
export const GAP_MAX = 1800;      // an 18% lie: still inside the 20% per-print guard
const MIN_ETH = 30_000_000_000_000n;  // what the steps after the first need from the operator
const CASE_ETH = 100_000_000_000_000n; // a whole case's side, measured at 0.000076 ETH on live: refuse
                                       // to start one that could not be finished

const REPORT = [
  { name: "value", type: "uint256" }, { name: "prevValue", type: "uint256" },
  { name: "prevBandLo", type: "uint256" }, { name: "prevBandHi", type: "uint256" },
  { name: "round", type: "uint64" }, { name: "timestamp", type: "uint64" },
  { name: "payloadHash", type: "bytes32" }, { name: "signer", type: "address" },
  { name: "prevSamples", type: "uint64" }, { name: "exists", type: "bool" },
];
const ABI = [
  { type: "function", name: "reg", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "operatorOf", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "address" }] },
  { type: "function", name: "bondOf", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "requiredBond", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "depositBond", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "recordReport", stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }, { type: "bytes32" }, { type: "address" }], outputs: [] },
  { type: "function", name: "lastReport", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "tuple", components: REPORT }] },
  { type: "function", name: "reportAt", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "uint64" }], outputs: [{ type: "tuple", components: REPORT }] },
  { type: "function", name: "accountOf", stateMutability: "view", inputs: [{ type: "address" }],
    outputs: [{ type: "tuple", components: [{ name: "posted", type: "uint256" }, { name: "debt", type: "uint256" }, { name: "supplied", type: "uint256" }] }] },
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [],
    outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
];

/** A refusal the visitor should read. Anything else is an outage. */
export class Refusal extends Error {
  constructor(message, extra) { super(message); this.refusal = true; this.extra = extra || {}; }
}

export function makeClients(privateKey, rpcUrl) {
  const chain = { ...arbitrumSepolia };
  const transport = http(rpcUrl || "https://sepolia-rollup.arbitrum.io/rpc", { timeout: 20_000 });
  const pub = createPublicClient({ chain, transport });
  const account = privateKeyToAccount(privateKey);
  const wallet = createWalletClient({ chain, transport, account });
  return { pub, wallet, account };
}

function read(pub, address, functionName, args) {
  return pub.readContract({ address, abi: ABI, functionName, args: args || [] });
}

/** Chainlink's answer on the asset's six decimals. */
async function chainlink(pub) {
  const r = await read(pub, ADDR.aggregator, "latestRoundData");
  return BigInt(r[1]) / 100n;
}

/** Everything a print decision depends on, read in one go. */
export async function snapshot(pub, borrower) {
  const reg = await read(pub, ADDR.lantern, "reg");
  const [subj, peer, cl, block] = await Promise.all([
    read(pub, reg, "lastReport", [ADDR.subject]),
    read(pub, reg, "lastReport", [ADDR.peer]),
    chainlink(pub),
    pub.getBlock({ blockTag: "latest" }),
  ]);
  const acct = borrower ? await read(pub, ADDR.market, "accountOf", [borrower]) : null;
  return { reg, subj, peer, cl, now: block.timestamp, acct };
}

/** The rounds a new case would use: one past whatever either feed has printed. */
export function nextRounds(s) {
  const last = s.subj.round > s.peer.round ? s.subj.round : s.peer.round;
  return { r1: Number(last) + 1, r2: Number(last) + 2 };
}

/** Chainlink's value, held inside the contract's own per-print guard against the last print. */
export function honestValue(anchor, cl) {
  if (!anchor) return cl;
  const lo = anchor * (BPS - DRIFT + 100n) / BPS, hi = anchor * (BPS + DRIFT - 100n) / BPS;
  return cl < lo ? lo : cl > hi ? hi : cl;
}

function payload(caseId, kind) { return keccak256(toHex(`LANTERN:CASE-${caseId}:${kind}`)); }

async function send(ctx, address, functionName, args) {
  const { pub, wallet, account } = ctx;
  const { request } = await pub.simulateContract({ address, abi: ABI, functionName, args, account });
  let hash;
  try { hash = await wallet.writeContract(request); }
  catch (e) {
    if (/exceeds the balance|insufficient funds/i.test(String(e && (e.shortMessage || e.message))))
      throw new Refusal("the demo feed is out of test ETH for gas; try again later");
    throw e;
  }
  const rec = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rec.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
  return hash;
}

/** Keep the subject feed's bond above what a liquidation will ask of it, with room for one more. */
async function topUpBond(ctx) {
  const { pub, account } = ctx;
  const [bond, required] = await Promise.all([
    read(pub, ADDR.lantern, "bondOf", [ADDR.subject]),
    read(pub, ADDR.lantern, "requiredBond", [ADDR.subject]),
  ]);
  const want = required + required / 2n;
  if (bond >= required + required / 5n) return [];
  const need = want - bond, hashes = [];
  const bal = await read(pub, ADDR.asset, "balanceOf", [account.address]);
  if (bal < need) hashes.push(await send(ctx, ADDR.asset, "claim", []));
  const allowed = await read(pub, ADDR.asset, "allowance", [account.address, ADDR.lantern]);
  if (allowed < need) hashes.push(await send(ctx, ADDR.asset, "approve", [ADDR.lantern, need]));
  hashes.push(await send(ctx, ADDR.lantern, "depositBond", [ADDR.subject, need]));
  return hashes;
}

const SEL_ABI = [
  { type: "function", name: "escrowOf", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "feedId", type: "bytes32" }, { name: "round", type: "uint64" }, { name: "recordedAt", type: "uint64" },
      { name: "deadline", type: "uint64" }, { name: "bonus", type: "uint256" }, { name: "liquidator", type: "address" },
      { name: "borrower", type: "address" }, { name: "outcome", type: "uint8" }, { name: "exists", type: "bool" }] }] },
  { type: "function", name: "seizureOf", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "borrower", type: "address" }, { name: "liquidator", type: "address" }, { name: "collateralAmount", type: "uint256" },
      { name: "repayAmount", type: "uint256" }, { name: "state", type: "uint8" }] }] },
  { type: "function", name: "healthOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ name: "debt", type: "uint256" }, { name: "limit", type: "uint256" }] },
  { type: "function", name: "closeFactorBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "liquidationBonusBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "liquidate", stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "uint256" }], outputs: [] },
];
ABI.push(...SEL_ABI);

/** A case id is fresh while neither Lantern nor the market has heard of it. */
async function caseIsFresh(pub, caseId) {
  const [e, z] = await Promise.all([
    read(pub, ADDR.lantern, "escrowOf", [BigInt(caseId)]),
    read(pub, ADDR.market, "seizureOf", [BigInt(caseId)]),
  ]);
  return !e.exists && z.state === 0;
}

/** Check the gas, the operator, and that the key is the one these feeds answer to. */
async function preflight(ctx, need) {
  const { pub, account } = ctx;
  const [eth, opSubj, opPeer] = await Promise.all([
    pub.getBalance({ address: account.address }),
    read(pub, ADDR.lantern, "operatorOf", [ADDR.subject]),
    read(pub, ADDR.lantern, "operatorOf", [ADDR.peer]),
  ]);
  const me = account.address.toLowerCase();
  if (opSubj.toLowerCase() !== me || opPeer.toLowerCase() !== me) throw new Error("the configured key does not operate the feeds");
  if (eth < need) throw new Refusal("the demo feed is low on test ETH for gas, so it is not starting new cases; try again later");
}

/**
 * One server-side step of a case. The server plays the feed operator and the liquidator; the
 * visitor plays the borrower and the prover. Each step checks the one before it from chain state,
 * and the payload hash binds every print to its case, so the key only ever acts inside a case.
 * @param req { kind: 'honest'|'lie'|'liquidate', caseId, r1, r2, gap, borrower }
 */
export async function print(ctx, req) {
  const kind = String(req.kind || "");
  if (!["honest", "lie", "liquidate"].includes(kind)) throw new Refusal("unknown step");
  const caseId = Number(req.caseId), r1 = Number(req.r1), r2 = Number(req.r2);
  if (!Number.isSafeInteger(caseId) || caseId <= 0) throw new Refusal("bad case id");
  if (!Number.isSafeInteger(r1) || r1 <= 0 || r2 !== r1 + 1) throw new Refusal("bad rounds");
  const borrower = /^0x[0-9a-fA-F]{40}$/.test(req.borrower || "") ? req.borrower : null;
  if (!borrower) throw new Refusal("connect a wallet first");

  await preflight(ctx, kind === "honest" ? CASE_ETH : MIN_ETH);
  const { pub, account } = ctx;
  const s = await snapshot(pub, borrower);
  const hashes = [];

  if (kind === "honest") {
    if (!(await caseIsFresh(pub, caseId))) throw new Refusal("this case number is taken; start a new case");
    // a case starts only for a wallet that is really there: one that has funded itself for its side
    const [vEth, vWeth] = await Promise.all([pub.getBalance({ address: borrower }), read(pub, ADDR.weth, "balanceOf", [borrower])]);
    if (vEth < VISITOR_MIN_ETH && vWeth === 0n && (!s.acct || s.acct.posted === 0n)) throw new Refusal("fund your wallet first (step 1)");
    const want = nextRounds(s);
    if (want.r1 !== r1) throw new Refusal(`the feed has moved on; this case needs rounds ${want.r1} and ${want.r2}`, want);
    hashes.push(...(await topUpBond(ctx)));
    const value = honestValue(s.subj.exists ? s.subj.value : 0n, s.cl);
    hashes.push(await send(ctx, ADDR.lantern, "recordReport", [ADDR.subject, value, BigInt(r1), s.now, payload(caseId, "HONEST"), account.address]));
    return { kind, round: r1, value: value.toString(), hashes };
  }

  const honest = await read(pub, s.reg, "reportAt", [ADDR.subject, BigInt(r1)]);
  if (!honest.exists || honest.payloadHash !== payload(caseId, "HONEST")) throw new Refusal("this case's real-price print is not on chain");

  if (kind === "lie") {
    const gap = Number(req.gap);
    if (!Number.isInteger(gap) || gap < GAP_MIN || gap > GAP_MAX) throw new Refusal(`the lie must be ${GAP_MIN / 100}% to ${GAP_MAX / 100}%`);
    if (Number(s.subj.round) !== r1) throw new Refusal("another case printed since this one started; start a new case");
    if (Number(s.peer.round) >= r2) throw new Refusal("the second feed already printed this round; start a new case");
    // a lie with nobody underneath it moves the feed for nothing
    if (!s.acct || s.acct.debt === 0n) throw new Refusal("open the loan before the feed lies");
    const value = honest.value * (BPS - BigInt(gap)) / BPS;
    hashes.push(await send(ctx, ADDR.lantern, "recordReport", [ADDR.subject, value, BigInt(r2), s.now, payload(caseId, "LIE"), account.address]));
    // the independent source prints the real price for the same round: that pair is the evidence
    hashes.push(await send(ctx, ADDR.lantern, "recordReport", [ADDR.peer, s.cl, BigInt(r2), s.now, payload(caseId, "CHAINLINK"), account.address]));
    return { kind, round: r2, value: value.toString(), peer: s.cl.toString(), hashes };
  }

  // liquidate: the market's own liquidation, priced on the lie, from the server's wallet
  const lie = await read(pub, s.reg, "reportAt", [ADDR.subject, BigInt(r2)]);
  if (!lie.exists || lie.payloadHash !== payload(caseId, "LIE")) throw new Refusal("this case's false print is not on chain");
  if (!(await caseIsFresh(pub, caseId))) throw new Refusal("this case was already liquidated");
  const [h, closeBps, bonusBps] = await Promise.all([
    read(pub, ADDR.market, "healthOf", [borrower, lie.value]),
    read(pub, ADDR.market, "closeFactorBps"),
    read(pub, ADDR.market, "liquidationBonusBps"),
  ]);
  const [debt, limit] = h;
  if (debt <= limit) throw new Refusal("the loan is still healthy at the false price; nothing to liquidate");
  const repay = debt * BigInt(closeBps) / BPS;
  const notional = repay + repay * BigInt(bonusBps) / BPS;
  const bal = await read(pub, ADDR.asset, "balanceOf", [account.address]);
  if (bal < notional) hashes.push(await send(ctx, ADDR.asset, "claim", []));
  const allowed = await read(pub, ADDR.asset, "allowance", [account.address, ADDR.market]);
  if (allowed < notional) hashes.push(await send(ctx, ADDR.asset, "approve", [ADDR.market, notional]));
  hashes.push(await send(ctx, ADDR.market, "liquidate", [borrower, BigInt(caseId), BigInt(r2), repay]));
  return { kind, round: r2, repay: repay.toString(), notional: notional.toString(), hashes };
}

export { encodeAbiParameters };
