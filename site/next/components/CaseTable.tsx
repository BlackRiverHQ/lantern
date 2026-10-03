"use client";

/* CaseTable.tsx — the list of liquidations. Each row is a case; the columns are the four things a
   reader asks in order: which one, how it ended, what money is behind it, and what decided it. */

import { useRouter } from "next/navigation";
import { RESULT_TEXT, type CaseRecord } from "@/lib/chain/cases";
import { ago, hold } from "@/lib/format";
import { RULE_NAMES } from "@/lib/chain/config";

export function CaseTable({
  cases, account, mini, empty,
}: { cases: CaseRecord[]; account: string | null; mini?: boolean; empty: React.ReactNode }) {
  const router = useRouter();
  if (!cases.length) return <div className="empty">{empty}</div>;
  return (
    <div className={"tbl " + (mini ? "cases-mini" : "cases")}>
      <div className="r th">
        <span>Case</span><span>Result</span><span>Held</span>
        {!mini ? <span>Rule</span> : null}
        <span>When</span>
      </div>
      {cases.map((c) => {
        const r = RESULT_TEXT[c.result];
        const you = account && c.borrower && c.borrower.toLowerCase() === account.toLowerCase();
        return (
          <div key={c.id} className="r row" onClick={() => router.push("/dashboard/cases/?case=" + c.id)}
            role="link" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") router.push("/dashboard/cases/?case=" + c.id); }}>
            <span className="id">#{c.id}{you ? <em className="you">you</em> : null}</span>
            <span>
              <span className={"tag " + c.result}>{r[0]}</span>{" "}
              <small className="muted">{r[1]}</small>
            </span>
            <span className="num">{hold(c.bonus)}</span>
            {!mini ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {c.rule === null ? "\u2014" : RULE_NAMES[c.rule] + (c.gap !== null ? ", " + (c.gap / 100).toFixed(2) + "% apart" : "")}
              </span>
            ) : null}
            <span className="muted" style={{ fontSize: 13 }}>
              {c.ts ? ago(c.ts) : "block " + c.block.toLocaleString("en-US")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
