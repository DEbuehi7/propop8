"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_POLICY, TRI_FIELDS, validateDeal, type DealInputs, type Pct, type Tri, type TriField } from "@/lib/b5r/engine";
import { EXAMPLE_DEAL } from "@/lib/b5r/example";
import { useB5r } from "./useB5r";

const T = { navy: "#1B243D", navyDeep: "#141B2E", slate: "#5C6478", gray: "#E9EBEF", cyan: "#3DDCE8", magenta: "#E92AD6" };
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" } as const;
const SAVE_KEY = "brrrr:simruns";

const LABELS: Record<TriField, [string, string]> = {
  rehabCost: ["Rehab cost", "$ total, before contingency"],
  rehabDurationMonths: ["Rehab duration", "months"],
  grossPotentialRentMonthly: ["Gross potential rent", "$/month, all units, stabilized"],
  vacancyCreditLossPct: ["Vacancy + credit loss", "fraction, e.g. 0.07 (floor 5%)"],
  otherIncomeMonthly: ["Other income", "$/month"],
  opexAnnualExCapex: ["Operating expenses", "$/year, excl. tax, insurance, mgmt, reserves"],
  propertyTaxAnnual: ["Property tax", "$/year"],
  insuranceAnnual: ["Insurance", "$/year"],
  exitCapRate: ["Exit cap rate", "fraction, e.g. 0.065"],
  refiRate: ["Refi rate", "fraction, e.g. 0.072"],
  holdingCostMonthly: ["Holding cost during rehab", "$/month"],
};
const FIXED: [keyof DealInputs, string, string][] = [
  ["units", "Units", ""], ["purchasePrice", "Purchase price", "$"], ["buyClosingCosts", "Buy closing costs", "$"],
  ["acquisitionLoanAmount", "Acquisition loan", "$"], ["acquisitionLoanRate", "Acquisition rate", "fraction"],
  ["refiAmortizationYears", "Refi amortization", "years"], ["refiClosingCostsPct", "Refi closing costs", "fraction of loan"],
];

type Form = Record<string, string>;
function toForm(d: DealInputs): Form {
  const f: Form = { dealId: d.dealId };
  for (const [k] of FIXED) f[k as string] = String(d[k]);
  for (const k of TRI_FIELDS) { const t = d[k]; Object.assign(f, { [`${k}.low`]: String(t.low), [`${k}.mode`]: String(t.mode), [`${k}.high`]: String(t.high), [`${k}.provenance`]: t.provenance, [`${k}.source`]: t.source }); }
  return f;
}
function fromForm(f: Form, base: DealInputs): DealInputs {
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[$,\s]/g, "")));
  const d: DealInputs = { ...base, dealId: f.dealId.trim() || "UNTITLED" };
  for (const [k] of FIXED) (d as unknown as Record<string, number>)[k as string] = n(f[k as string]);
  const today = new Date().toISOString().slice(0, 10);
  for (const k of TRI_FIELDS) {
    const prov = f[`${k}.provenance`] as Tri["provenance"];
    d[k] = { ...base[k], low: n(f[`${k}.low`]), mode: n(f[`${k}.mode`]), high: n(f[`${k}.high`]), provenance: prov, source: f[`${k}.source`], date: today, confidence: prov === "observed" ? "high" : prov === "modeled" ? "med" : "low" };
  }
  return d;
}

