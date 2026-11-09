/**
 * The weathering layer (canon B5R-55, locked): the ISO 15686 factor method,
 * condition grades from dated photos, and when work falls due.
 *
 * Every element, lifespan and factor below is SYNTHETIC test data (GOV-17):
 * made-up values that exercise the rules, not measurements of any building.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assess, conditionTrend, CONDITION_GRADES, dateOf, dayNumber, DEFAULT_INTERVENTION_GRADE, estimateLife,
  FACTOR_NAMES, MECHANISMS, MIN_TREND_DAYS, responseTimes, SHEARING_LAYERS, usableObservations,
  type Factor, type FactorName, type Observation, type WeatheringElement,
} from "../lib/b5r/weathering/serviceLife";
import { CANON_REGISTER } from "../lib/canon";

const AS_OF = "2026-11-08";
const ref = (value: number): Factor => ({ value, basis: "synthetic: reference conditions" });
const factors = (over: Partial<Record<FactorName, number | null>> = {}): Record<FactorName, Factor> =>
  Object.fromEntries(FACTOR_NAMES.map((n) => [n, n in over ? { value: over[n] ?? null, basis: "synthetic" } : ref(1)])) as Record<FactorName, Factor>;
const look = (date: string, grade: Observation["grade"], extra: Partial<Observation> = {}): Observation =>
  ({ date, grade, by: "Synthetic Grader", photo: `syn-${date}`, viewpoint: "VP-SYN-1", ...extra });

/** A synthetic painted wall: reference life 10 years, installed 2020-01-01. */
const wall = (over: Partial<WeatheringElement> = {}): WeatheringElement => ({
  id: "SYN-WALL", name: "Synthetic painted wall", layer: "skin", mechanism: "uv", owner: "building",
  installed: "2020-01-01",
  reference: { years: 10, source: "synthetic test value", conditions: "synthetic reference conditions" },
  factors: factors(), observations: [], ...over,
});

test("factor method: estimated life = reference life x the seven factors", () => {
  assert.equal(FACTOR_NAMES.length, 7);
  assert.deepEqual(estimateLife(wall()), { years: 10, factorProduct: 1, unknown: [], flagged: [] });
  // Harsh sun (0.8) and good upkeep (1.2): 10 x 0.96 = 9.6 years.
  const e = estimateLife(wall({ factors: factors({ outdoor: 0.8, maintenance: 1.2 }) }));
  assert.equal(e.years, 9.6);
  assert.equal(e.factorProduct, 0.96);
  assert.deepEqual(e.flagged, []);
  // Outside the standard's 0.8 to 1.2 is allowed, but flagged for a person.
  const wide = estimateLife(wall({ factors: factors({ execution: 1.5 }) }));
  assert.equal(wide.years, 15);
  assert.equal(wide.flagged.length, 1);
  assert.match(wide.flagged[0], /workmanship factor 1\.5 is outside 0\.8 to 1\.2/);
});

test("unknown stays unknown: no default lifespan or factor", () => {
  const noSource = estimateLife(wall({ reference: { years: 10, source: " ", conditions: "" } }));
  assert.equal(noSource.years, null);
  assert.deepEqual(noSource.unknown, ["reference service life has no source"]);
  const noYears = estimateLife(wall({ reference: { years: null, source: "synthetic", conditions: "" } }));
  assert.equal(noYears.years, null);
  assert.deepEqual(noYears.unknown, ["reference service life not known"]);
  const gaps = estimateLife(wall({ factors: factors({ indoor: null, inUse: 0 }) }));
  assert.equal(gaps.years, null);
  assert.equal(gaps.factorProduct, null);
  assert.deepEqual(gaps.unknown, ["indoor environment factor not set", "in-use conditions factor is not a positive number"]);
  const f = factors();
  f.design = { value: 1.1, basis: "" };
  assert.deepEqual(estimateLife(wall({ factors: f })).unknown, ["design level factor has no basis"]);
});

test("dates: strict YYYY-MM-DD, years are 365.25 days", () => {
  assert.equal(dayNumber("2026-02-30"), null);
  assert.equal(dayNumber("2026-2-1"), null);
  assert.equal(dayNumber(null), null);
  assert.equal(dateOf(dayNumber("2026-11-08") as number), "2026-11-08");
});

