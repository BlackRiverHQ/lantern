"use client";

/* Cases — every liquidation on chain, and the transactions that decided it.
   The detail adds the one thing a record can still be missing: a seizure nobody has settled, which
   anyone may move, and the buttons for it live on the row that names it. */

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useProtocol } from "@/components/protocol";
import { CaseTable } from "@/components/CaseTable";
import { RESULT_TEXT, type CaseRecord } from "@/lib/chain/cases";
import { config } from "@/lib/chain/config";
import { encode } from "@/lib/chain/abi";
import { short, hold } from "@/lib/format";

const LABEL: Record<string, string> = {
  LiquidationRecorded: "Liquidated, profit held",
  Liquidated: "Collateral taken",
  ChallengeOpened: "Challenged",
  ChallengeUpheld: "Proof upheld",
  ChallengeRefused: "Proof refused",
  ChallengeVoided: "Challenge voided",
  BonusReleased: "Profit released",
  SeizureClaimed: "Settled",
};

export default function CasesPage() {
  return (
    <Suspense fallback={<>
      <div className="head"><h1>Cases</h1></div>
      <div className="card"><div className="card-b"><span className="muted">Reading the chain…</span></div></div>
    </>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const p = useProtocol();
  const params = useSearchParams();
  const selected = params.get("case");
  const c = useMemo(
    () => (selected ? p.cases.find((x) => String(x.id) === selected) || null : null),
    [selected, p.cases]
  );

  return (
    <>
      <div className="head">
        <h1>Cases</h1>
        <div className="sub">{p.casesLoaded ? p.cases.length + " recorded on this deployment" : "reading the chain…"}</div>
      </div>

      {p.error ? <div className="err" role="alert">{p.error}</div> : null}

      <div className="card">
        <div className="card-b flush">
          <CaseTable
            cases={p.cases}
            account={p.account}
            empty={p.casesLoaded
              ? <>No liquidation has been recorded on this deployment yet. <a href="/dashboard/run/" style={{ textDecoration: "underline" }}>Run the first one.</a></>
              : "Reading the chain…"}
          />
        </div>
      </div>

      {c ? <Detail c={c} /> : null}
    </>
  );
}

function Detail({ c }: { c: CaseRecord }) {
  const p = useProtocol();
  const decidedUnsettled = c.outcome !== null && c.outcome !== 0 && !c.settled;
  const windowClosed =
    c.outcome === 0 && !c.challengeOpen && c.deadline !== null && c.deadline <= p.now;

  const settle = () => {
    if (decidedUnsettled) {
      p.position("Settle case #" + c.id, async (run) => {
        await run.tx("position", "Settle case #" + c.id, config().market, encode("claim", ["uint256"], [c.id]));
      });
    } else {
      p.position("Release case #" + c.id, async (run) => {
        await run.tx("position", "Release case #" + c.id, config().lantern, encode("release", ["uint256"], [c.id]));
      });
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h2>Case #{c.id}</h2>
        <span className={`tag ${c.result}`}>{RESULT_TEXT[c.result][0]}</span>
      </div>
      <div className="card-b">
        <div className="kv" style={{ marginBottom: 4 }}>
          <span className="l"><i>borrower</i>{short(c.borrower)}</span>
          <span className="l"><i>profit held</i>{hold(c.bonus)}</span>
          <span className="l"><i>at block</i>{c.block.toLocaleString("en-US")}</span>
        </div>
        <ol className="ctl">
          {c.ev.map((e, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 16, padding: "10px 0", borderTop: "1px solid var(--line-2)", fontSize: 14 }}>
              <b style={{ fontWeight: 500 }}>{LABEL[e.n] || e.n}</b>
              <span className="muted mono" style={{ fontSize: 12 }}>block {e.block.toLocaleString("en-US")}</span>
              <a href={config().explorer + "/tx/" + e.tx} target="_blank" rel="noopener"
                style={{ fontSize: 13, borderBottom: "1px solid var(--line)" }}>View transaction ↗</a>
            </li>
          ))}
        </ol>
        {decidedUnsettled || windowClosed ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <span className="muted small">
              {decidedUnsettled ? "The escrow is decided and the market's seizure is still open." : "The window closed uncontested. The profit is still held."}
            </span>
            <button className="go" style={{ marginLeft: "auto" }} disabled={!p.canAct} onClick={settle}>
              {decidedUnsettled ? "Settle" : "Release to the liquidator"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
