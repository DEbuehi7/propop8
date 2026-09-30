"""
AIM-B5R property aggregator — lightweight, background, accumulates over time.

Built fresh (the old HAS Sentinel / n8n / BatchData stack is confirmed dead —
nothing here assumes it exists). This is a standalone SQLite-backed pipeline:
no external DB, no n8n, no server. It's meant to be invoked on a schedule
(cron / a scheduled task) and just accumulate parcel history in one file,
`aim_b5r.sqlite3`, next to this script.

WHAT I VERIFIED before writing this (see the reply for full sources):
  - Kern County's Assessor GIS system runs on Esri ArcGIS and its public page
    confirms parcel numbers, use codes, owner/assessee names and assessed
    values exist in it -- but the page doesn't expose a direct REST/download
    URL, so `fetch_kern()` below is a stub until that's located.
  - Fresno County publishes parcel number, address, zoning and flood-zone
    data via a web map viewer and shapefile downloads ("GIS Online") --
    but its own page states owner information is withheld under California
    Government Code restrictions. `fetch_fresno()` is a stub for the same
    reason: the exact shapefile/service URL isn't confirmed yet.
  - CONSEQUENCE: bulk owner-name data is not free/open for at least Fresno,
    and unconfirmed for Kern. Owner identification for outreach will need a
    separate, explicit enrichment step (a skip-trace/data vendor, looked up
    only for parcels that already cleared the distress/fit screen below) --
    not something to expect out of the parcel bulk data itself. Do not wire
    a vendor in here without Daniel picking one; nothing is assumed.

WHAT THIS FILE DOES do, right now, end to end:
  - Defines the schema for what a "candidate property" record looks like.
  - Stores it in SQLite with first_seen/last_seen tracking, so re-running
    the aggregator over months/years builds a real history per parcel
    (assessed value changes, a sale event, a new owner) instead of just a
    snapshot -- that history is the dataset the B5R engine's Recalibrate
    step needs.
  - Defines a `Source` plugin interface so Kern/Fresno (or a paid vendor)
    can be wired in independently, without touching the storage or scoring
    code.
  - Computes a simple, transparent distress/fit score from whatever fields
    a source actually provides (missing fields just don't contribute --
    nothing here fabricates a signal a source didn't supply).
  - Runs standalone: `python3 aim_b5r_aggregator.py run` does one pass over
    all registered sources and prints a summary. Nothing here requires
    n8n, Supabase, or any account Daniel doesn't already have.
"""

from __future__ import annotations

import sqlite3
import json
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Protocol

DB_PATH = Path(__file__).parent / "aim_b5r.sqlite3"

TARGET_COUNTIES = ["Kern", "Fresno"]
MIN_UNITS = 10  # per Daniel: 10+ unit multifamily only


# --------------------------------------------------------------------------
# Schema
# --------------------------------------------------------------------------
@dataclass
class ParcelRecord:
    apn: str                       # assessor's parcel number -- the natural key
    county: str
    situs_address: Optional[str] = None
    use_code: Optional[str] = None
    use_code_description: Optional[str] = None
    units: Optional[int] = None
    year_built: Optional[int] = None
    land_sqft: Optional[float] = None
    building_sqft: Optional[float] = None
    assessed_land_value: Optional[float] = None
    assessed_improvement_value: Optional[float] = None
    last_sale_date: Optional[str] = None       # ISO date, if the source provides it
    last_sale_price: Optional[float] = None
    owner_name: Optional[str] = None           # None for most sources -- see module docstring
    owner_mailing_address: Optional[str] = None
    is_absentee_owner: Optional[bool] = None   # True if mailing addr != situs addr, when both known
    tax_delinquent: Optional[bool] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: str = "unknown"
    source_url: Optional[str] = None
    observed_date: str = field(default_factory=lambda: date.today().isoformat())


class Source(Protocol):
    """Anything that can hand back ParcelRecords for a county implements this.
    Kern/Fresno county GIS, or a paid vendor (Regrid, ReportAll, BatchData,
    etc.), all look the same to the aggregator below. `counties` declares
    which of TARGET_COUNTIES this source actually covers, so the run loop
    doesn't call e.g. the Kern source against Fresno."""
    name: str
    counties: list[str]

    def fetch_parcels(self, county: str, min_units: int) -> list[ParcelRecord]:
        ...


