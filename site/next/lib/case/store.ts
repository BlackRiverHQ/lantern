/* store.ts — the case a visitor is running, kept in localStorage under a key made of the chain and
   the deployment, so a reload resumes the case instead of losing it, and a redeploy starts clean.
   A step in flight is written down before it is waited on: the surface then shows it as in flight
   and picks up its receipt rather than offering the step again. */

import { config } from "../chain/config";
import type { CaseKey } from "../chain/read";
import type { StepKey } from "./plan";

export type TxNote = { l: string; h: string; s: string };
export type Pending = { step: string; label?: string; hash?: string; at: number; server?: boolean };

export type Store = {
  id: number;
  r1: number;
  r2: number;
  gap: number;
  tx: Partial<Record<string, TxNote[]>>;
  start: { required: string; errors: string; borrower: string | null };
  pending: Pending | null;
};

const key = () => "lantern.case.v2." + config().chainId + "." + config().lantern.toLowerCase();

export function load(): Store | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key());
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}

export function save(s: Store | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (s) localStorage.setItem(key(), JSON.stringify(s));
    else localStorage.removeItem(key());
  } catch {
    /* a full or disabled store must not break a transaction */
  }
}

export const asKey = (s: Store): CaseKey => ({ id: s.id, r1: s.r1, r2: s.r2, gap: s.gap });

export function noteTx(s: Store, step: StepKey | "position", note: TxNote): void {
  const list = (s.tx[step] = s.tx[step] || []);
  if (!list.some((t) => t.h === note.h)) list.push(note);
}
