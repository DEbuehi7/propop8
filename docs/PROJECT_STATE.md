# PROJECT_STATE

Machine-made by `lib/state/projectState.ts` (canon GOV-18). Do not edit by hand: run `npm run state`.
`tests/projectState.test.ts` fails when this file no longer matches the repo.

## Stack and conventions

| | |
|---|---|
| Next.js | 16.4.3 |
| React | 19.2.8 |
| TypeScript | ^5 |
| Node on Netlify | 22 |
| Deploy | Netlify site `propops8` builds `main` (`netlify.toml`); `/admin/*` sits behind the login in `proxy.ts` |
| Branches | Work on a feature branch, open a pull request, the owner merges; never force-push `main` |
| Verify | `npm run verify` (typecheck, lint, tests) before any merge or deploy |
| Rules | `CLAUDE.md` stop rules and the canon (`docs/canon/README.md`) |

## Module versions

Every `export const …VERSION… = "…"` in `lib/`.

| Constant | Value | File |
|---|---|---|
| `FIS_SCHEMA_VERSION` | aim-fis-project-1 | `lib/b5r/facade/contracts.ts` |
| `FIS_ENGINE_VERSION` | aim-fis-flat-0.2.0 | `lib/b5r/facade/contracts.ts` |
| `FIS_CONTRACT_VERSION` | aim-fis-decision-1 | `lib/b5r/facade/contracts.ts` |
| `FIS_CATALOGUE_VERSION` | fis-flat-catalogue-0.1 | `lib/b5r/facade/contracts.ts` |
| `PHASE1_RULES_VERSION` | phase1-gate-1.0.0 | `lib/b5r/phase1/seed.ts` |
| `API_VERSION` | 2023-06-01 | `lib/b5r/screen/claude.ts` |
| `SCREEN_VERSION` | aim-b5r-photo-screen-1 | `lib/b5r/screen/report.ts` |
| `CANON_VERSION` | 1.8.0 | `lib/canon/index.ts` |
| `ENGINE_VERSION` | 1.1.0 | `lib/engineVersion.ts` |

## Pages

| Path | Who can open it |
|---|---|
| `/about` | public |
| `/admin/b5r/facade` | admin login |
| `/admin/b5r` | admin login |
| `/admin/intakes` | admin login |
| `/admin/let/eon` | admin login |
| `/admin/let/lumen` | admin login |
| `/admin/let` | admin login |
| `/admin/let/transect` | admin login |
| `/admin/login` | anyone (the login page) |
| `/admin` | admin login |
| `/admin/review` | admin login |
| `/audit` | public |
| `/audit/thank-you` | public |
| `/brrrr` | public |
| `/infographics` | public |
| `/ingest` | public |
| `/legal/[slug]` | public |
| `/` | public |
| `/plate` | public |
| `/plate8/late8` | public |
| `/plate8/mate8` | public |
| `/plate8/monitoring` | public |
| `/plate8` | public |
| `/plate8/plate8` | public |
| `/plate8/skate8` | public |
| `/plate8/slate8` | public |
| `/plate8/state8` | public |
| `/tools/[slug]` | public |
| `/tools` | public |
| `/tools/recert/engine` | public |
| `/tools/recert` | public |
| `/tools/vacancy-calculator` | public |
| `/upload/[token]` | anyone holding an expiring upload link |

## API routes

Denied by default: a route is public only if `tests/routeAuth.test.ts` lists it, with its reason.

| Path | Access |
|---|---|
| `/api/admin/b5r/calibration` | admin session |
| `/api/admin/b5r/deals/[dealId]` | admin session |
| `/api/admin/b5r/deals` | admin session |
| `/api/admin/b5r/job` | admin session |
| `/api/admin/intakes/events` | admin session |
| `/api/admin/intakes` | admin session |
| `/api/admin/login` | public by decision |
| `/api/admin/logout` | public by decision |
| `/api/admin/pending-intakes` | admin session |
| `/api/admin/reports/retry` | admin session |
| `/api/admin/reviews` | admin session |
| `/api/health` | public by decision |
| `/api/late8/audiobook` | public by decision |
| `/api/plate8/state8/monitoring` | admin session |
| `/api/plate8/state8/session` | admin session |
| `/api/rss` | public by decision |
| `/api/send-report` | admin session |
| `/api/tally-webhook` | public by decision |
| `/api/upload/[token]` | public by decision |
| `/api/yt` | public by decision |

## Environment variable names

Names only, never values (CLAUDE.md rule 2). Where each one is read:

