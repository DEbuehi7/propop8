/**
 * The Context & Dignity Engine study (canon 1.8.0, B5R-53): its hypothetical
 * underwriting page, re-run with the façade NPV formula. The figures are
 * research, never an underwriting input; this test only proves the study's
 * arithmetic and keeps the canon text in step with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { npvOf } from "../lib/b5r/facade/capital";
import { CANON_REGISTER } from "../lib/canon";

/** Study page 12: a 30-unit building, $60,000 of incremental design capex, 10 years at 8%, no terminal value. */
const CAPEX = 60_000;
const RATE = 0.08;
const YEARS = 10;
const CAP = 0.06;
const SCENARIOS = [
  { name: "conservative", turns: 0, perTurn: 0, utility: 1_500, program: 2_500, noi: -1_000, npv: -66_710, capValue: -16_667 },
  { name: "base", turns: 2, perTurn: 3_000, utility: 3_000, program: 2_000, noi: 7_000, npv: -13_029, capValue: 116_667 },
  { name: "upside", turns: 3, perTurn: 3_500, utility: 5_000, program: 2_500, noi: 13_000, npv: 27_231, capValue: 216_667 },
];

test("context study p12: each scenario's NOI, NPV and cap-rate figure match the study", () => {
  for (const s of SCENARIOS) {
    const noi = s.turns * s.perTurn + s.utility - s.program;
    assert.equal(noi, s.noi, `${s.name} NOI`);
    assert.equal(Math.round(npvOf(CAPEX, noi, RATE, YEARS)), s.npv, `${s.name} NPV`);
    assert.equal(Math.round(noi / CAP), s.capValue, `${s.name} value at a 6% cap`);
  }
  // The study's reading: at base, ten years of $7,000 do not repay $60,000 at 8%;
  // break-even needs about $8,942 a year (docs/aim-b5r/CONTEXT_DIGNITY.md).
  assert.ok(npvOf(CAPEX, 7_000, RATE, YEARS) < 0);
  assert.ok(npvOf(CAPEX, 8_941, RATE, YEARS) < 0 && npvOf(CAPEX, 8_942, RATE, YEARS) > 0);
  // An end-of-life cost lowers NPV by its present value; no cost now and no benefit gives 0.
  assert.equal(npvOf(0, 0, RATE, YEARS), 0);
  assert.ok(Math.abs(npvOf(0, 0, RATE, YEARS, 1_000) + 1_000 / 1.08 ** 10) < 1e-9);
});

test("canon B5R-53 quotes the figures the formula gives", () => {
  const e = CANON_REGISTER.find((x) => x.id === "B5R-53");
  assert.ok(e, "B5R-53 is in the register");
  assert.equal(e.status, "RESEARCH", "hypothetical figures are never an underwriting input");
  const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
  for (const s of SCENARIOS) {
    assert.ok(e.statement.includes(money(s.noi)), `${s.name} NOI ${money(s.noi)} in B5R-53`);
    assert.ok(e.statement.includes(money(s.npv)), `${s.name} NPV ${money(s.npv)} in B5R-53`);
  }
});
