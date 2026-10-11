/**
 * Admin login attempt limit (audit finding M3).
 *
 * Five failed attempts from one client within 15 minutes locks that client
 * out until the window passes. Clients are identified by an HMAC of their
 * IP address keyed with ADMIN_SESSION_SECRET, so raw IPs are never stored.
 *
 * No global lock on purpose: a global lock would let anyone lock the owner
 * out by failing from many addresses. With a 20+ character password,
 * spreading guesses across addresses is still hopeless.
 *
 * Fails open (allows the attempt, logs the problem) if the attempts table
 * is unreachable, so a missing migration can never lock the owner out.
 */
import { createHmac } from "node:crypto";

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;

export interface AttemptStore {
  /** Failed attempts for this client since the given time. */
  countFailures(clientHash: string, sinceIso: string): Promise<number>;
  record(clientHash: string, ok: boolean): Promise<void>;
}

export function clientIp(headers: Headers): string {
  const nf = headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function clientHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(`admin-login:${ip}`).digest("hex");
}

export type Gate = { allowed: true } | { allowed: false; retryAfterSec: number };

export async function checkGate(store: AttemptStore, hash: string, now = Date.now()): Promise<Gate> {
  try {
    const failures = await store.countFailures(hash, new Date(now - WINDOW_MS).toISOString());
    return failures >= MAX_FAILURES ? { allowed: false, retryAfterSec: WINDOW_MS / 1000 } : { allowed: true };
  } catch (e) {
    console.error("[admin-login] attempt limit unavailable; allowing", (e as Error).message);
    return { allowed: true };
  }
}

export async function recordAttempt(store: AttemptStore, hash: string, ok: boolean): Promise<void> {
  try {
    await store.record(hash, ok);
  } catch (e) {
    console.error("[admin-login] could not record attempt", (e as Error).message);
  }
}