test("age only: due at install date plus the estimated life", () => {
  const a = assess(wall({ factors: factors({ outdoor: 0.8, maintenance: 1.2 }) }), AS_OF);
  assert.equal(a.kind, "material");
  assert.equal(a.ageDueDate, "2029-08-07");
  assert.equal(a.ageYears, 6.85);
  assert.equal(a.status, "ok");
  assert.equal(a.dueBy, "age");
  assert.equal(a.dueDate, "2029-08-07");
});

test("an observed grade at the intervention grade makes work due, from the first look of that run", () => {
  assert.equal(DEFAULT_INTERVENTION_GRADE, 4);
  const a = assess(wall({ observations: [look("2025-01-10", 2), look("2025-09-01", 4), look("2026-06-01", 5)] }), AS_OF);
  assert.equal(a.status, "due");
  assert.equal(a.dueBy, "observed");
  assert.equal(a.dueDate, "2025-09-01");
  // An element can set its own intervention grade.
  const strict = assess(wall({ interventionGrade: 3, observations: [look("2026-06-01", 3)] }), AS_OF);
  assert.equal(strict.status, "due");
  assert.equal(strict.dueDate, "2026-06-01");
});

test("trend: least squares over graded looks; the earlier of trend and age wins", () => {
  const looks = [look("2024-01-01", 1), look("2025-01-01", 2), look("2026-01-01", 3)];
  const t = conditionTrend(looks, 4);
  assert.ok(t);
  assert.equal(t.gradesPerYear, 0.999);
  assert.equal(t.reachesInterventionOn, "2027-01-02");
  // Installed 2023-03-01 with 12 years: age says 2035; the trend's 2027 comes first.
  const a = assess(wall({ installed: "2023-03-01", reference: { years: 12, source: "synthetic", conditions: "" }, observations: looks }), AS_OF);
  assert.equal(a.ageDueDate, "2035-03-01");
  assert.equal(a.status, "ok");
  assert.equal(a.dueBy, "trend");
  assert.equal(a.dueDate, "2027-01-02");
});

test("a slower trend never moves the date later on its own", () => {
  const looks = [look("2024-01-01", 1), look("2026-01-01", 2)];
  const a = assess(wall({ factors: factors({ outdoor: 0.8, maintenance: 1.2 }), observations: looks }), AS_OF);
  assert.ok(a.trend?.reachesInterventionOn && a.trend.reachesInterventionOn > "2029-08-07");
  assert.equal(a.dueBy, "age");
  assert.equal(a.dueDate, "2029-08-07");
  assert.ok(a.notes.some((n) => /the earlier date stands until a person changes/.test(n)));
});

test("check: the age date has passed but the latest look is fine, so a person re-inspects", () => {
  const old = wall({ installed: "2010-01-01" });
  const unseen = assess(old, AS_OF);
  assert.equal(unseen.ageDueDate, "2020-01-02");
  assert.equal(unseen.status, "due", "nobody has looked since it fell due");
  const seen = assess({ ...old, observations: [look("2026-06-01", 2)] }, AS_OF);
  assert.equal(seen.status, "check");
  assert.equal(seen.dueBy, "age");
  assert.ok(seen.notes.some((n) => /re-inspect/.test(n)));
  // A look from before the due date does not count as a check.
  assert.equal(assess({ ...old, observations: [look("2019-06-01", 2)] }, AS_OF).status, "due");
});

test("photos count only when dated, graded, named and from a registered viewpoint", () => {
  const { used, excluded } = usableObservations([
    look("2026-03-01", 2),
    look("2026-03-02", null),
    look("2026-03-03", 2, { by: "" }),
    look("2026-03-04", 2, { viewpoint: "" }),
    look("2026-03-05", 2, { photo: "" }),
    look("2026-13-01", 2),
    look("2026-03-06", 7 as unknown as Observation["grade"]),
  ]);
  assert.deepEqual(used.map((o) => o.date), ["2026-03-01"]);
  assert.deepEqual(excluded.map((x) => x.why), ["not graded", "no named grader", "no registered viewpoint", "no photo", "no valid date", "grade is not 1 to 5"]);
  const a = assess(wall({ observations: [look("2026-03-01", 2), look("2027-01-01", 5)] }), AS_OF);
  assert.equal(a.latest?.date, "2026-03-01", "a photo dated after the as-of day is left out");
  assert.deepEqual(a.excluded, [{ date: "2027-01-01", why: "after 2026-11-08" }]);
});