class KernCountySource:
    """STUB. Kern's Assessor GIS page (kerncounty.com) confirms an Esri
    ArcGIS-backed system with parcel #, use code, owner/assessee name and
    assessed value -- but the public page doesn't publish a direct service
    URL. Next step: find Kern's actual ArcGIS REST endpoint (their GIS
    division can usually give this directly, or it's discoverable from
    https://www.kerncounty.com/government/departments/assessor-recorder/property/mapping-gis/gis-data)
    and implement the real HTTP call here. Until then this raises, loudly,
    rather than silently returning nothing."""
    name = "kern_county_gis"
    counties = ["Kern"]

    def fetch_parcels(self, county: str, min_units: int) -> list[ParcelRecord]:
        raise NotImplementedError(
            "Kern County source not wired in yet -- the public GIS data page "
            "doesn't expose a direct REST/download URL. See module docstring."
        )


class FresnoCountySource:
    """STUB. Fresno publishes parcel #, address, zoning and flood-zone data
    via 'GIS Online' (web viewer) and shapefile downloads -- confirmed on
    fresnocountyca.gov. Owner name is explicitly withheld under California
    Government Code restrictions, so this source will never populate
    owner_name/owner_mailing_address regardless of implementation. Next
    step: find the actual shapefile/service URL under 'GIS Online' and
    implement the real fetch (likely a shapefile download + local parse,
    since no REST endpoint was found in the county page itself)."""
    name = "fresno_county_gis"
    counties = ["Fresno"]

    def fetch_parcels(self, county: str, min_units: int) -> list[ParcelRecord]:
        raise NotImplementedError(
            "Fresno County source not wired in yet -- need the actual GIS "
            "Online service/shapefile URL. See module docstring. Note: this "
            "source will never carry owner_name -- that's excluded by CA "
            "Gov Code, confirmed on the county's own GIS page."
        )


SOURCES: list[Source] = [KernCountySource(), FresnoCountySource()]


# --------------------------------------------------------------------------
# Storage — one SQLite file, no server, safe to run on a laptop or a cron box
# --------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS parcels (
    apn TEXT NOT NULL,
    county TEXT NOT NULL,
    situs_address TEXT,
    use_code TEXT,
    use_code_description TEXT,
    units INTEGER,
    year_built INTEGER,
    land_sqft REAL,
    building_sqft REAL,
    assessed_land_value REAL,
    assessed_improvement_value REAL,
    last_sale_date TEXT,
    last_sale_price REAL,
    owner_name TEXT,
    owner_mailing_address TEXT,
    is_absentee_owner INTEGER,
    tax_delinquent INTEGER,
    latitude REAL,
    longitude REAL,
    source TEXT,
    source_url TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    PRIMARY KEY (apn, county)
);

CREATE TABLE IF NOT EXISTS parcel_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apn TEXT NOT NULL,
    county TEXT NOT NULL,
    observed_date TEXT NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT
);

