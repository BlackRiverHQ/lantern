"use client";

/* protocol.tsx — the one place the surface talks to the chain.
   It owns the snapshot, the visitor's case, the cases list and the wallet, and hands each page the
   same live values. Everything below this file renders; nothing below it decides. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { config, SEL } from "@/lib/chain/config";
import { encode } from "@/lib/chain/abi";
import { call, rpc } from "@/lib/chain/rpc";
import { deriveHonest, readSnapshot, type CaseKey, type Snapshot } from "@/lib/chain/read";
import { loadCases, latestCaseId, type CaseRecord } from "@/lib/chain/cases";
import { allowanceOf, connect, refreshBalances, send, silentReconnect, simulate, switchChain, W } from "@/lib/chain/wallet";
import { asKey, load, noteTx, save, type Store } from "@/lib/case/store";
import { gate, plain, steps, type Prices, type Runner, type StepKey, type StepView } from "@/lib/case/plan";
import { absBps } from "@/lib/format";

declare global {
  interface Window { __LANTERN__?: Record<string, unknown>; ethereum?: any }
}

type Protocol = {
  ready: boolean;
  online: boolean;
  error: string;
  account: string | null;
  chain: number | null;
  s: Snapshot | null;
  prices: Prices | null;
  case: Store | null;
  views: StepView[];
  gate: ReturnType<typeof gate>;
  busy: string | null;
  pending: { step: string; label?: string; hash?: string; server?: boolean } | null;
  cases: CaseRecord[];
  casesLoaded: boolean;
  now: number;
  canAct: boolean;
  connectOrSwitch: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadCases: () => Promise<void>;
  runStep: (k: StepKey) => Promise<void>;
  newCase: () => Promise<void>;
  setGap: (bps: number) => void;
  position: (label: string, fn: (r: Runner) => Promise<void>) => Promise<void>;
};

const Ctx = createContext<Protocol | null>(null);

export function useProtocol(): Protocol {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProtocol outside the provider");
  return v;
}

export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState("");
  const [s, setS] = useState<Snapshot | null>(null);
  const [k, setK] = useState<Store | null>(null);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [casesLoaded, setCasesLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Protocol["pending"]>(null);
  const [tick, setTick] = useState(0);
  const [wallet, setWallet] = useState<{ account: string | null; chain: number | null }>({ account: null, chain: null });

  const seq = useRef(0);
  const busyRef = useRef<string | null>(null);
  const kRef = useRef<Store | null>(null);
  const sRef = useRef<Snapshot | null>(null);
  const pendingRef = useRef<Protocol["pending"]>(null);
  const wall = useRef(Date.now());

  /* the runner object the step table reads. Its fields are refreshed in place, so a step's closure
     sees the state the chain is in at the moment the step runs, not the one it was rendered with. */
  const runner = useRef<Runner>({
    s: null as unknown as Snapshot,
    k: { id: 0, r1: 0, r2: 0, gap: 1500 },
    account: null,
    chain: null,
    owner: null,
    tx: async () => { throw new Error("not wired"); },
    approve: async () => { throw new Error("not wired"); },
    server: async () => { throw new Error("not wired"); },
    refresh: async () => { },
    now: () => 0,
  });

  const chainNow = useCallback(() => {
    const snap = sRef.current;
    return snap ? snap.now + Math.floor((Date.now() - wall.current) / 1000) : Math.floor(Date.now() / 1000);
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const key = kRef.current ? asKey(kRef.current) : null;
      const snap = await readSnapshot(key, runner.current.account);
      if (mine !== seq.current) return; // a newer read is on its way; that one lands
      wall.current = Date.now();
      sRef.current = snap;
      runner.current.s = snap;
      setS(snap);
      setOnline(true);
    } catch (e) {
      if (mine === seq.current) {
        setOnline(false);
        setError("Could not read the chain (" + (e as Error).message + ").");
      }
    }
  }, []);

  const reloadCases = useCallback(async () => {
    try {
      const list = await loadCases();
      setCases(list);
      setCasesLoaded(true);
    } catch (e) {
      setCasesLoaded(true);
      setError("Could not read the cases (" + (e as Error).message + ").");
    }
  }, []);

  /* ---------------------------------------------------------------- sending */
  const doTx = useCallback(async (
    step: string, label: string, to: string, data: string, value?: bigint
  ) => {
    const sim = await simulate(to, data, value);
    if (!sim.ok) throw new Error(sim.reason);
    const e = await send(label, to, data, value, (hash) => {
      const p = { step, label, hash };
      pendingRef.current = p;
      setPending(p);
    });
    const cur = kRef.current;
    if (cur) { noteTx(cur, step as StepKey, { l: label, h: e.hash, s: e.status }); save(cur); }
    pendingRef.current = null;
    setPending(null);
    if (e.status !== "ok") throw new Error(e.reason || label + " " + e.status);
    return e;
  }, []);

  const doApprove = useCallback(async (step: string, token: string, spender: string, need: bigint, what: string) => {
    if ((await allowanceOf(token, spender)) >= need) return;
    await doTx(step, "Approve " + what, token, encode("approve", ["address", "uint256"], [spender, need]));
  }, [doTx]);

  const doServer = useCallback(async (step: string, kind: string, labels: ((j: any) => string)[]) => {
    const CFG = config();
    const cur = kRef.current;
    if (!cur) throw new Error("no case");
    const p = { step, server: true };
    pendingRef.current = p;
    setPending(p);
    let r: Response, j: any;
    try {
      r = await fetch(CFG.api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, caseId: cur.id, r1: cur.r1, r2: cur.r2, gap: cur.gap, borrower: runner.current.account }),
      });
      j = await r.json().catch(() => ({}));
    } finally {
      pendingRef.current = null;
      setPending(null);
    }
    if (!r.ok) {
      // the server's words are about the demo feed, not the visitor's wallet: never run them through plain()
      const e = new Error("Demo feed: " + (j.error || "answered " + r.status)) as Error & { server?: boolean };
      e.server = true;
      throw e;
    }
    const hs: string[] = j.hashes || [];
    hs.forEach((h, i) => {
      const main = labels.length - (hs.length - i);
      noteTx(cur, step as StepKey, { l: main >= 0 ? labels[main](j) : "Feed setup", h, s: "ok" });
    });
    save(cur);
    setTick((t) => t + 1);
    return j;
  }, []);

  runner.current.tx = (step, label, to, data, value) => doTx(step, label, to, data, value);
  runner.current.approve = (step, token, spender, need, what) => doApprove(step, token, spender, need, what);
  runner.current.server = (step, kind, labels) => doServer(step, kind, labels);
  runner.current.refresh = refresh;
  runner.current.now = chainNow;

  /* ---------------------------------------------------------------- the case */
  const freshId = useCallback(async (): Promise<number> => {
    const max = await latestCaseId();
    // a random offset keeps two visitors starting at once from picking the same number
    let id = Math.max(max, 9) + 1 + Math.floor(Math.random() * 50);
    return id;
  }, []);

  const probeId = useCallback(async (from: number): Promise<number> => {
    const CFG = config();
    for (let i = 0; i < 20; i++) {
      const id = from + i;
      const e = await call(CFG.lantern, SEL.escrowOf + BigInt(id).toString(16).padStart(64, "0"));
      const z = await call(CFG.market, SEL.seizureOf + BigInt(id).toString(16).padStart(64, "0"));
      const eExists = (e.slice(2 + 8 * 64, 2 + 9 * 64).length === 64) && BigInt("0x" + (e.slice(2 + 8 * 64, 2 + 9 * 64) || "0")) === 1n;
      const sState = BigInt("0x" + (z.slice(2 + 4 * 64, 2 + 5 * 64) || "0"));
      if (!eExists && sState === 0n) return id;
    }
    return from + 20;
  }, []);

  const newCase = useCallback(async () => {
    if (busyRef.current) return;
    setBusy("new");
    busyRef.current = "new";
    setError("");
    try {
      await refresh();
      const snap = sRef.current;
      if (!snap) throw new Error("no chain state");
      const last = Math.max(snap.subj.round, snap.peerLast.round);
      const id = await probeId(await freshId());
      const next: Store = {
        id, r1: last + 1, r2: last + 2,
        gap: kRef.current?.gap ?? 1500,
        tx: {},
        start: { required: snap.required.toString(), errors: snap.errors.toString(), borrower: runner.current.account },
        pending: null,
      };
      kRef.current = next;
      setK(next);
      save(next);
    } catch (e) {
      setError(plain(e));
    }
    await refresh();
    save(kRef.current);
    setBusy(null);
    busyRef.current = null;
  }, [refresh, freshId, probeId]);

  const setGap = useCallback((bps: number) => {
    const cur = kRef.current;
    if (!cur) return;
    cur.gap = bps;
    kRef.current = { ...cur };
    setK(kRef.current);
    save(kRef.current);
  }, []);

  const runStep = useCallback(async (key: StepKey) => {
    if (busyRef.current || !sRef.current) return;
    const snap = sRef.current;
    const cur = kRef.current;
    const prices: Prices = cur
      ? { ...deriveHonest(snap, asKey(cur)), spread: 0n }
      : { pH: 0n, L: 0n, peerV: 0n, spread: 0n };
    prices.spread = absBps(prices.L, prices.peerV);
    const view = steps(runner.current, prices).find((v) => v.key === key);
    if (!view || view.st !== "ready" || !view.run) return;
    if (gate(runner.current) || pendingRef.current) return;
    if (cur && !cur.start.borrower && runner.current.account) {
      cur.start.borrower = runner.current.account;
      save(cur);
    }
    setBusy(key);
    busyRef.current = key;
    setError("");
    try {
      await view.run();
    } catch (e) {
      setError(plain(e));
    }
    // stay locked until the chain read after the step has landed, so the step just run is never
    // offered again from the state before it
    await refresh();
    setBusy(null);
    busyRef.current = null;
    try { await refreshBalances(); } catch { /* the next poll picks it up */ }
    reloadCases();
  }, [refresh, reloadCases]);

  const position = useCallback(async (label: string, fn: (r: Runner) => Promise<void>) => {
    if (busyRef.current) return;
    setBusy("position");
    busyRef.current = "position";
    setError("");
    try { await fn(runner.current); } catch (e) { setError(plain(e)); }
    await refresh();
    setBusy(null);
    busyRef.current = null;
    reloadCases();
  }, [refresh, reloadCases]);

  const connectOrSwitch = useCallback(async () => {
    try {
      if (!(globalThis as any).ethereum) {
        window.open("https://metamask.io/download/", "_blank");
        return;
      }
      if (!W.account) await connect();
      if (W.chain !== config().chainId) await switchChain();
      setWallet({ account: W.account, chain: W.chain });
    } catch (e) {
      setError(plain(e));
    }
    await refresh();
  }, [refresh]);

  /* ---------------------------------------------------------------- lifecycle */
  useEffect(() => {
    const cur = load();
    if (cur) { kRef.current = cur; setK(cur); }
    silentReconnect()
      .then(() => { setWallet({ account: W.account, chain: W.chain }); return refresh(); })
      .then(() => { setReady(true); reloadCases(); }, () => { setReady(true); reloadCases(); });
  }, [refresh, reloadCases]);

  useEffect(() => {
    const p = (globalThis as any).ethereum;
    if (!p || !p.on) return;
    const onAcc = (a: string[]) => { W.account = (a && a[0]) || null; setWallet({ account: W.account, chain: W.chain }); refresh(); };
    const onChain = (c: string) => { W.chain = parseInt(c, 16); setWallet({ account: W.account, chain: W.chain }); refresh(); };
    p.on("accountsChanged", onAcc);
    p.on("chainChanged", onChain);
    return () => {
      if (p.removeListener) { p.removeListener("accountsChanged", onAcc); p.removeListener("chainChanged", onChain); }
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      if (document.hidden || busyRef.current) return;
      refresh();
    }, pending ? 5000 : 15000);
    return () => clearInterval(t);
  }, [ready, refresh, pending]);

  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => { if (!document.hidden) reloadCases(); }, 30000);
    return () => clearInterval(t);
  }, [ready, reloadCases]);

  // The runner is what the step table is computed from, so it is synced here rather than in an
  // effect: a case created in this render must be the case the table is built for, not the previous
  // one. Deferring this to an effect left the freshly created case's rounds compared against zero.
  runner.current.account = wallet.account;
  runner.current.chain = wallet.chain;
  runner.current.owner = k?.start.borrower ?? null;
  runner.current.k = k ? asKey(k) : { id: 0, r1: 0, r2: 0, gap: 1500 };
  runner.current.s = sRef.current as Snapshot;

  const prices = useMemo<Prices | null>(() => {
    if (!s || !k) return null;
    const d = deriveHonest(s, asKey(k));
    return { ...d, spread: absBps(d.L, d.peerV) };
  }, [s, k]);

  const views = useMemo<StepView[]>(() => {
    if (!s || !k || !prices || !ready) return [];
    try { return steps(runner.current, prices); } catch { return []; }
  }, [s, k, prices, ready, tick]); // tick: the deadline countdown moves every second

  const g = useMemo(() => (s ? gate(runner.current) : null), [s, wallet, k, ready, tick]);

  const value: Protocol = {
    ready, online, error, account: wallet.account, chain: wallet.chain,
    s, prices, case: k, views, gate: g, busy, pending,
    cases, casesLoaded, now: chainNow(),
    canAct: !busy && !pending && !g,
    connectOrSwitch, refresh, reloadCases, runStep, newCase, setGap, position,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
