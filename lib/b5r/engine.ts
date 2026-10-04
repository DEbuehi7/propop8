/**
 * AIM-B5R underwriting engine — TypeScript port of aim-b5r-engine/aim_b5r_engine.py.
 *
 * Pure calculation, no I/O, so it runs identically in a Web Worker (browser),
 * a Node API route, or a test. The Python module stays the reference
 * implementation; tests/b5r.test.ts checks this port against a golden run of it.
 *
 * Random streams differ from numpy (different PRNG), so results match the
 * Python engine statistically (P10/P50/P90 within sampling error), not draw
 * for draw. Same seed -> same result within this implementation.
 */

export type Provenance = "observed" | "modeled" | "assumed";
export type Confidence = "low" | "med" | "high";

export interface Tri {
  low: number; mode: number; high: number;
  unit: string; source: string; date: string;
  provenance: Provenance; confidence: Confidence;
}

export interface Policy {
  policyId: string;
  minDscr: number;
  maxRefiLtv: number;
  minYocSpreadOverDebtConstant: number;
  maxCashLeftInPct: number;
  maxP90CashLeftInPct: number;
  vacancyFloor: number;
  capexReservePerUnitYr: number;
  mgmtFeePctEgi: number;
  rehabContingencyPct: number;
  refiSeasoningMonths: number;
  callGateDsaMin: number;
  callGateConfidenceMin: number;
}

export const DEFAULT_POLICY: Policy = {
  policyId: "b5r_default_v1",
  minDscr: 1.25,
  maxRefiLtv: 0.75,
  minYocSpreadOverDebtConstant: 0.0075,
  maxCashLeftInPct: 0.25,
  maxP90CashLeftInPct: 0.5,
  vacancyFloor: 0.05,
  capexReservePerUnitYr: 300,
  mgmtFeePctEgi: 0.08,
  rehabContingencyPct: 0.15,
  refiSeasoningMonths: 6,
  callGateDsaMin: 8,
  callGateConfidenceMin: 80,
};

/** Field order matters: it is the sampling order (mirrors the Python module). */
export const TRI_FIELDS = [
  "rehabCost", "rehabDurationMonths", "grossPotentialRentMonthly", "vacancyCreditLossPct",
  "otherIncomeMonthly", "opexAnnualExCapex", "propertyTaxAnnual", "insuranceAnnual",
  "exitCapRate", "refiRate", "holdingCostMonthly",
] as const;
export type TriField = (typeof TRI_FIELDS)[number];

export interface DealInputs extends Record<TriField, Tri> {
  dealId: string;
  units: number;
  purchasePrice: number;
  buyClosingCosts: number;
  acquisitionLoanAmount: number;
  acquisitionLoanRate: number;
  refiAmortizationYears: number;
  refiClosingCostsPct: number;
  notes?: string;
}

export interface Pct { p10: number; p50: number; p90: number }
export interface SimResult {
  dealId: string; nIterations: number; seed: number;
  cashRequired: Pct; allInBasis: Pct; stabilizedNoi: Pct; arv: Pct; maxRefiLoan: Pct;
  cashOut: Pct; cashLeftIn: Pct; equityRecoveryPct: Pct | null; cashOnCash: Pct | null;
  durationOfExposureMonths: Pct; actualDscr: Pct; yoc: Pct;
  gates: {
    dscrPassProbability: number; positiveLeverageProbability: number;
    cashLeftInPctP50: number; cashLeftInPctP90: number;
    gateCashLeftInP50Ok: boolean; gateCashLeftInP90Ok: boolean;
  };
}
type Raw = { cashLeftIn: Float64Array; actualDscr: Float64Array };

export const N_ITER = 5000;
export const SEED = 8;

/** mulberry32: small, fast, well-distributed 32-bit PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inverse CDF of triangular(low, mode, high). */
export function triQuantile(t: { low: number; mode: number; high: number }, u: number): number {
  const { low: a, mode: c, high: b } = t;
  if (a === b) return c;
  const fc = (c - a) / (b - a);
  return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

function sample(t: Tri, rng: () => number, n: number): Float64Array {
  const out = new Float64Array(n);
  if (t.low === t.mode && t.mode === t.high) { out.fill(t.mode); return out; }
  for (let i = 0; i < n; i++) out[i] = triQuantile(t, rng());
  return out;
}

/** numpy-style linear-interpolated percentile (p in 0..100). */
export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Float64Array.from(values as ArrayLike<number>).sort();
  if (a.length === 0) return NaN;
  const k = ((a.length - 1) * p) / 100;
  const lo = Math.floor(k), hi = Math.ceil(k);
  return a[lo] + (a[hi] - a[lo]) * (k - lo);
}

