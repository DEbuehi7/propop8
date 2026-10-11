# PropOps8 production reality audit — 2026-10-10

Scope: the `propop8` repository at `feat/aim-b5r-phase1` (what `feat/b5r-job`
fast-forwards to), its 19 API routes, 32 pages, Supabase schema files,
Netlify config and production dependencies. Code review plus automated
tests; live checks are scripted for Daniel to run (`scripts/audit/live-check.sh`)
because this workspace cannot reach the live site without per-URL approval.

**Verdict:** the paid audit path (Tally → upload → review → report) is
well guarded and tested. Two fixes are needed before calling production
solid: the Next.js upgrade and Node version (H1, H2). Three medium
issues sit outside the paid path, in the admin login and the personal
Plate pages (M1–M3). Nothing here is an active breach; no secrets were found.

## Findings, most severe first

| ID | Severity | Finding | Fix | Changes runtime? |
|---|---|---|---|---|
| C1 | Critical (found after the first pass) | `main` carries `.env.local`, added 2026-10-05 through the GitHub website, in a **public** repository. It holds a Supabase **secret** key (bypasses every access rule) and a publishable key for the project whose ref starts `qxoomn` (not the PropOps8 audit project). The first pass scanned `feat/b5r-job` only, which is why it was missed. | Revoke that secret key in Supabase now and replace it anywhere it is used; remove the file from `main` (`fix/remove-committed-env`). Removing the file does not erase it from history; revoking the key is what makes the copy worthless. | Only where that key is used |
| H1 | High | `next@16.3.3` has 7 published advisories fixed in 16.4.0, including SSRF in Image Optimization (4 files use `next/image`) and SSG/ISR cache poisoning. The critical RCE is in `next/og`, which this app does not use. | Upgrade `next` (and `eslint-config-next`) to 16.4.x; `npm run verify`; live e2e; deploy. | Yes — needs go |
| H2 | High | Netlify builds on Node 20 (`netlify.toml`), which reached end of life on 2026-04-30: no more security patches. | `NODE_VERSION = "22"` (the version every test here runs on). | Yes — needs go |
| M1 | Medium | `/api/rss` is an open, unauthenticated fetch proxy. The private-address check runs on the first hop only and redirects are followed, so a public URL that redirects to an internal address gets past it (DNS rebinding likewise). | Follow redirects manually and re-check each hop, or require the admin cookie (Plate is a personal rig). | Yes — needs go |
| M2 | Medium | `/api/plate8/state8/session`: anyone can list the latest 10 sessions and write new ones with the service-role key. While the `PLATE8_` variables are unset it writes into the PropOps8 project. The `sessions` table is not defined in the repo, so its RLS can't be checked here. | Require the admin cookie until Plate8 is public; set the `PLATE8_` variables; add the table definition to the repo. | Yes — needs go |
| M3 | Medium | Admin login has no attempt limit and uses one shared password. A copied session cookie stays valid for 12 h even after logout (stateless). | Netlify rate-limit rule (or a small lockout table) on `/api/admin/login`; a 20+ character password from the password manager; rotate `ADMIN_SESSION_SECRET` to end every session. | Login only — needs go |
| L1 | Low | No `Strict-Transport-Security` or `Content-Security-Policy` header in `netlify.toml`. | Add HSTS first; CSP after a report-only week. | Headers only |
| L2 | Low | `/api/yt` is public; with a YouTube key set, anyone can spend its daily quota. | Same gate as M1. | Yes |
| L3 | Low | `sharp` (<0.35.5) and `source-map-js` (<1.2.2) advisories, both pulled in through Next. | Expected to clear with H1; re-run `npm audit --omit=dev`. | With H1 |

## Fix status (branch `fix/audit-h1-m3`, approved 2026-10-10)

