# Handoff notes

Open items carried forward from the Phase 0/1 session (2026-10-06/07).

## Dance8
- `TransitionResolver` is fixed (reads `fromClipId`/`toClipId`, honours incompatible direct edges) and tested, but it is **deliberately not wired into scoring**. `CandidateScorer` still hardcodes `transitionCost = 0`. Wiring it in changes decisions and needs its own step, with the decision golden (`tests/fixtures/dance8_decisions_golden.json`) updated on purpose.

## Audit
- `tests/fixtures/audit_golden.json` pins the paid report output. Any change to it must be shown as a diff and approved.
- Per-unit spend: not built. Waiting on a decision about where the unit count comes from.
- Vendor averages and aging against the property's own baseline: not built in the screener or the engine (aging uses a fixed 30 days).

## Lint
- `LINT-TODO.md` lists the React-compiler warnings to refactor one at a time. `react-hooks/static-components` must stay at zero.

## Calculators
- Rules: subset limits (aged <= open, reopened <= closed, top vendor <= total), no negatives, and "baseline too small to compare" under $100.
- Missed runs = `floor(daysSince / frequency)` via `calcMath.missedCycles`, used for both the number and the dots.
