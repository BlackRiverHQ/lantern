# The band

The band is the feed's own realized range. It is never set by hand and never comes from an external
reference, so there is no second oracle to trust and no reference-writing key to compromise.

## How it moves

```
width = clamp(moveBps * 6, 50 bps, 5000 bps)
moveBps = (7 * previousMoveBps + realizedMove) / 8      # EWMA, 1/8 weight on the newest move
realizedMove is capped at the width the band already had
```

Thin history widens the band toward the ceiling by sample deficit, so a feed with no history accepts
almost anything and a feed with a long history tightens onto its own behavior:

```
width = clamp(moveBps * 6, ...) + (5000 - clamp(...)) * (32 - samples) / 32     while samples < 32
```

## Two guards that are not the band

- **Per-report drift**, 20% of the previous value. A single print cannot jump, whether or not it lands
  inside the band.
- **Cumulative drift**, 50% inside a rolling hour. A sequence of small steps cannot walk a feed
  arbitrarily far within one window.

Both are hard: exceeding either reverts the write.

## Why an outlier cannot buy tolerance

A print outside the band contributes at most the width of the band it contradicted. One forged print
therefore cannot widen the feed's tolerance much, and a repeated offender has to escalate. The ceiling
of 50% still binds, and the escalation a determined signer can buy with it is stated in
[LIMITS.md](LIMITS.md).

## Worked example

A feed warms with 34 prints stepping up 0.1% each:

```
samples 34, moveBps ~10  ->  width = max(50, 60) = 60 bps
band = anchor +/- 0.6%
```

A print 10% above the anchor is inside the 20% per-report drift guard, so it is accepted - and outside
a 0.6% band, so `SELF_HISTORY` fires when someone challenges it. Tests:
`test_observe_move_is_capped_by_the_current_width`, `testFuzz_outlier_widening_is_bounded`,
`test_selfHistory_upheld_above_the_band`.
