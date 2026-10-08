# Handoff notes

Open items carried forward from the Phase 0/1 session (2026-10-06/07).

## Dance8
- `TransitionResolver` is fixed (reads `fromClipId`/`toClipId`, honours incompatible direct edges) and tested, but it is **deliberately not wired into scoring**. `CandidateScorer` still hardcodes `transitionCost = 0`. Wiring it in changes decisions and needs its own step, with the decision golden (`tests/fixtures/dance8_decisions_golden.json`) updated on purpose.

## Audit
- `tests/fixtures/audit_golden.json` pins the paid report output. Any change to it must be shown as a diff and approved.
- Engine 1.1.0 (2026-10-08) added two findings: spend by unit (units above 3x the median unit; needs a unit on 60% of rows and 8 distinct units; never claims a portfolio per-unit average) and open-item aging against the file's own closed history (90th percentile of days-to-close; needs 8 closed items with both dates). Both are appended after the existing findings.
- Still not built: per-unit spend using a real unit count (the file does not carry one), and vendor averages against the property's own baseline.
- The aging-vs-history golden is `tests/fixtures/audit_aging_golden.json` (fixture `audit_ledger_aging.csv`); the main golden still covers the main fixture.

## Lint
- 15 of 16 React-compiler warnings are cleared (some fixed in code, some kept as effects with a stated reason on an `eslint-disable-next-line` comment). One remains: `react-hooks/exhaustive-deps` in `app/plate8/state8/page.tsx`; fixing it changes when its effect runs, so it needs a decision. See `LINT-TODO.md`. `react-hooks/static-components` must stay at zero.

## Calculators
- Rules: subset limits (aged <= open, reopened <= closed, top vendor <= total), no negatives, and "baseline too small to compare" under $100.
- Missed runs = `floor(daysSince / frequency)` via `calcMath.missedCycles`, used for both the number and the dots.

## Plate8 vs audit database (before Plate8 goes public)
- Plate8 (`lib/supabaseServer.ts`) and the audit routes (`send-report`, `tally-webhook`, `admin/intakes`) all read the same `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. On the live site they point at the audit project, which has no Plate8 tables, so Plate8 session saves would fail. The audit is unaffected.
- Plate8 needs its own project settings (separate variable names, or a separate deploy) before it is public. The session route's Supabase write is also fire-and-forget today (not awaited), so failures are silent; fix that in the same step.

## Phase 1B — audit review trail (built, live, verified 2026-10-08)

Run in the AUDIT Supabase project (`tjxnxescjcvpzthmhvuh`), in order:
`supabase/migrations/009_review_trail.sql`, then `010_report_storage.sql`.

- Review page saves engine output and reviewer edits (separately, with `ENGINE_VERSION`
  and the PDF SHA-256) via `/api/admin/reviews` BEFORE the PDF downloads. A failed save
  stops the flow.
- `/api/send-report` sends only an approved review whose PDF hash matches, keeps the
  409 already-sent guard, and records `report_sent` / `report_send_failed` with the
  Resend id or error. Retry for a failed send: `/api/admin/reports/retry` (stored PDF).
- `/admin/intakes` shows review stage, Resend id, History timeline, Retry button, and
  now also lists DELIVERED intakes (previously they dropped off the list).
- Live pipeline check with synthetic data: `BASE_URL=... npm run e2e:audit`
  (secrets read from env by name; `--dry` prints the plan). Run against production on 2026-10-08: all 10 checks passed. It leaves synthetic intakes named `E2E SYNTHETIC ...`; remove with `delete from audit_intakes where company like 'E2E SYNTHETIC%';` in the audit project.
- Bump `lib/engineVersion.ts` whenever a change would alter what a report says.

## Plate8 session write (done)
- `app/api/plate8/state8/session/route.ts` now awaits the Supabase save. A failed save returns 502 with `success:false` (session still kept in memory); the page ignores the status, so the UI is unchanged.
- `lib/supabaseServer.ts` reads `PLATE8_SUPABASE_URL` / `PLATE8_SUPABASE_SERVICE_ROLE_KEY` first and falls back to the shared variables. Set the PLATE8_ pair in Netlify, pointing at a Plate8 project, before Plate8 goes public.
