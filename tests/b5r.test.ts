import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { simulate, tornado, edoCall, triQuantile, percentile, debtConstant, validateDeal, makeRng, DEFAULT_POLICY, TRI_FIELDS } from "../lib/b5r/engine";
import { EXAMPLE_DEAL } from "../lib/b5r/example";

const gold = JSON.parse(readFileSync(new URL("./fixtures/b5r_golden.json", import.meta.url), "utf8"));
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const close = (a: number, b: number, relTol: number, label: string) =>
  assert.ok(Math.abs(a - b) <= Math.abs(b) * relTol + 1e-9, `${label}: ${a} vs python ${b}`);

test("same seed -> identical result; different seed -> different", () => {
  assert.deepEqual(simulate(EXAMPLE_DEAL), simulate(EXAMPLE_DEAL));
  assert.notEqual(simulate(EXAMPLE_DEAL, DEFAULT_POLICY, 5000, 1).stabilizedNoi.p50, simulate(EXAMPLE_DEAL, DEFAULT_POLICY, 5000, 2).stabilizedNoi.p50);
});

test("percentile matches numpy linear interpolation", () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
  assert.equal(percentile([10, 20, 30, 40, 50], 10), 14);
});

test("triangular quantile endpoints, mode and degenerate case", () => {
  const t = { low: 0, mode: 5, high: 10 };
  assert.equal(triQuantile(t, 0), 0); assert.equal(triQuantile(t, 1), 10); assert.equal(triQuantile(t, 0.5), 5);
  assert.equal(triQuantile({ low: 3, mode: 3, high: 3 }, 0.7), 3);
});

test("debt constant matches known value (7.2%, 30y ≈ 0.08144)", () => {
  assert.ok(Math.abs(debtConstant(0.072, 30) - 0.081444) < 1e-4);
});

test("port matches the Python reference within sampling error", () => {
  const r = simulate(EXAMPLE_DEAL, DEFAULT_POLICY, 200_000, 1);
  const g = gold.result;
  for (const [k, gk] of [["cashRequired", "cash_required"], ["allInBasis", "all_in_basis"], ["stabilizedNoi", "stabilized_noi"], ["arv", "arv"], ["maxRefiLoan", "max_refi_loan"], ["actualDscr", "actual_dscr"], ["yoc", "yoc"], ["durationOfExposureMonths", "duration_of_exposure_months"]] as const) {
    for (const p of ["p10", "p50", "p90"] as const) close((r as any)[k][p], g[gk][p], 0.01, `${k}.${p}`);
  }
  for (const p of ["p10", "p50", "p90"] as const) {
    assert.ok(Math.abs(r.cashLeftIn[p] - g.cash_left_in[p]) < 0.01 * g.all_in_basis.p50, `cashLeftIn.${p}`);
    assert.ok(Math.abs(r.cashOut[p] - g.cash_out[p]) < 0.01 * g.all_in_basis.p50, `cashOut.${p}`);
  }
  assert.ok(Math.abs(r.gates.dscrPassProbability - g.gates.dscr_pass_probability) < 0.01);
  assert.ok(Math.abs(r.gates.positiveLeverageProbability - g.gates.positive_leverage_probability) < 0.01);
  assert.ok(Math.abs(r.gates.cashLeftInPctP50 - g.gates.cash_left_in_pct_p50) < 0.02);
  assert.ok(Math.abs(r.gates.cashLeftInPctP90 - g.gates.cash_left_in_pct_p90) < 0.02);
  assert.equal(edoCall(r).call, gold.call.call);
});

test("tornado ranks the same top drivers as Python and shares sum to 1", () => {
  const t = tornado(EXAMPLE_DEAL, DEFAULT_POLICY, "cashLeftIn", 40_000, 1);
  assert.equal(t.length, TRI_FIELDS.length);
  assert.ok(Math.abs(t.reduce((s, r) => s + r.shareOfTotalSwing, 0) - 1) < 1e-9);
  const goldTop = gold.tornado.slice(0, 3).map((r: any) => r.input);
  const top3 = t.slice(0, 3).map((r) => snake(r.input));
  assert.deepEqual([...top3].sort(), [...goldTop].sort());
  close(t[0].swing, gold.tornado[0].swing, 0.1, "top swing");
});