function pct(values: ArrayLike<number>): Pct {
  return { p10: percentile(values, 10), p50: percentile(values, 50), p90: percentile(values, 90) };
}

export function debtConstant(rate: number, amortYears: number): number {
  const r = rate / 12, n = amortYears * 12;
  if (r === 0) return 12 / n;
  return (r / (1 - Math.pow(1 + r, -n))) * 12;
}

export function validateDeal(d: DealInputs): string[] {
  const errs: string[] = [];
  if (!(d.units > 0)) errs.push("Units must be greater than zero.");
  if (!(d.purchasePrice > 0)) errs.push("Purchase price must be greater than zero.");
  if (d.acquisitionLoanAmount < 0 || d.acquisitionLoanAmount > d.purchasePrice + d.buyClosingCosts) errs.push("Acquisition loan can't be negative or exceed price + closing costs.");
  for (const f of TRI_FIELDS) {
    const t = d[f];
    if (![t.low, t.mode, t.high].every(Number.isFinite)) errs.push(`${f}: low / mode / high must be numbers.`);
    else if (!(t.low <= t.mode && t.mode <= t.high)) errs.push(`${f}: needs low ≤ mode ≤ high.`);
  }
  if (d.exitCapRate.low <= 0) errs.push("Exit cap rate must be above zero.");
  if (d.refiRate.low < 0) errs.push("Refi rate can't be negative.");
  return errs;
}

function run(deal: DealInputs, policy: Policy, n: number, seed: number): { result: SimResult; raw: Raw } {
  const rng = makeRng(seed);
  const rehabCost = sample(deal.rehabCost, rng, n);
  const rehabMonths = sample(deal.rehabDurationMonths, rng, n);
  const gprMonthly = sample(deal.grossPotentialRentMonthly, rng, n);
  const vacancy = sample(deal.vacancyCreditLossPct, rng, n).map((v) => Math.max(v, policy.vacancyFloor));
  const otherIncome = sample(deal.otherIncomeMonthly, rng, n);
  const opexEx = sample(deal.opexAnnualExCapex, rng, n);
  const propTax = sample(deal.propertyTaxAnnual, rng, n);
  const insurance = sample(deal.insuranceAnnual, rng, n);
  const exitCap = sample(deal.exitCapRate, rng, n);
  const refiRate = sample(deal.refiRate, rng, n);
  const holdMonthly = sample(deal.holdingCostMonthly, rng, n);

  const acqFees = deal.acquisitionLoanAmount * 0.01;
  const capexReserve = policy.capexReservePerUnitYr * deal.units;

  const cashRequired = new Float64Array(n), allIn = new Float64Array(n), noiA = new Float64Array(n);
  const arvA = new Float64Array(n), maxLoanA = new Float64Array(n), cashOutA = new Float64Array(n);
  const leftA = new Float64Array(n), dscrA = new Float64Array(n), yocA = new Float64Array(n);
  const exposure = new Float64Array(n);
  const eq: number[] = [], coc: number[] = [], leftPct: number[] = [];
  let dscrPass = 0, posLev = 0;

  for (let i = 0; i < n; i++) {
    const basis = deal.purchasePrice + deal.buyClosingCosts + rehabCost[i] * (1 + policy.rehabContingencyPct) + holdMonthly[i] * rehabMonths[i] + acqFees;
    const req = basis - deal.acquisitionLoanAmount;
    const egi = gprMonthly[i] * 12 * (1 - vacancy[i]) + otherIncome[i] * 12;
    const noi = egi - (opexEx[i] + propTax[i] + insurance[i] + egi * policy.mgmtFeePctEgi + capexReserve);
    const yoc = noi / basis;
    const dc = debtConstant(refiRate[i], deal.refiAmortizationYears);
    if (yoc - dc >= policy.minYocSpreadOverDebtConstant) posLev++;
    const arv = noi / exitCap[i];
    const maxLoan = Math.min(arv * policy.maxRefiLtv, noi / (policy.minDscr * dc));
    const dscr = noi / (maxLoan * dc);
    const cashOut = maxLoan - deal.acquisitionLoanAmount - maxLoan * deal.refiClosingCostsPct;
    const left = req - cashOut;
    const cf = noi - maxLoan * dc;

    cashRequired[i] = req; allIn[i] = basis; noiA[i] = noi; arvA[i] = arv; maxLoanA[i] = maxLoan;
    cashOutA[i] = cashOut; leftA[i] = left; dscrA[i] = dscr; yocA[i] = yoc;
    exposure[i] = rehabMonths[i] + 3 + policy.refiSeasoningMonths;
    if (dscr >= policy.minDscr - 1e-9) dscrPass++;
    if (req > 0) { eq.push(cashOut / req); leftPct.push(left / req); }
    if (left > 0) { const c = cf / left; if (Number.isFinite(c)) coc.push(c); }
  }

  const p50L = percentile(leftPct, 50), p90L = percentile(leftPct, 90);
  const result: SimResult = {
    dealId: deal.dealId, nIterations: n, seed,
    cashRequired: pct(cashRequired), allInBasis: pct(allIn), stabilizedNoi: pct(noiA), arv: pct(arvA),
    maxRefiLoan: pct(maxLoanA), cashOut: pct(cashOutA), cashLeftIn: pct(leftA),
    equityRecoveryPct: eq.length ? pct(eq) : null, cashOnCash: coc.length ? pct(coc) : null,
    durationOfExposureMonths: pct(exposure), actualDscr: pct(dscrA), yoc: pct(yocA),
    gates: {
      dscrPassProbability: dscrPass / n, positiveLeverageProbability: posLev / n,
      cashLeftInPctP50: p50L, cashLeftInPctP90: p90L,
      gateCashLeftInP50Ok: p50L <= policy.maxCashLeftInPct, gateCashLeftInP90Ok: p90L <= policy.maxP90CashLeftInPct,
    },
  };
  return { result, raw: { cashLeftIn: leftA, actualDscr: dscrA } };
}

