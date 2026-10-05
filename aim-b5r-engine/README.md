# AIM-B5R data & underwriting engine

Standalone Python subsystem — no dependency on the Next.js app around it,
no n8n, no Supabase, no server. Meant to run on a schedule (weekly) and
accumulate a real dataset over 1-2+ years, per the AIM-B5R spec (Assess →
Instrument → Model → Buy → Rehab → Rent → Recalibrate → Refinance →
Repeat). Everything persists in one file this folder creates on first
run: `aim_b5r.sqlite3` (gitignored — it's data, not code; back it up
separately from git).

## Files

| File | What it does |
|---|---|
| `aim_b5r_engine.py` | Monte Carlo B5R underwriting math (5,000-draw simulation, P10/P50/P90 outputs, tornado sensitivity, EDO call). No I/O — pure calculation. See the `aim-b5r-underwriting` skill for the full spec this implements. |
| `aim_b5r_example.py` | A worked, fully-labeled-`ASSUMED` 12-unit example deal. Run it to see the engine's output shape: `python3 aim_b5r_example.py`. |
| `aim_b5r_aggregator.py` | SQLite-backed parcel store with change-history tracking and a transparent distress score. Kern/Fresno county-GIS sources are deliberate `NotImplementedError` stubs (no confirmed public endpoint yet) — see the module docstring. |
| `aim_b5r_context.py` | Four data sources: a PropStream (or similar) CSV importer for property/transaction data, Census ACS, HUD Fair Market Rents, and GDELT news signal — all documented, stable, free/cheap sources chosen deliberately over further county-portal reverse-engineering. |
| `run_weekly.py` | **The one entrypoint to schedule.** Runs the aggregator and all four context sources, isolates failures per-source so one bad source doesn't block the rest. `python3 run_weekly.py` |

## Setup

```
pip install -r aim-b5r-engine/requirements.txt
```

Two of the four context sources need a free key/token (sign-up links are
in the `RuntimeError` each one raises without it, and in
`aim_b5r_context.py`'s docstrings):
- `CENSUS_API_KEY` — https://api.census.gov/data/key_signup.html
- `HUD_API_TOKEN` — https://www.huduser.gov/hudapi/public/register

GDELT (news) and the PropStream CSV import need no key, but PropStream
CSV import is a separate, manual step on your own export cadence — it is
NOT part of `run_weekly.py`'s automatic run, since there's no path to
guess:

```
python3 -c "from aim_b5r_context import PropStreamCSVSource; \
    print(PropStreamCSVSource().ingest('/path/to/export.csv'))"
```

`aim_b5r_context.DEFAULT_COLUMN_MAP` is a best guess at PropStream's
real export column headers, not yet confirmed against a real export —
check the first `ingest()` result's `error` field (it prints the actual
header if the guess is wrong) and correct the map to match.

## Status as of first commit

- Underwriting engine: built, tested by direct execution, matches the
  skill spec.
- Aggregator: built, tested (new/changed/unchanged detection verified
  end-to-end); Kern/Fresno GIS sources still stubbed pending a confirmed
  public endpoint.
- Context sources: CSV import tested end-to-end with a synthetic file
  (7 cases, all passing); Census/HUD/GDELT are unverified against the
  live APIs — this sandbox's own network policy blocks outbound calls
  to them, so real verification has to happen wherever this actually
  runs.

## Web app counterpart (TypeScript)

The underwriting math also lives in the Next.js app so the `/brrrr` Simulate
tab can run it in the browser with no server round-trip:

- `lib/b5r/engine.ts` — TypeScript port of `aim_b5r_engine.py`. **This Python
  file stays the reference.** `tests/b5r.test.ts` checks the port against a
  golden run (`tests/fixtures/b5r_golden.json`); if you change the math here,
  regenerate that fixture and update the port.
- `lib/b5r/worker.ts` + `app/brrrr/useB5r.ts` — runs it in a Web Worker.
- Saved deals, run history and the predicted-vs-actual log live in Supabase
  (`supabase/migrations/007_b5r_pipeline.sql`), behind the admin login at
  `/admin/b5r`. Saving re-runs the simulation on the server from the submitted
  inputs, so stored results are always the engine's own output.
- The weekly data job (`run_scheduled.py`, run by `.github/workflows/b5r-weekly.yml`)
  keeps the SQLite dataset in a private Supabase Storage bucket (`b5r-data`):
  restore → `run_weekly.main()` → save + dated backup → record the run in
  `b5r_job_runs` (migration 008), shown at the top of `/admin/b5r`.

## Scheduled job setup (one time)

1. Run `supabase/migrations/007_b5r_pipeline.sql` then `008_b5r_job_runs.sql`.
2. GitHub repo → Settings → Secrets and variables → Actions → add:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CENSUS_API_KEY`, `HUD_API_TOKEN`.
3. Actions → "AIM-B5R weekly data job" → Run workflow once to test.
   It then runs Mondays 13:17 UTC. A red run (GitHub emails you) means every
   context source failed or a stage crashed; individual source failures are
   recorded but don't fail the run. The Kern/Fresno county-GIS stubs are
   expected to report "not wired in yet" and are ignored.

The job refuses to run if the saved dataset can't be downloaded (anything other
than "doesn't exist yet"), so a network blip can never overwrite good data with
an empty file. Tests: `python3 -m unittest test_scheduled -v` (stub Supabase).
