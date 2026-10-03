/* wallet.ts — the injected wallet, and the only place a transaction is signed.
   Every call is preflighted with eth_call before it is offered for signature, so a doomed
   transaction is never signed and a refusal costs no gas. */

import { config, CHAIN_ID } from "./config";
import { decodeError, encAddress } from "./abi";
import { SEL } from "./config";

export type WalletState = {
  account: string | null;
  chain: number | null;
  hold: bigint;
  eth: bigint;
};

export type TxEntry = {
  label: string;
  hash: string;
  status: "pending" | "ok" | "reverted" | "timeout";
  to: string;
  block?: number;
  gas?: number;
  reason?: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
export const log: TxEntry[] = [];

export const W: WalletState = { account: null, chain: null, hold: 0n, eth: 0n };

const provider = (): any => (globalThis as any).ethereum;
export const hasWallet = (): boolean => !!(globalThis as any).ethereum;
export const onChange = (f: Listener): (() => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};
const notify = () => listeners.forEach((f) => { try { f(); } catch { /* a listener must not break a send */ } });

function request(method: string, params?: unknown[]): Promise<any> {
  const p = provider();
  if (!p) return Promise.reject(new Error("no wallet in this browser"));
  return p.request({ method, params: params || [] });
}

export async function connect(): Promise<WalletState> {
  const p = provider();
  if (!p) throw new Error("no wallet in this browser");
  const accounts = await p.request({ method: "eth_requestAccounts" });
  W.account = (accounts && accounts[0]) || null;
  W.chain = parseInt(await p.request({ method: "eth_chainId" }), 16);
  if (p.on) p.on("accountsChanged", (a: string[]) => { W.account = (a && a[0]) || null; refreshBalances(); notify(); });
  if (p.on) p.on("chainChanged", (c: string) => { W.chain = parseInt(c, 16); refreshBalances(); notify(); });
  await refreshBalances();
  notify();
  return W;
}

export async function silentReconnect(): Promise<WalletState> {
  const p = provider();
  if (!p || !p.request) return W;
  const a = await p.request({ method: "eth_accounts" });
  if (a && a[0]) await connect();
  return W;
}

export async function switchChain(): Promise<void> {
  const p = provider();
  if (!p) throw new Error("no wallet in this browser");
  const CFG = config();
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + CHAIN_ID.toString(16) }] });
  } catch (e: any) {
    if (e && (e.code === 4902 || /Unrecognized chain/i.test(e.message || ""))) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x" + CHAIN_ID.toString(16),
          chainName: "Arbitrum Sepolia",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [CFG.rpcs[0]],
          blockExplorerUrls: [CFG.explorer],
        }],
      });
    } else throw e;
  }
  W.chain = parseInt(await p.request({ method: "eth_chainId" }), 16);
  notify();
}

export async function refreshBalances(): Promise<void> {
  if (!W.account) { W.hold = 0n; W.eth = 0n; notify(); return; }
  const CFG = config();
  const [hold, eth] = await Promise.all([
    request("eth_call", [{ to: CFG.asset, data: SEL.balanceOf + encAddress(W.account) }, "latest"])
      .then((r: string) => BigInt(r || "0x0"))
      .catch(() => 0n),
    request("eth_getBalance", [W.account, "latest"]).then((r: string) => BigInt(r)).catch(() => 0n),
  ]);
  W.hold = hold;
  W.eth = eth;
  notify();
}

function txFields(to: string, calldata: string, value?: bigint | number | string): Record<string, unknown> {
  const t: Record<string, unknown> = { from: W.account, to, data: calldata };
  if (value) t.value = "0x" + BigInt(value).toString(16);
  return t;
}

/** Ask the chain what a call would do before anything is signed. */
export async function simulate(
  to: string, calldata: string, value?: bigint | number | string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await request("eth_call", [txFields(to, calldata, value), "latest"]);
    return { ok: true };
  } catch (e: any) {
    let d = e && (e.data || (e.info && e.info.error && e.info.error.data));
    if (d && typeof d === "object") d = d.data || null;
    let reason: string | null = null;
    try { reason = decodeError(typeof d === "string" ? d : null); } catch { reason = null; }
    return { ok: false, reason: reason || (e && e.message) || "the chain refused it" };
  }
}

export async function send(
  label: string, to: string, calldata: string, value?: bigint | number | string,
  onHash?: (h: string) => void
): Promise<TxEntry> {
  const hash = await request("eth_sendTransaction", [txFields(to, calldata, value)]);
  if (onHash) { try { onHash(hash); } catch { /* a render callback must not break a send */ } }
  const entry: TxEntry = { label, hash, status: "pending", to };
  log.unshift(entry);
  notify();
  return wait(hash, entry);
}

async function wait(hash: string, entry: TxEntry): Promise<TxEntry> {
  for (let i = 0; i < 120; i++) {
    const r = await request("eth_getTransactionReceipt", [hash]);
    if (r) {
      entry.status = r.status === "0x1" ? "ok" : "reverted";
      entry.block = parseInt(r.blockNumber, 16);
      entry.gas = parseInt(r.gasUsed, 16);
      if (entry.status === "reverted") entry.reason = await reasonFor(hash);
      notify();
      return entry;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  entry.status = "timeout";
  notify();
  return entry;
}

/** Replay a mined transaction against its own block to recover the revert data. Receipts on most
 *  nodes carry no reason field at all, and this replay is what puts the decoded error on screen. */
async function reasonFor(hash: string): Promise<string> {
  let data: string | null = null;
  let msg: string | null = null;
  try {
    const tx = await request("eth_getTransactionByHash", [hash]);
    const rec = await request("eth_getTransactionReceipt", [hash]);
    const tag = rec && rec.blockNumber ? rec.blockNumber : "latest";
    await request("eth_call", [{ from: tx.from, to: tx.to, data: tx.input }, tag]);
  } catch (e: any) {
    msg = (e && e.message) || null;
    let d = e && (e.data || (e.info && e.info.error && e.info.error.data));
    if (d && typeof d === "object") d = d.data || null;
    data = typeof d === "string" ? d : null;
  }
  try { return decodeError(data) || msg || "the call was refused"; } catch { return msg || "the call was refused"; }
}

/** The allowance this spender holds on this token, read at the moment it matters. A market supply
 *  spends an allowance to the market, a bond spends one to Lantern, collateral spends one on the
 *  wrapped ether: one cached number cannot stand for all three. */
export async function allowanceOf(token: string, spender: string): Promise<bigint> {
  return BigInt(await request("eth_call", [{ to: token, data: SEL.allowance + encAddress(W.account!) + encAddress(spender) }, "latest"]) || "0x0");
}
