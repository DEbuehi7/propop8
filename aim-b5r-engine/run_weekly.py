"""
Single weekly entrypoint for the AIM-B5R data-aggregation layer.

This is the one command to put on a schedule (cron, Windows Task
Scheduler, or a Claude scheduled task with this directory attached):

    python3 run_weekly.py

It does two independent things and reports on both, even if one fails:
  1. aim_b5r_aggregator.run_once()   -- county-GIS parcel sources
                                        (Kern/Fresno are still stubs --
                                        see that file -- so today this
                                        logs a clear "not wired in yet"
                                        error per county, not a crash).
  2. aim_b5r_context.run_weekly_context() -- Census / HUD / GDELT, each
                                        independently, plus (separately,
                                        not on this schedule) whatever
                                        PropStream CSVs get dropped in
                                        via PropStreamCSVSource.ingest().

Everything lands in one file next to this script: aim_b5r.sqlite3. That
file IS the accumulating dataset -- back it up / sync it wherever this
ends up running long-term.

This script does not import a PropStream CSV on its own, because that's
a file Daniel exports by hand on his own cadence, not something to guess
a path for. Run that step explicitly when a fresh export is in hand:

    python3 -c "from aim_b5r_context import PropStreamCSVSource; \\
        print(PropStreamCSVSource().ingest('/path/to/export.csv'))"
"""
from __future__ import annotations

import json
from datetime import datetime

from aim_b5r_aggregator import run_once
from aim_b5r_context import run_weekly_context


def main() -> dict:
    started = datetime.utcnow().isoformat()
    report = {"run_started": started}

    try:
        report["parcel_sources"] = run_once()
    except Exception as e:  # noqa: BLE001 -- one stage failing shouldn't hide the other
        report["parcel_sources"] = {"error": f"{type(e).__name__}: {e}"}

    try:
        report["context_sources"] = run_weekly_context()
    except Exception as e:  # noqa: BLE001
        report["context_sources"] = {"error": f"{type(e).__name__}: {e}"}

    report["run_finished"] = datetime.utcnow().isoformat()
    return report


if __name__ == "__main__":
    print(json.dumps(main(), indent=2, default=str))
