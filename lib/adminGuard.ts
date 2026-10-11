import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/adminAuth";

/**
 * Returns a 401 response unless the request carries a valid admin session
 * cookie, else null. Same rule as the /admin pages and the admin API.
 */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  return (await verifySessionCookie(store.get(COOKIE_NAME)?.value))
    ? null
    : NextResponse.json({ error: "Not authenticated", signIn: "/admin/login" }, { status: 401 });
}
