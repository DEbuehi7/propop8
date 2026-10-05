import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verifySessionCookie, COOKIE_NAME } from "@/lib/adminAuth";

export const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });

/** Returns a 401 response when the admin cookie is missing/invalid, else null. */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  const store = await cookies();
  return (await verifySessionCookie(store.get(COOKIE_NAME)?.value)) ? null : NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export const STATUSES = ["screening", "modeling", "offer", "bought", "rehab", "stabilized", "refinanced", "dead"] as const;
export type DealStatus = (typeof STATUSES)[number];