const usd = (n: number) => (Number.isFinite(n) ? (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US") : "—");
const pc = (n: number, dp = 0) => (Number.isFinite(n) ? `${(n * 100).toFixed(dp)}%` : "—");
const x2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

const inputStyle = { width: "100%", background: T.navyDeep, border: `1px solid ${T.slate}55`, borderRadius: 3, color: T.gray, fontSize: 14, padding: "7px 8px", outline: "none", fontFamily: FONT, boxSizing: "border-box" as const, ...NUM };
const callColor = { EXECUTE: T.cyan, DEFER: T.gray, ESCALATE: T.gray, KILL: T.magenta } as const;

const Rule = ({ label }: { label: string }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 14px" }}>
    <span style={{ color: T.gray, fontSize: 13.5 }}>{label}</span><span style={{ flex: 1, height: 1, background: `${T.slate}44` }} />
  </div>
);

function Tile({ label, value, ok, sub }: { label: string; value: string; ok?: boolean; sub?: string }) {
  const c = ok === undefined ? T.gray : ok ? T.cyan : T.magenta;
  return (
    <div style={{ background: T.navyDeep, border: `1px solid ${T.slate}33`, borderRadius: 4, padding: "12px 14px" }}>
      <div style={{ color: T.slate, fontSize: 11.5 }}>{label}</div>
      <div style={{ color: c, fontSize: 22, fontWeight: 600, marginTop: 3, ...NUM }}>{value} <span aria-hidden style={{ fontSize: 14 }}>{ok === undefined ? "" : ok ? "✓" : "✕"}</span></div>
      {sub && <div style={{ color: T.slate, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MetricRow({ label, p, f }: { label: string; p: Pct | null; f: (n: number) => string }) {
  return (
    <tr style={{ borderTop: `1px solid ${T.slate}2A` }}>
      <td style={{ padding: "8px 0", color: T.gray }}>{label}</td>
      {p ? [p.p10, p.p50, p.p90].map((v, i) => <td key={i} style={{ textAlign: "right", color: i === 1 ? T.gray : T.slate, fontWeight: i === 1 ? 600 : 400 }}>{f(v)}</td>) : <td colSpan={3} style={{ textAlign: "right", color: T.slate }}>n/a</td>}
    </tr>
  );
}

export default function SimulatePanel() {
  const [form, setForm] = useState<Form>(() => toForm(EXAMPLE_DEAL));
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ id: string; at: string; dealId: string; call: string; dscr: number; left: number }[]>([]);
  const { state, run } = useB5r();
  const [pipeMsg, setPipeMsg] = useState<string | null>(null);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isExample = form.dealId.startsWith("EXAMPLE") || Object.keys(form).filter((k) => k.endsWith(".provenance")).some((k) => form[k] === "assumed");

  // ?deal=ID loads a saved pipeline deal's inputs (admin only; the API enforces it).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("deal");
    if (!id) return;
    fetch(`/api/admin/b5r/deals/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => { if (!res.ok) throw new Error(res.status === 401 ? "Sign in to admin to load pipeline deals." : "Deal not found."); return res.json(); })
      .then((d) => { setForm(toForm(d.deal.inputs)); setPipeMsg(`Loaded ${id} from the pipeline.`); })
      .catch((e: Error) => setPipeMsg(e.message));
  }, []);
  useEffect(() => { try { const r = window.localStorage.getItem(SAVE_KEY); if (r) setSaved(JSON.parse(r)); } catch { /* storage unavailable */ } }, []);

  function go() {
    const deal = fromForm(form, EXAMPLE_DEAL);
    const errs = validateDeal(deal);
    for (const [k, label] of FIXED.map(([k, l]) => [k as string, l] as const)) if (!Number.isFinite(Number(deal[k as keyof DealInputs]))) errs.push(`${label} must be a number.`);
    setErrors(errs);
    if (!errs.length) run(deal, DEFAULT_POLICY);
  }
  function save() {
    if (!state.result || !state.call) return;
    const next = [{ id: String(Date.now()), at: new Date().toISOString().slice(0, 10), dealId: form.dealId, call: state.call.call, dscr: state.result.gates.dscrPassProbability, left: state.result.cashLeftIn.p50 }, ...saved].slice(0, 50);
    setSaved(next); try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  async function saveToPipeline() {
    const deal = fromForm(form, EXAMPLE_DEAL);
    setPipeMsg("Saving…");
    try {
      const res = await fetch("/api/admin/b5r/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs: deal }) });
      const body = await res.json().catch(() => ({}));
      setPipeMsg(res.ok ? `Saved ${body.dealId} to the pipeline (re-simulated on the server: ${body.call.call}).` : res.status === 401 ? "Sign in to admin to save to the pipeline." : body.error ?? "Could not save.");
    } catch { setPipeMsg("Could not reach the server."); }
  }

  const r = state.result;
  const maxSwing = useMemo(() => Math.max(...(state.tornado ?? []).map((t) => t.swing), 1), [state.tornado]);

  return (
    <div>
      <div style={{ color: T.slate, fontSize: 12.5, maxWidth: 680, lineHeight: 1.55 }}>
        Monte Carlo underwrite for 5+ unit value-add deals: 5,000 draws, fixed seed, P10 / P50 / P90 with policy gates and a ranked list of what to diligence next. Runs in your browser in the background; nothing is sent anywhere.
      </div>

      {pipeMsg && <div role="status" style={{ marginTop: 14, padding: "10px 14px", borderLeft: `3px solid ${T.cyan}`, background: `${T.cyan}12`, fontSize: 12.5 }}>{pipeMsg}</div>}

      {isExample && (
        <div role="note" style={{ marginTop: 14, padding: "10px 14px", borderLeft: `3px solid ${T.magenta}`, background: `${T.magenta}12`, fontSize: 12.5, lineHeight: 1.55 }}>
          Inputs marked <b>assumed</b> are illustrative placeholders, not a real property. Replace each with a sourced figure (bid, rent comp, term sheet, T-12) and set its evidence tag before trusting a call.
        </div>
      )}

      <Rule label="Deal" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <label><div style={{ color: T.slate, fontSize: 12, marginBottom: 4 }}>Deal ID</div>
          <input style={inputStyle} value={form.dealId} onChange={(e) => set("dealId")(e.target.value)} /></label>
        {FIXED.map(([k, l, u]) => (
          <label key={k as string}><div style={{ color: T.slate, fontSize: 12, marginBottom: 4 }}>{l}{u && ` (${u})`}</div>
            <input style={inputStyle} inputMode="decimal" value={form[k as string]} onChange={(e) => set(k as string)(e.target.value)} /></label>
        ))}
      </div>

      <Rule label="Uncertain inputs — low / most likely / high, each with its evidence" />
      <div style={{ display: "grid", gap: 14 }}>
        {TRI_FIELDS.map((k) => (
          <fieldset key={k} style={{ border: `1px solid ${T.slate}33`, borderRadius: 4, padding: "10px 12px", margin: 0 }}>
            <legend style={{ padding: "0 6px", fontSize: 13 }}>{LABELS[k][0]} <span style={{ color: T.slate, fontSize: 11.5 }}>— {LABELS[k][1]}</span></legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
              {(["low", "mode", "high"] as const).map((p) => (
                <label key={p}><div style={{ color: T.slate, fontSize: 11.5, marginBottom: 3 }}>{p === "mode" ? "most likely" : p}</div>
                  <input style={inputStyle} inputMode="decimal" aria-label={`${LABELS[k][0]} ${p}`} value={form[`${k}.${p}`]} onChange={(e) => set(`${k}.${p}`)(e.target.value)} /></label>
              ))}
              <label><div style={{ color: T.slate, fontSize: 11.5, marginBottom: 3 }}>evidence</div>
                <select style={inputStyle} aria-label={`${LABELS[k][0]} evidence`} value={form[`${k}.provenance`]} onChange={(e) => set(`${k}.provenance`)(e.target.value)}>
                  <option value="assumed">assumed</option><option value="modeled">modeled</option><option value="observed">observed</option>
                </select></label>
            </div>
            <input style={{ ...inputStyle, marginTop: 8, fontSize: 12.5 }} aria-label={`${LABELS[k][0]} source`} placeholder="Source — e.g. GC bid 9/28, CoStar comps" value={form[`${k}.source`]} onChange={(e) => set(`${k}.source`)(e.target.value)} />
          </fieldset>
        ))}
      </div>

      {errors.length > 0 && (
        <ul role="alert" style={{ margin: "16px 0 0", padding: "10px 14px 10px 30px", borderLeft: `3px solid ${T.magenta}`, background: `${T.magenta}12`, fontSize: 13, lineHeight: 1.6 }}>
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
        <button onClick={go} disabled={state.status === "running"}
          style={{ background: T.cyan, color: T.navy, border: "none", borderRadius: 3, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: FONT, opacity: state.status === "running" ? 0.6 : 1 }}>
          {state.status === "running" ? "Simulating…" : "Run simulation"}
        </button>
        <button onClick={() => { setForm(toForm(EXAMPLE_DEAL)); setErrors([]); }}
          style={{ background: "none", color: T.gray, border: `1px solid ${T.slate}66`, borderRadius: 3, padding: "11px 16px", fontSize: 13.5, cursor: "pointer", fontFamily: FONT }}>
          Load illustrative example
        </button>
      </div>

      <div aria-live="polite">
        {state.status === "error" && <p style={{ color: T.magenta, fontSize: 13 }}>Simulation failed: {state.error}</p>}
        {r && state.call && (
          <>
            <Rule label={`Result — ${r.dealId} · ${r.nIterations.toLocaleString()} draws · seed ${r.seed} · ${state.ms} ms`} />
            <div style={{ borderLeft: `4px solid ${callColor[state.call.call]}`, background: T.navyDeep, padding: "12px 16px", borderRadius: 3 }}>
              <div style={{ fontSize: 12, color: T.slate, letterSpacing: ".08em" }}>MECHANICAL CALL (policy {state.call.policyId})</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: callColor[state.call.call] }}>{state.call.call}</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>{state.call.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              <div style={{ color: T.slate, fontSize: 11.5, marginTop: 8 }}>The mechanical floor only. It doesn't replace judgment on anything the policy doesn't cover.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 14 }}>
              <Tile label={`DSCR ≥ ${DEFAULT_POLICY.minDscr} in`} value={pc(r.gates.dscrPassProbability)} ok={r.gates.dscrPassProbability >= 0.7} sub="of draws (needs 70%)" />
              <Tile label="Positive leverage in" value={pc(r.gates.positiveLeverageProbability)} ok={r.gates.positiveLeverageProbability >= 0.7} sub="of draws (needs 70%)" />
              <Tile label="Cash left in, P50" value={pc(r.gates.cashLeftInPctP50)} ok={r.gates.gateCashLeftInP50Ok} sub={`of cash required (max ${pc(DEFAULT_POLICY.maxCashLeftInPct)})`} />
              <Tile label="Cash left in, P90" value={pc(r.gates.cashLeftInPctP90)} ok={r.gates.gateCashLeftInP90Ok} sub={`downside tail (max ${pc(DEFAULT_POLICY.maxP90CashLeftInPct)})`} />
            </div>

            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse", fontSize: 13, ...NUM }}>
                <thead><tr style={{ color: T.slate, textAlign: "right" }}><th style={{ textAlign: "left", fontWeight: 400, paddingBottom: 6 }}>Metric</th><th style={{ fontWeight: 400 }}>P10</th><th style={{ fontWeight: 400 }}>P50</th><th style={{ fontWeight: 400 }}>P90</th></tr></thead>
                <tbody>
                  <MetricRow label="Cash required" p={r.cashRequired} f={usd} />
                  <MetricRow label="All-in basis" p={r.allInBasis} f={usd} />
                  <MetricRow label="Stabilized NOI" p={r.stabilizedNoi} f={usd} />
                  <MetricRow label="Yield on cost" p={r.yoc} f={(n) => pc(n, 2)} />
                  <MetricRow label="ARV (NOI ÷ exit cap)" p={r.arv} f={usd} />
                  <MetricRow label="Max refinance loan" p={r.maxRefiLoan} f={usd} />
                  <MetricRow label="Cash out at refi" p={r.cashOut} f={usd} />
                  <MetricRow label="Cash left in" p={r.cashLeftIn} f={usd} />
                  <MetricRow label="Equity recovered" p={r.equityRecoveryPct} f={(n) => pc(n)} />
                  <MetricRow label="Cash-on-cash after refi" p={r.cashOnCash} f={(n) => pc(n, 1)} />
                  <MetricRow label="DSCR at max loan" p={r.actualDscr} f={x2} />
                  <MetricRow label="Months of exposure" p={r.durationOfExposureMonths} f={(n) => n.toFixed(1)} />
                </tbody>
              </table>
            </div>

            <Rule label="What to diligence next — swing in P50 cash left in, input moved P10 → P90" />
            {state.tornadoPending && !state.tornado && <div style={{ color: T.slate, fontSize: 13 }}>Ranking inputs…</div>}
            {state.tornado && (
              <div style={{ display: "grid", gap: 7 }}>
                {state.tornado.map((t) => (
                  <div key={t.input} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 190px) 1fr 70px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                    <span>{LABELS[t.input][0]}</span>
                    <span style={{ background: `${T.slate}22`, height: 10, borderRadius: 2 }}>
                      <span style={{ display: "block", height: 10, borderRadius: 2, width: `${Math.max(2, (t.swing / maxSwing) * 100)}%`, background: T.cyan }} />
                    </span>
                    <span style={{ textAlign: "right", color: T.slate, ...NUM }}>{pc(t.shareOfTotalSwing)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <button onClick={save} style={{ background: "none", color: T.gray, border: `1px solid ${T.slate}66`, borderRadius: 3, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
                Save this run (this browser)
              </button>{" "}
              <button onClick={saveToPipeline} style={{ background: "none", color: T.cyan, border: `1px solid ${T.cyan}`, borderRadius: 3, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
                Save to pipeline (admin)
              </button>
            </div>
          </>
        )}
      </div>

      <Rule label={`Saved runs (${saved.length})`} />
      {saved.length === 0 ? <div style={{ color: T.slate, fontSize: 13 }}>No runs saved yet.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse", fontSize: 12.5, ...NUM }}>
            <thead><tr style={{ color: T.slate, textAlign: "left" }}><th style={{ fontWeight: 400 }}>Date</th><th style={{ fontWeight: 400 }}>Deal</th><th style={{ fontWeight: 400 }}>Call</th><th style={{ fontWeight: 400, textAlign: "right" }}>DSCR pass</th><th style={{ fontWeight: 400, textAlign: "right" }}>P50 cash left in</th><th /></tr></thead>
            <tbody>{saved.map((s) => (
              <tr key={s.id} style={{ borderTop: `1px solid ${T.slate}2A` }}>
                <td style={{ padding: "8px 0", color: T.slate }}>{s.at}</td><td>{s.dealId}</td>
                <td style={{ color: callColor[s.call as keyof typeof callColor] ?? T.gray }}>{s.call}</td>
                <td style={{ textAlign: "right" }}>{pc(s.dscr)}</td><td style={{ textAlign: "right" }}>{usd(s.left)}</td>
                <td style={{ textAlign: "right" }}><button aria-label="Remove saved run" onClick={() => { const n = saved.filter((x) => x.id !== s.id); setSaved(n); try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(n)); } catch { /* ignore */ } }}
                  style={{ background: "none", border: "none", color: T.slate, cursor: "pointer", fontSize: 16, fontFamily: FONT }}>×</button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
