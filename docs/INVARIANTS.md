# Invariants

Each invariant has at least one test that tries to break it.

## Accounting

- `invariant_bonusConserved` — for every liquidation the bonus is either held, released to the
  liquidator, redirected to the borrower, paid to a prover, or charged to a bond. No path mints or
  burns value.
- `invariant_noDoubleSettle` — a liquidation can never both release and redirect; the terminal state
  is written once.
- `invariant_escrowSolvency` — held balances always equal the sum of un-settled escrows.

## Access and authority

- `invariant_onlyMarketRecords` — only the registered market can open an escrow.
- `invariant_noAdminSurface` — no function changes the hold window, the band constants, or a feed's
  registration after deployment.
- `invariant_noPricingWhileUnderBonded` — no report is recorded for a feed whose bond is below the
  floor for its current exposure.

## Adjudication

- `invariant_verdictIsDeterministic` — the same challenge against the same state yields the same
  verdict.
- `invariant_windowIsBinding` — no challenge opened after the window closes can be upheld.
- `invariant_stakeConserved` — a prover's stake is either returned with the bounty or forfeited to
  the liquidator, never both.
- `invariant_selfHistoryMonotone` — the pre-report band is snapshotted for every accepted report, the
  band only widens through realized moves, and drift caps hold across any call sequence. The band is
  not a gate: a value outside it is accepted and left contestable, which is the whole point.

## Failure behaviour

- `invariant_failClosed` — under-bonded, stale, replayed or duplicate prints revert the recording
  path rather than being accepted with reduced guarantees. A slot conflict is the one deliberate
  exception: it is recorded, because a rule that cannot leave evidence can never be proven.

