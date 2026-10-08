"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CALIBRATION_METRICS, type CalibrationMetric, type CalibrationStats } from "@/lib/b5r/calibration";
import type { SimResult } from "@/lib/b5r/engine";

const STATUSES = ["screening", "modeling", "offer", "bought", "rehab", "stabilized", "refinanced", "dead"];
const CALL_COLOR: Record<string, string> = { EXECUTE: "#4FD69C", DEFER: "#A3A9B8", ESCALATE: "#F2A33A", KILL: "#E92AD6" };
const usd = (n: number) => (Number.isFinite(n) ? (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US") : "—");
const pc = (n: number) => `${Math.round(n * 100)}%`;

interface DealRow { id: string; deal_id: string; status: string; latest_call: string | null; latest_result: SimResult | null; updated_at: string }
interface Run { id: string; call: string; reasons: string[]; created_at: string; n_iterations: number; result: SimResult }
interface Calib { id: string; metric: string; predicted_p50: number; actual: number; error_pct_of_p50: number | null; source: string; logged_at: string; run_id: string }
interface Detail { deal: DealRow; runs: Run[]; calibration: Calib[]; stats: Record<string, CalibrationStats | null> }

interface JobRun { id: string; started_at: string; ok: boolean; summary: string; trigger: string }
const STALE_DAYS = 9; // job is weekly; a run older than this means it stopped

export default function B5rPipeline() {
  // Fixed once per page load, so render stays pure.
  const [now] = useState(() => Date.now());
  const [job, setJob] = useState<JobRun[] | "unavailable" | null>(null);
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ runId: "", metric: "stabilizedNoi" as CalibrationMetric, actual: "", source: "" });

  const loadList = useCallback(async () => {
    const res = await fetch("/api/admin/b5r/deals", { cache: "no-store" });
    if (!res.ok) { setMsg(res.status === 401 ? "Sign in to admin first." : "Could not load the pipeline (has migration 007 been run?)."); setDeals([]); return; }
    setDeals((await res.json()).deals);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/b5r/deals/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) { setMsg("Could not load that deal."); return; }
    const d: Detail = await res.json();
    setDetail(d); setForm((f) => ({ ...f, runId: d.runs[0]?.id ?? "" }));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    fetch("/api/admin/b5r/job", { cache: "no-store" })
      .then(async (r) => (r.ok ? setJob((await r.json()).runs) : setJob("unavailable")))
      .catch(() => setJob("unavailable"));
  }, []);
  useEffect(() => { if (open) { setDetail(null); loadDetail(open); } }, [open, loadDetail]);

  async function setStatus(dealId: string, status: string) {
    const res = await fetch(`/api/admin/b5r/deals/${encodeURIComponent(dealId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setMsg(res.ok ? `${dealId} → ${status}` : "Could not change status.");
    loadList();
  }
  async function logActual(e: React.FormEvent) {
    e.preventDefault();
    const actual = Number(form.actual.replace(/[$,\s]/g, ""));
    if (!open || !form.runId || !form.actual.trim() || !Number.isFinite(actual)) { setMsg("Pick a run and enter the actual as a number."); return; }
    const res = await fetch("/api/admin/b5r/calibration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: open, runId: form.runId, metric: form.metric, actual, source: form.source }) });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Logged. Error vs P50: ${body.errorPctOfP50 === null ? "n/a" : pc(body.errorPctOfP50)}` : body.error ?? "Failed.");
    if (res.ok) { setForm((f) => ({ ...f, actual: "", source: "" })); loadDetail(open); }
  }

  const card: React.CSSProperties = { padding: 14, borderRadius: 12, background: "#111a33", border: "1px solid rgba(233,235,239,.12)" };
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0b1224", border: "1px solid rgba(233,235,239,.2)", borderRadius: 6, color: "#e9ebef", padding: "8px 9px", font: "14px Inter, system-ui, sans-serif" };

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 16px 80px", color: "#cbd5e1", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>AIM-B5R pipeline</h1>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#8e9ab3", maxWidth: 680, lineHeight: 1.55 }}>
        Deals saved from the <Link href="/brrrr" style={{ color: "#3DDCE8" }}>simulator</Link>. Every saved run is kept as history. Log what actually happened (the NOI you really got, the real rehab spend) and the model&apos;s error is tracked per metric, so you know when to widen a range.
      </p>
      {job !== null && (() => {
        const last = job === "unavailable" ? null : job[0];
        const ageDays = last ? (now - new Date(last.started_at).getTime()) / 864e5 : Infinity;
        const bad = job === "unavailable" || !last || !last.ok || ageDays > STALE_DAYS;
        const text = job === "unavailable" ? "Weekly data job: status unavailable (has migration 008 been run?)."
          : !last ? "Weekly data job: no runs recorded yet. Check the GitHub Actions workflow “AIM-B5R weekly data job”."
          : `Weekly data job: last run ${new Date(last.started_at).toLocaleDateString()} (${last.trigger}) — ${last.ok ? "healthy" : "UNHEALTHY"}: ${last.summary}${ageDays > STALE_DAYS ? ` — NOT RUN IN ${Math.floor(ageDays)} DAYS, it may have stopped` : ""}`;
        return <div role="status" style={{ ...card, padding: "10px 12px", marginBottom: 14, borderLeft: `3px solid ${bad ? "#E92AD6" : "#4FD69C"}`, fontSize: 13 }}>{text}</div>;
      })()}
      {msg && <div role="status" style={{ ...card, padding: "10px 12px", marginBottom: 14 }}>{msg}</div>}
      {deals === null && <p>Loading…</p>}
      {deals?.length === 0 && !msg && <p>No deals yet. Run a simulation and choose “Save to pipeline”.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {deals?.map((d) => {
          const g = d.latest_result?.gates;
          return (
            <div key={d.id} style={{ ...card, borderLeft: `3px solid ${CALL_COLOR[d.latest_call ?? ""] ?? "#A3A9B8"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setOpen(open === d.deal_id ? null : d.deal_id)} aria-expanded={open === d.deal_id}
                  style={{ background: "none", border: "none", color: "#fff", font: "700 15px Inter, system-ui, sans-serif", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  {open === d.deal_id ? "▾" : "▸"} {d.deal_id}
                </button>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: CALL_COLOR[d.latest_call ?? ""] ?? "#A3A9B8" }}>{d.latest_call ?? "—"}</span>
              </div>
              <div style={{ fontSize: 13, margin: "6px 0", display: "flex", gap: 16, flexWrap: "wrap", color: "#8e9ab3" }}>
                {g && <span>DSCR pass {pc(g.dscrPassProbability)}</span>}
                {d.latest_result && <span>P50 cash left in {usd(d.latest_result.cashLeftIn.p50)}</span>}
                <span>updated {new Date(d.updated_at).toLocaleDateString()}</span>
              </div>
              <label style={{ fontSize: 12, color: "#8e9ab3" }}>Stage{" "}
                <select value={d.status} onChange={(e) => setStatus(d.deal_id, e.target.value)} style={{ ...input, width: "auto", marginLeft: 6 }}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>

              {open === d.deal_id && (
                <div style={{ marginTop: 14, borderTop: "1px solid rgba(233,235,239,.12)", paddingTop: 14 }}>
                  {!detail ? <p>Loading…</p> : (
                    <>
                      <Link href={`/brrrr?deal=${encodeURIComponent(d.deal_id)}`} style={{ color: "#3DDCE8", fontSize: 13 }}>Open these inputs in the simulator →</Link>

                      <h2 style={{ color: "#fff", fontSize: 14, margin: "16px 0 8px" }}>Run history</h2>
                      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                        {detail.runs.map((r) => (
                          <div key={r.id} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <span style={{ color: "#8e9ab3" }}>{new Date(r.created_at).toLocaleString()}</span>
                            <b style={{ color: CALL_COLOR[r.call] }}>{r.call}</b>
                            <span>NOI P50 {usd(r.result.stabilizedNoi.p50)} · cash left in P50 {usd(r.result.cashLeftIn.p50)}</span>
                          </div>
                        ))}
                      </div>

                      <h2 style={{ color: "#fff", fontSize: 14, margin: "18px 0 8px" }}>Log what actually happened</h2>
                      <form onSubmit={logActual} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, alignItems: "end" }}>
                        <label style={{ fontSize: 12 }}>Against run<select style={input} value={form.runId} onChange={(e) => setForm({ ...form, runId: e.target.value })}>
                          {detail.runs.map((r) => <option key={r.id} value={r.id}>{new Date(r.created_at).toLocaleDateString()} · {r.call}</option>)}</select></label>
                        <label style={{ fontSize: 12 }}>Metric<select style={input} value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as CalibrationMetric })}>
                          {Object.entries(CALIBRATION_METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                        <label style={{ fontSize: 12 }}>Actual<input style={input} inputMode="decimal" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} /></label>
                        <label style={{ fontSize: 12 }}>Source<input style={input} placeholder="T-12, invoice, closing statement…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
                        <button type="submit" style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #4FD69C", background: "transparent", color: "#4FD69C", font: "600 13px Inter, system-ui, sans-serif", cursor: "pointer" }}>Log actual</button>
                      </form>

                      {detail.calibration.length > 0 && (
                        <div style={{ overflowX: "auto", marginTop: 12 }}>
                          <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 12.5 }}>
                            <thead><tr style={{ color: "#8e9ab3", textAlign: "left" }}><th>Logged</th><th>Metric</th><th style={{ textAlign: "right" }}>Predicted P50</th><th style={{ textAlign: "right" }}>Actual</th><th style={{ textAlign: "right" }}>Error</th></tr></thead>
                            <tbody>{detail.calibration.map((c) => (
                              <tr key={c.id} style={{ borderTop: "1px solid rgba(233,235,239,.08)" }}>
                                <td style={{ padding: "6px 0" }}>{new Date(c.logged_at).toLocaleDateString()}</td>
                                <td>{CALIBRATION_METRICS[c.metric as CalibrationMetric] ?? c.metric}</td>
                                <td style={{ textAlign: "right" }}>{Number(c.predicted_p50).toLocaleString()}</td>
                                <td style={{ textAlign: "right" }}>{Number(c.actual).toLocaleString()}</td>
                                <td style={{ textAlign: "right" }}>{c.error_pct_of_p50 === null ? "n/a" : pc(Number(c.error_pct_of_p50))}</td>
                              </tr>))}</tbody>
                          </table>
                        </div>
                      )}

                      <h2 style={{ color: "#fff", fontSize: 14, margin: "18px 0 8px" }}>How wrong has the model been? (all deals)</h2>
                      {Object.entries(detail.stats).filter(([, s]) => s).length === 0 ? <p style={{ fontSize: 13, color: "#8e9ab3" }}>No actuals logged yet.</p> : (
                        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                          {Object.entries(detail.stats).filter(([, s]) => s).map(([m, s]) => (
                            <div key={m}>{CALIBRATION_METRICS[m as CalibrationMetric]}: n={s!.n}, mean error {pc(s!.meanErrorPct)}, spread {pc(s!.stdErrorPct)}, inside P10–P90 {pc(s!.withinP10P90)} — <b style={{ color: s!.recommendation === "widen range" ? "#F2A33A" : "#4FD69C" }}>{s!.recommendation}</b></div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