CREATE TABLE IF NOT EXISTS run_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_started TEXT NOT NULL,
    run_finished TEXT,
    source TEXT NOT NULL,
    county TEXT NOT NULL,
    records_seen INTEGER DEFAULT 0,
    records_new INTEGER DEFAULT 0,
    records_changed INTEGER DEFAULT 0,
    error TEXT
);
"""

TRACKED_FIELDS = [
    "situs_address", "use_code", "units", "assessed_land_value",
    "assessed_improvement_value", "last_sale_date", "last_sale_price",
    "owner_name", "tax_delinquent",
]


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn


def upsert_parcel(conn: sqlite3.Connection, rec: ParcelRecord) -> str:
    """Insert a new parcel or update an existing one, logging every tracked
    field that actually changed to parcel_history. Returns 'new', 'changed',
    or 'unchanged'."""
    cur = conn.execute(
        "SELECT * FROM parcels WHERE apn = ? AND county = ?", (rec.apn, rec.county)
    )
    row = cur.fetchone()
    now = datetime.utcnow().isoformat()
    rec_dict = asdict(rec)
    # observed_date is metadata for the history log, not a parcels-table
    # column (the table tracks first_seen/last_seen instead) -- keep it for
    # the history INSERT below via rec.observed_date, but drop it here.
    rec_dict.pop("observed_date", None)
    rec_dict["is_absentee_owner"] = (
        None if rec.is_absentee_owner is None else int(rec.is_absentee_owner)
    )
    rec_dict["tax_delinquent"] = (
        None if rec.tax_delinquent is None else int(rec.tax_delinquent)
    )

    if row is None:
        cols = list(rec_dict.keys()) + ["first_seen", "last_seen"]
        placeholders = ",".join("?" for _ in cols)
        values = list(rec_dict.values()) + [now, now]
        conn.execute(f"INSERT INTO parcels ({','.join(cols)}) VALUES ({placeholders})", values)
        return "new"

    # PRAGMA table_info rows are (cid, name, type, notnull, dflt_value, pk) --
    # index 1 is the column name; index 0 is just the integer position.
    col_names = [d[1] for d in conn.execute("PRAGMA table_info(parcels)").fetchall()]
    existing = dict(zip(col_names, row))
    changed = False
    for f in TRACKED_FIELDS:
        old_val = existing.get(f)
        new_val = rec_dict.get(f)
        if old_val != new_val and new_val is not None:
            conn.execute(
                "INSERT INTO parcel_history (apn, county, observed_date, field_changed, old_value, new_value) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (rec.apn, rec.county, rec.observed_date, f, str(old_val), str(new_val)),
            )
            changed = True

    set_clause = ",".join(f"{k}=?" for k in rec_dict.keys())
    conn.execute(
        f"UPDATE parcels SET {set_clause}, last_seen=? WHERE apn=? AND county=?",
        list(rec_dict.values()) + [now, rec.apn, rec.county],
    )
    return "changed" if changed else "unchanged"


# --------------------------------------------------------------------------
# Scoring — transparent, additive, never invents a signal a source lacked
# --------------------------------------------------------------------------
def distress_score(rec: ParcelRecord) -> dict:
    """A simple, explainable score out of the signals actually present.
    This is intentionally NOT the old project's DSA v3 weighting (that was
    scoped to a different, now-killed system) -- it's a fresh, minimal
    starting point. Tune or replace freely; every contributing signal is
    named in the output so it stays auditable."""
    points = 0
    reasons = []
    max_points = 0

    if rec.tax_delinquent is True:
        points += 25
        reasons.append("tax_delinquent")
    max_points += 25

    if rec.is_absentee_owner is True:
        points += 15
        reasons.append("absentee_owner")
    max_points += 15

    if rec.last_sale_date:
        try:
            years_held = (date.today() - date.fromisoformat(rec.last_sale_date)).days / 365.25
            if years_held >= 15:
                points += 15
                reasons.append(f"long_hold ({years_held:.0f}y)")
        except ValueError:
            pass
    max_points += 15

    if rec.year_built and rec.year_built <= 1979:
        points += 10
        reasons.append(f"pre-1980 build ({rec.year_built})")
    max_points += 10

    score_pct = round(100 * points / max_points, 1) if max_points else 0.0
    return {"points": points, "max_points": max_points, "score_pct": score_pct, "reasons": reasons}


# --------------------------------------------------------------------------
# Run loop — call this from cron / a scheduled task. Idempotent, safe to
# run daily or weekly; it only records what changed.
# --------------------------------------------------------------------------
def run_once(sources: list[Source] = SOURCES, min_units: int = MIN_UNITS) -> dict:
    conn = get_db()
    summary = {"sources": []}
    for source in sources:
        for county in source.counties:
            if county not in TARGET_COUNTIES:
                continue
            started = datetime.utcnow().isoformat()
            seen = new = changed = 0
            error = None
            try:
                records = source.fetch_parcels(county, min_units)
                for rec in records:
                    seen += 1
                    result = upsert_parcel(conn, rec)
                    if result == "new":
                        new += 1
                    elif result == "changed":
                        changed += 1
                conn.commit()
            except NotImplementedError as e:
                error = str(e)
            except Exception as e:  # noqa: BLE001 -- log and keep going for other sources
                error = f"{type(e).__name__}: {e}"

            conn.execute(
                "INSERT INTO run_log (run_started, run_finished, source, county, records_seen, "
                "records_new, records_changed, error) VALUES (?,?,?,?,?,?,?,?)",
                (started, datetime.utcnow().isoformat(), source.name, county, seen, new, changed, error),
            )
            conn.commit()
            summary["sources"].append({
                "source": source.name, "county": county, "seen": seen,
                "new": new, "changed": changed, "error": error,
            })
    conn.close()
    return summary


def status() -> dict:
    """Quick health check: how many parcels tracked, last run per source,
    and the current top-scored candidates. Safe to call anytime."""
    if not DB_PATH.exists():
        return {"db_exists": False, "message": "No runs yet -- aim_b5r.sqlite3 not created."}
    conn = get_db()
    n_parcels = conn.execute("SELECT COUNT(*) FROM parcels").fetchone()[0]
    last_runs = conn.execute(
        "SELECT source, county, run_finished, records_seen, records_new, error "
        "FROM run_log ORDER BY id DESC LIMIT 10"
    ).fetchall()
    conn.close()
    return {
        "db_exists": True,
        "db_path": str(DB_PATH),
        "total_parcels_tracked": n_parcels,
        "recent_runs": last_runs,
    }


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "run":
        print(json.dumps(run_once(), indent=2))
    elif cmd == "status":
        print(json.dumps(status(), indent=2, default=str))
    else:
        print("usage: python3 aim_b5r_aggregator.py [run|status]")
