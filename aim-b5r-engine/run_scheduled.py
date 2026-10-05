"""
Scheduled entrypoint (GitHub Actions, weekly): restore the dataset from Supabase
Storage, run run_weekly.main(), save the dataset back, record the run.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 run_scheduled.py

Exit code 1 (so GitHub emails you) when the run is unhealthy. Healthy means:
no stage raised, and at least one context source (Census / HUD / GDELT) returned
data. The Kern/Fresno county-GIS stubs are *expected* to report "not wired in
yet" every week and do not count against health.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import aim_b5r_aggregator as agg
import run_weekly
import sync_supabase as sync


def assess(report: dict) -> tuple[bool, str]:
    problems: list[str] = []
    note = ""
    ctx = report.get("context_sources")
    if not isinstance(ctx, dict):
        problems.append("context stage did not run")
    elif "error" in ctx:
        problems.append(f"context stage crashed: {ctx['error']}")
    else:
        results = [v for county in ctx.values() if isinstance(county, dict) for v in county.values()]
        good = [v for v in results if isinstance(v, dict) and "error" not in v]
        failed = len(results) - len(good)
        if not good:
            problems.append("every context source failed (check CENSUS_API_KEY / HUD_API_TOKEN and network)")
        elif failed:
            note = f"{failed} of {len(results)} context sources failing"
    ps = report.get("parcel_sources")
    if isinstance(ps, dict) and "error" in ps:
        problems.append(f"parcel stage crashed: {ps['error']}")
    if problems:
        return False, "; ".join(problems)
    return True, f"OK with {note}" if note else "OK"


def main(client: sync.Supabase | None = None, db_path: Path | None = None, trigger: str = "schedule") -> int:
    db_path = db_path or agg.DB_PATH
    client = client or sync.Supabase()
    started = datetime.now(timezone.utc)

    client.ensure_bucket()
    had_db = client.download_db(db_path)  # raises (aborting the run) on anything but "not there yet"
    print(f"{'Restored' if had_db else 'No saved dataset yet — starting fresh'}: {db_path.name}")

    report = run_weekly.main()
    ok, summary = assess(report)
    print(json.dumps(report, indent=2, default=str))

    if db_path.exists():
        data = sync.snapshot(db_path)
        client.upload(sync.LIVE_OBJECT, data)
        client.upload(f"backups/{started:%Y-%m-%d}.sqlite3", data)
        print(f"Saved dataset ({len(data):,} bytes) + dated backup")
    else:
        summary += "; no database file was produced"
        ok = False

    client.record_run({"started_at": started.isoformat(), "ok": ok, "summary": summary, "report": report, "trigger": trigger})
    print(f"{'OK' if ok else 'UNHEALTHY'}: {summary}")
    return 0 if ok else 1


if __name__ == "__main__":
    import os
    sys.exit(main(trigger=os.environ.get("B5R_TRIGGER", "schedule")))