test(`a trend needs looks at least ${MIN_TREND_DAYS} days apart, and only a worsening one projects a date`, () => {
  assert.equal(conditionTrend([look("2026-01-01", 1), look("2026-02-01", 3)], 4), null);
  const steady = conditionTrend([look("2025-01-01", 2), look("2026-01-01", 2)], 4);
  assert.equal(steady?.gradesPerYear, 0);
  assert.equal(steady?.reachesInterventionOn, null);
});

test("unknown: no estimate, no install date and no trend says what is missing", () => {
  const a = assess(wall({ installed: null, reference: { years: null, source: "", conditions: "" } }), AS_OF);
  assert.equal(a.status, "unknown");
  assert.equal(a.dueDate, null);
  assert.ok(a.notes.some((n) => n.startsWith("no age estimate")));
  assert.ok(a.notes.includes("no install date"));
  assert.ok(a.notes.some((n) => n.startsWith("no trend")));
});

test("graffiti, vandalism and litter are cycles, not decay: no service life", () => {
  for (const [m, def] of Object.entries(MECHANISMS)) {
    const expected = m === "graffiti" || m === "vandalism" ? "social" : m === "litter" ? "operational" : "material";
    assert.equal(def.kind, expected, m);
  }
  const tag = assess(wall({ id: "SYN-SIGN", layer: "skin", mechanism: "graffiti", observations: [look("2026-10-01", 5)] }), AS_OF);
  assert.equal(tag.status, "not_decay");
  assert.equal(tag.estimate, null);
  assert.equal(tag.dueDate, null);
  assert.match(tag.notes[0], /not decay\. Log report-to-clear times/);
});

test("public elements say who can fix them", () => {
  const crossing = assess(wall({ id: "SYN-XING", layer: "site", mechanism: "abrasion", owner: "public" }), AS_OF);
  assert.ok(crossing.notes.some((n) => /report it to the city or utility/.test(n)));
});

test("report-to-clear times: median of cleared, oldest open, bad rows left out", () => {
  const r = responseTimes([
    { reported: "2026-11-01T08:00:00Z", cleared: "2026-11-01T20:00:00Z" },
    { reported: "2026-11-02T08:00:00Z", cleared: "2026-11-04T08:00:00Z" },
    { reported: "2026-11-03T08:00:00Z", cleared: "2026-11-03T14:00:00Z" },
    { reported: "2026-11-07T08:00:00Z", cleared: null },
    { reported: "2026-11-05T08:00:00Z", cleared: "2026-11-04T08:00:00Z" },
    { reported: "not a date", cleared: null },
  ], "2026-11-08T08:00:00Z");
  assert.deepEqual(r, { cleared: 3, open: 1, medianHours: 12, longestOpenHours: 24, excluded: 2 });
  assert.deepEqual(responseTimes([], "2026-11-08"), { cleared: 0, open: 0, medianHours: null, longestOpenHours: null, excluded: 0 });
});

test("deterministic: the same element and day give the same assessment", () => {
  const el = wall({ observations: [look("2026-01-01", 3), look("2024-01-01", 1), look("2025-01-01", 2)] });
  assert.deepEqual(assess(el, AS_OF), assess(structuredClone(el), AS_OF));
  assert.throws(() => assess(el, "8 Nov 2026"), /YYYY-MM-DD/);
});

test("canon B5R-55 stays in step with the code", () => {
  const e = CANON_REGISTER.find((x) => x.id === "B5R-55");
  assert.ok(e, "B5R-55 is registered");
  assert.equal(e.status, "LOCKED");
  assert.equal(SHEARING_LAYERS.join(", "), "site, structure, skin, services, space_plan, stuff");
  assert.match(e.statement, /site, structure, skin, services, space plan, stuff/);
  assert.match(e.statement, /ISO 15686/);
  assert.equal(Object.keys(CONDITION_GRADES).length, 5);
  assert.match(e.statement, /1 \(as new\) to 5 \(failed or unsafe\)/);
  assert.match(e.statement, /never moves a date later/);
  assert.match(e.statement, /graffiti, vandalism and litter/i);
});
