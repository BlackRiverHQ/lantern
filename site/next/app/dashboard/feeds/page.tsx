"use client";

/* Feeds and bonds — the operator's side of the protocol.

   A feed is not an account the dashboard owns: it is a bond that stands behind every print, and the
   second source it is reconciled against. Anyone may register one (the contract sets the caller as
   its operator); only that operator may bond it or declare its peer. This page reads both live and
   shows what each one still lacks, so the operator path is performed against real state rather than
   described. */

import { useEffect, useMemo, useState } from "react";
import { useProtocol } from "@/components/protocol";
import { config } from "@/lib/chain/config";
import { encBytes32, encode } from "@/lib/chain/abi";
import { readFeeds, type FeedView } from "@/lib/chain/feeds";
import { hold, short, usd } from "@/lib/format";

const ZERO32 = "0x" + "0".repeat(64);
const DECIMALS = 6; // must equal the asset's own decimals, or the contract refuses the feed
const STORE = "lantern.feed";

type Mine = { name: string; id: string; label: string };

function loadMine(): Mine | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const m = JSON.parse(raw) as Mine;
    return m && m.id && m.label ? m : null;
  } catch { return null; }
}

export default function FeedsPage() {
  const p = useProtocol();
  const [feeds, setFeeds] = useState<FeedView[] | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => setMine(loadMine()), []);

  const ids = useMemo(() => {
    const CFG = config();
    return [CFG.subject, CFG.peer, ...(mine ? [mine.id] : [])];
  }, [mine]);

  useEffect(() => {
    if (!p.ready) return;
    let gone = false;
    // keyed to readiness, not to the block: a read keyed to the snapshot that triggers it can be
    // thrown away by its own refresh and never land. readFeeds depends on nothing that ticks, so a
    // slow interval is enough to keep the bonds and exposures current.
    const read = () => {
      readFeeds(ids)
        .then((f) => { if (!gone) { setFeeds(f); setErr(""); } })
        .catch((e) => { if (!gone) setErr(String((e as Error).message || e)); });
    };
    read();
    const t = setInterval(read, 30000);
    return () => { gone = true; clearInterval(t); };
  }, [p.ready, ids]);

  const CFG = config();
  const my = mine ? feeds?.find((f) => f.id === mine.id) ?? null : null;

  /** The feed id is derived from the operator's own address, so two visitors naming a feed the same
   *  thing do not collide, and the id is recoverable after a reload from the label alone. */
  const register = () => {
    if (!p.account) return;
    const text = name.trim() || "my feed";
    const label = text + ":" + p.account.toLowerCase();
    const id = "0x" + encBytes32(label);
    p.position("Register " + text, async (run) => {
      await run.tx("position", "Register feed " + text, CFG.lantern,
        encode("registerFeed", ["bytes32", "bytes32", "uint8"], [label, "signers:" + label, DECIMALS]));
    });
    const m = { name: text, id, label };
    try { localStorage.setItem(STORE, JSON.stringify(m)); } catch { /* the feed still exists on chain */ }
    setMine(m);
  };

  const deposit = (f: FeedView) => {
    const need = f.required - f.bond;
    p.position("Bond " + short(f.id), async (run) => {
      await run.approve("position", CFG.asset, CFG.lantern, need, "bond");
      await run.tx("position", "Deposit " + hold(need) + " behind " + short(f.id), CFG.lantern,
        encode("depositBond", ["bytes32", "uint256"], [f.id, need]));
    });
  };

  const declarePeer = (f: FeedView) => {
    p.position("Declare peer", async (run) => {
      await run.tx("position", "Declare the second source", CFG.lantern,
        encode("setPeerFeed", ["bytes32", "bytes32"], [f.id, CFG.peer]));
    });
  };

  const withdraw = (f: FeedView) => {
    const free = f.bond - f.required;
    p.position("Withdraw surplus", async (run) => {
      await run.tx("position", "Withdraw " + hold(free) + " of surplus", CFG.lantern,
        encode("withdrawBond", ["bytes32", "uint256"], [f.id, free]));
    });
  };

  return (
    <>
      <div className="head">
        <h1>Feeds and bonds</h1>
        <div className="sub">{feeds ? feeds.filter((f) => f.registered).length + " registered on this deployment" : "reading the chain…"}</div>
      </div>

      {p.error ? <div className="err" role="alert">{p.error}</div> : null}
      {err ? <div className="err" role="alert">Could not read the feeds ({err}).</div> : null}

      <div className="gate">
        <span>
          A feed posts the bond that stands behind every price it publishes, and the bond is what pays a
          prover when one of its prints is caught. Anyone may register a feed; only its operator may bond
          it or declare the second source it is compared against.
        </span>
        {!p.account ? <button className="go" style={{ marginLeft: "auto" }} onClick={p.connectOrSwitch}>Connect wallet</button> : null}
      </div>

      <div className="card">
        <div className="card-h">
          <h2>This deployment&rsquo;s feeds</h2>
          <span className="meta">bond vs. what the contract requires</span>
        </div>
        <div className="card-b flush">
          <div className="tbl feed">
            <div className="r th">
              <span>Feed</span><span>Operator</span><span>Bond</span><span>Exposure</span><span>Caught</span><span>Second source</span><span>Can price</span>
            </div>
            {feeds === null ? (
              <div className="empty">Reading the chain…</div>
            ) : (
              feeds.slice(0, 2).map((f, i) => (
                <div className="r" key={f.id}>
                  <span>
                    {i === 0 ? "The demo feed" : "Its second source"}
                    <span className="small muted mono" style={{ display: "block" }}>{short(f.id)}</span>
                  </span>
                  <span className="mono small">
                    {short(f.operator)}
                    {p.account && f.operator.toLowerCase() === p.account.toLowerCase() ? <em className="you">you</em> : null}
                  </span>
                  <span className="num">
                    {hold(f.bond)}
                    <span className="small muted" style={{ display: "block" }}>needs {hold(f.required)}</span>
                  </span>
                  <span className="num">{hold(f.exposure)}</span>
                  <span className="num">{f.errors.toString()}</span>
                  <span className="mono small">{f.peerId === ZERO32 ? <span className="muted">none declared</span> : short(f.peerId)}</span>
                  <span>
                    <span className={"tag " + (f.priceable ? "upheld" : "refused")}>{f.priceable ? "yes" : "no"}</span>
                    {f.last ? <span className="small muted" style={{ display: "block", marginTop: 4 }}>last {usd(f.last.value)}</span> : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h2>Register your own feed</h2>
          <span className="meta">the caller becomes its operator</span>
        </div>
        <div className="card-b">
          {!p.account ? (
            <p className="small muted">
              A feed is tied to the wallet that registers it, so connect first. The id is derived from your
              address and the name below, which means the same name in two wallets is two different feeds.
            </p>
          ) : my ? (
            <MyFeed f={my} mine={mine!} p={p} onDeposit={deposit} onPeer={declarePeer} onWithdraw={withdraw} />
          ) : (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                Give it a name. The contract sets you as the operator, requires the asset&rsquo;s own decimals
                ({DECIMALS}), and asks for a bond before the feed may price anything &mdash; a feed with no bond
                cannot publish.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="a short name for your feed"
                  aria-label="Feed name"
                  style={{ flex: "1 1 260px", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: "var(--r)", font: "inherit", background: "var(--card)" }}
                />
                <button className="btn" disabled={!p.canAct} onClick={register}>Register the feed</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function MyFeed({ f, mine, p, onDeposit, onPeer, onWithdraw }: {
  f: FeedView;
  mine: Mine;
  p: ReturnType<typeof useProtocol>;
  onDeposit: (f: FeedView) => void;
  onPeer: (f: FeedView) => void;
  onWithdraw: (f: FeedView) => void;
}) {
  const CFG = config();
  const shortfall = f.required > f.bond ? f.required - f.bond : 0n;
  const surplus = f.bond > f.required ? f.bond - f.required : 0n;
  const needsHold = shortfall > 0n && p.s ? p.s.hold < shortfall : false;

  return (
    <>
      <div className="kv" style={{ marginBottom: 6 }}>
        <span className="l"><i>name</i>{mine.name}</span>
        <span className="l"><i>feed id</i>{f.id}</span>
        <span className="l"><i>operator</i>{short(f.operator)}<em className="you">you</em></span>
        <span className="l"><i>bond</i>{hold(f.bond)} <span className="muted">of {hold(f.required)} required</span></span>
        <span className="l"><i>exposure</i>{hold(f.exposure)}</span>
        <span className="l"><i>second source</i>{f.peerId === ZERO32 ? <span className="muted">not declared</span> : short(f.peerId)}</span>
        <span className="l"><i>can price</i>{f.priceable ? "yes" : "no"}</span>
      </div>

      <ol style={{ listStyle: "none", margin: "14px 0 0", padding: 0 }}>
        <Step n={1} title="Registered" done={f.registered} />
        <Step
          n={2}
          title={"Bond the feed" + (shortfall > 0n ? " \u2014 " + hold(shortfall) + " short" : "")}
          done={f.priceable}
          note={f.priceable
            ? "The bond covers the feed's exposure, so it may price a liquidation."
            : "A feed with no bond cannot publish. The deposit goes to your wallet for approval first."}
          action={shortfall > 0n ? (
            <>
              <button className="go" disabled={!p.canAct || needsHold} onClick={() => onDeposit(f)}>Deposit {hold(shortfall)}</button>
              {needsHold ? <span className="small muted" style={{ marginLeft: 10 }}>needs {hold(shortfall)} in your wallet</span> : null}
            </>
          ) : surplus > 0n ? (
            <button className="ghost sm" disabled={!p.canAct} onClick={() => onWithdraw(f)}>Withdraw {hold(surplus)} of surplus</button>
          ) : null}
        />
        <Step
          n={3}
          title="Declare the second source"
          done={f.peerId !== ZERO32}
          note={f.peerId !== ZERO32
            ? "Declared. A challenge can now compare your prints against it."
            : "Declaring a peer is what makes your prints comparable, and it can only be done once \u2014 a peer that could be swapped after a liquidation would let a feed choose which comparison applies to a claim already made."}
          action={!f.peerId || f.peerId === ZERO32 ? (
            <button className="go" disabled={!p.canAct} onClick={() => onPeer(f)}>Declare {short(CFG.peer)} as the peer</button>
          ) : null}
        />
      </ol>
    </>
  );
}

function Step({ n, title, done, note, action }: {
  n: number; title: string; done: boolean; note?: string; action?: React.ReactNode;
}) {
  return (
    <li className={"rs " + (done ? "done" : "ready")}>
      <span className="rs-n">{done ? "✓" : n}</span>
      <span>
        <span className="rs-t">{title}</span>
        {note ? <span className="rs-p">{note}</span> : null}
        {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
      </span>
      <span className="rs-st">{done ? "done" : "next"}</span>
    </li>
  );
}
