/**
 * The living 8 (lib/brand/markState.ts): the header's 8 renders the visitor's
 * own calculator result and nothing else. These tests hold the mapping to the
 * calculators' own colour rule, the trip to /audit and back, the checks on a
 * typed-in link, the words beside the 8, and contrast (canon GOV-01, GOV-17,
 * VIS-02, EDO-09).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IDLE, MARK_LOOK, RESULT_PARAM, VACANCY_SLUG, markFromHandoff, markFromResult, markFromVacancy, markQuery,
  markSentence, markWords, sameMark, type MarkKind,
} from "../lib/brand/markState";
import { getMarkRecord, publishMark, queryOf, resetMark, subscribeMark } from "../lib/brand/markStore";
import { buildAuditHref } from "../lib/calculatorHandoff";
import { calculateChecked, getCalculator, renderableCalculators } from "../lib/diagnosticCalculators";
import { computeVacancy } from "../lib/calcMath";
import { PALETTE } from "../lib/chaosTokens";

const calc = (slug: string) => {
  const c = getCalculator(slug);
  assert.ok(c, slug);
  return c;
};
const run = (slug: string, v: Record<string, number>) => markFromResult(slug, calculateChecked(calc(slug), v));

test("a result maps to the 8: leak, healthy, not enough data, or the plain 8", () => {
  assert.deepEqual(run("callback-nightmare", { closed: 100, reopened: 12 }), { kind: "cost", figure: "+12%", source: "callback-nightmare" });
  assert.deepEqual(run("callback-nightmare", { closed: 100, reopened: 3 }), { kind: "healthy", figure: "+3%", source: "callback-nightmare" });
  assert.deepEqual(run("utility-energy-bleed", { current: 400, baseline: 40 }), { kind: "uncertain", source: "utility-energy-bleed" }, "a $40 baseline can't support a result");
  assert.deepEqual(run("callback-nightmare", { closed: 0, reopened: 0 }), IDLE, "no number yet");
  assert.deepEqual(run("callback-nightmare", { closed: 5, reopened: 9 }), IDLE, "impossible input says nothing about the property");
  assert.deepEqual(run("callback-nightmare", { closed: -1, reopened: 0 }), IDLE, "negative input");
  assert.deepEqual(markFromResult("not-a-calculator", { headline: "99%", headlineIsCost: true }), IDLE);
  assert.equal(markFromResult("vendor-money-pit", { headline: "<b>71%</b>", headlineIsCost: true }).figure, "b71%b", "the figure is the handoff's own cleaned headline");
});

test("for every calculator, the 8 takes the colour the result itself is drawn in", () => {
  for (const c of renderableCalculators()) {
    const sets = [
      Object.fromEntries(c.inputs.map((i) => [i.key, i.defaultValue ?? 0])),
      ...[0, 1, 10, 150, 1000, 50_000].flatMap((n) => [
        Object.fromEntries(c.inputs.map((i, k) => [i.key, n * (k + 1)])),
        Object.fromEntries(c.inputs.map((i, k) => [i.key, n * (c.inputs.length - k)])),
      ]),
    ];
    for (const v of sets) {
      const r = calculateChecked(c, v);
      const m = markFromResult(c.slug, r);
      const at = `${c.slug} ${JSON.stringify(v)}`;
      if (r.error) assert.equal(m.kind, "idle", at);
      else if (r.note) assert.equal(m.kind, "uncertain", at);
      else if (r.headline === "\u2014") assert.equal(m.kind, "idle", at);
      else {
        // DiagnosticCalculatorClient draws the number pink when headlineIsCost, mint otherwise.
        assert.equal(MARK_LOOK[m.kind].color, r.headlineIsCost ? PALETTE.pink : PALETTE.mint, at);
        assert.equal(m.figure, r.headline, at);
      }
    }
  }
});

test("vacancy: make-ready rent is a leak in dollars; none is healthy", () => {
  const sample = computeVacancy({ monthlyRent: 2100, moveOut: "2026-06-01", readyDate: "2026-06-28", leaseDate: "2026-07-02" });
  assert.ok(sample);
  assert.deepEqual(markFromVacancy(sample), { kind: "cost", figure: "$1,890", source: VACANCY_SLUG }, "27 make-ready days at $70 a day");
  const ready = computeVacancy({ monthlyRent: 2100, moveOut: "2026-06-01", readyDate: "2026-06-01", leaseDate: "2026-06-09" });
  assert.deepEqual(markFromVacancy(ready), { kind: "healthy", figure: "$0", source: VACANCY_SLUG });
  assert.deepEqual(markFromVacancy(null), IDLE, "bad dates draw no result");
});

test("the trip to /audit and back redraws the same 8", () => {
  const cases: [string, string, Record<string, string | number>, ReturnType<typeof markFromResult>][] = [];
  const callback = run("callback-nightmare", { closed: 100, reopened: 12 });
  cases.push(["callback-nightmare", "+12%", {}, callback]);
  const healthy = run("deadline-graveyard", { open: 40, aged: 2 });
  cases.push(["deadline-graveyard", healthy.figure!, {}, healthy]);
  const v = computeVacancy({ monthlyRent: 2100, moveOut: "2026-06-01", readyDate: "2026-06-28", leaseDate: "2026-07-02" })!;
  const vacancy = markFromVacancy(v);
  cases.push([VACANCY_SLUG, `${v.operationalDays} days`, { type: "vacancy", days: v.operationalDays, exposure: v.operationalExposure, totalDays: v.totalDays, total: v.totalExposure }, vacancy]);
  for (const [slug, headline, extra, mark] of cases) {
    const href = buildAuditHref(slug, headline, { ...extra, ...markQuery(mark) });
    const back = markFromHandoff(new URLSearchParams(queryOf(href)));
    assert.ok(sameMark(back, mark), `${slug}: ${JSON.stringify(back)} vs ${JSON.stringify(mark)}`);
  }
  assert.deepEqual(markQuery(IDLE), {});
  assert.deepEqual(markQuery({ kind: "uncertain", source: "utility-energy-bleed" }), {}, "only a result travels");
});

test("a typed-in link draws the plain 8 unless every part checks out", () => {
  const q = (s: string) => markFromHandoff(new URLSearchParams(s));
  assert.equal(q("calculator_slug=callback-nightmare&calculator_headline=12%25").kind, "idle", "no result flag: unknown, not a guess");
  assert.equal(q(`calculator_slug=callback-nightmare&calculator_headline=12%25&${RESULT_PARAM}=leak`).kind, "idle");
  assert.equal(q(`calculator_slug=evil&calculator_headline=12%25&${RESULT_PARAM}=cost`).kind, "idle");
  assert.equal(q(`calculator_slug=callback-nightmare&calculator_headline=n%2Fa&${RESULT_PARAM}=cost`).kind, "idle", "a headline needs a digit");
  assert.equal(q(`calculator_slug=callback-nightmare&calculator_headline=%3Cscript%3E1&${RESULT_PARAM}=cost`).figure, "script1");
  const vac = `calculator_slug=${VACANCY_SLUG}&calculator_headline=27%20days&${RESULT_PARAM}=cost`;
  assert.equal(q(`${vac}&exposure=1890`).figure, "$1,890");
  assert.equal(q(`${vac}&exposure=abc`).figure, "27 days", "a bad exposure falls back to the headline");
  assert.equal(q(`${vac}&exposure=-5`).figure, "27 days");
  assert.equal(q(`${vac}&exposure=`).figure, "27 days");
  assert.equal(q(`${vac}&exposure=1e40`).figure, "27 days", "a figure too long to show whole is never cut short");
});

test("words beside the 8: what it found, whose numbers, and that it is not verified", () => {
  const leak = run("callback-nightmare", { closed: 100, reopened: 12 });
  assert.deepEqual(markWords(leak), { label: "Leak found", figure: "+12%" });
  assert.equal(markSentence(leak), "Leak found: +12%, from the numbers you entered in Callback Nightmare. Not a verified finding.");
  const ok = markFromVacancy({ operationalExposure: 0 });
  assert.equal(markSentence(ok), "Healthy: $0, from the numbers you entered in Vacancy Black Hole. Not a verified finding.");
  assert.match(markSentence({ kind: "uncertain", source: "utility-energy-bleed" }), /^Not enough data: the numbers you entered in Utility Energy Bleed can't support a result\.$/);
  assert.deepEqual(markWords(IDLE), { label: "", figure: "" });
  assert.equal(markSentence(IDLE), "");
});

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** A colour at alpha a over the header's ground, as an opaque hex. */
const over = (fg: string, a: number, bg: string) =>
  "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");

