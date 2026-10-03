/* prove.ts — the prover's arithmetic, as pure functions.

   Nothing here decides a challenge. `Lantern.adjudicate` calls `Verdicts.evaluate` on chain, and for
   CROSS_SOURCE that is exactly: the peer feed must carry a report for the SAME round with a
   non-zero value, and the two values must differ by more than CROSS_SOURCE_TOLERANCE_BPS of the
   peer's. Every function below mirrors one contract function, so the console can say before a stake
   moves what the contract will say after it, and `test/prove.test.mjs` re-derives each constant from
   the Solidity source rather than trusting this copy. */

import { TOLERANCE_BPS } from "../chain/config";

const BPS = 10000n;
export const MIN_STAKE_BPS = 100n; // Constants.MIN_STAKE_BPS

export type Verdict = {
  upheld: boolean;
  /** the number the contract reports as `observed` */
  spread: bigint;
  /** …and as `bound` */
  bound: bigint;
  why: string;
};

/** Verdicts.evaluate, CROSS_SOURCE branch. A peer that does not exist, or carries a zero, refuses
 *  before any arithmetic: two sources that agree cannot both be wrong, and neither can two that
 *  disagree, so a disagreement alone is enough. */
export function crossSource(subject: bigint, peer: bigint, peerExists: boolean): Verdict {
  if (!peerExists || peer === 0n) {
    return {
      upheld: false, spread: 0n, bound: 0n,
      why: "The second feed has no print for that round, so there is nothing to compare against.",
    };
  }
  const spread = ((subject > peer ? subject - peer : peer - subject) * BPS) / peer;
  return {
    upheld: spread > TOLERANCE_BPS,
    spread,
    bound: TOLERANCE_BPS,
    why: spread > TOLERANCE_BPS
      ? "The two sources are further apart than the contract's tolerance."
      : "The two sources are inside the contract's tolerance, so this claim would be refused and the stake would go to the liquidator.",
  };
}

/** WaterfallMath.stakeFloor — the larger of one percent of the held profit and the absolute floor. */
export function stakeFloor(bonus: bigint, minStake: bigint): bigint {
  const proportional = (bonus * MIN_STAKE_BPS) / BPS;
  return proportional > minStake ? proportional : minStake;
}

export type Payout = { stake: bigint; bounty: bigint; total: bigint };

/** What an upheld challenge pays the prover: the stake back, plus the bounty charged to the feed's
 *  own bond. BondMath.chargeable caps that bounty at what the bond actually holds, so the number
 *  shown is the number that can be paid rather than the number that was wanted. */
export function payout(stake: bigint, bonus: bigint, bountyBps: bigint, bond: bigint): Payout {
  const want = (bonus * bountyBps) / BPS;
  const bounty = bond < want ? bond : want;
  return { stake, bounty, total: stake + bounty };
}

export type Window = { open: boolean; left: number; why: string };

/** The guards inside openChallenge, in the order the contract applies them, so a case that cannot
 *  be challenged says which of them stops it rather than greying out. */
export function canChallenge(
  c: { exists: boolean; outcome: number; deadline: number | null; challengeOpen: boolean },
  now: number,
): Window {
  if (!c.exists) return { open: false, left: 0, why: "There is no escrow under this id." };
  if (c.outcome !== 0) return { open: false, left: 0, why: "A verdict has already landed." };
  if (c.challengeOpen) return { open: false, left: 0, why: "Somebody already staked a challenge on it." };
  const left = (c.deadline ?? 0) - now;
  if (left <= 0) return { open: false, left: 0, why: "The challenge window has closed." };
  return { open: true, left, why: "" };
}