| Name | Read in |
|---|---|
| `ADMIN_PASSWORD` | `app/api`, `scripts/e2e-audit.mjs` |
| `ADMIN_SESSION_SECRET` | `app/api`, `lib/adminAuth.ts` |
| `ANTHROPIC_API_KEY` | `lib/b5r` |
| `AUDIT_NOTIFY_EMAIL` | `lib/email.ts` |
| `BASE_URL` | `scripts/e2e-audit.mjs` |
| `ELEVENLABS_API_KEY` | `lib/stuttr` |
| `HELPER_SOURCES` | `scripts/media` |
| `LATE8_AUDIOBOOK_URL` | `lib/late8` |
| `NEXT_PUBLIC_BASE_URL` | `lib/email.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.ts`, `lib/supabaseServer.ts` |
| `NEXT_PUBLIC_SUPABASE_URL` | `app/api`, `lib/b5r`, `lib/fulfill.ts`, `lib/sendReport.ts`, `lib/supabaseClient.ts`, `lib/supabaseServer.ts`, `lib/uploadTokens.ts`, `scripts/security` |
| `NEXT_PUBLIC_TALLY_FORM_ID` | `app/audit` |
| `PLATE8_SUPABASE_SERVICE_ROLE_KEY` | `lib/supabaseServer.ts` |
| `PLATE8_SUPABASE_URL` | `lib/supabaseServer.ts` |
| `RESEND_API_KEY` | `lib/email.ts`, `lib/sendReport.ts` |
| `RESEND_FROM` | `lib/email.ts`, `lib/sendReport.ts` |
| `STATE8_SYSTEM_USER_ID` | `app/api` |
| `STUTTR_LIBRARY` | `scripts/dance8`, `scripts/stuttr` |
| `SUPABASE_SERVICE_ROLE_KEY` | `app/api`, `lib/b5r`, `lib/fulfill.ts`, `lib/sendReport.ts`, `lib/supabaseServer.ts`, `lib/uploadTokens.ts`, `scripts/security` |
| `TALLY_PAYMENT_ENABLED` | `app/api` |
| `TALLY_SIGNING_SECRET` | `app/api`, `scripts/e2e-audit.mjs` |
| `YOUTUBE_API_KEY` | `app/api` |

## Database migrations

| File | Tables created | Tables with RLS enabled |
|---|---|---|
| `migrations/001_init_schema.sql` | 6 | 6 |
| `migrations/002_seed_state8_system_user.sql` | 0 | 0 |
| `supabase/migrations/005_tally.sql` | 0 | 0 |
| `supabase/migrations/006_report_columns.sql` | 0 | 0 |
| `supabase/migrations/007_b5r_pipeline.sql` | 3 | 3 |
| `supabase/migrations/008_b5r_job_runs.sql` | 1 | 1 |
| `supabase/migrations/009_review_trail.sql` | 2 | 2 |
| `supabase/migrations/010_report_storage.sql` | 0 | 0 |
| `supabase/migrations/011_admin_login_attempts.sql` | 1 | 1 |

## npm scripts

`b5r` · `b5r:phase1` · `build` · `dance8` · `dev` · `e2e:audit` · `helpers` · `lint` · `start` · `state` · `stuttr` · `test` · `typecheck` · `verify`

## Canon

Version 1.8.0: 22 studies, 207 entries.

- By status: CONCEPT 9 · CONFLICT 1 · LOCKED 132 · OPEN 8 · PROPOSED 20 · RESEARCH 15 · SPEC 22
- By build state: built 53 · n/a 103 · not_built 29 · partial 16 · unchecked 6

Locked or specified, but not fully built (what is still missing):

| Domain | Not built | Partly built |
|---|---|---|
| AIM_B5R | B5R-11, B5R-18, B5R-21, B5R-22, B5R-23, B5R-24, B5R-26, B5R-30 | B5R-02, B5R-16, B5R-19, B5R-20, B5R-45 |
| DANCE8 | D8-08, D8-13 | D8-01, D8-10 |
| EDO_PATTERN | EDO-10, EDO-12 | none |
| GOVERNANCE | GOV-05, GOV-11 | GOV-08, GOV-10, GOV-17, GOV-19, GOV-28 |
| MOBILITY | MOB-07 | none |
| PLATE8 | PL8-01, PL8-02 | none |
| PROPOPS8 | P8O-03, P8O-04 | P8O-02 |
| ROBOTICS | ROB-09 | none |
| STUTTR | none | STU-01 |
| TRIADIC | TRI-05, TRI-12 | none |
| VISUAL | VIS-07 | VIS-02 |

Not yet checked against the code: GOV-06, STU-03, ST8-02, PL8-03, PL8-05, VIS-04.

## AIM-B5R pilot gates (Phase 1, G0 identity)

| Lead | Proposed | Final | Signed |
|---|---|---|---|
| K1 | PASS | PASS | yes |
| K2 | HOLD | — | no |
| K3 | HOLD | — | no |
| K4 | HOLD | — | no |
| K5 | HOLD | — | no |
| F1 | HOLD | — | no |
| F2 | HOLD | — | no |
| F3 | HOLD | — | no |
| F4 | HOLD | — | no |
| F5 | HOLD | — | no |

From `data/aim-b5r/phase1/out/gate_decisions.csv`. G1–G6 have rules (`docs/aim-dataset/CONTRACT.md`) but no evidence kit yet.