test("each state reads without colour: its own words, icon and shape, and text contrast of 4.5:1", () => {
  const states: MarkKind[] = ["cost", "healthy", "uncertain"];
  const shape = (k: MarkKind) => `${MARK_LOOK[k].stroke}/${MARK_LOOK[k].fillLower}`;
  assert.equal(new Set(states.map((k) => MARK_LOOK[k].label)).size, 3);
  assert.equal(new Set(states.map((k) => MARK_LOOK[k].icon)).size, 3);
  assert.equal(new Set(states.map(shape)).size, 3, "every status changes the 8's structure (EDO-09)");
  assert.equal(new Set(states.map((k) => MARK_LOOK[k].color)).size, 3);
  assert.equal(MARK_LOOK.idle.label, "");
  for (const k of states) {
    const chip = over(MARK_LOOK[k].color, 0.08, PALETTE.void);
    assert.ok(contrast(MARK_LOOK[k].color, chip) >= 4.5, `${k} words on the chip: ${contrast(MARK_LOOK[k].color, chip).toFixed(2)}`);
    assert.ok(contrast(PALETTE.bright, chip) >= 4.5, `${k} figure on the chip`);
  }
  for (const k of states) assert.notEqual(MARK_LOOK[k].color, PALETTE.cyan, "cyan stays the action colour, never a status here");
});

