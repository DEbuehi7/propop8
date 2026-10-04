// POST { dealId, runId, metric, actual, source? }
// The prediction is read from the stored run server-side — the client only
// supplies what actually happened, so the log can't be fed a made-up P50.
import { NextResponse } from "next/server";
import { db, denyUnlessAdmin } from "@/lib/b5r/api";
import { isCalibrationMetric, predictedFor, errorPctOfP50 } from "@/lib/b5r/calibration";
import type { SimResult } from "@/lib/b5r/engine";

export async function POST(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  let b: { dealId?: unknown; runId?: unknown; metric?: unknown; actual?: unknown; source?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof b.dealId !== "string" || typeof b.runId !== "string") return NextResponse.json({ error: "dealId and runId are required" }, { status: 400 });
  if (!isCalibrationMetric(b.metric)) return NextResponse.json({ error: "Unknown metric" }, { status: 400 });
  if (typeof b.actual !== "number" || !Number.isFinite(b.actual)) return NextResponse.json({ error: "Actual must be a number" }, { status: 400 });

  const supabase = db();
  const { data: run, error } = await supabase.from("b5r_runs").select("id, deal_id, result").eq("id", b.runId).maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!run || run.deal_id !== b.dealId) return NextResponse.json({ error: "Run not found for this deal" }, { status: 404 });

  const p = predictedFor(run.result as SimResult, b.metric);
  const row = {
    deal_id: b.dealId, run_id: b.runId, metric: b.metric,
    predicted_p10: p.p10, predicted_p50: p.p50, predicted_p90: p.p90,
    actual: b.actual, error_pct_of_p50: errorPctOfP50(p, b.actual),
    source: typeof b.source === "string" ? b.source.slice(0, 300) : "",
  };
  const { error: insErr } = await supabase.from("b5r_calibration").insert(row);
  if (insErr) return NextResponse.json({ error: "Could not log actual" }, { status: 500 });
  return NextResponse.json({ ok: true, errorPctOfP50: row.error_pct_of_p50 });
}
