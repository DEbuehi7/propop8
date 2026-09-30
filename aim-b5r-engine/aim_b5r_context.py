"""
AIM-B5R context layer: property/transaction ingestion + location/market/news
context. This is the "creative, not fragile" redesign after the county-GIS
hunt proved to be the same time-sink HAS Sentinel already burned months on.

Design principle: every source here is either (a) a stable, documented,
free government API, (b) GDELT (built for exactly this kind of programmatic
news-event monitoring, no scraping-ToS issue), or (c) an import of a CSV you
already have in hand from a proven tool (PropStream) -- nothing here
reverse-engineers an undocumented interactive map application.

Four sources, all independent of each other and of the county-GIS stubs in
aim_b5r_aggregator.py (those stay as-is; this file doesn't replace them, it
gives you a path that doesn't depend on them working):

  1. PropStreamCSVSource   -- property + transaction data, from a CSV export
                              you already have (or will pull weekly). This is
                              the "creative" answer to the county-portal dead
                              end: reuse the tool that already solved this.
  2. CensusACSSource        -- county-level demographic/housing context
                              (median rent, median home value, income,
                              vacancy). Free API, needs a free key.
  3. HudFmrSource           -- HUD Fair Market Rents by county/bedroom count
                              -- a sanity check for the B5R engine's rent
                              assumptions. Free API, needs a free key.
  4. GdeltNewsSource        -- weekly news/event signal for each county
                              (construction, zoning, disasters, market
                              news). No key needed for basic queries.

Every network-touching function below is marked with a `# VERIFY:` comment
naming exactly what to confirm before trusting it unattended -- API shapes
drift, and I'm not going to assert precision I don't have. The parsing,
storage and error-handling around each call is real and tested.
"""

from __future__ import annotations

import csv
import json
import os
import urllib.request
import urllib.parse
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from aim_b5r_aggregator import get_db, ParcelRecord, upsert_parcel, DB_PATH

# County FIPS codes (California = state FIPS 06) -- stable, not going to change.
COUNTY_FIPS = {
    "Kern": "029",
    "Fresno": "019",
}
STATE_FIPS = "06"

CONTEXT_SCHEMA = """
CREATE TABLE IF NOT EXISTS county_context (
    county TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    unit TEXT,
    source TEXT NOT NULL,
    vintage TEXT,              -- the data's own reference period, e.g. "2024" or "2023-ACS5"
    fetched_date TEXT NOT NULL,
    PRIMARY KEY (county, metric, vintage)
);

CREATE TABLE IF NOT EXISTS news_signal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    county TEXT NOT NULL,
    fetched_date TEXT NOT NULL,
    window_days INTEGER NOT NULL,
    query TEXT NOT NULL,
    article_count INTEGER,
    avg_tone REAL,
    top_titles TEXT              -- JSON list, kept short
);
"""


def get_context_db() -> sqlite3.Connection:
    conn = get_db()  # reuses aim_b5r.sqlite3 -- one file, one history
    conn.executescript(CONTEXT_SCHEMA)
    return conn


def _http_get_json(url: str, timeout: int = 20) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


# --------------------------------------------------------------------------
# 1. PropStream (or any similar tool) CSV import — property + transaction data
# --------------------------------------------------------------------------
# VERIFY: these are PLAUSIBLE PropStream export column names based on how
# PropStream's list-export is commonly described (APN, address, owner,
# assessed/market value, last sale date/price, year built, units, land use).
# I have not seen an actual PropStream export file, so I am not asserting
# these are exact. DEFAULT_COLUMN_MAP below is meant to be edited once you
# drop in one real export and tell me what its header row actually says --
# a five-minute fix, not a redesign.
DEFAULT_COLUMN_MAP = {
    "APN": "apn",
    "Property Address": "situs_address",
    "Land Use": "use_code_description",
    "Units": "units",
    "Year Built": "year_built",
    "Total Assessed Value": "assessed_land_value",  # split out if the export separates land/improvement
    "Last Sale Date": "last_sale_date",
    "Last Sale Amount": "last_sale_price",
    "Owner Name": "owner_name",
    "Owner Mailing Address": "owner_mailing_address",
    "County": "county",
}


