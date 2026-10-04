"""Tests for the scheduled job's persistence + health logic, against a stub Supabase.
Run: python3 -m unittest test_scheduled -v"""
import json, sqlite3, tempfile, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import aim_b5r_aggregator as agg
import run_scheduled as rs
import run_weekly
import sync_supabase as sync


class Stub(BaseHTTPRequestHandler):
    store: dict = {}; runs: list = []; download_mode = "ok"; bucket_status = 200
    def log_message(self, *a): pass
    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code); self.send_header("Content-Type", ctype); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = self.rfile.read(n)
        if self.path == "/storage/v1/bucket": return self._send(Stub.bucket_status, b'{"error":"Duplicate","message":"The resource already exists"}' if Stub.bucket_status == 400 else b"{}")
        if self.path.startswith("/storage/v1/object/b5r-data/"):
            assert self.headers.get("x-upsert") == "true" and "Bearer" in self.headers.get("Authorization", "")
            Stub.store[self.path.split("/b5r-data/")[1]] = body; return self._send(200, b"{}")
        if self.path == "/rest/v1/b5r_job_runs": Stub.runs.append(json.loads(body)); return self._send(201)
        self._send(404)
    def do_GET(self):
        if self.path == "/storage/v1/object/authenticated/b5r-data/aim_b5r.sqlite3":
            m = Stub.download_mode
            if m == "missing": return self._send(400, b'{"statusCode":"404","error":"not_found","message":"Object not found"}')
            if m == "missing404": return self._send(404, b"{}")
            if m == "error": return self._send(500, b"boom")
            if m == "garbage": return self._send(200, b"<html>not a db</html>")
            return self._send(200, Stub.store["aim_b5r.sqlite3"], "application/octet-stream")
        self._send(404)


def fake_report(ctx_ok=True):
    def main():
        conn = agg.get_db(); conn.execute("create table if not exists ran(x)"); conn.execute("insert into ran values (1)"); conn.commit(); conn.close()
        return {"parcel_sources": {"sources": []}, "context_sources": {"Kern": {"census": {"pop": 1} if ctx_ok else {"error": "x"}, "hud_fmr": {"error": "no token"}, "gdelt": {"error": "net"}}}}
    return main


class Scheduled(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), Stub); threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.client = sync.Supabase(f"http://127.0.0.1:{cls.srv.server_port}", "k")
    @classmethod
    def tearDownClass(cls): cls.srv.shutdown()
    def setUp(self):
        Stub.store, Stub.runs, Stub.download_mode, Stub.bucket_status = {}, [], "missing", 200
        self.tmp = tempfile.TemporaryDirectory(); self.db = Path(self.tmp.name) / "t.sqlite3"
        self._p = agg.DB_PATH; agg.DB_PATH = self.db; self._m = run_weekly.main
    def tearDown(self):
        agg.DB_PATH = self._p; run_weekly.main = self._m; self.tmp.cleanup()

    def test_first_run_starts_fresh_then_uploads_live_and_backup(self):
        run_weekly.main = fake_report()
        self.assertEqual(rs.main(self.client, self.db), 0)
        self.assertIn("aim_b5r.sqlite3", Stub.store)
        self.assertTrue(any(k.startswith("backups/") for k in Stub.store))
        self.assertEqual(len(Stub.runs), 1); self.assertTrue(Stub.runs[0]["ok"])

    def test_404_style_missing_also_means_first_run(self):
        Stub.download_mode = "missing404"; run_weekly.main = fake_report()
        self.assertEqual(rs.main(self.client, self.db), 0)

    def test_existing_dataset_is_restored_and_extended_not_replaced(self):
        run_weekly.main = fake_report(); rs.main(self.client, self.db)           # week 1
        self.db.unlink(); Stub.download_mode = "ok"                              # fresh runner
        self.assertEqual(rs.main(self.client, self.db), 0)                       # week 2
        rows = sqlite3.connect(sync_db := Path(self.tmp.name) / "check.sqlite3") if False else None
        chk = Path(self.tmp.name) / "check.sqlite3"; chk.write_bytes(Stub.store["aim_b5r.sqlite3"])
        self.assertEqual(sqlite3.connect(chk).execute("select count(*) from ran").fetchone()[0], 2)

    def test_download_failure_aborts_without_touching_stored_data(self):
        Stub.store["aim_b5r.sqlite3"] = b"SQLite format 3\x00precious"; Stub.download_mode = "error"; run_weekly.main = fake_report()
        with self.assertRaises(sync.SyncError): rs.main(self.client, self.db)
        self.assertEqual(Stub.store["aim_b5r.sqlite3"], b"SQLite format 3\x00precious"); self.assertEqual(Stub.runs, [])

    def test_garbage_download_aborts(self):
        Stub.download_mode = "garbage"; run_weekly.main = fake_report()
        with self.assertRaises(sync.SyncError): rs.main(self.client, self.db)
        self.assertEqual(Stub.store, {})

    def test_bucket_already_exists_is_fine(self):
        Stub.bucket_status = 400; run_weekly.main = fake_report(); self.assertEqual(rs.main(self.client, self.db), 0)

    def test_all_context_failing_is_unhealthy_exit_1_but_still_saved_and_recorded(self):
        run_weekly.main = fake_report(ctx_ok=False)
        self.assertEqual(rs.main(self.client, self.db), 1)
        self.assertIn("aim_b5r.sqlite3", Stub.store); self.assertFalse(Stub.runs[0]["ok"])

    def test_assess(self):
        ok = {"census": {"a": 1}, "hud": {"error": "e"}}
        self.assertEqual(rs.assess({"context_sources": {"Kern": ok}, "parcel_sources": {}})[0], True)
        self.assertEqual(rs.assess({"context_sources": {"error": "boom"}})[0], False)
        self.assertEqual(rs.assess({"context_sources": {"Kern": {"census": {"error": "e"}}}})[0], False)
        self.assertEqual(rs.assess({"context_sources": {"Kern": ok}, "parcel_sources": {"error": "x"}})[0], False)
        self.assertEqual(rs.assess({})[0], False)

    def test_missing_credentials_raise(self):
        with self.assertRaises(sync.SyncError): sync.Supabase("", "")


if __name__ == "__main__":
    unittest.main()
