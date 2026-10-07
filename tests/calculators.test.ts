import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAGNOSTIC_CALCULATORS, getCalculator, renderableCalculators, calculateChecked } from "../lib/diagnosticCalculators";
import { buildAuditHref } from "../lib/calculatorHandoff";
import { sharePct, changePct, missedCycles, computeVacancy } from "../lib/calcMath";
import { runEngine, parseCsv } from "../lib/auditEngine";

const calc = (slug: string, v: Record<string, number>) => getCalculator(slug)!.calculate(v);

test("registry: unique slugs, vacancy present and external", () => {
  const slugs = DIAGNOSTIC_CALCULATORS.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(getCalculator("vacancy-black-hole")?.externalHref, "/tools/vacancy-calculator");
  assert.equal(renderableCalculators().length, 7);
});

test("registry: every renderable entry has inputs and visualProps for its input keys", () => {
  for (const c of renderableCalculators()) {
    assert.ok(c.inputs.length > 0, c.slug);
    const props = c.visualProps(Object.fromEntries(c.inputs.map((i) => [i.key, 1])));
    assert.ok(Object.keys(props).length > 0, c.slug);
  }
});

test("callback-nightmare fixtures", () => {
  assert.deepEqual(
    (({ headline, headlineIsCost }) => ({ headline, headlineIsCost }))(calc("callback-nightmare", { closed: 200, reopened: 18 })),
    { headline: "+9%", headlineIsCost: true },
  );
  assert.equal(calc("callback-nightmare", { closed: 200, reopened: 0 }).headline, "0%");
  assert.equal(calc("callback-nightmare", { closed: 200, reopened: 10 }).headlineIsCost, false); // exactly 5% is not > 5%
  assert.equal(calc("callback-nightmare", { closed: 0, reopened: 3 }).headline, "—");
});

test("vendor-money-pit fixtures", () => {
  const r = calc("vendor-money-pit", { total: 10000, topVendor: 7100 });
  assert.equal(r.headline, "71%");
  assert.equal(r.headlineIsCost, true);
  assert.equal(calc("vendor-money-pit", { total: 10000, topVendor: 4900 }).headlineIsCost, false);
  assert.equal(calc("vendor-money-pit", { total: 10000, topVendor: 5000 }).headlineIsCost, true); // >= 50
});

test("deadline-graveyard fixtures", () => {
  assert.equal(calc("deadline-graveyard", { open: 40, aged: 10 }).headline, "25%");
  assert.equal(calc("deadline-graveyard", { open: 40, aged: 6 }).headlineIsCost, false); // exactly 15%
  assert.equal(calc("deadline-graveyard", { open: 40, aged: 7 }).headlineIsCost, true);
});

test("automation-graveyard fixtures", () => {
  assert.equal(calc("automation-graveyard", { frequency: 7, daysSince: 30 }).headline, "4");
  assert.equal(calc("automation-graveyard", { frequency: 7, daysSince: 10 }).headline, "1");
  assert.equal(calc("automation-graveyard", { frequency: 7, daysSince: 6 }).headline, "0");
  // Reported case: due on days 23, 46, 69, 92, 115 -> five missed.
  assert.equal(calc("automation-graveyard", { frequency: 23, daysSince: 133 }).headline, "5");
  assert.equal(missedCycles(23, 133), 5);
  assert.equal(missedCycles(23, 46), 2); // a run due exactly now counts
  assert.equal(calc("automation-graveyard", { frequency: 0, daysSince: 10 }).headline, "—");
});

test("asset-health and utility fixtures", () => {
  assert.equal(calc("asset-health-nightmare", { past: 1000, current: 1250 }).headline, "+25%");
  assert.equal(calc("asset-health-nightmare", { past: 1000, current: 800 }).headlineIsCost, false);
  assert.equal(calc("utility-energy-bleed", { current: 1500, baseline: 1200 }).headline, "$300");
  assert.equal(calc("utility-energy-bleed", { current: 900, baseline: 1200 }).headline, "-$300");
});