class PropStreamCSVSource:
    """Reads a CSV you exported (from PropStream or anywhere else) and
    upserts it through the same parcels table/history as the county-GIS
    sources -- same schema, same change-tracking, same distress scoring.
    This is the whole point: the aggregator doesn't care WHERE a
    ParcelRecord came from, so swapping in a proven paid tool costs nothing
    architecturally.

    Usage: drop a fresh export at `csv_path` (weekly, per your cadence) and
    call `.ingest(csv_path)`. It does not delete or require the file to
    persist -- read once, upsert, move on.
    """
    name = "propstream_csv_import"

    def __init__(self, column_map: dict[str, str] = None):
        self.column_map = column_map or DEFAULT_COLUMN_MAP

    def ingest(self, csv_path: str, default_county: Optional[str] = None) -> dict:
        conn = get_context_db()
        seen = new = changed = errors = 0
        error_examples = []
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            missing_cols = [c for c in self.column_map if c not in (reader.fieldnames or [])]
            if missing_cols:
                conn.close()
                return {
                    "ok": False,
                    "error": f"CSV header doesn't match the expected columns: missing {missing_cols}. "
                             f"Actual header was: {reader.fieldnames}. Update DEFAULT_COLUMN_MAP to match "
                             f"the real export and retry -- nothing was written.",
                }
            for row in reader:
                seen += 1
                try:
                    kwargs = {}
                    for src_col, field_name in self.column_map.items():
                        raw = (row.get(src_col) or "").strip()
                        if raw == "":
                            continue
                        if field_name in ("units", "year_built"):
                            kwargs[field_name] = int(float(raw.replace(",", "")))
                        elif field_name in ("assessed_land_value", "last_sale_price"):
                            kwargs[field_name] = float(raw.replace("$", "").replace(",", ""))
                        else:
                            kwargs[field_name] = raw
                    kwargs.setdefault("county", default_county)
                    if not kwargs.get("apn") or not kwargs.get("county"):
                        errors += 1
                        if len(error_examples) < 3:
                            error_examples.append(f"row {seen}: missing apn or county after mapping")
                        continue
                    kwargs["source"] = self.name
                    rec = ParcelRecord(**kwargs)
                    result = upsert_parcel(conn, rec)
                    if result == "new":
                        new += 1
                    elif result == "changed":
                        changed += 1
                except (ValueError, TypeError) as e:
                    errors += 1
                    if len(error_examples) < 3:
                        error_examples.append(f"row {seen}: {e}")
        conn.commit()
        conn.close()
        return {"ok": True, "seen": seen, "new": new, "changed": changed,
                "errors": errors, "error_examples": error_examples}


