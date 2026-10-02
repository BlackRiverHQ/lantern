# Testing

## Shape

- `test/unit/` — one file per module; behaviour and revert paths.
- `test/fuzz/` — band math, exposure floors, waterfall splits, window arithmetic.
- `test/invariants/` — stateful suites driven by handlers over random sequences.
- `test/integration/` — full lifecycle from print to waterfall.
- `test/fixtures/` — named scenarios replayed from `fixtures/`.

## Adversarial cases required

Forged print, replayed payload across assets, same-slot conflict, stale round, band walk, challenge
after the window, double challenge, insufficient stake, verdict on a moved round, bond drained
mid-window, an honest loss classified honest, and a conflict that must leave evidence on-chain.

## Running

```
forge test -vv
forge test --match-path "test/invariants/*" -vvv
forge coverage
```

