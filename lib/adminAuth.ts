/**
 * lib/adminAuth.ts
 * ----------------------------------------------------------------
 * Minimal session auth for the /admin area. Deliberately not a full
 * auth system -- this is a single-operator internal tool, gated by
 * one shared password, not a multi-user login. If that ever changes
 * (a second reviewer, customers logging in), swap this for real
 * Supabase Auth rather than extending it.
 *
 * Uses the Web Crypto API (crypto.subtle) rather than Node's
 * `crypto` module on purpose: Next.js Middleware runs on the Edge
 * runtime by default, which does not support Node's crypto module,
 * but does support Web Crypto. Writing it this way means the same
 * function works unmodified in middleware.ts (Edge) and in the API
 * route (Node) -- no need to special-case either.
 *
 * ENV VARS REQUIRED (set in Netlify's site settings, not committed):
 *   ADMIN_PASSWORD          the shared password you type at /admin/login
 *   ADMIN_SESSION_SECRET    any long random string, used to sign the
 *                           session cookie so it can't be forged.
 *                           Generate one with: openssl rand -hex 32
 */

export const COOKIE_NAME = "propops8_admin";
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

function requireSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set. Add it in Netlify env vars -- " +
        "generate one with `openssl rand -hex 32`.",
    );
  }
  return secret;
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bufToHex(sig);
}

/** Constant-time-ish compare for two equal-length hex strings. */
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Plain string compare, but constant-time -- used for the password itself. */
export function safeStringEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  const aPad = a.padEnd(maxLen, "\0");
  const bPad = b.padEnd(maxLen, "\0");
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) diff |= aPad.charCodeAt(i) ^ bPad.charCodeAt(i);
  return diff === 0;
}

export async function createSessionCookie(): Promise<string> {
  const secret = requireSecret();
  const expires = Date.now() + SESSION_MS;
  const sig = await hmac(String(expires), secret);
  return `${expires}.${sig}`;
}

export async function verifySessionCookie(cookie: string | undefined | null): Promise<boolean> {
  if (!cookie) return false;
  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return false;
  const secret = requireSecret();
  const expected = await hmac(payload, secret);
  if (!hexEqual(expected, sig)) return false;
  const expires = Number(payload);
  return Number.isFinite(expires) && Date.now() < expires;
}
