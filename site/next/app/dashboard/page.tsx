"use client";

/* Overview — the state of the feed and the money it is holding.
   Four vitals, then the rows that need a decision, then the liquidations themselves. The tiles are
   not a summary of the page below them: the bond, the history depth, the held bonuses and the
   caught lies are the four facts that decide whether a print can be priced at all, and whether
   anything on chain is waiting for someone to move it. */

import Link from "next/link";
import { useProtocol } from "@/components/protocol";
import { CaseTable } from "@/components/CaseTable";
import { attention } from "@/lib/attention";
import { absBps, fx, mmss, pct, usd } from "@/lib/format";
import { config, TOLERANCE_BPS } from "@/lib/chain/config";
import { encode } from "@/lib/chain/abi";

export default function Overview() {
  const p = useProtocol();
  const s = p.s;
  const rows = s ? attention(s, p.cases, p.now, p.account) : [];

  // the clock on the open windows, taken from the escrows the cases list already read
  const openCases = p.cases.filter((c) => c.outcome === 0 && c.deadline !== null && c.deadline > p.now);
  const soonest = openCases.length ? Math.min(...openCases.map((c) => c.deadline! - p.now)) : null;

  const spread = s && s.subj.exists ? absBps(s.subj.value, s.cl) : 0n;
  const bondOk = s ? s.bond >= s.required : true;

  const act = (kind: "release" | "claim", id: number, label: string) => {
    const CFG = config();
    const to = kind === "release" ? CFG.lantern : CFG.market;
    p.position(label + " case #" + id, async (run) => {
      await run.tx("position", label + " case #" + id, to, encode(kind, ["uint256"], [id]));
    });
  };

  return (
    <>
      <div className="head">
        <h1>Feed and money</h1>
        <div className="sub">{s ? "read at block " + s.block.toLocaleString("en-US") : "reading the chain…"}</div>
      </div>

      <div className="tiles">
        <div className={"tile" + (bondOk ? "" : " alarm")}>
          <div className="k">Feed bond</div>
          <div className="v mono">{s ? fx(s.bond, 6, 2) : "—"}</div>
          <div className="n">{s ? "HOLD, against " + fx(s.required, 6, 2) + " required" : "—"}</div>
        </div>
        <div className="tile">
          <div className="k">History depth</div>
          <div className="v">{s ? s.subj.samples : "—"}</div>
          <div className="n">{s ? (s.priceable ? "prints behind the last one, enough to price on" : "too thin to price a liquidation on") : "—"}</div>
        </div>
        <div className={"tile" + (openCases.length > 0 ? " alarm" : "")}>
          <div className="k">Held bonuses</div>
          <div className="v">{s ? openCases.length : "—"}</div>
          <div className="n">
            {!s ? "—"
              : soonest !== null ? "windows open, next closes in " + mmss(soonest)
              : "no window open"}
          </div>
        </div>
        <div className={"tile" + (s && s.errors > 0n ? " good" : "")}>
          <div className="k">Caught lies</div>
          <div className="v">{s ? s.errors.toString() : "—"}</div>
          <div className="n">{s && s.errors > 0n ? "prints the feed was caught on" : "no print challenged yet"}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-h">
          <h2>Needs a decision</h2>
          <span className="meta">{rows.length === 0 ? "nothing" : rows.length + (rows.length === 1 ? " row" : " rows")}</span>
        </div>
        <div className="card-b flush">
          {rows.length === 0 ? (
            <div className="empty">
              <b>Nothing is waiting.</b> Every held bonus has been decided and every seizure settled. A
              case puts money here again — <Link href="/dashboard/run/" style={{ textDecoration: "underline" }}>run one</Link>.
            </div>
          ) : (
            <div className="tbl attn">
              {rows.map((r) => (
                <div className="r" key={r.key}>
                  <span>
                    <b style={{ fontWeight: 500 }}>{r.what}</b>
                    <br />
                    <small className="muted mono">{r.detail}</small>
                  </span>
                  <span className="muted mono" style={{ fontSize: 12.5 }}>{r.when}</span>
                  {r.action ? (
                    <button className="go" disabled={!p.canAct}
                      onClick={() => act(r.action!.kind, r.action!.id, r.action!.label)}>
                      {r.action.label}
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: 12.5 }}>the feed&#8217;s move</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h2>Liquidations</h2>
          <span className="meta"><Link href="/dashboard/cases/">All cases →</Link></span>
        </div>
        <div className="card-b flush">
          <CaseTable
            cases={p.cases.slice(0, 5)}
            account={p.account}
            mini
            empty={p.casesLoaded ? "No liquidation has been recorded on this deployment yet." : "Reading the chain…"}
          />
        </div>
      </div>

      {s && s.subj.exists ? (
        <div className="tbl attn" style={{ marginTop: 18 }}>
          <div className="r">
            <span className="muted" style={{ fontSize: 13 }}>
              The feed&#8217;s last print against the second source, same round
            </span>
            <span className="num">{usd(s.subj.value)} vs {usd(s.cl)}</span>
            <span className={spread > TOLERANCE_BPS ? "tag refused" : "tag released"}>
              {pct(spread)}{spread > TOLERANCE_BPS ? ", provable" : ", within tolerance"}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