test("the store: one record, shared, and a repeat notifies no one", () => {
  resetMark();
  let calls = 0;
  const off = subscribeMark(() => calls++);
  const leak = run("callback-nightmare", { closed: 100, reopened: 12 });
  publishMark(leak, "calculator_slug=callback-nightmare");
  publishMark({ ...leak }, "calculator_slug=callback-nightmare");
  assert.equal(calls, 1);
  assert.ok(sameMark(getMarkRecord().mark, leak));
  assert.equal(getMarkRecord().auditQuery, "calculator_slug=callback-nightmare");
  resetMark();
  assert.equal(calls, 2);
  off();
  publishMark(leak);
  assert.equal(calls, 2, "an unsubscribed listener hears nothing");
  resetMark();
});

test("motion: one transition on change, none on a loop, and none with reduced motion", () => {
  const src = readFileSync(join(__dirname, "..", "components/brand/LivingEight.tsx"), "utf8");
  const css = src.slice(src.indexOf("LIVING_EIGHT_CSS"), src.indexOf("`;", src.indexOf("LIVING_EIGHT_CSS")));
  assert.ok(!/infinite|alternate/.test(css), "no animation repeats");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.living8 \*, \.living8-chip \{ animation: none !important; \}/);
  for (const f of ["components/brand/LivingEight.tsx", "lib/brand/markStore.ts", "lib/brand/markState.ts"]) {
    const s = readFileSync(join(__dirname, "..", f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(s), `${f}: the calculators promise nothing is stored`);
  }
  const header = readFileSync(join(__dirname, "..", "components/SiteHeader.tsx"), "utf8");
  assert.ok(!/REVENUE_TREND|revenueTrend/.test(header.replace(/\/\*[\s\S]*?\*\//g, "")), "the 8 no longer follows a hand-set flag");
});