| ID | Status | What changed | Still needs Daniel |
|---|---|---|---|
| H1 | Fixed | `next` and `eslint-config-next` 16.3.3 → 16.4.0. The legal page's `params` type was tightened to what 16.4 requires. Full production build passes (webpack, offline). | Check the Netlify deploy preview builds (it uses Turbopack, which this workspace can't run offline). |
| H2 | Fixed | `netlify.toml`: `NODE_VERSION = "22"`. | Nothing; the next deploy uses it. |
| M1 | Fixed | New `lib/safeFetch.ts`: redirects are followed by hand (max 5) and every hop is checked when it connects, so a public URL that redirects inside, and DNS rebinding, are both refused. Also a 4 MB cap and 12 s timeout. `/api/rss` uses it. Tests: `tests/safeFetch.test.ts`. | Nothing. |
| M2 | Fixed (gate) | `/api/plate8/state8/session` (GET, POST) and `/api/plate8/state8/monitoring` need the admin cookie (`lib/adminGuard.ts`). Both Plate8 pages show a Sign in link instead of failing. | Set the `PLATE8_` variables when Plate8 gets its own project. Run the `sessions` query below and send the output so the table definition can go in the repo. |
| M3 | Fixed (limit) | Five wrong passwords from one address in 15 minutes → 429 with `Retry-After` until the window passes. Addresses are stored only as an HMAC (`lib/loginThrottle.ts`, migration `011_admin_login_attempts.sql`). If the table is missing or unreachable the limit allows the attempt, so it can never lock you out. Tests: `tests/loginThrottle.test.ts`. | Run migration 011. Change `ADMIN_PASSWORD` to 20+ characters and rotate `ADMIN_SESSION_SECRET` (ends every open session). |
| L3 | Cleared | Lockfile-only updates within existing ranges: Next's `sharp` 0.35.5, `source-map-js` 1.2.2. `npm audit --omit=dev` reports 0. | Nothing. Dev-only tools (netlify-cli, eslint) still show advisories; they are not deployed. |

`sessions` table definition (read-only; run in the project Plate8 writes to, which is PropOps8 until the `PLATE8_` variables are set):

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions'
order by ordinal_position;
select relrowsecurity from pg_class where oid = 'public.sessions'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'sessions';
```

## Verified and passing

| Area | What was checked | Evidence |
|---|---|---|
| Admin API | All 12 data handlers under `/api/admin`, plus `send-report`, check the signed admin cookie before doing anything (login and logout need none) | Code review (each handler's first statement) |
| Admin pages | `/admin/*` redirects to login without a valid cookie; forged, tampered and expired cookies fail | `tests/securityGuards.test.ts` (new) |
| Tally webhook | Signature checked first, constant-time; tampered body, truncated signature and missing secret all refused before the database | `tests/securityGuards.test.ts` (new) |
| Webhook replays | Claimed once per event id; a repeat returns `duplicate: true`; unique response id; intake id used as the email idempotency key | Code review |
| Uploads | Token-scoped with expiry and revocation; 50 MB, 10 files and the CSV/XLS(X) allowlist are enforced by the private bucket itself, not just the browser | `supabase/schema.sql`, `lib/uploadTokens.ts` |
| Data access | Every table defined in the repo has RLS on and no policies (service-role only); both buckets are private | `supabase/schema.sql`, migrations 007–010 |
| Reports | Send needs an approved review and a matching PDF fingerprint; resend refused (409); retry from the stored PDF | `tests/sendGuard.test.ts`; live e2e 10/10 (twice) |
| Secrets | **Corrected:** `feat/b5r-job` and its history are clean, but `main` is not (see C1). A re-scan of every branch and all history found no other keys. | Pattern scan of all branches and history (names and file paths only; no values printed) |
| Tests | 186 → 203 tests at audit; 211 with the fixes; 0 lint errors | `npm run verify` |

## Not verified here (needs Daniel, 10 minutes)

1. **Live behaviour:** run `bash scripts/audit/live-check.sh` from the `propop8` folder. It prints PASS/FAIL per check and which security headers are present.
2. **Live database rules:** Supabase → SQL Editor, run (read-only):

   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
   select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by tablename;
   select id, public, file_size_limit from storage.buckets order by id;
   ```

   Expected: every table `rowsecurity = true`; no policies, or only ones you recognise; every bucket `public = false`.
3. **Plan:** if the PropOps8 project is on the Free plan, it has no backups and can pause. Moving the organization to Pro (as planned for the vault) fixes both.

## Stress testing next

Once H1/H2 are done, the remaining confidence comes from failure drills,
run against a staging copy rather than production:

- a signed webhook replayed 10 times;
- email provider down;
- database unreachable mid-upload;
- a 50 MB file;
- 100 concurrent page loads.

Each drill gets a pass rule written before it runs.
