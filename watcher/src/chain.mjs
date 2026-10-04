// chain.mjs: everything the watcher reads from and sends to the deployed contracts.
//
// Every number the watcher uses to decide comes from here, read off the chain, and the rule
// mirror in rules.mjs is applied to exactly what Lantern.adjudicate will read itself.

import { createPublicClient, createWalletClient, http, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

export const DEPLOYMENT = {
  chainId: 421614,
  lantern: "0xcdce3a1b3ebf7fe1e340ab670e25fe768195ac54",
  market: "0x290714d09f6d1ab50f7c31698eda92993ab01f95",
  asset: "0x185690fb4d3c765bac544423a34953b2b8b03a22",
  fromBlock: 315054532n,
};

const REPORT = "(uint256 value, uint256 prevValue, uint256 prevBandLo, uint256 prevBandHi, uint64 round, uint64 timestamp, bytes32 payloadHash, address signer, uint64 prevSamples, bool exists)";

export const LANTERN_ABI = parseAbi([
  "function reg() view returns (address)",
  "function escrowOf(uint256) view returns ((bytes32 feedId, uint64 round, uint64 recordedAt, uint64 deadline, uint256 bonus, address liquidator, address borrower, uint8 outcome, bool exists))",
  "function challengeOf(uint256) view returns ((address prover, uint256 stake, uint8 rule, bytes32 evidenceHash, bool resolved, bool upheld, uint64 openedAt))",
  "function peerOf(bytes32) view returns (bytes32)",
  "function bondOf(bytes32) view returns (uint256)",
  "function minStake() view returns (uint256)",
  "function bountyBps() view returns (uint16)",
  "function holdWindow() view returns (uint64)",
  "function openChallenge(uint256 liquidationId, uint8 rule, bytes evidence, uint256 stake) returns (uint256)",
  "function adjudicate(uint256 liquidationId) returns (bool)",
  "function release(uint256 liquidationId)",
  "function voidStaleChallenge(uint256 liquidationId)",
]);
export const REGISTRY_ABI = parseAbi([
  "function book() view returns (address)",
  `function reportAt(bytes32 feedId, uint64 round) view returns (${REPORT})`,
]);
export const BOOK_ABI = parseAbi([
  "function slotOf(bytes32 feedId, uint64 round) view returns ((uint256 firstValue, uint256 otherValue, uint64 round, bool seen, bool conflicted))",
  "function payloadFeed(bytes32) view returns (bytes32)",
]);
export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function claim()",
  "function claimedAt(address) view returns (uint64)",
  "function cooldown() view returns (uint64)",
]);

export const EV = {
  recorded: parseAbiItem("event LiquidationRecorded(uint256 indexed liquidationId, bytes32 indexed feedId, uint256 bonus, uint64 deadline)"),
  upheld: parseAbiItem("event ChallengeUpheld(uint256 indexed liquidationId, uint8 rule, uint256 observed, uint256 bound)"),
  refused: parseAbiItem("event ChallengeRefused(uint256 indexed liquidationId, uint256 stakeForfeited)"),
};

/**
 * The signing key comes only from the environment (WATCHER_PRIVATE_KEY) or from an account file
 * outside the repository (WATCHER_ACCOUNT_FILE, the JSON `cast wallet new --json` writes). It is never
 * printed or written anywhere. Without a key the watcher can still read and report.
 */
export function loadAccount() {
  let key = process.env.WATCHER_PRIVATE_KEY || "";
  const file = process.env.WATCHER_ACCOUNT_FILE;
  if (!key && file) {
    const d = JSON.parse(readFileSync(file, "utf8"));
    key = (Array.isArray(d) ? d[0] : d).private_key;
  }
  if (!key) return null;
  return privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key);
}

export function clients(rpcUrl, account) {
  const chain = {
    id: DEPLOYMENT.chainId, name: "Arbitrum Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  const transport = http(rpcUrl, { timeout: 30_000, retryCount: 3 });
  const pub = createPublicClient({ chain, transport });
  const wallet = account ? createWalletClient({ chain, transport, account }) : null;
  return { pub, wallet, account };
}

const read = (pub, address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });

