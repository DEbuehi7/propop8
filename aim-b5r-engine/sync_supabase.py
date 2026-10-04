"""
Supabase persistence for the scheduled AIM-B5R job. Standard library only.

GitHub Actions runners are throwaway, but the whole point of the aggregator is
a dataset that accumulates for a year or two. So the SQLite file lives in a
private Supabase Storage bucket: download it before a run, upload it after.

Safety rule, enforced in run_scheduled.py: if the download fails for any reason
OTHER than "object doesn't exist yet", the run aborts. Uploading a fresh empty
database over a good one because of a network blip would silently destroy the
dataset.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the same values the web app
uses as NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
"""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

BUCKET = "b5r-data"
LIVE_OBJECT = "aim_b5r.sqlite3"


class SyncError(RuntimeError):
    pass


class Supabase:
    def __init__(self, url: str | None = None, key: str | None = None):
        self.url = (url or os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not self.url or not self.key:
            raise SyncError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")

    def _req(self, method: str, path: str, body: bytes | None = None, headers: dict | None = None, timeout: int = 120):
        h = {"Authorization": f"Bearer {self.key}", "apikey": self.key, **(headers or {})}
        req = urllib.request.Request(f"{self.url}{path}", data=body, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()
        except urllib.error.URLError as e:
            raise SyncError(f"Could not reach Supabase: {e.reason}") from e

    def ensure_bucket(self) -> None:
        status, body = self._req("POST", "/storage/v1/bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode(),
                                 {"Content-Type": "application/json"})
        if status in (200, 201):
            return
        # Already-exists comes back as 409, or 400 with a "Duplicate"/"already exists" body depending on version.
        if status == 409 or b"already exists" in body.lower() or b"duplicate" in body.lower():
            return
        raise SyncError(f"Could not create bucket {BUCKET}: HTTP {status} {body[:200]!r}")

    def download_db(self, dest: Path) -> bool:
        """True if downloaded; False if the object genuinely doesn't exist yet (first run).
        Any other failure raises SyncError so the caller aborts instead of overwriting."""
        status, body = self._req("GET", f"/storage/v1/object/authenticated/{BUCKET}/{LIVE_OBJECT}")
        if status == 200:
            if not body.startswith(b"SQLite format 3\x00"):
                raise SyncError("Downloaded object is not a SQLite database; refusing to continue.")
            dest.write_bytes(body)
            return True
        lowered = body.lower()
        if status == 404 or (status == 400 and (b"not found" in lowered or b"not_found" in lowered)):
            return False
        raise SyncError(f"Download failed: HTTP {status} {body[:200]!r}")

    def upload(self, name: str, data: bytes) -> None:
        status, body = self._req("POST", f"/storage/v1/object/{BUCKET}/{name}", data,
                                 {"Content-Type": "application/octet-stream", "x-upsert": "true"})
        if status not in (200, 201):
            raise SyncError(f"Upload of {name} failed: HTTP {status} {body[:200]!r}")

    def record_run(self, row: dict) -> None:
        status, body = self._req("POST", "/rest/v1/b5r_job_runs", json.dumps(row, default=str).encode(),
                                 {"Content-Type": "application/json", "Prefer": "return=minimal"})
        if status not in (200, 201, 204):
            raise SyncError(f"Could not record run: HTTP {status} {body[:200]!r} (has migration 008 been run?)")


def snapshot(db_path: Path) -> bytes:
    """Consistent copy of a live SQLite file (uses SQLite's own backup API)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "snap.sqlite3"
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(out)
        try:
            src.backup(dst)
        finally:
            dst.close()
            src.close()
        return out.read_bytes()
