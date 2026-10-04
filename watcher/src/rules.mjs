// rules.mjs: what Lantern.adjudicate will decide, computed before a stake is put down.
//
// Every function here mirrors one function in the contracts, line for line:
//   evaluate     Verdicts.evaluate          (src/libraries/Verdicts.sol)
//   stakeFloor   WaterfallMath.stakeFloor   (src/libraries/WaterfallMath.sol)
//   bounty       FixedPoint.bpsOf + BondMath.chargeable, as adjudicate applies them
// test/rules.test.mjs re-reads each constant from the Solidity source instead of trusting the copy
// below. The live agreement check (`npm run agree`) compares these answers with every verdict
// already recorded on chain.

export const BPS = 10_000n;
export const STALENESS_BOUND = 300n;            // Constants.STALENESS_BOUND, 5 minutes
export const CROSS_SOURCE_TOLERANCE_BPS = 500n; // Constants.CROSS_SOURCE_TOLERANCE_BPS
export const MIN_STAKE_BPS = 100n;              // Constants.MIN_STAKE_BPS

// Provenance.Rule, in declaration order
export const RULES = ["SLOT_UNIQUENESS", "ROUND_ORDERING", "SELF_HISTORY", "PAYLOAD_PROVENANCE", "CROSS_SOURCE"];

const ZERO32 = "0x" + "0".repeat(64);

// FixedPoint.absDiffBps: the difference as a share of the second value; a zero divisor is infinite
export function absDiffBps(a, b) {
  if (b === 0n) return (1n << 256n) - 1n;
  return ((a > b ? a - b : b - a) * BPS) / b;
}

/**
 * Verdicts.evaluate. `i` carries exactly what adjudicate passes in:
 *   report            reg.reportAt(e.feedId, e.round)
 *   slotConflicted    book.slotOf(feedId, round).conflicted
 *   otherValueForRound book.slotOf(feedId, round).otherValue
 *   payloadFeed       book.payloadFeed(report.payloadHash)
 *   thisFeed          e.feedId
 *   liquidationTime   e.recordedAt
 *   peerValue, peerExists  reg.reportAt(peer, e.round), or zero when no peer is declared
 * @returns {{upheld: boolean, observed: bigint, bound: bigint}}
 */
export function evaluate(rule, i) {
  const r = i.report;
  switch (rule) {
    case 0: // SLOT_UNIQUENESS
      return { upheld: i.slotConflicted, observed: i.otherValueForRound, bound: r.value };
    case 1: { // ROUND_ORDERING
      const t = BigInt(i.liquidationTime), ts = BigInt(r.timestamp);
      const age = t > ts ? t - ts : 0n;
      return { upheld: age > STALENESS_BOUND, observed: age, bound: STALENESS_BOUND };
    }
    case 2: { // SELF_HISTORY
      const below = r.prevBandLo !== 0n && r.value < r.prevBandLo;
      const above = r.prevBandHi !== 0n && r.value > r.prevBandHi;
      if (below) return { upheld: true, observed: r.value, bound: r.prevBandLo };
      if (above) return { upheld: true, observed: r.value, bound: r.prevBandHi };
      return { upheld: false, observed: r.value, bound: r.prevBandHi };
    }
    case 3: { // PAYLOAD_PROVENANCE
      const pf = (i.payloadFeed || ZERO32).toLowerCase();
      const crossFeed = pf !== ZERO32 && pf !== i.thisFeed.toLowerCase();
      return { upheld: crossFeed, observed: crossFeed ? 1n : 0n, bound: 1n };
    }
    case 4: { // CROSS_SOURCE
      if (!i.peerExists || i.peerValue === 0n) return { upheld: false, observed: r.value, bound: 0n };
      const spread = absDiffBps(r.value, i.peerValue);
      return { upheld: spread > CROSS_SOURCE_TOLERANCE_BPS, observed: spread, bound: CROSS_SOURCE_TOLERANCE_BPS };
    }
    default:
      throw new Error("no such rule " + rule);
  }
}

/** Every rule at once, so the caller can see which hold and which do not. */
export function evaluateAll(i) {
  return RULES.map((name, rule) => ({ rule, name, ...evaluate(rule, i) }));
}

/**
 * The rule to stake on. The rule that is hardest to argue with goes first: a second, independent
 * source, then the feed contradicting itself in one round, then a payload from another feed, then
 * staleness. SELF_HISTORY comes last because it shows that the move was abnormal, not that the price
 * was wrong. The watcher only stakes on it when asked to (`allowHistory`).
 */
export const PREFERENCE = [4, 0, 3, 1, 2];
export function choose(results, { allowHistory = false } = {}) {
  for (const rule of PREFERENCE) {
    if (rule === 2 && !allowHistory) continue;
    const r = results[rule];
    if (r.upheld) return r;
  }
  return null;
}

/** WaterfallMath.stakeFloor */
export function stakeFloor(bonus, minStake) {
  const p = (bonus * MIN_STAKE_BPS) / BPS;
  return p > minStake ? p : minStake;
}

/** What an upheld challenge pays on top of the returned stake: bpsOf(bonus, bountyBps), capped at the bond. */
export function bounty(bonus, bountyBps, bond) {
  const want = (bonus * BigInt(bountyBps)) / BPS;
  return bond < want ? bond : want;
}
