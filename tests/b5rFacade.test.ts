/**
 * AIM-B5R Façade Intelligence System (FIS-Flat v0.1). Synthetic data only:
 * the page fixture, plus a tiny two-by-two elevation built here to drive
 * the rules. The tiny project is marked LIVE only so the EXECUTE branch can
 * be reached; nothing in it describes a real building.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FIS_GATES, FIS_MODULES, INTERVENTION_LADDER } from "../lib/canon/vocab";
import {
  CATALOGUE, CRITERIA, FACADE_GATES, MODULE_IDS,
  buildContract, canPlace, capitalFor, cellById, checkOption, clearWallFraction, contractIntact, evaluateProject, scoreOption, sensitivity, shiftWeights,
  validateProject,
  type CostLine, type FacadeOption, type FacadeProject, type GateRecord, type ModuleId,
} from "../lib/b5r/facade";
import { SYNTHETIC_PROJECT, cellId } from "../lib/b5r/facade/fixture";

const ROOT = join(__dirname, "..");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ---------------------------------------------------------------------------
// A tiny rule-test project: 2 floors x 2 bays, survey-verified, fully priced.
//   c00 solid wall (street)   c01 lobby with an exit door
//   c10 bedroom window        c11 living room with a downspout
// ---------------------------------------------------------------------------

const priced = (id: string, kind: CostLine["kind"], amountUsd: number): CostLine => ({
  id, kind, label: id, amountUsd, estimateClass: "BID", sourceIds: ["bid"], date: "2026-10-01", confidence: "med",
  region: "Test region", scopeDefinition: `${kind} for the rule test`, assumptions: "rule test",
});

const ALL_PASS: GateRecord[] = FACADE_GATES.map((g) => ({
  gate: g.id, state: "PASS", reason: "rule test", sourceIds: ["survey"], reviewer: "Test reviewer", date: "2026-10-02",
}));

function tiny(): FacadeProject {
  const cell = (id: string, floor: number, bay: number, roomUse: FacadeProject["cells"][number]["roomUse"]) => ({
    id, elevationId: "e", floor, bay, roomUse, geometryState: "SURVEY_VERIFIED" as const, sourceIds: ["survey"], drivers: {},
  });
  const option: FacadeOption = {
    id: "o1", name: "Mural", intent: "rule test", assignments: { c00: "F1" }, justifications: [],
    costLines: [
      priced("access", "access", 1000), priced("cont", "contingency", 500), priced("design", "design_permits", 800),
      priced("mat", "materials", 300), priced("install", "install", 400), priced("tenant", "tenant_disruption", 0),
    ],
    benefitLines: [{ id: "om", kind: "incremental_om", label: "Mural upkeep", annualUsd: 50, state: "provisional", estimateClass: "BUDGET", sourceIds: ["bid"], date: "2026-10-01", method: "vendor quote" }],
    nonFinancialBenefits: [], scores: null, renderSourceId: null,
  };
  return {
    schemaVersion: "aim-fis-project-1", id: "tiny", name: "Rule test", revision: 1, dataStatus: "LIVE", mode: "retrofit",
    locationContext: "rule test", occupied: true, property: null,
    sources: [
      { id: "survey", type: "survey", title: "Test survey", uri: "test", sha256: null, captureDate: "2026-10-01", author: "test", permission: "owner", tier: 2 },
      { id: "bid", type: "bid", title: "Test bid", uri: "test", sha256: null, captureDate: "2026-10-01", author: "test", permission: "owner", tier: 2 },
      { id: "render", type: "ai_concept_image", title: "Concept render", uri: "test", sha256: null, captureDate: null, author: "test", permission: "owner", tier: 4 },
    ],
    drivers: {},
    elevations: [{ id: "e", name: "Test", orientation: "S", floors: 2, bays: 2, bayWidthsMm: [3000, 3000], floorHeightsMm: [3200, 3000], schematicBayWidths: [1, 1], baseGeometrySourceId: "survey", surveyState: "SURVEY_VERIFIED" }],
    cells: [cell("c00", 0, 0, "resident_amenity"), cell("c01", 0, 1, "lobby"), cell("c10", 1, 0, "bedroom"), cell("c11", 1, 1, "living")],
    masks: [
      { id: "m-door", cellId: "c01", kind: "egress", rect: { x: 0.2, y: 0.2, w: 0.6, h: 0.8 }, state: "verified", sourceIds: ["survey"] },
      { id: "m-win", cellId: "c10", kind: "window", rect: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, state: "verified", sourceIds: ["survey"] },
      { id: "m-pipe", cellId: "c11", kind: "utility", rect: { x: 0.4, y: 0, w: 0.2, h: 1 }, state: "verified", sourceIds: ["survey"] },
    ],
    gateRecords: clone(ALL_PASS),
    requiredWork: [priced("repairs", "required_repairs", 2000)],
    budget: { approvedUsd: 10000, approvedBy: "Test owner", date: "2026-10-03", sourceIds: ["bid"] },
    finance: { discountRate: 0.05, horizonYears: 3, endOfLifeUsd: 100, sourceIds: ["bid"] },
    weights: { values: Object.fromEntries(CRITERIA.map((c) => [c.id, c.weight])) as FacadeProject["weights"]["values"], chosenBy: "Test", date: "2026-10-01" },
    options: [option],
  };
}

const callOf = (p: FacadeProject, optionId = "o1") => evaluateProject(p).options.find((o) => o.optionId === optionId);

// ---------------------------------------------------------------------------

test("facade fixture: synthetic, unlinked, valid, and nothing priced", () => {
  const p = SYNTHETIC_PROJECT;
  assert.equal(p.dataStatus, "SYNTHETIC");
  assert.equal(p.property, null);
  assert.deepEqual(validateProject(p).filter((i) => i.severity === "error"), []);
  assert.equal(p.cells.length, 35);
  for (const s of p.sources) assert.equal(s.permission, "synthetic");
  const lines = [...p.requiredWork, ...p.options.flatMap((o) => o.costLines)];
  assert.ok(lines.length > 0 && lines.every((l) => l.amountUsd === null), "every price is null (not priced)");
  assert.ok(p.options.flatMap((o) => o.benefitLines).every((b) => b.annualUsd === null));
});

test("facade fixture: no option obstructs a window, exit, utility, historic or access mask", () => {
  for (const o of SYNTHETIC_PROJECT.options) assert.deepEqual(checkOption(SYNTHETIC_PROJECT, o), [], o.id);
  const ev = evaluateProject(SYNTHETIC_PROJECT);
  const [a, b, c] = ev.options;
  assert.equal(a.windows.clear, a.windows.residentWindows);
  assert.equal(b.windows.clear, b.windows.residentWindows);
  assert.deepEqual(c.windows.screened, [cellId(1, 3), cellId(2, 3), cellId(3, 3)], "C screens only its three justified windows");
  // Concept stage: nothing reviewed, nothing priced, so no option can go ahead.
  for (const o of ev.options) {
    assert.notEqual(o.call, "EXECUTE");
    assert.equal(o.call, "ESCALATE", `${o.optionId}: fire, structure and envelope are unreviewed`);
    assert.equal(o.capital.cTotal, null, "unknown is null, never zero");
  }
});

test("facade catalogue: F0-F7 in order, flat first, every module on the canon ladder", () => {
  assert.deepEqual(CATALOGUE.map((m) => m.id), [...MODULE_IDS]);
  assert.deepEqual(CATALOGUE.map((m) => ({ id: m.id, name: m.name, status: m.status })), FIS_MODULES.map((m) => ({ ...m })), "catalogue matches canon (B5R-41)");
  assert.deepEqual(FACADE_GATES.map((g) => [g.id, g.name]), FIS_GATES.map((g) => [g.id, g.name]), "gates match canon (B5R-40)");
  assert.deepEqual(CRITERIA.map((c) => c.weight), [25, 20, 25, 15, 10, 5], "the owner's Fresno weights (B5R-43)");
  const by = Object.fromEntries(CATALOGUE.map((m) => [m.id, m]));
  assert.equal(by.F7.status, "disabled");
  assert.equal(by.F6.status, "pilot");
  for (const m of CATALOGUE) {
    assert.ok((INTERVENTION_LADDER as readonly string[]).includes(m.ladder), `${m.id} ladder step`);
    assert.ok(m.triggers.includes("FG1") && m.triggers.includes("FG7"), `${m.id} always meets fire and capital`);
    assert.ok(Object.values(m.spec).every((v) => v === null), `${m.id} spec stays unknown until a product is chosen`);
  }
});

test("facade masks: nothing covers an exit or historic fabric; refusals give the reason", () => {
  const p = SYNTHETIC_PROJECT;
  const o = clone(p.options[0]);
  const at = (f: number, b: number) => cellById(p, cellId(f, b))!;
  const refuse = (f: number, b: number, m: ModuleId, kind: string, gate: string | null) => {
    const r = canPlace(p, at(f, b), m, o);
    assert.equal(r.ok, false, `${m} on ${cellId(f, b)}`);
    if (!r.ok) {
      assert.equal(r.kind, kind, `${m} on ${cellId(f, b)}`);
      assert.equal(r.gate, gate, `${m} on ${cellId(f, b)}`);
      assert.ok(r.reason.length > 20);
    }
  };
  refuse(1, 1, "F3", "mask", "FG4"); // a screen over a bedroom window needs a justification
  refuse(1, 5, "F3", "mask", "FG1"); // studio window under the fire escape: the hard block is named first...
  o.justifications.push({ cellId: cellId(1, 5), maskKind: "window", reason: "test", sourceIds: ["syn-sun-note"] });
  refuse(1, 5, "F3", "mask", "FG1"); // ...and a justified window still cannot cover the exit
  refuse(0, 6, "F3", "mask", "FG1"); // stair exit door
  refuse(0, 1, "F2", "mask", "FG1"); // no panel beside an exit
  refuse(1, 5, "F2", "mask", "FG1"); // nor beside a fire escape
  refuse(1, 2, "F3", "mask", "FG6"); // a screen would cover the downspout
  refuse(1, 6, "F3", "mask", "FG6"); // or the bathroom vent
  assert.equal(canPlace(p, at(0, 2), "F5", o).ok, true, "F5 covers the meters as a removable door");
  refuse(1, 0, "F5", "catalogue", null); // no utility to protect
  refuse(2, 0, "F4", "catalogue", null); // wayfinding above street level
  refuse(1, 1, "F4", "catalogue", null);
  refuse(4, 0, "F1", "survey", null); // unmeasured top floor: NEEDS SURVEY
  refuse(1, 0, "F7", "catalogue", null); // disabled
  refuse(1, 0, "F6", "survey", null); // pilot module needs a survey-verified cell
  assert.equal(canPlace(p, at(4, 1), "F0", o).ok, true, "F0 is always allowed");
  assert.equal(canPlace(p, at(1, 0), "F1", o).ok, true, "a solid pier can take a finish");

  // Historic fabric: measured here so the rule itself is tested.
  const h = clone(p);
  h.cells.find((c) => c.id === cellId(4, 0))!.geometryState = "FIELD_OBSERVED";
  const hc = cellById(h, cellId(4, 0))!;
  const hr = canPlace(h, hc, "F2", o);
  assert.ok(!hr.ok && hr.gate === "FG5", "no panel beside historic fabric");
  assert.ok(canPlace(h, hc, "F1", o).ok, "paint below the cornice, after historic review");
  const h3 = canPlace(h, hc, "F3", o);
  assert.ok(!h3.ok && h3.gate === "FG5", "nothing covers historic fabric");
});

test("facade masks (v0.2, loosened): finishes, panels and signs may sit beside a protected area that stays clear", () => {
  const p = SYNTHETIC_PROJECT;
  const o = clone(p.options[0]);
  const at = (f: number, b: number) => cellById(p, cellId(f, b))!;
  const ok = (f: number, b: number, m: ModuleId, note: RegExp) => {
    const r = canPlace(p, at(f, b), m, o);
    assert.ok(r.ok, `${m} on ${cellId(f, b)}: ${r.ok ? "" : r.reason}`);
    if (r.ok) assert.match(r.notes.join(" "), note, `${m} on ${cellId(f, b)}`);
  };
  ok(1, 1, "F1", /beside the window, which stays clear; FG4/); // paint around a bedroom window
  ok(1, 1, "F2", /FG4 and FG3/); // a panel around it meets the flashing too
  ok(0, 1, "F4", /beside the exit, which stays clear; FG1/); // address sign beside the lobby door
  ok(0, 1, "F1", /FG1/);
  ok(1, 2, "F2", /beside the utility, which stays clear; FG6/); // panel beside the downspout
  ok(0, 3, "F3", /common-area window; FG4/); // mail-room window: no justification needed

  // Too little opaque wall left once the window stays clear.
  const big = clone(p);
  big.masks.find((m) => m.cellId === cellId(1, 1) && m.kind === "window")!.rect = { x: 0.05, y: 0.05, w: 0.9, h: 0.8 };
  assert.ok(clearWallFraction(big, cellId(1, 1)) < 0.3);
  const r = canPlace(big, cellById(big, cellId(1, 1))!, "F1", o);
  assert.ok(!r.ok && /Too little opaque wall/.test(r.reason));

  // The union of overlapping masks is counted once: studio window + fire escape.
  const wall = clearWallFraction(p, cellId(1, 5));
  const win = 0.64 * 0.58;
  const esc = 1 * 0.28;
  const overlap = 0.64 * (0.78 - 0.72);
  assert.ok(Math.abs(wall - (1 - (win + esc - overlap))) < 1e-6);

  // A finish beside a window brings FG4 into the option, so FG4 cannot be "not applicable".
  const q = clone(p);
  q.options[0].assignments[cellId(1, 1)] = "F1";
  q.gateRecords.push({ gate: "FG4", state: "NOT_APPLICABLE", reason: "paint only", sourceIds: ["syn-geometry"], reviewer: "Test reviewer", date: "2026-11-04" });
  const fg4 = evaluateProject(q).options[0].gates.find((g) => g.gate === "FG4")!;
  assert.equal(fg4.state, "UNKNOWN");
  assert.ok(fg4.appliesBecause.some((x) => /F1 beside the window on c-1-1/.test(x)));
  assert.equal(evaluateProject(q).options[0].windows.clear, evaluateProject(q).options[0].windows.residentWindows, "paint around a window leaves it clear");
});

test("facade gates: an obstruction in an option file is a FAIL and the option is KILLed, not scored low", () => {
  const p = clone(SYNTHETIC_PROJECT);
  const c = p.options[2];
  c.assignments[cellId(1, 1)] = "F3"; // screen over a bedroom window, no justification
  c.assignments[cellId(2, 5)] = "F3"; // screen over the fire escape
  c.assignments[cellId(1, 2)] = "F2"; // allowed: a panel beside the downspout
  const ev = evaluateProject(p);
  const o = ev.options.find((x) => x.optionId === c.id)!;
  assert.equal(o.call, "KILL");
  assert.equal(o.gates.find((g) => g.gate === "FG1")?.state, "FAIL");
  assert.equal(o.gates.find((g) => g.gate === "FG4")?.state, "FAIL");
  assert.notEqual(o.gates.find((g) => g.gate === "FG6")?.state, "FAIL", "beside is not an obstruction");
  assert.ok(!o.conflicts.some((x) => x.cellId === cellId(1, 2)));
  assert.ok(!ev.ranking.some((r) => r.optionId === c.id), "a killed option is not ranked");
  assert.ok(o.score.total !== null, "its score still exists, and changes nothing");
});

test("facade gates: every gate PASS on reviewed real data gives EXECUTE; any critical unknown blocks it", () => {
  assert.equal(callOf(tiny())?.call, "EXECUTE");
  assert.match(callOf(tiny())!.reasons.at(-1)!, /Not construction approval/);

  let p = tiny();
  p.gateRecords = p.gateRecords.filter((r) => r.gate !== "FG1");
  assert.equal(callOf(p)?.call, "ESCALATE", "no fire / life-safety review");

  p = tiny();
  p.gateRecords.find((r) => r.gate === "FG3")!.state = "UNKNOWN";
  assert.equal(callOf(p)?.call, "ESCALATE", "envelope unknown");

  p = tiny();
  p.gateRecords.find((r) => r.gate === "FG6")!.state = "UNKNOWN";
  assert.equal(callOf(p)?.call, "DEFER", "operations unknown");

  p = tiny();
  Object.assign(p.gateRecords.find((r) => r.gate === "FG2")!, { state: "FAIL", reason: "no attachment path" });
  assert.equal(callOf(p)?.call, "KILL");

  p = tiny();
  Object.assign(p.gateRecords.find((r) => r.gate === "FG2")!, { state: "FAIL", reviewer: "" });
  assert.equal(callOf(p)?.gates.find((g) => g.gate === "FG2")?.state, "UNKNOWN", "an unreviewed FAIL is held as UNKNOWN");

  p = tiny();
  p.gateRecords.find((r) => r.gate === "FG4")!.sourceIds = ["render"];
  assert.equal(callOf(p)?.gates.find((g) => g.gate === "FG4")?.state, "UNKNOWN", "a concept image cannot pass a gate");

  p = tiny();
  p.gateRecords.find((r) => r.gate === "FG5")!.reviewer = " ";
  assert.equal(callOf(p)?.call, "DEFER", "a PASS needs a named reviewer");

  p = tiny();
  p.dataStatus = "SYNTHETIC";
  p.sources = p.sources.map((s) => (s.id === "render" ? s : { ...s, type: "synthetic" as const, permission: "synthetic" as const }));
  assert.equal(callOf(p)?.call, "DEFER", "synthetic data never gives EXECUTE");
});

test("facade gates: option records beat project-wide ones; not-applicable has to be earned", () => {
  let p = tiny();
  p.gateRecords.push({ gate: "FG6", state: "UNKNOWN", reason: "access plan pending", sourceIds: [], reviewer: "", date: "", optionId: "o1" });
  assert.equal(callOf(p)?.gates.find((g) => g.gate === "FG6")?.state, "UNKNOWN");

  const na = (gate: GateRecord["gate"], reason = "nothing attached", reviewer = "Test reviewer") => {
    const q = tiny();
    Object.assign(q.gateRecords.find((r) => r.gate === gate)!, { state: "NOT_APPLICABLE", reason, reviewer });
    return q;
  };
  assert.equal(callOf(na("FG2"))?.gates.find((g) => g.gate === "FG2")?.state, "NOT_APPLICABLE", "F1 paint adds no attachment");
  assert.equal(callOf(na("FG2"))?.call, "EXECUTE");
  assert.equal(callOf(na("FG1"))?.gates.find((g) => g.gate === "FG1")?.state, "UNKNOWN", "fire / life safety always applies");
  assert.equal(callOf(na("FG7"))?.gates.find((g) => g.gate === "FG7")?.state, "UNKNOWN", "capital always applies");
  assert.equal(callOf(na("FG5"))?.gates.find((g) => g.gate === "FG5")?.state, "UNKNOWN", "F1 triggers sign / mural review");
  assert.equal(callOf(na("FG2", ""))?.gates.find((g) => g.gate === "FG2")?.state, "UNKNOWN", "N/A needs a reason");

  p = na("FG2");
  p.options[0].assignments.c11 = "F5";
  p.options[0].costLines.push(priced("fab", "fabrication", 200));
  assert.equal(callOf(p)?.call, "EXECUTE", "F5 does not trigger FG2");
  p.options[0].assignments.c00 = "F2";
  assert.equal(callOf(p)?.gates.find((g) => g.gate === "FG2")?.state, "UNKNOWN", "F2 panels do");
});

test("facade gates: attached modules need survey-verified cells (FG2)", () => {
  const p = tiny();
  p.options[0].assignments.c11 = "F5";
  p.options[0].costLines.push(priced("fab", "fabrication", 200));
  assert.equal(callOf(p)?.call, "EXECUTE");
  p.cells.find((c) => c.id === "c11")!.geometryState = "FIELD_OBSERVED";
  const fg2 = callOf(p)?.gates.find((g) => g.gate === "FG2");
  assert.equal(fg2?.state, "UNKNOWN");
  assert.match(fg2!.reasons.join(" "), /c11/);
});

test("facade capital: the study's formulas, with unknown as null and placeholders left out", () => {
  const p = tiny();
  const cap = capitalFor(p, p.options[0]);
  assert.equal(cap.cRequiredWork, 2000);
  assert.equal(cap.cContingency, 500);
  assert.equal(cap.cTotal, 2000 + 1000 + 500 + 800 + 300 + 400 + 0, "a priced zero (vacant, with a source) counts");
  assert.equal(cap.bApproved, 10000);
  assert.equal(cap.bOptional, 10000 - 2000 - 500, "B_optional = max(0, B_approved - C_required_work - C_contingency)");
  assert.equal(cap.withinBudget, true);
  assert.equal(cap.gate, null);
  assert.equal(cap.annualNetBenefit, -50, "no verified benefit, known upkeep");
  const r = 0.05;
  const npv = -5000 + [1, 2, 3].reduce((t, k) => t + -50 / (1 + r) ** k, 0) - 100 / (1 + r) ** 3;
  assert.equal(cap.npv, Math.round(npv * 100) / 100);

  // One unpriced line makes the total unknown, never a smaller number.
  const q = tiny();
  q.options[0].costLines.find((l) => l.kind === "materials")!.amountUsd = null;
  const cq = capitalFor(q, q.options[0]);
  assert.equal(cq.cTotal, null);
  assert.equal(cq.npv, null);
  assert.equal(cq.gate?.state, "UNKNOWN");
  assert.equal(callOf(q)?.call, "DEFER");

  // A missing required kind is also unknown.
  const m = tiny();
  m.options[0].costLines = m.options[0].costLines.filter((l) => l.kind !== "install");
  assert.match(capitalFor(m, m.options[0]).unpriced.join(" "), /no install line/);

  // Board figures never enter a sum.
  const b = tiny();
  Object.assign(b.options[0].costLines.find((l) => l.kind === "materials")!, { estimateClass: "UNVERIFIED_VISUAL_PLACEHOLDER", amountUsd: 85 });
  const cb = capitalFor(b, b.options[0]);
  assert.equal(cb.cTotal, null);
  assert.ok(cb.excluded.some((e) => e.why.includes("concept art")));
  const s = tiny();
  s.options[0].costLines.find((l) => l.kind === "materials")!.sourceIds = ["render"];
  assert.ok(capitalFor(s, s.options[0]).excluded.some((e) => e.why.includes("concept image")));
});

test("facade capital: decoration cannot displace required repair (FG7)", () => {
  const over = tiny();
  over.budget.approvedUsd = 4000; // required 2000 + contingency 500 fit; the rest (2500) does not
  const c = capitalFor(over, over.options[0]);
  assert.equal(c.bOptional, 1500);
  assert.equal(c.gate?.state, "FAIL");
  assert.match(c.gate!.reasons[0], /displace required repair/);
  assert.equal(callOf(over)?.call, "KILL");

  const under = tiny();
  under.budget.approvedUsd = 2400; // required work and contingency alone exceed it
  assert.match(capitalFor(under, under.options[0]).gate!.reasons[0], /Required work and contingency/);
  assert.equal(capitalFor(under, under.options[0]).bOptional, 0);

  const nobudget = tiny();
  nobudget.budget.approvedBy = "";
  assert.equal(capitalFor(nobudget, nobudget.options[0]).bApproved, null, "a budget without an approver is not approved");
  assert.equal(callOf(nobudget)?.call, "DEFER");
});

test("facade capital: only verified, sourced benefits count; NOI needs a causal chain", () => {
  const p = tiny();
  const o = p.options[0];
  o.benefitLines.push(
    { id: "e1", kind: "energy_savings", label: "verified", annualUsd: 300, state: "verified", estimateClass: "BUDGET", sourceIds: ["bid"], date: "2026-10-01", method: "metered" },
    { id: "e2", kind: "energy_savings", label: "provisional", annualUsd: 900, state: "provisional", estimateClass: "BUDGET", sourceIds: ["bid"], date: "2026-10-01", method: "estimate" },
    { id: "n1", kind: "noi_effect", label: "no chain", annualUsd: 5000, state: "verified", estimateClass: "BUDGET", sourceIds: ["bid"], date: "2026-10-01", method: "?" },
    { id: "n2", kind: "noi_effect", label: "board", annualUsd: 9000, state: "verified", estimateClass: "UNVERIFIED_VISUAL_PLACEHOLDER", sourceIds: ["bid"], date: "", method: "", causalChain: "image" },
  );
  const c = capitalFor(p, o);
  assert.equal(c.annualNetBenefit, 300 - 50);
  assert.equal(c.verifiedBenefitCount, 1);
  assert.deepEqual(c.excluded.map((e) => e.id).sort(), ["e2", "n1", "n2"]);
});

test("facade validation: concept images never back geometry; links are checked, not assumed", () => {
  const p = tiny();
  p.cells[0].sourceIds = ["render"];
  assert.ok(validateProject(p).some((i) => i.severity === "error" && i.where === "cell c00"));
  assert.equal(callOf(p)?.call, "DEFER", "project-file errors stop the call");

  const s = tiny();
  s.sources.push({ id: "fake", type: "synthetic", title: "x", uri: "x", sha256: null, captureDate: null, author: "x", permission: "synthetic", tier: 4 });
  assert.ok(validateProject(s).some((i) => i.where === "source fake"), "no synthetic source in a LIVE project");

  const link = tiny();
  link.property = { property_uuid: "6f1c2d4e-8b3a-5c7d-9e0f-a1b2c3d4e5f6", lead_id: "K1" };
  assert.ok(validateProject(link).some((i) => i.severity === "warning" && i.where === "property"));
  assert.ok(validateProject(link, { properties: [] }).some((i) => i.severity === "error" && /no Phase 1 property/.test(i.message)));
  assert.ok(validateProject(link, { properties: [{ property_uuid: link.property.property_uuid, lead_id: "F2" }] }).some((i) => /lead_id does not match/.test(i.message)));
  assert.deepEqual(validateProject(link, { properties: [{ property_uuid: link.property.property_uuid, lead_id: "K1" }] }).filter((i) => i.where === "property"), []);

  const syn = clone(SYNTHETIC_PROJECT);
  syn.property = { property_uuid: "6f1c2d4e-8b3a-5c7d-9e0f-a1b2c3d4e5f6", lead_id: "K1" };
  assert.ok(validateProject(syn).some((i) => /synthetic project cannot link/.test(i.message)));

  const retail = clone(SYNTHETIC_PROJECT) as unknown as { cells: { roomUse: string }[] };
  retail.cells[0].roomUse = "retail";
  assert.ok(validateProject(retail as unknown as FacadeProject).some((i) => /residential only/.test(i.message)), "B5R-33");

  const w = tiny();
  w.weights.values.context = 20;
  assert.ok(validateProject(w).some((i) => i.where === "weights"));
});

test("facade scoring: after the gates, editable weights, lifecycle value needs evidence, sensitivity", () => {
  const p = clone(SYNTHETIC_PROJECT);
  const ev = evaluateProject(p);
  const a = ev.options[0];
  const life = a.score.parts.find((x) => x.criterion === "lifecycle_value");
  assert.equal(life?.value, 0, "no verified benefit, so lifecycle value counts as 0");
  assert.match(life!.note!, /no verified benefit/);
  assert.equal(a.score.total, 20 + 0 + 5 + 12 + 6 + 2, "Fresno weights: comfort 25, lifecycle 20, energy 25, upkeep 15, context 10, adaptability 5");
  assert.deepEqual(ev.ranking.map((r) => r.optionId), ["opt-b", "opt-a", "opt-c"]);

  const shifted = shiftWeights(p.weights, "environmental", 5);
  const sum = Object.values(shifted.values).reduce((t, v) => t + v, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9);
  assert.equal(shifted.values.environmental, 30);

  // Two options that swap places when the environmental weight moves.
  const o1 = clone(p.options[0]);
  const o2 = clone(p.options[0]);
  o1.id = "x1"; o2.id = "x2";
  o1.scores!.values = { resident_comfort: 5, lifecycle_value: 0, environmental: 0, constructability: 5, context: 5, adaptability: 5 };
  o2.scores!.values = { resident_comfort: 5, lifecycle_value: 0, environmental: 2, constructability: 4, context: 4, adaptability: 1 };
  const caps = { verifiedBenefitCount: 0 };
  assert.equal(scoreOption(o1, p.weights, caps).total, 55);
  assert.equal(scoreOption(o2, p.weights, caps).total, 25 + 10 + 12 + 8 + 1);
  const sens = sensitivity([{ option: o1, capital: caps }, { option: o2, capital: caps }], p.weights);
  assert.equal(sens.leader, "x2");
  assert.equal(sens.stable, false);
  assert.ok(sens.checks.some((c) => c.criterion === "environmental" && c.delta === -5 && c.leader === "x1"));

  const unscored = clone(p.options[0]);
  delete unscored.scores!.values.context;
  assert.equal(scoreOption(unscored, p.weights, caps).total, null, "no total until every criterion is scored");
});

test("facade decision contract: versioned, hashed, deterministic, human review required", async () => {
  const ev = evaluateProject(SYNTHETIC_PROJECT);
  assert.deepEqual(evaluateProject(SYNTHETIC_PROJECT), ev, "same input, same evaluation");
  const meta = { generatedAt: "2026-11-04T12:00:00.000Z" };
  const c1 = await buildContract(SYNTHETIC_PROJECT, ev, meta);
  const c2 = await buildContract(SYNTHETIC_PROJECT, ev, meta);
  assert.equal(c1.sha256, c2.sha256);
  assert.match(c1.sha256, /^[0-9a-f]{64}$/);
  assert.equal(c1.contractVersion, "aim-fis-decision-1");
  assert.equal(c1.drawingStatus, "AI_CONCEPT");
  assert.equal(c1.project.dataStatus, "SYNTHETIC");
  assert.equal(c1.humanReview.required, true);
  assert.equal(c1.humanReview.reviewer, null);
  assert.ok(c1.limits.some((l) => /never construction approval/.test(l)));
  assert.ok(c1.options.every((o) => o.call !== "EXECUTE"));
  assert.equal(c1.recommendation?.optionId, "opt-b");
  assert.ok(c1.recommendation!.nextEvidence.some((x) => x.startsWith("FG1")));
  assert.equal(await contractIntact(c1), true);
  assert.equal(await contractIntact({ ...c1, options: c1.options.map((o) => ({ ...o, call: "EXECUTE" as const })) }), false, "editing a call breaks the seal");

  const reviewed = await buildContract(SYNTHETIC_PROJECT, ev, { ...meta, review: { reviewer: "Owner", outcome: "revisions_requested", note: "test", at: meta.generatedAt } });
  assert.notEqual(reviewed.sha256, c1.sha256);
  assert.equal(reviewed.options[1].call, c1.options[1].call, "a review is recorded beside the call, never instead of it");
});

test("facade page: lives under /admin (behind the login) and is linked from the admin bar", () => {
  assert.ok(existsSync(join(ROOT, "app/admin/b5r/facade/page.tsx")));
  assert.match(readFileSync(join(ROOT, "proxy.ts"), "utf8"), /matcher: \["\/admin\/:path\*"\]/);
  assert.match(readFileSync(join(ROOT, "components/admin/AdminNav.tsx"), "utf8"), /\/admin\/b5r\/facade/);
});