# --------------------------------------------------------------------------
# 2. Census ACS — county-level demographic/housing context
# --------------------------------------------------------------------------
class CensusACSSource:
    """Census Bureau American Community Survey 5-year estimates, by county.
    Free, stable, official -- but requires a free API key (instant signup,
    no cost): https://api.census.gov/data/key_signup.html

    # VERIFY: the exact ACS vintage year in the URL (e.g. /2023/acs/acs5)
    should be bumped to whatever the current released vintage is when this
    actually runs -- Census releases a new 5-year vintage annually. Variable
    codes below (B19013_001E median household income, B25064_001E median
    gross rent, B25077_001E median home value, B01003_001E population,
    B25002_003E vacant housing units, B25002_002E occupied) are stable ACS
    detailed-table codes and unlikely to change.
    """
    name = "census_acs"
    BASE = "https://api.census.gov/data/2023/acs/acs5"
    VARIABLES = {
        "median_household_income": "B19013_001E",
        "median_gross_rent": "B25064_001E",
        "median_home_value": "B25077_001E",
        "population": "B01003_001E",
        "vacant_housing_units": "B25002_003E",
        "occupied_housing_units": "B25002_002E",
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("CENSUS_API_KEY")

    def fetch(self, county: str) -> dict:
        if not self.api_key:
            raise RuntimeError(
                "No Census API key. Sign up free at "
                "https://api.census.gov/data/key_signup.html and set CENSUS_API_KEY."
            )
        fips = COUNTY_FIPS[county]
        get_vars = ",".join(self.VARIABLES.values())
        url = (f"{self.BASE}?get={get_vars}&for=county:{fips}&in=state:{STATE_FIPS}"
               f"&key={self.api_key}")
        data = _http_get_json(url)  # VERIFY: response shape is [[headers...], [values...]]
        header, values = data[0], data[1]
        row = dict(zip(header, values))
        code_to_name = {v: k for k, v in self.VARIABLES.items()}
        return {code_to_name[code]: float(row[code]) for code in self.VARIABLES.values() if code in row}

    def store(self, county: str):
        result = self.fetch(county)
        conn = get_context_db()
        today = date.today().isoformat()
        for metric, value in result.items():
            conn.execute(
                "INSERT OR REPLACE INTO county_context (county, metric, value, unit, source, vintage, fetched_date) "
                "VALUES (?,?,?,?,?,?,?)",
                (county, metric, value, "USD or count", self.name, "2023-ACS5", today),
            )
        conn.commit()
        conn.close()
        return result


# --------------------------------------------------------------------------
# 3. HUD Fair Market Rents — sanity-checks the B5R engine's rent inputs
# --------------------------------------------------------------------------
class HudFmrSource:
    """HUD's Fair Market Rent API, by county, all bedroom counts. Free API
    token required: https://www.huduser.gov/hudapi/public/register

    # VERIFY: HUD's API structure (entity IDs are county-based FIPS strings
    like 'CA029' for Kern) and the exact current-year endpoint path --
    HUD's own docs at https://www.huduser.gov/portal/dataset/fmr-api.html
    are the source of truth; this targets their documented FMR-by-county
    pattern as of my training, not a live-verified call.
    """
    name = "hud_fmr"
    BASE = "https://www.huduser.gov/hudapi/public/fmr/data"

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = api_token or os.environ.get("HUD_API_TOKEN")

    def fetch(self, county: str) -> dict:
        if not self.api_token:
            raise RuntimeError(
                "No HUD API token. Register free at "
                "https://www.huduser.gov/hudapi/public/register and set HUD_API_TOKEN."
            )
        entity_id = f"CA{COUNTY_FIPS[county]}"
        req = urllib.request.Request(
            f"{self.BASE}/{entity_id}",
            headers={"Authorization": f"Bearer {self.api_token}"},
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        return data  # VERIFY: field names in the response against current HUD docs

    def store(self, county: str):
        result = self.fetch(county)
        conn = get_context_db()
        today = date.today().isoformat()
        basic = result.get("data", {}).get("basicdata", result.get("data", {}))
        for key, value in (basic.items() if isinstance(basic, dict) else []):
            if isinstance(value, (int, float)):
                conn.execute(
                    "INSERT OR REPLACE INTO county_context (county, metric, value, unit, source, vintage, fetched_date) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (county, f"fmr_{key}", float(value), "USD/month", self.name,
                     str(result.get("data", {}).get("year", "")), today),
                )
        conn.commit()
        conn.close()
        return result


# --------------------------------------------------------------------------
# 4. GDELT — weekly news/event signal, no key required for basic queries
# --------------------------------------------------------------------------
class GdeltNewsSource:
    """GDELT DOC 2.0 API -- structured, geolocated global news, updated
    continuously, free, documented, built for exactly this kind of
    programmatic pull (no scraping-ToS gray area). Good for a weekly
    "what's happening in this market" signal: zoning changes, disasters,
    major development news, rent-control ballot measures, etc.

    # VERIFY: query syntax and rate limits against
    https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ -- this targets
    their documented ArtList/ArtCount modes as of my training.
    """
    name = "gdelt_news"
    BASE = "https://api.gdeltproject.org/api/v2/doc/doc"

    def fetch(self, county: str, extra_terms: str = "real estate OR zoning OR multifamily OR apartment",
              window_days: int = 7) -> dict:
        query = f'"{county} County" California ({extra_terms})'
        params = {
            "query": query,
            "mode": "artlist",
            "maxrecords": "20",
            "timespan": f"{window_days}d",
            "format": "json",
        }
        url = f"{self.BASE}?{urllib.parse.urlencode(params)}"
        data = _http_get_json(url)
        articles = data.get("articles", [])
        return {
            "query": query,
            "article_count": len(articles),
            "titles": [a.get("title") for a in articles[:10]],
        }

    def store(self, county: str, window_days: int = 7):
        result = self.fetch(county, window_days=window_days)
        conn = get_context_db()
        conn.execute(
            "INSERT INTO news_signal (county, fetched_date, window_days, query, article_count, avg_tone, top_titles) "
            "VALUES (?,?,?,?,?,?,?)",
            (county, date.today().isoformat(), window_days, result["query"],
             result["article_count"], None, json.dumps(result["titles"])),
        )
        conn.commit()
        conn.close()
        return result


# --------------------------------------------------------------------------
# Weekly run — call this from a scheduled task. Each source fails on its own
# without taking the others down (no API key yet is expected, not fatal).
# --------------------------------------------------------------------------
def run_weekly_context(counties: list[str] = ("Kern", "Fresno")) -> dict:
    results = {}
    for county in counties:
        results[county] = {}
        for source_cls, key in ((CensusACSSource, "census"), (HudFmrSource, "hud_fmr"),
                                 (GdeltNewsSource, "gdelt")):
            source = source_cls()
            try:
                results[county][key] = source.store(county) if hasattr(source, "store") else source.fetch(county)
            except Exception as e:  # noqa: BLE001 -- one source's failure shouldn't block the others
                results[county][key] = {"error": f"{type(e).__name__}: {e}"}
    return results


if __name__ == "__main__":
    print(json.dumps(run_weekly_context(), indent=2, default=str))
