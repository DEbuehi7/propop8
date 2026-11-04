/**
 * The seven hard gates FG1-FG7 (study section 6), per option. Pure.
 *
 * Each gate's final state is the worse of two things:
 *   - the recorded review (an option's own record beats a project-wide one);
 *   - what the data shows: a protected mask obstructed (FAIL), attached
 *     modules on cells that are not survey-verified (FG2 UNKNOWN), and the
 *     capital model (FG7).
 * Order: FAIL > UNKNOWN > PASS / NOT_APPLICABLE.
 *
 * A record only counts when it can stand up:
 *   - no record is UNKNOWN (a critical unknown blocks; it is never a soft pass);
 *   - PASS needs a named reviewer and a source that is not a concept image;
 *   - FAIL needs a named reviewer, otherwise it is held as UNKNOWN
 *     (dataset contract: missing evidence is HOLD, never FAIL);
 *   - NOT_APPLICABLE needs a written reason and a reviewer, is never allowed
 *     on FG1 or FG7, never on a gate a module in this option triggers, and
 *     never on FG5 where the elevation has historic fabric.
 * In canon terms (EVIDENCE_AXES.gateOutcome) UNKNOWN is HOLD.
 */
import type { CapitalSummary } from "./capital";
import { moduleOf } from "./catalogue";
import {
  ALWAYS_APPLIES, CONCEPT_SOURCE_TYPES, FACADE_GATES,
  type FacadeGateId, type FacadeOption, type FacadeProject, type GateRecord, type GateState, type ModuleId,
} from "./contracts";
import { moduleAt, type Conflict } from "./masks";

export interface GateResult {
  gate: FacadeGateId;
  name: string;
  state: GateState;
  /** The record used, if any. */
  record: GateRecord | null;
  /** Modules in this option that make the gate apply. */
  triggeredBy: ModuleId[];
  /** Conditions of the building that make it apply whatever the modules (historic fabric -> FG5). */
  appliesBecause: string[];
  reasons: string[];
  blocking: boolean;
}

const RANK: Record<GateState, number> = { FAIL: 3, UNKNOWN: 2, PASS: 1, NOT_APPLICABLE: 1 };

export function recordFor(p: FacadeProject, gate: FacadeGateId, optionId: string): GateRecord | null {
  return p.gateRecords.find((r) => r.gate === gate && r.optionId === optionId)
    ?? p.gateRecords.find((r) => r.gate === gate && r.optionId === undefined)
    ?? null;
}

function realSources(p: FacadeProject, ids: string[]): boolean {
  return ids.some((id) => {
    const s = p.sources.find((x) => x.id === id);
    return s !== undefined && !CONCEPT_SOURCE_TYPES.includes(s.type);
  });
}

/** What a recorded review is worth on its own. */
function fromRecord(p: FacadeProject, gate: FacadeGateId, rec: GateRecord | null, triggers: string[]): { state: GateState; reason: string } {
  if (!rec) return { state: "UNKNOWN", reason: "no review recorded" };
  const who = rec.reviewer.trim();
  switch (rec.state) {
    case "UNKNOWN":
      return { state: "UNKNOWN", reason: rec.reason || "recorded as unknown" };
    case "FAIL":
      return who
        ? { state: "FAIL", reason: `${rec.reason} (${who}, ${rec.date})` }
        : { state: "UNKNOWN", reason: `a FAIL needs a named reviewer, so it is held as UNKNOWN: ${rec.reason}` };
    case "PASS":
      if (!who) return { state: "UNKNOWN", reason: "a PASS needs a named reviewer" };
      if (!realSources(p, rec.sourceIds)) return { state: "UNKNOWN", reason: "a PASS needs a source that is not a concept image or board" };
      return { state: "PASS", reason: `${rec.reason} (${who}, ${rec.date})` };
    case "NOT_APPLICABLE":
      if (ALWAYS_APPLIES.includes(gate)) return { state: "UNKNOWN", reason: `${gate} always applies; it cannot be marked not applicable` };
      if (triggers.length > 0) return { state: "UNKNOWN", reason: `marked not applicable, but it applies: ${triggers.join(", ")}` };
      if (!rec.reason.trim() || !who) return { state: "UNKNOWN", reason: "not applicable needs a written reason and a reviewer" };
      return { state: "NOT_APPLICABLE", reason: `${rec.reason} (${who}, ${rec.date})` };
  }
}

export function evaluateGates(p: FacadeProject, option: FacadeOption, conflicts: Conflict[], capital: CapitalSummary): GateResult[] {
  const used = [...new Set(p.cells.map((c) => moduleAt(option, c.id)))].sort();
  const unsurveyedAttached = p.cells
    .filter((c) => moduleOf(moduleAt(option, c.id)).attached && c.geometryState !== "SURVEY_VERIFIED")
    .map((c) => c.id);

  const historic = p.masks.some((m) => m.kind === "historic");

  return FACADE_GATES.map((g) => {
    const triggeredBy = used.filter((m) => moduleOf(m).triggers.includes(g.id));
    const appliesBecause = g.id === "FG5" && historic ? ["historic fabric on this elevation"] : [];
    const rec = recordFor(p, g.id, option.id);
    const base = fromRecord(p, g.id, rec, [...triggeredBy.map((m) => `${m} in this option`), ...appliesBecause]);
    let state = base.state;
    const reasons = [base.reason];
    const worsen = (s: GateState, why: string) => {
      if (RANK[s] > RANK[state]) state = s;
      reasons.push(why);
    };
    for (const c of conflicts.filter((x) => x.kind === "mask" && x.gate === g.id)) {
      worsen("FAIL", `${c.moduleId} on ${c.cellId}: ${c.reason}`);
    }
    if (g.id === "FG2" && unsurveyedAttached.length > 0) {
      worsen("UNKNOWN", `attached modules on cells not survey-verified: ${unsurveyedAttached.join(", ")}`);
    }
    if (g.id === "FG7" && capital.gate) {
      for (const r of capital.gate.reasons) worsen(capital.gate.state, r);
    }
    return { gate: g.id, name: g.name, state, record: rec, triggeredBy, appliesBecause, reasons, blocking: state === "FAIL" || state === "UNKNOWN" };
  });
}
