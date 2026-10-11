import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { COOKIE_NAME, createSessionCookie, safeStringEqual } from "@/lib/adminAuth";
import {
  checkGate,
  clientHash,
  clientIp,
  recordAttempt,
  type AttemptStore,
} from "@/lib/loginThrottle";

export const runtime = "nodejs"; // node:crypto for the client hash

/**
 * Attempts live in public.admin_login_attempts (migration 011) in the
 * PropOps8 project. Any error here makes the limit fail open, so a missing
 * table or an outage can never lock the owner out.
 */
const attemptStore: AttemptStore = {
  async countFailures(hash, sinceIso) {
    const { count, error } = await db()
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("client_hash", hash)
      .eq("ok", false)
      .gte("at", sinceIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
  async record(hash, ok) {
    const { error } = await db().from("admin_login_attempts").insert({ client_hash: hash, ok });
    if (error) throw new Error(error.message);
  },
};

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not set on the server." },
      { status: 500 },
    );
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Without the session secret no cookie can be issued anyway (500 below),
  // so the limit only runs when it is set.
  const secret = process.env.ADMIN_SESSION_SECRET;
  const hash = secret ? clientHash(clientIp(req.headers), secret) : null;
  if (hash) {
    const gate = await checkGate(attemptStore, hash);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
      );
    }
  }

  if (!safeStringEqual(password, expected)) {
    if (hash) await recordAttempt(attemptStore, hash, false);
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  if (hash) await recordAttempt(attemptStore, hash, true);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await createSessionCookie(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
