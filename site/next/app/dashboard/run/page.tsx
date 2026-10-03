"use client";

/* Run a case — the mechanism, drivable end to end from this page.
   Each step is one button and one or more real transactions; every argument is derived from chain
   state rather than typed into a field, and a step is only offered once every step before it is
   done. The step table lives in lib/case/plan.ts; this file renders it. */

import { useMemo } from "react";
import Link from "next/link";
import { useProtocol } from "@/components/protocol";
import { config, TOLERANCE_BPS } from "@/lib/chain/config";
import { encode } from "@/lib/chain/abi";
import { absBps, fx, hold, pct, usd, weth } from "@/lib/format";
import { PREVIEW, STEP_TITLE, type StepKey, type StepView } from "@/lib/case/plan";

export default function RunPage() {
  const p = useProtocol();
  const s = p.s;
  const CFG = config();
  const k = p.case;
  const g = p.gate;
  const done = p.views.filter((v) => v.st === "done").length;

  return (
    <>
      <div className="head">
        <h1>{k ? "Case #" + k.id : "Run a case"}</h1>
        <div className="sub">
          {k && p.views.length ? done + " of " + p.views.length + " steps done" : "a feed lies, the market liquidates on it, you prove it"}
        </div>
      </div>

      {g ? (
        <div className="gate">
          <span>{g.why}</span>
          {g.kind === "connect" || g.kind === "chain" ? (
            <button className="link" onClick={p.connectOrSwitch}>{g.label}</button>
          ) : null}
          {g.kind === "gas" || g.kind === "nowallet" ? (
            <a className="link" href={g.link[0]} target="_blank" rel="noopener">{g.link[1]} ↗</a>
          ) : null}
        </div>
      ) : null}

      {p.error ? <div className="err" role="alert">{p.error}</div> : null}

      <Outcome />

      <div className="rgrid">
        <div className="card">
          <div className="card-h">
            <h2>{k ? "Case #" + k.id : "No case yet"}</h2>
            <span className="meta">
              <button className="ghost sm" onClick={p.newCase} disabled={!!p.busy || !!p.pending}>
                {k ? "New case" : "Start a case"}
              </button>
            </span>
          </div>

          {k && s && !(s.r2 && s.r2.exists) ? (
            <div className="gap">
              <label htmlFor="gapIn">How far the feed lies</label>
              <input id="gapIn" type="range" min={2} max={18} step={1} value={k.gap / 100}
                disabled={!!p.busy || !!p.pending}
                onChange={(e) => p.setGap(Number(e.target.value) * 100)} />
              <b>{k.gap / 100}% low</b>
              <span className="hint">
                {BigInt(k.gap) > TOLERANCE_BPS ? "over 5% off, so it is provable" : "5% or less: the proof will fail"}
              </span>
            </div>
          ) : null}

          <ol className="rsteps">
            {!k ? (
              <StepPreview />
            ) : !p.views.length || !s ? (
              <li className="rs-empty">Reading the case from the chain…</li>
            ) : (
              p.views.map((v, i) => <Step key={v.key} v={v} i={i} />)
            )}
          </ol>
        </div>

        <aside className="rail">
          <Prices />
          <WalletCard />
          <PositionCard />
        </aside>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- steps */

function StepPreview() {
  const order: StepKey[] = ["fund", "honest", "borrow", "lie", "liquidate", "challenge", "verdict", "claim"];
  const who: Record<StepKey, string> = {
    fund: "you", honest: "demo feed", borrow: "you", lie: "demo feed",
    liquidate: "liquidator", challenge: "you", verdict: "you", claim: "you",
  };
  return (
    <>
      {order.map((key, i) => (
        <li className="rs todo" key={key}>
          <span className="rs-n">{i + 1}</span>
          <div>
            <div className="rs-t">{STEP_TITLE[key]}<em>{who[key]}</em></div>
            <div className="rs-p">{PREVIEW[key]}</div>
          </div>
          <div />
        </li>
      ))}
    </>
  );
}

function Step({ v, i }: { v: StepView; i: number }) {
  const p = useProtocol();
  const inflight = p.busy === v.key || p.pending?.step === v.key;
  const st = inflight ? "busy" : v.st;
  const pendHash = p.pending?.step === v.key && p.pending.hash ? p.pending.hash : null;
  const txs = p.case?.tx[v.key] || [];

  return (
    <li className={"rs " + st}>
      <span className="rs-n">{v.st === "done" ? "✓" : i + 1}</span>
      <div>
        <div className="rs-t">{v.title}<em>{v.who}</em></div>
        {v.st === "todo" ? (
          <div className="rs-p">{v.preview}</div>
        ) : (
          <div className="rs-v">
            {v.vals.map((pair, n) => <span key={n}><i>{pair[0]}</i>{pair[1]}</span>)}
          </div>
        )}
        {v.note ? (
          <div className="rs-x">
            {v.note}{" "}
            {v.link ? <a href={v.link[0]} target="_blank" rel="noopener">{v.link[1]} ↗</a> : null}
          </div>
        ) : null}
        {pendHash ? (
          <div className="rs-tx">
            <a className="rs-l" href={config().explorer + "/tx/" + pendHash} target="_blank" rel="noopener">
              {p.pending?.label} (pending) ↗
            </a>
          </div>
        ) : null}
        <div className="rs-tx">
          {txs.map((t, n) => (
            <a key={n} className={"rs-l" + (t.s === "ok" ? "" : " bad")}
              href={config().explorer + "/tx/" + t.h} target="_blank" rel="noopener">
              {t.l} ↗
            </a>
          ))}
        </div>
      </div>
      <div className="rs-a">
        {st === "ready" && v.run ? (
          <button className="go" disabled={!p.canAct} onClick={() => p.runStep(v.key)}>{v.label || "Send"}</button>
        ) : (
          <span className="rs-st">
            {{ done: "Done", todo: "", ready: "", wait: "Waiting", blocked: "Blocked", busy: p.pending?.server ? "Demo feed working…" : "Confirming…" }[st]}
          </span>
        )}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- rail */

function Prices() {
  const p = useProtocol();
  const s = p.s;
  if (!s) {
    return (
      <div className="card"><div className="card-b">
        <h3>ETH price</h3>
        <div className="px">
          <div><div className="lab">Second source</div><div className="val">—</div></div>
          <div><div className="lab">Lantern feed</div><div className="val">—</div></div>
        </div>
      </div></div>
    );
  }
  const gap = s.subj.exists ? absBps(s.subj.value, s.cl) : 0n;
  const bad = gap > TOLERANCE_BPS;
  return (
    <div className="card"><div className="card-b">
      <h3>ETH price <span>{s.subj.exists ? pct(gap) + " apart" : ""}</span></h3>
      <div className="px">
        <div><div className="lab">Second source</div><div className="val">{usd(s.cl)}</div></div>
        <div><div className="lab">Lantern feed</div><div className="val">{s.subj.exists ? usd(s.subj.value) : "—"}</div></div>
      </div>
      <div className={"implied " + (s.subj.exists ? (bad ? "bad" : "ok") : "")}>
        {s.subj.exists
          ? bad ? "Off by " + pct(gap) + ". That is provable." : "Within " + pct(gap) + " of the second source."
          : ""}
      </div>
    </div></div>
  );
}

function WalletCard() {
  const p = useProtocol();
  const s = p.s;
  return (
    <div className="card"><div className="card-b">
      <h3>Your wallet</h3>
      {p.account && s ? (
        <div className="kv">
          <span className="l"><i>ETH</i>{fx(s.eth, 18, 6)}</span>
          <span className="l"><i>HOLD</i>{fx(s.hold, 6, 4)}</span>
          <span className="l"><i>WETH</i>{weth(s.weth).replace(" WETH", "")}</span>
        </div>
      ) : (
        <span className="muted small">Not connected</span>
      )}
    </div></div>
  );
}

function PositionCard() {
  const p = useProtocol();
  const s = p.s;
  const ratio = s?.hNow && s.hNow.limit > 0n ? Number((s.hNow.debt * 1000n) / s.hNow.limit) / 10 : 0;
  const can = p.canAct;
  const hasLoan = !!(s && s.hNow && s.hNow.limit > 0n);

  return (
    <div className="card"><div className="card-b">
      <h3>Your loan <span>{hasLoan ? ratio.toFixed(0) + "% of limit" : ""}</span></h3>
      {hasLoan ? (
        <div className={"bar" + (ratio > 100 ? " over" : ratio > 85 ? " near" : "")}
          style={{ "--w": Math.min(100, ratio) + "%" } as React.CSSProperties}>
          <i />
        </div>
      ) : (
        <div className="muted small">
          {p.account ? "No position on this deployment yet." : "Connect a wallet to see your position."}
        </div>
      )}
      <div className="kv">
        {p.account && s ? (
          <>
            <span className="l"><i>collateral</i>{weth(s.acct.posted)}</span>
            <span className="l"><i>debt</i>{hold(s.acct.debt)}</span>
            <span className="l"><i>limit at spot</i>{s.hNow ? hold(s.hNow.limit) : "—"}</span>
            <span className="l"><i>lent</i>{hold(s.acct.supplied)}</span>
          </>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 13 }}>
        <button className="ghost sm" disabled={!(can && !!s && s.acct.debt > 0n && s.hold >= s.acct.debt)}
          onClick={() => p.position("Repay", async (r) => {
            const debt = r.s.acct.debt;
            const CFG = config();
            await r.approve("position", CFG.asset, CFG.market, debt, "HOLD");
            await r.tx("position", "Repay " + hold(debt), CFG.market, encode("repay", ["uint256"], [debt]));
          })}>
          Repay
        </button>
        <button className="ghost sm" disabled={!(can && !!s && s.acct.debt === 0n && s.acct.posted > 0n)}
          onClick={() => p.position("Withdraw collateral", async (r) => {
            const put = r.s.acct.posted;
            await r.tx("position", "Withdraw " + weth(put), config().market, encode("withdrawCollateral", ["uint256"], [put]));
          })}>
          Withdraw collateral
        </button>
        {s && s.acct.supplied > 0n ? (
          <button className="ghost sm" disabled={!(can && s.idle > 0n)}
            onClick={() => p.position("Withdraw lent", async (r) => {
              const amt = r.s.acct.supplied < r.s.idle ? r.s.acct.supplied : r.s.idle;
              await r.tx("position", "Withdraw " + hold(amt) + " lent", config().market, encode("withdraw", ["uint256"], [amt]));
            })}>
            Withdraw lent
          </button>
        ) : null}
      </div>
    </div></div>
  );
}

/* ---------------------------------------------------------------- outcome */

function Outcome() {
  const p = useProtocol();
  const s = p.s;
  const k = p.case;
  const closed = !!(k && s && s.r2 && s.sz && s.sz.state !== 0 && s.esc && s.esc.outcome !== 0 && s.sz.state === 2);

  const rows: [string, string][] = useMemo(() => {
    if (!closed || !s || !k || !p.prices) return [];
    const d = p.prices;
    const up = s.esc!.outcome === 2;
    const bounty = up && s.ch?.upheld ? (s.esc!.bonus * s.bounty) / 10000n : 0n;
    const req0 = k.start ? BigInt(k.start.required) : s.required;
    const err0 = k.start ? BigInt(k.start.errors) : s.errors;
    const shared: [string, string][] = [
      ["The feed said", usd(d.L)],
      ["The second source said", usd(d.peerV)],
      ["Gap", pct(d.spread) + ", limit " + pct(TOLERANCE_BPS)],
    ];
    if (up) {
      return [...shared,
        ["Collateral returned", weth(s.sz!.collateral)],
        ["Profit you received", hold(s.esc!.bonus)],
        ["Bounty from the feed's bond", hold(bounty)],
        s.required !== req0
          ? ["Feed's required bond", hold(req0) + " → " + hold(s.required)]
          : ["Feed's caught lies", err0.toString() + " → " + s.errors.toString()],
      ];
    }
    return [...shared,
      ["The liquidator kept", hold(s.esc!.bonus) + " profit"],
      ["Collateral taken", weth(s.sz!.collateral)],
      [s.ch?.open ? "Your stake" : "Challenge", s.ch?.open ? hold(s.ch.stake) + " went to the liquidator" : "none in the window"],
      ["Feed's caught lies", err0.toString() + " → " + s.errors.toString()],
    ];
  }, [closed, s, k, p.prices]);

  if (!closed || !s || !k) return null;
  const up = s.esc!.outcome === 2;
  const all = (["fund", "honest", "borrow", "lie", "liquidate", "challenge", "verdict", "claim"] as StepKey[])
    .flatMap((key) => (k.tx[key] || []).map((t) => ({ ...t, key })));

  return (
    <div className={"outcome " + (up ? "win" : "lose")}>
      <span className="oc-tag">Case #{k.id} closed</span>
      <div className="oc-h">
        <h2>
          {up ? "The lie was caught. You were made whole."
            : s.ch?.open ? "The proof did not hold. The liquidation stands."
            : "Nobody challenged. The liquidation stands."}
        </h2>
      </div>
      <div className="oc-rows">
        {rows.map((r, i) => (
          <div key={i}><span className="lab">{r[0]}</span><span className="val">{r[1]}</span></div>
        ))}
      </div>
      <div className="oc-tx">
        <span className="lab">{all.length} transactions</span>
        {all.map((t, i) => (
          <a key={i} className={"rs-l" + (t.s === "ok" ? "" : " bad")}
            href={config().explorer + "/tx/" + t.h} target="_blank" rel="noopener">{t.l} ↗</a>
        ))}
      </div>
      <div className="oc-a">
        <button className="btn" onClick={p.newCase} disabled={!!p.busy || !!p.pending}>Run another case</button>
        <Link className="ghost" href="/dashboard/cases/">See all cases</Link>
      </div>
    </div>
  );
}