export function simulate(deal: DealInputs, policy: Policy = DEFAULT_POLICY, n = N_ITER, seed = SEED): SimResult {
  const errs = validateDeal(deal);
  if (errs.length) throw new Error(errs.join(" "));
  return run(deal, policy, n, seed).result;
}

export interface TornadoRow { input: TriField; p10Result: number; p90Result: number; swing: number; shareOfTotalSwing: number }

/** Swing each uncertain input P10→P90 (others random) and rank by swing in the target's P50. */
export function tornado(deal: DealInputs, policy: Policy = DEFAULT_POLICY, target: "cashLeftIn" | "actualDscr" = "cashLeftIn", n = N_ITER, seed = SEED): TornadoRow[] {
  const rows: Omit<TornadoRow, "shareOfTotalSwing">[] = [];
  for (const f of TRI_FIELDS) {
    const orig = deal[f];
    const at = (u: number): number => {
      const v = triQuantile(orig, u);
      const pinned: Tri = { ...orig, low: v, mode: v, high: v, source: "tornado-pin", provenance: "modeled" };
      return percentile(run({ ...deal, [f]: pinned }, policy, n, seed).raw[target], 50);
    };
    const p10Result = at(0.1), p90Result = at(0.9);
    rows.push({ input: f, p10Result, p90Result, swing: Math.abs(p90Result - p10Result) });
  }
  rows.sort((a, b) => b.swing - a.swing);
  const total = rows.reduce((s, r) => s + r.swing, 0) || 1;
  return rows.map((r) => ({ ...r, shareOfTotalSwing: r.swing / total }));
}

export type CallName = "EXECUTE" | "DEFER" | "ESCALATE" | "KILL";
export interface EdoCall { call: CallName; reasons: string[]; policyId: string }

export function edoCall(res: SimResult, policy: Policy = DEFAULT_POLICY, dsa?: number, confidence?: number): EdoCall {
  const g = res.gates, reasons: string[] = [];
  let call: CallName = "EXECUTE";
  const p = (x: number) => `${Math.round(x * 100)}%`;
  if (g.dscrPassProbability < 0.7) { call = "KILL"; reasons.push(`DSCR only clears policy (${policy.minDscr}) in ${p(g.dscrPassProbability)} of draws`); }
  if (!g.gateCashLeftInP50Ok) { call = call === "KILL" ? "KILL" : "DEFER"; reasons.push(`P50 cash-left-in ${p(g.cashLeftInPctP50)} of cash required exceeds policy max ${p(policy.maxCashLeftInPct)}`); }
  if (!g.gateCashLeftInP90Ok) { if (call === "EXECUTE") call = "DEFER"; reasons.push(`P90 cash-left-in ${p(g.cashLeftInPctP90)} exceeds policy max ${p(policy.maxP90CashLeftInPct)} -- downside tail is uncapped`); }
  if (g.positiveLeverageProbability < 0.7) { if (call === "EXECUTE") call = "DEFER"; reasons.push(`Positive leverage holds in only ${p(g.positiveLeverageProbability)} of draws`); }
  if (dsa !== undefined && confidence !== undefined && (dsa < policy.callGateDsaMin || confidence < policy.callGateConfidenceMin)) {
    if (call === "EXECUTE") call = "ESCALATE";
    reasons.push(`DSA ${dsa} / confidence ${confidence} below call gate (${policy.callGateDsaMin}/${policy.callGateConfidenceMin})`);
  }
  if (!reasons.length) reasons.push("All policy gates clear at P50 and P90");
  return { call, reasons, policyId: policy.policyId };
}
