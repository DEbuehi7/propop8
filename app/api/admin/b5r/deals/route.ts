// GET  /api/admin/b5r/deals  -> pipeline list
// POST /api/admin/b5r/deals  -> save a deal: the SERVER re-runs the simulation
//      from the submitted inputs, so a stored result is always the engine's own
//      output for those inputs, never a number the browser supplied.
import { NextResponse } from "next/server";
import { db, denyUnlessAdmin, STATUSES, type DealStatus } from "@/lib/b5r/api";
import { parseDealInputs } from "@/lib/b5r/parse";
import { simulate, edoCall, validateDeal, DEFAULT_POLICY, N_ITER, SEED } from "@/lib/b5r/engine";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { data, error } = await db()
    .from("b5r_deals")
    .select("id, deal_id, status, latest_call, latest_result, updated_at, created_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
  return NextResponse.json({ deals: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  let body: { inputs?: unknown; status?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = parseDealInputs(body.inputs);
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join(" ") }, { status: 400 });
  const problems = validateDeal(parsed.deal);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });
  const status = STATUSES.includes(body.status as DealStatus) ? (body.status as DealStatus) : undefined;

  const result = simulate(parsed.deal, DEFAULT_POLICY, N_ITER, SEED);
  const call = edoCall(result, DEFAULT_POLICY);
  const supabase = db();

  const { data: existing, error: selErr } = await supabase.from("b5r_deals").select("id").eq("deal_id", parsed.deal.dealId).maybeSingle();
  if (selErr) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });

  const fields = { inputs: parsed.deal, latest_call: call.call, latest_result: result, updated_at: new Date().toISOString(), ...(status ? { status } : {}) };
  const write = existing
    ? await supabase.from("b5r_deals").update(fields).eq("deal_id", parsed.deal.dealId)
    : await supabase.from("b5r_deals").insert({ deal_id: parsed.deal.dealId, ...fields });
  if (write.error) return NextResponse.json({ error: "Could not save deal" }, { status: 500 });

  const { data: run, error: runErr } = await supabase
    .from("b5r_runs")
    .insert({ deal_id: parsed.deal.dealId, inputs: parsed.deal, result, call: call.call, reasons: call.reasons, policy_id: call.policyId, n_iterations: N_ITER, seed: SEED })
    .select("id")
    .single();
  if (runErr) return NextResponse.json({ error: "Deal saved but run history failed" }, { status: 500 });

  return NextResponse.json({ ok: true, dealId: parsed.deal.dealId, runId: run.id, call });
}
