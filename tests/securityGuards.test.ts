/**
 * Production guards that had no tests: admin session cookie, the /admin
 * proxy gate, and the Tally webhook's signature check. No network: the
 * webhook cases all stop before the first database call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.ADMIN_SESSION_SECRET = "test-session-secret-not-real";
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key-not-real";

const sign = (payload: string) => createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("hex");

test("admin cookie: a fresh cookie verifies; forged, tampered and expired ones do not", async () => {
  const { createSessionCookie, verifySessionCookie } = await import("../lib/adminAuth");
  const good = await createSessionCookie();
  assert.equal(await verifySessionCookie(good), true);
  const [exp, sig] = good.split(".");
  assert.equal(await verifySessionCookie(`${Number(exp) + 1000}.${sig}`), false, "extended expiry with old signature");
  assert.equal(await verifySessionCookie(`${exp}.${"0".repeat(sig.length)}`), false, "forged signature");
  const past = String(Date.now() - 1000);
  assert.equal(await verifySessionCookie(`${past}.${sign(past)}`), false, "correctly signed but expired");
  assert.equal(await verifySessionCookie(undefined), false);
  assert.equal(await verifySessionCookie("garbage"), false);
});

test("admin password compare is exact", async () => {
  const { safeStringEqual } = await import("../lib/adminAuth");
  assert.equal(safeStringEqual("correct horse", "correct horse"), true);
  assert.equal(safeStringEqual("correct horse", "correct hors"), false);
  assert.equal(safeStringEqual("", "x"), false);
  assert.equal(safeStringEqual("x\0", "x"), false);
});

test("/admin proxy: no cookie redirects to login; login page and valid cookie pass", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../proxy");
  const { createSessionCookie, COOKIE_NAME } = await import("../lib/adminAuth");
  const anon = await proxy(new NextRequest("https://propops8.com/admin/b5r"));
  assert.equal(anon.status, 307);
  assert.match(anon.headers.get("location") ?? "", /\/admin\/login\?from=%2Fadmin%2Fb5r$/);
  const login = await proxy(new NextRequest("https://propops8.com/admin/login"));
  assert.equal(login.headers.get("location"), null);
  const withCookie = new NextRequest("https://propops8.com/admin/intakes", { headers: { cookie: `${COOKIE_NAME}=${await createSessionCookie()}` } });
  assert.equal((await proxy(withCookie)).headers.get("location"), null);
});

test("Tally webhook: unsigned, tampered or unconfigured requests stop before the database", async () => {
  process.env.TALLY_SIGNING_SECRET = "tally-test-secret-not-real";
  const { POST } = await import("../app/api/tally-webhook/route");
  const body = JSON.stringify({ eventId: "evt_test", data: { responseId: "r1", fields: [] } });
  const sig = createHmac("sha256", process.env.TALLY_SIGNING_SECRET).update(body).digest("base64");
  const req = (b: string, s?: string) =>
    new Request("https://propops8.com/api/tally-webhook", { method: "POST", body: b, headers: s ? { "tally-signature": s } : {} });

  assert.equal((await POST(req(body))).status, 401, "no signature");
  assert.equal((await POST(req(body + " ", sig))).status, 401, "body changed after signing");
  assert.equal((await POST(req(body, sig.slice(0, -2)))).status, 401, "truncated signature");
  delete process.env.TALLY_SIGNING_SECRET;
  assert.equal((await POST(req(body, sig))).status, 500, "missing secret refuses instead of accepting");
});
