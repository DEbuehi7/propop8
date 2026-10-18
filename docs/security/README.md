# Phase 0D: defensibility gate

**Status: in progress, opened 18 Oct 2026.** Canon P8O-02 and GOV-10: no new
major features past this gate until the items below pass. The goal is not
"litigation-proof" software; it is being able to show what data was used,
which rule applied, who acted and what was delivered.

## Gate checklist

| Item | Status | Evidence |
|---|---|---|
| Secret scanning | **Done** | `tests/secretScan.test.ts` fails `npm run verify` on any credential or tracked `.env` file; `scripts/security/scanSecrets.ts` (add `--history` for every commit) |
| No tracked secrets | **Done** for current files | 0 findings across all tracked files on 2026-10-18 |
| Credential rotation confirmed | **Owner** | History still holds one Supabase secret key (commit 33d4c7f0, `.env.local`, audit finding C1). Confirm it was revoked, then close it in the incident log |
| Environment template complete | **Done** | `.env.local.example` lists every variable the app reads; `tests/envExample.test.ts` keeps it complete and blank |
| Identity / role model | **Done** | [ROLES.md](ROLES.md) |
| Authorization negative tests | **Done** | `tests/routeAuth.test.ts` (default deny for every API route) plus the existing `tests/securityGuards.test.ts` |
| Privacy classes | **Done** | [DATA_CLASSES.md](DATA_CLASSES.md) |
| Source / version registry | **Done** for the recert forms | `data/propops8/sources.csv` (20 forms); `tests/sourceRegistry.test.ts` ties it to the engine. Links not re-checked yet (`access_status = unchecked`) |
| Incident runbook | **Done** | [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md) |
| Vendor register | **Done** | [VENDORS.md](VENDORS.md) |
| Restore test | **Owner** | [RESTORE_TEST.md](RESTORE_TEST.md): run once and record the result |
| Retention enforced | **Owner** | Finding R1 below: `scripts/security/purgeUploads.ts` dry run, then `--delete`, then schedule |

The gate passes when every row says Done.

## Findings from this pass

| ID | Severity | Finding | Fix |
|---|---|---|---|
| R1 | **High** | The privacy policy and `/legal` promise that uploaded source files are deleted 30 days after upload, and immediately on a refund. Nothing does that: the purge job in `supabase/schema.sql` is commented out (and sketched at 90 days), and `purge_after` is never set. | `scripts/security/purgeUploads.ts` lists files past 30 days (dry run) and deletes them through the Storage API with `--delete`; `--intake` handles a refund. `tests/retention.test.ts` keeps the window equal to the published one. Next: run it weekly (a scheduled function is a separate change). |
| R2 | Medium | Netlify hosts the site but is not named in the privacy policy's list of providers; n8n is named but this code doesn't use it. | Owner or counsel: update the policy (see [VENDORS.md](VENDORS.md)). |
| R3 | Medium | **The GitHub repository is public.** Code is fine, but nothing confidential can ever be committed, and the full history (including C1) is readable by anyone. | Owner: make the repository private (GitHub, Settings, General, Danger Zone, Change visibility), unless it must stay public. |
| R4 | Low | `/api/yt` is public and spends the YouTube quota (audit finding L2, still open). | Gate it with the admin cookie once Slate8 shows a sign-in link like the other Plate8 pages. Listed as public, with that reason, in `tests/routeAuth.test.ts`. |
| R5 | Low | Report PDFs have no stated retention and no backup outside Supabase. | Owner decision: how long approved reports are kept, and whether they get their own backup. |

## Owner steps, in order (about 45 minutes)

1. **Confirm C1 is revoked.** In the Plate8 Supabase project, API keys: the
   secret key created before 10 Oct 2026 should be gone. If it isn't, revoke
   it now and update anything that used it. Then mark the incident log row
   closed.
2. **Make the repo private** (R3), unless it needs to stay public.
3. **Retention (R1).** From the `propop8` folder:
   `npx tsx --env-file=.env.local scripts/security/purgeUploads.ts` (dry run).
   If the list looks right, run it again with `--delete`.
4. **Restore test.** Follow [RESTORE_TEST.md](RESTORE_TEST.md) and add the row.
5. **Earlier audit leftovers**, if not done yet: run migration 011; set a 20+
   character `ADMIN_PASSWORD`; rotate `ADMIN_SESSION_SECRET`.

## Run log

| Date | What | Who | Result |
|---|---|---|---|
| 2026-10-18 | Tracked-file secret scan | Claude | 0 findings |
| 2026-10-18 | History secret scan, all branches | Claude | 1 Supabase secret key + the `.env.local` that held it (C1); nothing else |
