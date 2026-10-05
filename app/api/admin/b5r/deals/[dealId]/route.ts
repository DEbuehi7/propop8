// GET   -> deal + run history + calibration log + per-metric error stats
// PATCH -> { status } move the deal through the pipeline
import { NextResponse } from "next/server";
import { db, denyUnlessAdmin, STATUSES, type DealStatus } from "@/lib/b5r/api";
import { calibrationStats, CALIBRATION_METRICS } from "@/lib/b5r/calibration";

type Ctx = { params: Promise<{ dealId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { dealId } = await params;
  const supabase = db();

  const { data: deal, error } = await supabase.from("b5r_deals").select("*").eq("deal_id", dealId).maybeSingle();
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const [runs, calib, allCalib] = await Promise.all([
    supabase.from("b5r_runs").select("id, call, reasons, policy_id, n_iterations, seed, created_at, result").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(50),
    supabase.from("b5r_calibration").select("*").eq("deal_id", dealId).order("logged_at", { ascending: false }),
    // stats are portfolio-wide: how wrong has the model been, per metric, across every deal
    supabase.from("b5r_calibration").select("metric, error_pct_of_p50, predicted_p10, predicted_p90, actual"),
  ]);
  if (runs.error || calib.error || allCalib.error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const stats: Record<string, ReturnType<typeof calibrationStats>> = {};
  for (const m of Object.keys(CALIBRATION_METRICS)) {
    stats[m] = calibrationStats((allCalib.data ?? []).filter((r) => r.metric === m).map((r) => ({ ...r, error_pct_of_p50: r.error_pct_of_p50 === null ? null : Number(r.error_pct_of_p50), predicted_p10: Number(r.predicted_p10), predicted_p90: Number(r.predicted_p90), actual: Number(r.actual) })));
  }
  return NextResponse.json({ deal, runs: runs.data ?? [], calibration: calib.data ?? [], stats });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { dealId } = await params;
  let body: { status?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!STATUSES.includes(body.status as DealStatus)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  const { error, count } = await db().from("b5r_deals").update({ status: body.status, updated_at: new Date().toISOString() }, { count: "exact" }).eq("deal_id", dealId);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
