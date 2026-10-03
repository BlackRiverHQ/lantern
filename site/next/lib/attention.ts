/* attention.ts — the rows that need a decision.
   A dashboard exists to answer one question fast: is anything wrong, and is there anything I can do
   about it. Every row here is derived from chain state, and a row only carries an operation when the
   protocol would actually let that operation succeed — release after a closed window, claim after a
   decided escrow, both of which anyone may send. Where the move belongs to the feed operator and not
   to the visitor, the row says so instead of offering a button that has to fail. */

import type { Snapshot } from "./chain/read";
import type { CaseRecord } from "./chain/cases";
import { hold, mmss } from "./format";

export type Attention = {
  key: string;
  what: string;
  detail: string;
  when?: string;
  action?: { kind: "release" | "claim"; id: number; label: string };
};

export function attention(s: Snapshot, cases: CaseRecord[], now: number, account: string | null): Attention[] {
  const rows: Attention[] = [];

  for (const c of cases) {
    const mine = account && c.borrower && c.borrower.toLowerCase() === account.toLowerCase();
    // a held bonus whose window has closed with no unresolved challenge: anyone may release it
    if (c.outcome === 0 && c.deadline !== null && c.deadline <= now && !c.challengeOpen) {
      rows.push({
        key: "release-" + c.id,
        what: "Held bonus, window closed",
        detail: "case #" + c.id + " \u00b7 " + hold(c.bonus),
        when: "uncontested",
        action: { kind: "release", id: c.id, label: "Release" },
      });
      continue;
    }
    // decided but the market's seizure is still open: the collateral has not moved yet
    if (c.outcome !== null && c.outcome !== 0 && !c.settled) {
      rows.push({
        key: "claim-" + c.id,
        what: c.outcome === 2 ? (mine ? "Your collateral is unclaimed" : "Collateral, borrower made whole") : "Collateral still held",
        detail: "case #" + c.id,
        when: c.outcome === 2 ? "goes to the borrower" : "goes to the liquidator",
        action: { kind: "claim", id: c.id, label: "Settle" },
      });
      continue;
    }
    // a window still running, or one whose challenge has not been ruled on yet: the move is the
    // adjudication, and it belongs to whoever holds the open challenge, so the row states the state
    // and points at the case rather than offering a button
    const deadline = c.deadline;
    if (c.outcome === 0 && c.challengeOpen) {
      rows.push({
        key: "window-" + c.id,
        what: "Challenge awaiting a ruling",
        detail: "case #" + c.id + " \u00b7 " + hold(c.bonus),
        when: "anyone may adjudicate",
      });
    } else if (c.outcome === 0 && deadline !== null && deadline > now) {
      rows.push({
        key: "window-" + c.id,
        what: "Held bonus, window open",
        detail: "case #" + c.id + " \u00b7 " + hold(c.bonus),
        when: mmss(deadline - now) + " left",
      });
    }
  }

  if (s.bond < s.required) {
    rows.push({
      key: "bond",
      what: "Feed under its required bond",
      detail: hold(s.bond) + " of " + hold(s.required),
      when: "the feed cannot price",
    });
  }
  if (!s.priceable) {
    rows.push({
      key: "thin",
      what: "Feed history too thin to price on",
      detail: s.subj.samples + " prints behind the last one",
      when: "prints still accepted",
    });
  }

  return rows;
}