test("operations-chaos-index fixtures", () => {
  assert.equal(calc("operations-chaos-index", { count: 20, avgCost: 150 }).headline, "$3,000");
  assert.equal(calc("operations-chaos-index", { count: 20, avgCost: 0 }).headline, "$3,000"); // 0 falls back to 150
});

test("calcMath: unknown is null, never zero", () => {
  assert.equal(sharePct(5, 0), null);
  assert.equal(changePct(5, 0), null);
  assert.equal(changePct(5, -10), null);
  assert.equal(missedCycles(0, 10), null);
  assert.equal(sharePct(1, 4), 25);
  assert.equal(changePct(150, 100), 50);
});

test("computeVacancy fixtures", () => {
  const m = computeVacancy({ monthlyRent: 2100, moveOut: "2026-06-01", readyDate: "2026-06-28", leaseDate: "2026-07-02" })!;
  assert.equal(m.operationalDays, 27);
  assert.equal(m.leasingDays, 4);
  assert.equal(m.totalDays, 31);
  assert.equal(m.operationalExposure, 1890);
  assert.equal(m.totalExposure, 2170);
  assert.equal(m.leasingExposure, 280);
  assert.equal(computeVacancy({ monthlyRent: 2100, moveOut: "2026-06-10", readyDate: "2026-06-01", leaseDate: "2026-07-02" }), null);
  assert.equal(computeVacancy({ monthlyRent: 0, moveOut: "2026-06-01", readyDate: "2026-06-28", leaseDate: "2026-07-02" }), null);
});

test("parity: calculator and audit engine agree on vendor concentration", () => {
  // 3 rows, one category: Acme 700 of 1000 = 70%.
  const csv = [
    "date,vendor,category,amount,unit,status",
    "2026-03-03,Acme,Plumbing,400,101,closed",
    "2026-03-10,Acme,Plumbing,300,102,closed",
    "2026-03-15,Beta,Plumbing,300,103,closed",
  ].join("\n");
  const parsed = parseCsv(csv);
  const result = runEngine(parsed.rows, { asOf: Date.UTC(2026, 3, 1) });
  const f = result.findings.find((x) => x.visual?.kind === "concentration");
  assert.ok(f && f.visual?.kind === "concentration", "engine should flag concentration");
  const calcShare = sharePct(700, 1000)!;
  assert.equal(Math.round((f.visual as { sharePct: number }).sharePct), Math.round(calcShare));
  assert.equal(calc("vendor-money-pit", { total: 1000, topVendor: 700 }).headline, `${Math.round(calcShare)}%`);
});

test("impossible input shows an error, no number, and no audit handoff", () => {
  const cases: [string, Record<string, number>][] = [
    ["deadline-graveyard", { open: 34, aged: 234 }],
    ["callback-nightmare", { closed: 23, reopened: 30 }],
    ["vendor-money-pit", { total: 1000, topVendor: 1500 }],
  ];
  for (const [slug, v] of cases) {
    const r = calc(slug, v);
    assert.ok(r.error, `${slug} should reject ${JSON.stringify(v)}`);
    assert.equal(r.headline, "—", slug);
    assert.equal(r.headlineIsCost, false, slug);
    // The client only builds the handoff for a real headline; "—" is not one.
    assert.equal(buildAuditHref(slug, r.headline).includes("calculator_headline"), false, slug);
  }
});

test("limits are inclusive: all of it is still possible", () => {
  assert.equal(calc("deadline-graveyard", { open: 34, aged: 34 }).headline, "100%");
  assert.equal(calc("callback-nightmare", { closed: 23, reopened: 23 }).error, undefined);
  assert.equal(calc("vendor-money-pit", { total: 1000, topVendor: 1000 }).headline, "100%");
});

test("negative input is rejected before any calculation", () => {
  const c = getCalculator("vendor-money-pit")!;
  assert.ok(calculateChecked(c, { total: 1000, topVendor: -5 }).error);
  assert.equal(calculateChecked(c, { total: 1000, topVendor: 500 }).headline, "50%");
});
