/* rpc.ts — JSON-RPC straight from the page. Two public endpoints, tried in order, so a rate limit
   on one is not an outage. Nothing here trusts a response shape: every read is decoded by words. */

import { config } from "./config";

let ri = 0;
let rid = 1;

export async function rpc(method: string, params: unknown[]): Promise<any> {
  const CFG = config();
  let last: unknown = null;
  for (let t = 0; t < CFG.rpcs.length * 2; t++) {
    try {
      const r = await fetch(CFG.rpcs[ri], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rid++, method, params }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    } catch (e) {
      last = e;
      ri = (ri + 1) % CFG.rpcs.length;
    }
  }
  throw last || new Error("no RPC answered");
}

export const call = (to: string, data: string): Promise<string> =>
  rpc("eth_call", [{ to, data }, "latest"]);

export function words(hex: string | undefined): bigint[] {
  const h = String(hex || "0x").slice(2);
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
}

export const w32 = (v: bigint | number | string): string => BigInt(v).toString(16).padStart(64, "0");
export const id32 = (h: string): string => h.slice(2).toLowerCase();
export const hexAddr = (w: bigint | undefined): string => "0x" + (w || 0n).toString(16).padStart(40, "0");
export const first = (hex: string | undefined): bigint => words(hex)[0] || 0n;

export type Report = { value: bigint; prevValue: bigint; round: number; ts: number; samples: number; exists: boolean };

/* Report: value, prevValue, prevBandLo, prevBandHi, round, timestamp, payloadHash, signer,
   prevSamples, exists — decoded by consecutive words, no tuple offset. */
export function report(hex: string | undefined): Report {
  const w = words(hex);
  return {
    value: w[0] || 0n,
    prevValue: w[1] || 0n,
    round: Number(w[4] || 0n),
    ts: Number(w[5] || 0n),
    samples: Number(w[8] || 0n),
    exists: w[9] === 1n,
  };
}

export async function chainIsTarget(): Promise<boolean> {
  const id = await rpc("eth_chainId", []);
  return parseInt(id, 16) === config().chainId;
}
