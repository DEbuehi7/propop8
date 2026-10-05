import { TRI_FIELDS, type DealInputs, type Tri } from "./engine";

const PROV = ["observed", "modeled", "assumed"] as const;
const CONF = ["low", "med", "high"] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/** Validate untrusted JSON into DealInputs. Returns the deal or a list of problems. */
export function parseDealInputs(raw: unknown): { ok: true; deal: DealInputs } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["Deal must be an object."] };
  const fixed = ["units", "purchasePrice", "buyClosingCosts", "acquisitionLoanAmount", "acquisitionLoanRate", "refiAmortizationYears", "refiClosingCostsPct"] as const;
  const out: Record<string, unknown> = { dealId: str(raw.dealId, 80).trim(), notes: str(raw.notes, 1000) };
  if (!out.dealId) errors.push("Deal ID is required.");
  for (const k of fixed) { const n = num(raw[k]); if (Number.isNaN(n)) errors.push(`${k} must be a number.`); out[k] = n; }
  for (const k of TRI_FIELDS) {
    const t = raw[k];
    if (!isObj(t)) { errors.push(`${k} is missing.`); continue; }
    const prov = PROV.includes(t.provenance as never) ? (t.provenance as Tri["provenance"]) : "assumed";
    const conf = CONF.includes(t.confidence as never) ? (t.confidence as Tri["confidence"]) : "low";
    out[k] = { low: num(t.low), mode: num(t.mode), high: num(t.high), unit: str(t.unit, 120), source: str(t.source), date: str(t.date, 10), provenance: prov, confidence: prov === "assumed" && conf === "high" ? "low" : conf } satisfies Tri;
  }
  return errors.length ? { ok: false, errors } : { ok: true, deal: out as unknown as DealInputs };
}