/** The addresses Lantern itself points at, so nothing below is typed in twice. */
export async function wiring(pub) {
  const reg = await read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "reg");
  const book = await read(pub, reg, REGISTRY_ABI, "book");
  const [minStake, bountyBps, holdWindow] = await Promise.all([
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "minStake"),
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "bountyBps"),
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "holdWindow"),
  ]);
  return { reg, book, minStake, bountyBps: BigInt(bountyBps), holdWindow: BigInt(holdWindow) };
}

/** Every liquidation id Lantern has recorded since `from`, oldest first. */
export async function liquidationIds(pub, from = DEPLOYMENT.fromBlock) {
  const logs = await pub.getLogs({ address: DEPLOYMENT.lantern, event: EV.recorded, fromBlock: from, toBlock: "latest" });
  return logs.map((l) => ({ id: l.args.liquidationId, block: l.blockNumber, tx: l.transactionHash }));
}

/** How every challenge that reached a verdict ended, from the contract's own events. */
export async function verdictEvents(pub) {
  const [up, down] = await Promise.all([
    pub.getLogs({ address: DEPLOYMENT.lantern, event: EV.upheld, fromBlock: DEPLOYMENT.fromBlock, toBlock: "latest" }),
    pub.getLogs({ address: DEPLOYMENT.lantern, event: EV.refused, fromBlock: DEPLOYMENT.fromBlock, toBlock: "latest" }),
  ]);
  const out = new Map();
  for (const l of up) out.set(l.args.liquidationId, { upheld: true, tx: l.transactionHash, rule: l.args.rule });
  for (const l of down) out.set(l.args.liquidationId, { upheld: false, tx: l.transactionHash });
  return out;
}

/** The escrow, the challenge on it, and the exact inputs adjudicate would read for it. */
export async function caseState(pub, w, id) {
  const [e, c] = await Promise.all([
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "escrowOf", [id]),
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "challengeOf", [id]),
  ]);
  if (!e.exists) return { id, e, c, inputs: null };
  const report = await read(pub, w.reg, REGISTRY_ABI, "reportAt", [e.feedId, e.round]);
  const [slot, payloadFeed, peer, bond] = await Promise.all([
    read(pub, w.book, BOOK_ABI, "slotOf", [e.feedId, e.round]),
    read(pub, w.book, BOOK_ABI, "payloadFeed", [report.payloadHash]),
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "peerOf", [e.feedId]),
    read(pub, DEPLOYMENT.lantern, LANTERN_ABI, "bondOf", [e.feedId]),
  ]);
  const ZERO = "0x" + "0".repeat(64);
  const pr = peer === ZERO ? null : await read(pub, w.reg, REGISTRY_ABI, "reportAt", [peer, e.round]);
  return {
    id, e, c, peer, bond,
    inputs: {
      report,
      slotConflicted: slot.conflicted,
      otherValueForRound: slot.otherValue,
      payloadFeed,
      thisFeed: e.feedId,
      liquidationTime: e.recordedAt,
      peerValue: pr ? pr.value : 0n,
      peerExists: pr ? pr.exists : false,
    },
  };
}

/** Simulate first, so a revert costs nothing; then send and wait for the receipt. */
export async function send(ctx, address, abi, functionName, args) {
  const { pub, wallet, account } = ctx;
  const { request, result } = await pub.simulateContract({ address, abi, functionName, args, account });
  const hash = await wallet.writeContract(request);
  const rec = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (rec.status !== "success") throw new Error(`${functionName} reverted in ${hash}`);
  return { hash, result, gasUsed: rec.gasUsed, price: rec.effectiveGasPrice };
}

export async function simulate(ctx, address, abi, functionName, args) {
  const { result } = await ctx.pub.simulateContract({ address, abi, functionName, args, account: ctx.account });
  return result;
}
