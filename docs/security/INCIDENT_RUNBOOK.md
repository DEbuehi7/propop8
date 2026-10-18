# Incident runbook

**Why:** canon Phase 0D. What to do, in order, when something goes wrong.
Act first, then write it down in the log at the bottom. Never paste a key,
password or client file into a chat, ticket or screenshot while handling an
incident.

## 1. A key or password leaked

Signs: a secret in a commit, screenshot, chat, log or email; the secret scan
fails; a provider warns you.

1. **Revoke or rotate it at the provider first.** Deleting the file does not
   help; git history keeps it.

   | Secret | Where to rotate | Then |
   |---|---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` or a Supabase secret key | Supabase, Project Settings, API keys | Update Netlify and `.env.local`; redeploy |
   | `ADMIN_PASSWORD` | Your password manager | Update Netlify; redeploy |
   | `ADMIN_SESSION_SECRET` | Generate a new random value | Update Netlify; redeploy (ends every session) |
   | `TALLY_SIGNING_SECRET` | Tally, webhook settings | Update Netlify; send a test submission |
   | `RESEND_API_KEY` | Resend, API keys | Update Netlify; send a test email |
   | `YOUTUBE_API_KEY` | Google Cloud console, credentials | Update Netlify |
   | `PLATE8_SUPABASE_SERVICE_ROLE_KEY` | Plate8's Supabase project | Update Netlify |
2. Check the provider's logs for use you don't recognise since the leak.
3. Run `npx tsx scripts/security/scanSecrets.ts` (tracked files) and
   `npx tsx scripts/security/scanSecrets.ts --history`. Every credential the
   history scan lists must already be revoked.
4. Record it below.

## 2. Client data exposed

Signs: a report sent to the wrong person; a public link to a private file; a
file in the repo; unusual downloads.

1. Stop the exposure: revoke the upload token or link, make the bucket private
   again, remove the file from wherever it is public.
2. Work out exactly what was exposed, to whom, and when, from the review trail
   (`audit_intake_events`), Resend message ids and Supabase logs.
3. If personal information of California residents may have been exposed,
   talk to counsel about notification duties before contacting anyone else.
   Notices may have deadlines.
4. Tell the affected client plainly what happened and what you did.
5. Record it below.

## 3. A wrong report went out

1. The report is a fixed PDF with a fingerprint; the review trail shows who
   approved which bytes and when.
2. Email the client a correction from the same address; do not resend the
   wrong file.
3. Find the cause (data, engine, review). If the engine was wrong, fix it
   with a golden diff and an engine version bump (CLAUDE.md rule 9).

## 4. The site is down or a deploy broke it

1. Netlify, Deploys: open the last good deploy and choose Publish deploy.
   That rolls back in seconds.
2. Check `/api/health` reports the expected Supabase project and engine version.
3. Fix on a branch, run `npm run verify`, check a draft deploy, then publish.

## 5. Someone else got into admin

1. Rotate `ADMIN_SESSION_SECRET` (ends every session) and `ADMIN_PASSWORD`.
2. Check `admin_login_attempts`, the review trail and Netlify logs for what was
   done.
3. Treat any data they could see as exposed (section 2).

## 6. A provider is down (Supabase, Resend, Tally)

1. Tally webhooks retry; intakes are claimed once per event id, so replays
   are safe.
2. Failed sends can be retried from the stored PDF in `/admin/intakes`.
3. Tell any waiting client that delivery is delayed; don't promise a time you
   don't control.

## Contacts

- Counsel for privacy or breach questions: to be filled in by the owner.
- Each provider's support: from its dashboard.

## Log

| Date | What happened | What was done | Credential revoked or data affected | Closed |
|---|---|---|---|---|
| 2026-10-05 to 2026-10-10 | `.env.local` with a Supabase secret key committed to public `main` (audit finding C1) | File removed (PR #13); key to be revoked | Supabase secret key for the Plate8 project | **Open until the owner confirms revocation** |
