"use client";

/* Prove — the bonus somebody else's liquidation is holding, and the claim a stranger can make on it.

   This is the page the protocol's whole argument rests on: nothing here belongs to the visitor. Every
   row is another party's case, already liquidated, inside its five-minute window. The page reads the
   print the feed made for that case's own round and the print the feed's declared second source made
   for the same round, re-runs the comparison `Verdicts.evaluate` will run, and offers the stake only
   where the contract's own arithmetic says the claim holds. The contract recomputes it; this page
   only shows the visitor the sum before they pay to find out. */

import { useEffect, useRef, useState } from "react";
import { useProtocol } from "@/components/protocol";
import { CROSS_SOURCE, TOLERANCE_BPS, config } from "@/lib/chain/config";
import { encode } from "@/lib/chain/abi";
import { claimable, isHeld, provableCases, type Provable } from "@/lib/chain/prove";
import { RESULT_TEXT } from "@/lib/chain/cases";
import { canChallenge } from "@/lib/case/prove";
import { hold, mmss, pct, usd } from "@/lib/format";

export default function ProvePage() {
  const p = useProtocol();
  const [rows, setRows] = useState<Provable[] | null>(null);
  const [err, setErr] = useState("");

  // the chain facts only: which held bonuses exist, what each round printed, and what a claim pays.
  // The window itself is recomputed on every render from the ticking clock, not frozen at read time.
  //
  // Keyed to the provider's case list, and to nothing that ticks. Keyed to the block, this read was
  // restarted every few seconds and cancelled by its own refresh before it could land, so the page
  // sat on "Reading the chain…" forever; and reading an empty list while the cases were still
  // loading let that empty answer race the real one and win. So: wait for the cases, read the array
  // this effect was created for, and refresh when the provider reloads them (mount, after a
  // transaction, and its own 30s cadence).
  const stakeRef = useRef({ minStake: 0n, bounty: 0n });
  stakeRef.current = { minStake: p.s?.minStake ?? 0n, bounty: p.s?.bounty ?? 0n };

  const caseTick = p.cases;
  useEffect(() => {
    if (!p.ready || !p.casesLoaded) return;
    let gone = false;
    const { minStake, bounty } = stakeRef.current;
    provableCases(caseTick, Math.floor(Date.now() / 1000), minStake, bounty)
      .then((r) => { if (!gone) { setRows(r); setErr(""); } })
      .catch((e) => { if (!gone) setErr(String((e as Error).message || e)); });
    return () => { gone = true; };
  }, [p.ready, p.casesLoaded, caseTick]);

  const ready = rows !== null;
  const held = rows ? rows.filter(isHeld) : [];
  const decided = rows ? rows.filter((r) => !isHeld(r)) : [];
  const winnable = rows ? claimable(rows).filter((r) => canChallenge(
    { exists: r.c.exists, outcome: r.c.outcome ?? 0, deadline: r.c.deadline, challengeOpen: r.c.challengeOpen },
    p.now,
  ).open) : [];

  return (
    <>
      <div className="head">
        <h1>Prove a price contradicted the record</h1>
        <div className="sub">
          {ready ? held.length + " held, " + decided.length + " decided on this deployment" : "reading the chain…"}
        </div>
      </div>

      {p.error ? <div className="err" role="alert">{p.error}</div> : null}
      {err ? <div className="err" role="alert">Could not read the held bonuses ({err}).</div> : null}

      <div className="gate">
        <span>
          These are other people&rsquo;s cases. Anyone may challenge one &mdash; no account, no role.
          {p.account ? " Staking a claim needs HOLD for the stake and test ETH for gas." : " Reading needs no wallet; staking does."}
        </span>
        {!p.account ? (
          <button className="go" style={{ marginLeft: "auto" }} onClick={p.connectOrSwitch}>Connect wallet</button>
        ) : null}
      </div>

      {ready && winnable.length > 0 ? (
        <div className="note">
          {winnable.length} held bonus{winnable.length === 1 ? "" : "es"} can be claimed right now: the two sources are
          further apart than the {pct(TOLERANCE_BPS)} the contract allows, and the window is still open.
        </div>
      ) : null}

      <div className="card">
        <div className="card-h">
          <h2>Held bonuses</h2>
          <span className="meta">the contract recomputes every verdict</span>
        </div>
        <div className="card-b flush">
          <div className="tbl prove">
            <div className="r th">
              <span>Case</span>
              <span>Printed that round</span>
              <span>Second source, same round</span>
              <span>Apart</span>
              <span>Stake &rarr; pays</span>
              <span />
            </div>
            {rows === null ? (
              <div className="empty">Reading the chain…</div>
            ) : held.length === 0 ? (
              <div className="empty">
                <b>No bonus is being held right now.</b> A bonus appears here the moment a liquidation is
                recorded, and stays for the length of the challenge window.{" "}
                <a href="/dashboard/run/" style={{ textDecoration: "underline" }}>Run a case</a> to make one,
                or watch this page &mdash; it re-reads the chain every 30 seconds.
                {decided.length > 0 ? " The verdicts below show the comparison this page makes on cases that are already decided." : ""}
              </div>
            ) : (
              held.map((r) => <Row key={r.c.id} r={r} now={p.now} />)
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h2>Verdicts this deployment has reached</h2>
          <span className="meta">this page&rsquo;s read, beside the verdict the contract recorded</span>
        </div>
        <div className="card-b flush">
          <div className="tbl prove">
            <div className="r th">
              <span>Case</span>
              <span>Printed that round</span>
              <span>Second source, same round</span>
              <span>Apart</span>
              <span>This page says</span>
              <span>Contract recorded</span>
            </div>
            {rows === null ? (
              <div className="empty">Reading the chain…</div>
            ) : decided.length === 0 ? (
              <div className="empty">No case on this deployment has been decided yet.</div>
            ) : (
              decided.map((r) => <DecidedRow key={r.c.id} r={r} />)
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h"><h3>What the button sends</h3></div>
        <div className="card-b">
          <div className="kv">
            <span className="l"><i>1</i>approve(HOLD &rarr; Lantern, the stake)</span>
            <span className="l"><i>2</i>openChallenge(case, {CROSS_SOURCE}, the peer feed id, the stake)</span>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Both go to your wallet, so you see them before they are sent. The contract then re-reads both feeds
            at that case&rsquo;s round and decides: if the two are apart past {pct(TOLERANCE_BPS)} the claim is
            upheld, the borrower is made whole out of the held profit, and you are paid your stake back plus the
            bounty charged to the feed&rsquo;s own bond. If they are not, the claim is refused and your stake goes
            to the liquidator &mdash; which is the whole reason this page refuses to offer the button where the
            arithmetic does not hold.
          </p>
        </div>
      </div>
    </>
  );
}

function Row({ r, now }: { r: Provable; now: number }) {
  const p = useProtocol();
  const w = canChallenge(
    { exists: r.c.exists, outcome: r.c.outcome ?? 0, deadline: r.c.deadline, challengeOpen: r.c.challengeOpen },
    now,
  );
  const v = r.v;
  const canPay = p.s ? p.s.hold >= r.stake : false;
  const gas = p.s ? p.s.eth > 0n : false;

  return (
    <div className="r">
      <span className="id">
        <a href={"/dashboard/cases/?case=" + r.c.id} style={{ borderBottom: "1px solid var(--line)" }}>#{r.c.id}</a>
        <span className="small muted" style={{ display: "block" }}>round {r.round}</span>
      </span>

      <span className="num">{r.subj && r.subj.exists ? usd(r.subj.value) : <span className="muted">no print</span>}</span>

      <span className="num">
        {r.peer && r.peer.exists ? usd(r.peer.value) : <span className="muted">no print</span>}
        <span className="small muted" style={{ display: "block" }}>
          {r.peerId === "0x" + "0".repeat(64) ? "this feed declares no second source" : "declared peer"}
        </span>
      </span>

      <span>
        {v ? (
          <>
            <span className={"tag " + (v.upheld ? "upheld" : "refused")}>{pct(v.spread)}</span>
            <span className="small muted" style={{ display: "block", marginTop: 4 }}>limit {pct(v.bound)}</span>
          </>
        ) : <span className="muted small">—</span>}
      </span>

      <span className="num">
        {hold(r.stake)} <span className="muted">&rarr;</span> {hold(r.pay.total)}
        <span className="small muted" style={{ display: "block" }}>bounty out of the bond</span>
      </span>

      <span style={{ textAlign: "right" }}>
        {w.open && v && v.upheld ? (
          <>
            <button className="go" disabled={!p.canAct || !canPay || !gas} onClick={() => prove(p, r)}>
              Stake {hold(r.stake)}
            </button>
            <span className="small muted" style={{ display: "block", marginTop: 6 }}>
              {!gas ? "needs test ETH for gas" : !canPay ? "needs " + hold(r.stake) : mmss(w.left) + " left"}
            </span>
          </>
        ) : (
          <>
            <span className="small muted">{w.open ? (v ? v.why : "no second source to compare against") : w.why}</span>
            {w.open && v && !v.upheld ? <span className="small muted" style={{ display: "block", marginTop: 4 }}>nothing to stake on</span> : null}
          </>
        )}
      </span>
    </div>
  );
}

/** A case the contract has already decided. Its purpose on this page is to hold the page's own
 *  comparison up against the verdict the chain recorded, so a reader can check the page rather than
 *  trust it — and a row where the two disagree says so. */
function DecidedRow({ r }: { r: Provable }) {
  const v = r.v;
  const said = v ? (v.upheld ? "upheld" : "refused") : "";
  const got = RESULT_TEXT[r.c.result][0];
  const agrees = v ? (v.upheld ? r.c.result === "upheld" : r.c.result !== "upheld") : null;

  return (
    <div className="r">
      <span className="id">
        <a href={"/dashboard/cases/?case=" + r.c.id} style={{ borderBottom: "1px solid var(--line)" }}>#{r.c.id}</a>
        <span className="small muted" style={{ display: "block" }}>round {r.round}</span>
      </span>

      <span className="num">{r.subj && r.subj.exists ? usd(r.subj.value) : <span className="muted">no print</span>}</span>

      <span className="num">{r.peer && r.peer.exists ? usd(r.peer.value) : <span className="muted">no print</span>}</span>

      <span>
        {v
          ? <span className={"tag " + (v.upheld ? "upheld" : "refused")}>{pct(v.spread)}</span>
          : <span className="muted small">—</span>}
      </span>

      <span className="small">
        {v ? said : "no second source"}
        {agrees === false ? <span className="muted"> &mdash; differs</span> : null}
      </span>

      <span style={{ textAlign: "right" }}>
        <span className={"tag " + r.c.result}>{got}</span>
      </span>
    </div>
  );
}

function prove(p: ReturnType<typeof useProtocol>, r: Provable) {
  const CFG = config();
  p.position("Prove case #" + r.c.id, async (run) => {
    await run.approve("position", CFG.asset, CFG.lantern, r.stake, "stake");
    await run.tx("position", "Prove case #" + r.c.id, CFG.lantern,
      encode("openChallenge", ["uint256", "uint8", "bytes", "uint256"],
        [r.c.id, CROSS_SOURCE, r.peerId, r.stake]));
  });
}
