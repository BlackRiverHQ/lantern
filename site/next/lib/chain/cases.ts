/* cases.ts — every liquidation on chain, how it ended, and the transactions that decided it.
   Read from the two contracts' own event logs; the outcome is derived from which events exist,
   never from a field someone wrote down. */

import { config, EVENT_BY_TOPIC, SEL, TOPICS, type EventName } from "./config";
import { call, rpc, words } from "./rpc";

export type CaseEvent = { n: EventName; block: number; li: number; tx: string; topics: string[]; data: string };
export type CaseResult = "upheld" | "refused" | "voided" | "released" | "open";

export type CaseRecord = {
  id: number;
  block: number;
  ts: number | null;
  bonus: bigint;
  borrower: string | null;
  liquidator: string | null;
  rule: number | null;
  gap: number | null;
  result: CaseResult;
  settled: boolean;
  /** A challenge is open and no verdict has landed on it, so `release` would still revert. */
  challengeOpen: boolean;
  deadline: number | null;
  outcome: number | null;
  ev: CaseEvent[];
};

export const RESULT_TEXT: Record<CaseResult, [string, string]> = {
  upheld: ["Lie caught", "Borrower made whole"],
  refused: ["Proof refused", "Liquidation stood"],
  voided: ["Challenge voided", "Liquidation stood"],
  released: ["No challenge", "Liquidation stood"],
  open: ["In progress", "Decision pending"],
};

const word = (hex: string, i: number) => BigInt("0x" + (hex.slice(2 + i * 64, 2 + i * 64 + 64) || "0"));

async function logsFor(address: string): Promise<any[]> {
  const from = "0x" + config().fromBlock.toString(16);
  try {
    return await rpc("eth_getLogs", [{ address, fromBlock: from, toBlock: "latest" }]);
  } catch {
    return [];
  }
}

/** Every case, newest first. `meta` carries the block timestamps for the rows that are shown. */
export async function loadCases(): Promise<CaseRecord[]> {
  const CFG = config();
  const [a, b] = await Promise.all([logsFor(CFG.lantern), logsFor(CFG.market)]);

  const by = new Map<number, CaseRecord>();
  for (const l of a.concat(b)) {
    const n = EVENT_BY_TOPIC[l.topics[0]];
    if (!n) continue;
    const id = Number(BigInt(l.topics[1]));
    let c = by.get(id);
    if (!c) {
      c = {
        id, block: 0, ts: null, bonus: 0n, borrower: null, liquidator: null, rule: null, gap: null,
        result: "open", settled: false, challengeOpen: false, deadline: null, outcome: null, ev: [],
      };
      by.set(id, c);
    }
    c.ev.push({
      n, block: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16),
      tx: l.transactionHash, topics: l.topics, data: l.data,
    });
  }

  const cases = [...by.values()].filter((c) => c.ev.some((e) => e.n === "LiquidationRecorded"));
  cases.forEach((c) => {
    c.ev.sort((x, y) => x.block - y.block || x.li - y.li);
    const has = (n: EventName) => c.ev.find((e) => e.n === n);
    const liq = has("LiquidationRecorded")!;
    const m = has("Liquidated");
    const op = has("ChallengeOpened");
    const up = has("ChallengeUpheld");
    c.bonus = word(liq.data, 0);
    c.block = liq.block;
    c.borrower = m ? "0x" + m.topics[2].slice(-40) : null;
    c.liquidator = m && m.topics[3] ? "0x" + m.topics[3].slice(-40) : null;
    c.rule = op ? Number(word(op.data, 0)) : null;
    c.gap = up && Number(word(up.data, 0)) === 4 ? Number(word(up.data, 1)) : null;
    c.result = up ? "upheld"
      : has("ChallengeRefused") ? "refused"
      : has("ChallengeVoided") ? "voided"
      : has("BonusReleased") ? "released"
      : "open";
    c.settled = !!has("SeizureClaimed");
    c.challengeOpen =
      !!op && !up && !has("ChallengeRefused") && !has("ChallengeVoided");
  });
  cases.sort((x, y) => y.block - x.block);

  // The escrow is the authority on whether a held bonus can be moved and who it is owed to, so read
  // it for every case that has not been settled rather than inferring it from which events exist.
  // Both passes run in chunks: the overview promises a row for every held bonus and every unclaimed
  // seizure, and a cap here would quietly drop the older ones off that list.
  const live = cases.filter((c) => !c.settled);
  await inChunks(live, async (c) => {
    try {
      const e = words(await call(CFG.lantern, SEL.escrowOf + BigInt(c.id).toString(16).padStart(64, "0")));
      if (e[8] === 1n) {
        c.deadline = Number(e[3] || 0n);
        c.outcome = Number(e[7] || 0n);
        c.bonus = e[4] || c.bonus;
      }
    } catch { /* a case we cannot read keeps the result its events imply */ }
  });

  const blockTs = await blockTimestamps(cases.map((c) => c.block));
  cases.forEach((c) => { c.ts = blockTs[c.block] ?? null; });
  return cases;
}

/** Read in bounded groups so a long history does not open a hundred sockets at once. */
async function inChunks<T>(items: T[], fn: (item: T) => Promise<void>, size = 16): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function blockTimestamps(blocks: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  await Promise.all([...new Set(blocks)].map(async (b) => {
    try {
      const x = await rpc("eth_getBlockByNumber", ["0x" + b.toString(16), false]);
      out[b] = parseInt(x.timestamp, 16);
    } catch { /* a missing timestamp leaves the row showing its block number */ }
  }));
  return out;
}

/** The highest case id the chain has ever recorded. */
export async function latestCaseId(): Promise<number> {
  try {
    const logs = await rpc("eth_getLogs", [{
      address: config().lantern, topics: [TOPICS.LiquidationRecorded],
      fromBlock: "0x" + config().fromBlock.toString(16), toBlock: "latest",
    }]);
    return logs.reduce((m: number, l: any) => Math.max(m, Number(BigInt(l.topics[1]))), 0);
  } catch {
    return 0;
  }
}
