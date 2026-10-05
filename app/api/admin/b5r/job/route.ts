// GET -> recent runs of the weekly AIM-B5R data job (see aim-b5r-engine/run_scheduled.py)
import { NextResponse } from "next/server";
import { db, denyUnlessAdmin } from "@/lib/b5r/api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { data, error } = await db().from("b5r_job_runs").select("id, started_at, finished_at, ok, summary, trigger").order("started_at", { ascending: false }).limit(8);
  if (error) return NextResponse.json({ error: "Query failed (has migration 008 been run?)" }, { status: 500 });
  return NextResponse.json({ runs: data ?? [] });
}
