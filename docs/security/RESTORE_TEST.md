# Restore test

**Why:** canon GOV-11. A backup only counts once it has been restored and
checked. Do this once now, then every quarter and after any schema change.

**What it proves:** the PropOps8 audit database can be copied out and brought
back into a separate project with every table and row intact. It never
touches production data in place.

**Time:** about 20 minutes on the Mac.

## Before you start

1. Create a scratch Supabase project (free tier is fine). Name it
   `propops8-restore-test`. It is deleted at the end.
2. Install the Postgres client tools if `pg_dump --version` fails:
   `brew install libpq && brew link --force libpq`. The client's major version
   must be the same as or newer than the server's (Supabase shows it under
   Project Settings, Infrastructure).
3. Open both projects' connection strings: Project Settings, Database,
   Connection string, Session pooler. You'll paste them at hidden prompts
   below, so they never land in your shell history or on screen.

## Run it

From the `propop8` folder:

```bash
read -rs PROD_DB_URL && echo "production string saved"
read -rs SCRATCH_DB_URL && echo "scratch string saved"
pg_dump "$PROD_DB_URL" --schema=public --no-owner --no-privileges --format=custom --file=restore_test.dump
pg_restore --no-owner --no-privileges --dbname="$SCRATCH_DB_URL" restore_test.dump
```

Then compare row counts. Run the same query against both:

```bash
COUNTS="select 'admin_login_attempts' t, count(*) from admin_login_attempts union all select 'audit_intake_events', count(*) from audit_intake_events union all select 'audit_intakes', count(*) from audit_intakes union all select 'audit_reviews', count(*) from audit_reviews union all select 'audit_uploads', count(*) from audit_uploads union all select 'b5r_calibration', count(*) from b5r_calibration union all select 'b5r_deals', count(*) from b5r_deals union all select 'b5r_job_runs', count(*) from b5r_job_runs union all select 'b5r_runs', count(*) from b5r_runs union all select 'upload_tokens', count(*) from upload_tokens union all select 'webhook_events', count(*) from webhook_events order by 1"
psql "$PROD_DB_URL" -c "$COUNTS" > counts_prod.txt
psql "$SCRATCH_DB_URL" -c "$COUNTS" > counts_scratch.txt
diff counts_prod.txt counts_scratch.txt && echo "RESTORE TEST PASSED: every table matches"
```

A table missing from production (not every migration has been run) shows as
an error on both sides; that is a finding to note, not a failed restore.

## Clean up

```bash
rm -f restore_test.dump counts_prod.txt counts_scratch.txt
unset PROD_DB_URL SCRATCH_DB_URL
```

Delete the scratch project in Supabase (Project Settings, General, Delete
project). The dump holds client data, so it never goes to iCloud, email or a
chat.

## What this does not cover

- **Storage files** (the `audit-uploads` and `audit-reports` buckets) are not
  in a database dump. Uploads are kept for 30 days only; approved report PDFs
  are the ones worth a separate copy. Open decision: whether report PDFs get
  their own backup.
- **The plan.** On Supabase's Free plan the project has no automatic backups
  and can pause when idle (see the 2026-10-10 production audit). This manual
  dump is then the only backup.

## Record

Add a row after each run. A failed run is recorded too, with what failed.

| Date | Who | Source | Tables compared | Result | Notes |
|---|---|---|---|---|---|
| | | PropOps8 audit project | | | |
