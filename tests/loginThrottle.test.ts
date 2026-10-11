/**
 * Admin login attempt limit (audit finding M3). An in-memory store stands
 * in for public.admin_login_attempts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FAILURES,
  WINDOW_MS,
  checkGate,
  clientHash,
  clientIp,
  recordAttempt,
  type AttemptStore,
} from "../lib/loginThrottle";

function memoryStore(clock: { now: number }) {
  const rows: { at: number; hash: string; ok: boolean }[] = [];
  const store: AttemptStore = {
    async countFailures(hash, sinceIso) {
      const since = Date.parse(sinceIso);
      return rows.filter((r) => r.hash === hash && !r.ok && r.at >= since).length;
    },
    async record(hash, ok) {
      rows.push({ at: clock.now, hash, ok });
    },
  };
  return { store, rows };
}

const SECRET = "test-secret-not-real";

test("five failures lock one client for the window; others are unaffected", async () => {
  const clock = { now: Date.parse("2026-10-10T12:00:00Z") };
  const { store } = memoryStore(clock);
  const a = clientHash("203.0.113.7", SECRET);
  const b = clientHash("198.51.100.9", SECRET);

  for (let i = 0; i < MAX_FAILURES; i++) {
    assert.deepEqual(await checkGate(store, a, clock.now), { allowed: true }, `attempt ${i + 1}`);
    await recordAttempt(store, a, false);
    clock.now += 1000;
  }
  assert.deepEqual(await checkGate(store, a, clock.now), { allowed: false, retryAfterSec: WINDOW_MS / 1000 });
  assert.deepEqual(await checkGate(store, b, clock.now), { allowed: true });

  clock.now += WINDOW_MS; // all five failures are now older than the window
  assert.deepEqual(await checkGate(store, a, clock.now), { allowed: true });
});

test("successful logins never count toward the limit", async () => {
  const clock = { now: Date.parse("2026-10-10T12:00:00Z") };
  const { store } = memoryStore(clock);
  const a = clientHash("203.0.113.7", SECRET);
  for (let i = 0; i < 20; i++) await recordAttempt(store, a, true);
  assert.deepEqual(await checkGate(store, a, clock.now), { allowed: true });
});

test("a broken store fails open and recording errors are swallowed", async () => {
  const broken: AttemptStore = {
    countFailures: async () => { throw new Error("relation admin_login_attempts does not exist"); },
    record: async () => { throw new Error("insert failed"); },
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await checkGate(broken, "x".repeat(64)), { allowed: true });
    await recordAttempt(broken, "x".repeat(64), false); // must not throw
  } finally {
    console.error = quiet;
  }
});

test("client IP: Netlify header first, then the first forwarded address", () => {
  assert.equal(clientIp(new Headers({ "x-nf-client-connection-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" })), "198.51.100.9");
  assert.equal(clientIp(new Headers({ "x-real-ip": "192.0.2.4" })), "192.0.2.4");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("client hash: 64 hex chars, stable, and keyed by the secret", () => {
  const h = clientHash("203.0.113.7", SECRET);
  assert.match(h, /^[0-9a-f]{64}$/); // matches the table's check constraint
  assert.equal(h, clientHash("203.0.113.7", SECRET));
  assert.notEqual(h, clientHash("203.0.113.7", "a-different-secret"));
  assert.notEqual(h, clientHash("203.0.113.8", SECRET));
});