test("validation rejects bad inputs and simulate throws on them", () => {
  const bad = { ...EXAMPLE_DEAL, exitCapRate: { ...EXAMPLE_DEAL.exitCapRate, low: 0.08, mode: 0.07 } };
  assert.ok(validateDeal(bad).length > 0);
  assert.throws(() => simulate(bad));
  assert.ok(validateDeal({ ...EXAMPLE_DEAL, units: 0 }).length > 0);
});

test("gates: a clearly strong deal EXECUTEs, a clearly weak one is KILLed", () => {
  const strong = { ...EXAMPLE_DEAL, purchasePrice: 500_000, acquisitionLoanAmount: 375_000, rehabCost: { ...EXAMPLE_DEAL.rehabCost, low: 50_000, mode: 60_000, high: 75_000 } };
  assert.equal(edoCall(simulate(strong)).call, "EXECUTE");
  const weak = { ...EXAMPLE_DEAL, grossPotentialRentMonthly: { ...EXAMPLE_DEAL.grossPotentialRentMonthly, low: 7_000, mode: 8_000, high: 9_000 } };
  assert.equal(edoCall(simulate(weak)).call, "KILL");
});

test("rng is uniform-ish in [0,1)", () => {
  const r = makeRng(8); let s = 0;
  for (let i = 0; i < 20000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); s += x; }
  assert.ok(Math.abs(s / 20000 - 0.5) < 0.01);
});

import { parseDealInputs } from "../lib/b5r/parse";
import { calibrationStats, errorPctOfP50, isCalibrationMetric } from "../lib/b5r/calibration";

test("parseDealInputs accepts the example deal and rejects junk", () => {
  const ok = parseDealInputs(JSON.parse(JSON.stringify(EXAMPLE_DEAL)));
  assert.ok(ok.ok && ok.deal.dealId === EXAMPLE_DEAL.dealId);
  assert.equal(parseDealInputs(null).ok, false);
  const missing = parseDealInputs({ ...EXAMPLE_DEAL, rehabCost: undefined, units: "12" });
  assert.ok(!missing.ok && missing.errors.some((e) => e.includes("rehabCost")) && missing.errors.some((e) => e.includes("units")));
  const noId = parseDealInputs({ ...EXAMPLE_DEAL, dealId: "  " });
  assert.ok(!noId.ok);
});

test("parseDealInputs downgrades 'assumed' + 'high' confidence and coerces bad provenance", () => {
  const d = JSON.parse(JSON.stringify(EXAMPLE_DEAL));
  d.rehabCost.provenance = "assumed"; d.rehabCost.confidence = "high"; d.exitCapRate.provenance = "bogus";
  const r = parseDealInputs(d);
  assert.ok(r.ok && r.deal.rehabCost.confidence === "low" && r.deal.exitCapRate.provenance === "assumed");
});

test("calibration: error % and stats match the Python definitions", () => {
  assert.equal(errorPctOfP50({ p10: 80, p50: 100, p90: 130 }, 110), 0.1);
  assert.equal(errorPctOfP50({ p10: 0, p50: 0, p90: 1 }, 5), null);
  assert.equal(calibrationStats([]), null);
  const s = calibrationStats([
    { error_pct_of_p50: 0.1, predicted_p10: 80, predicted_p90: 130, actual: 110 },
    { error_pct_of_p50: -0.1, predicted_p10: 80, predicted_p90: 130, actual: 90 },
    { error_pct_of_p50: 0.5, predicted_p10: 80, predicted_p90: 130, actual: 150 },
  ])!;
  assert.equal(s.n, 3);
  assert.ok(Math.abs(s.meanErrorPct - 0.5 / 3) < 1e-9);
  assert.ok(Math.abs(s.withinP10P90 - 2 / 3) < 1e-9);
  assert.equal(s.recommendation, "widen range");
  assert.equal(calibrationStats([{ error_pct_of_p50: 0.02, predicted_p10: 1, predicted_p90: 3, actual: 2 }])!.recommendation, "range looks calibrated");
  assert.ok(isCalibrationMetric("arv") && !isCalibrationMetric("deal_id"));
});
