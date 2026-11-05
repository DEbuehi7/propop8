/**
 * Project file validation (study section 12.1 and the dataset-contract
 * evidence rules). Errors stop evaluation (the call becomes DEFER with the
 * errors as reasons); warnings are shown and kept.
 *
 * Rules that matter most:
 *   - AI concept images and design boards never back a measurement, a mask,
 *     a verified driver or a price (B5R-20; "images are never evidence");
 *   - geometry states need the right kind of source: FIELD_OBSERVED a photo,
 *     inspection, record, drawing or survey; SURVEY_VERIFIED a survey or
 *     drawing; a synthetic source only inside a SYNTHETIC project;
 *   - a source whose permission is unknown cannot verify anything (GOV-16);
 *   - a property link is checked against real Phase 1 records when they are
 *     given, never assumed (GOV-07), and a synthetic project links to nothing.
 */
import { EVIDENCE_AXES } from "../../canon/vocab";
import { isModuleId } from "./catalogue";
import {
  BENEFIT_KINDS, CONCEPT_SOURCE_TYPES, COST_KINDS, DRIVERS, ESTIMATE_CLASSES, FACADE_GATES, FIS_SCHEMA_VERSION, GATE_STATES,
  GEOMETRY_STATES, MASK_KINDS, ORIENTATIONS, PERMISSIONS, ROOM_USES, SCORE_MAX, SOURCE_TYPES,
  type FacadeProject, type GeometryState, type SourceType,
} from "./contracts";
import { weightProblems } from "./score";

export interface Issue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

const FACT_STATES: readonly string[] = EVIDENCE_AXES.propertyFactState;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GEOMETRY_SOURCES: Record<Exclude<GeometryState, "UNMEASURED">, readonly SourceType[]> = {
  FIELD_OBSERVED: ["field_photo", "inspection_report", "public_record", "drawing", "survey"],
  SURVEY_VERIFIED: ["survey", "drawing"],
};

export interface ValidateOptions {
  /** Phase 1 property records to check a link against. */
  properties?: { property_uuid: string; lead_id: string }[];
}

export function validateProject(p: FacadeProject, opts: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string) => issues.push({ severity: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ severity: "warning", where, message });
  const synthetic = p.dataStatus === "SYNTHETIC" || p.dataStatus === "MOCK";

  if (p.schemaVersion !== FIS_SCHEMA_VERSION) err("project", `schemaVersion must be ${FIS_SCHEMA_VERSION}`);
  if (!(EVIDENCE_AXES.dataStatus as readonly string[]).includes(p.dataStatus)) err("project", `dataStatus must be one of ${EVIDENCE_AXES.dataStatus.join(", ")}`);
  if (!Number.isInteger(p.revision) || p.revision < 1) err("project", "revision must be a whole number from 1");
  if (p.elevations.length === 0) err("project", "needs at least one elevation");
  if (p.options.length === 0) err("project", "needs at least one option (the repair baseline at least)");

  const ids = new Set<string>();
  const unique = (where: string, id: string) => {
    if (!id) err(where, "id is required");
    else if (ids.has(id)) err(where, `duplicate id ${id}`);
    ids.add(id);
  };

  // Sources.
  const source = new Map(p.sources.map((s) => [s.id, s]));
  for (const s of p.sources) {
    unique(`source ${s.id}`, s.id);
    if (!SOURCE_TYPES.includes(s.type)) err(`source ${s.id}`, `unknown type ${s.type}`);
    if (!PERMISSIONS.includes(s.permission)) err(`source ${s.id}`, `unknown permission ${s.permission}`);
    if (![1, 2, 3, 4].includes(s.tier)) err(`source ${s.id}`, "tier must be 1-4");
    if (CONCEPT_SOURCE_TYPES.includes(s.type) && s.tier !== 4) err(`source ${s.id}`, "concept images and boards are tier 4");
    if (s.type === "synthetic" && !synthetic) err(`source ${s.id}`, "a synthetic source belongs only in a SYNTHETIC or MOCK project");
  }
  const refs = (where: string, list: string[]) => {
    for (const id of list) if (!source.has(id)) err(where, `unknown source ${id}`);
  };
  const canVerify = (list: string[]) =>
    list.some((id) => {
      const s = source.get(id);
      return s !== undefined && !CONCEPT_SOURCE_TYPES.includes(s.type) && s.permission !== "unknown";
    });
  const backsGeometry = (state: GeometryState, list: string[]) => {
    if (state === "UNMEASURED") return true;
    return list.some((id) => {
      const s = source.get(id);
      if (!s || s.permission === "unknown") return false;
      return GEOMETRY_SOURCES[state].includes(s.type) || (synthetic && s.type === "synthetic");
    });
  };

  // Drivers.
  const driverIds = DRIVERS.map((d) => d.id) as string[];
  const checkDrivers = (where: string, drivers: FacadeProject["drivers"]) => {
    for (const [k, d] of Object.entries(drivers)) {
      if (!driverIds.includes(k)) { err(where, `unknown driver ${k}`); continue; }
      if (!d) continue;
      if (!FACT_STATES.includes(d.state)) err(`${where} ${k}`, `state must be one of ${FACT_STATES.join(", ")}`);
      refs(`${where} ${k}`, d.sourceIds);
      if (d.state === "verified" && !canVerify(d.sourceIds)) err(`${where} ${k}`, "verified needs a source that is not a concept image or board and has a known permission");
    }
  };
  checkDrivers("project drivers", p.drivers);

  // Elevations.
  const elev = new Map(p.elevations.map((e) => [e.id, e]));
  for (const e of p.elevations) {
    const w = `elevation ${e.id}`;
    unique(w, e.id);
    if (!ORIENTATIONS.includes(e.orientation)) err(w, `orientation must be one of ${ORIENTATIONS.join(", ")}`);
    if (!Number.isInteger(e.floors) || e.floors < 1 || !Number.isInteger(e.bays) || e.bays < 1) err(w, "floors and bays must be whole numbers from 1");
    if (e.bayWidthsMm.length !== e.bays) err(w, "bayWidthsMm needs one entry per bay (null when not measured)");
    if (e.floorHeightsMm.length !== e.floors) err(w, "floorHeightsMm needs one entry per floor (null when not measured)");
    if (e.schematicBayWidths.length !== e.bays || e.schematicBayWidths.some((x) => !(x > 0))) err(w, "schematicBayWidths needs one positive number per bay");
    for (const v of [...e.bayWidthsMm, ...e.floorHeightsMm]) if (v !== null && !(Number.isFinite(v) && v > 0)) err(w, "a measured size must be a positive number of mm");
    if (!GEOMETRY_STATES.includes(e.surveyState)) err(w, "unknown survey state");
    if (!source.has(e.baseGeometrySourceId)) err(w, `unknown source ${e.baseGeometrySourceId}`);
    else if (!backsGeometry(e.surveyState, [e.baseGeometrySourceId])) err(w, `${e.surveyState} needs a matching survey, drawing or field source, never a concept image`);
  }

  // Cells.
  const cell = new Map(p.cells.map((c) => [c.id, c]));
  const at = new Set<string>();
  for (const c of p.cells) {
    const w = `cell ${c.id}`;
    unique(w, c.id);
    const e = elev.get(c.elevationId);
    if (!e) err(w, `unknown elevation ${c.elevationId}`);
    else if (!Number.isInteger(c.floor) || !Number.isInteger(c.bay) || c.floor < 0 || c.floor >= e.floors || c.bay < 0 || c.bay >= e.bays) err(w, "floor or bay is outside the elevation grid");
    const key = `${c.elevationId}:${c.floor}:${c.bay}`;
    if (at.has(key)) err(w, "two cells at the same floor and bay");
    at.add(key);
    if (!ROOM_USES.includes(c.roomUse)) err(w, `room use must be one of ${ROOM_USES.join(", ")} (residential only, B5R-33)`);
    if (!GEOMETRY_STATES.includes(c.geometryState)) err(w, "unknown geometry state");
    refs(w, c.sourceIds);
    if (!backsGeometry(c.geometryState, c.sourceIds)) err(w, `${c.geometryState} needs a matching survey, drawing or field source, never a concept image`);
    checkDrivers(w, c.drivers);
  }
  for (const e of p.elevations) {
    let missing = 0;
    for (let f = 0; f < e.floors; f++) for (let b = 0; b < e.bays; b++) if (!at.has(`${e.id}:${f}:${b}`)) missing++;
    if (missing > 0) warn(`elevation ${e.id}`, `${missing} grid positions have no cell`);
  }

  // Masks.
  for (const m of p.masks) {
    const w = `mask ${m.id}`;
    unique(w, m.id);
    if (!cell.has(m.cellId)) err(w, `unknown cell ${m.cellId}`);
    if (!MASK_KINDS.includes(m.kind)) err(w, `kind must be one of ${MASK_KINDS.join(", ")}`);
    const { x, y, w: rw, h } = m.rect;
    if (![x, y, rw, h].every(Number.isFinite) || x < 0 || y < 0 || rw <= 0 || h <= 0 || x + rw > 1 + 1e-9 || y + h > 1 + 1e-9) err(w, "rect must sit inside the cell (fractions 0-1)");
    if (!FACT_STATES.includes(m.state)) err(w, "unknown evidence state");
    refs(w, m.sourceIds);
    if (m.state === "verified" && !canVerify(m.sourceIds)) err(w, "verified needs a source that is not a concept image or board and has a known permission");
  }

  // Gate records.
  const optionIds = new Set(p.options.map((o) => o.id));
  const gateIds = FACADE_GATES.map((g) => g.id) as string[];
  for (const [i, r] of p.gateRecords.entries()) {
    const w = `gate record ${i + 1} (${r.gate})`;
    if (!gateIds.includes(r.gate)) err(w, "unknown gate");
    if (!GATE_STATES.includes(r.state)) err(w, `state must be one of ${GATE_STATES.join(", ")}`);
    if (r.optionId !== undefined && !optionIds.has(r.optionId)) err(w, `unknown option ${r.optionId}`);
    refs(w, r.sourceIds);
  }
  const dup = new Set<string>();
  for (const r of p.gateRecords) {
    const k = `${r.gate}:${r.optionId ?? "*"}`;
    if (dup.has(k)) err(`gate record ${r.gate}`, `more than one record for ${r.gate}${r.optionId ? ` on ${r.optionId}` : " (project-wide)"}`);
    dup.add(k);
  }

  // Money lines.
  const checkCost = (where: string, l: FacadeProject["requiredWork"][number]) => {
    unique(where, l.id);
    if (!COST_KINDS.includes(l.kind)) err(where, `kind must be one of ${COST_KINDS.join(", ")}`);
    if (!ESTIMATE_CLASSES.includes(l.estimateClass)) err(where, `estimate class must be one of ${ESTIMATE_CLASSES.join(", ")}`);
    refs(where, l.sourceIds);
  };
  for (const l of p.requiredWork) {
    checkCost(`required work ${l.id}`, l);
    if (l.kind !== "required_repairs") err(`required work ${l.id}`, "project required work lines are required_repairs");
  }
  refs("budget", p.budget.sourceIds);
  refs("finance", p.finance.sourceIds);

  // Options.
  for (const o of p.options) {
    const w = `option ${o.id}`;
    unique(w, o.id);
    for (const [cellId, mod] of Object.entries(o.assignments)) {
      if (!cell.has(cellId)) err(w, `assignment to unknown cell ${cellId}`);
      if (!isModuleId(mod)) err(w, `unknown module ${String(mod)} on ${cellId}`);
    }
    for (const j of o.justifications) {
      const jw = `${w} justification ${j.cellId}`;
      if (!p.masks.some((m) => m.cellId === j.cellId && m.kind === "window")) err(jw, "only a cell with a window mask can carry a window justification");
      if (!j.reason.trim()) err(jw, "a justification needs a written reason");
      refs(jw, j.sourceIds);
      if (!canVerify(j.sourceIds)) err(jw, "a justification needs a source that is not a concept image or board");
    }
    for (const l of o.costLines) {
      checkCost(`${w} cost ${l.id}`, l);
      if (l.kind === "required_repairs") warn(`${w} cost ${l.id}`, "required repairs belong in the project's requiredWork, which every option carries");
    }
    for (const b of o.benefitLines) {
      unique(`${w} benefit ${b.id}`, b.id);
      if (!BENEFIT_KINDS.includes(b.kind)) err(`${w} benefit ${b.id}`, `kind must be one of ${BENEFIT_KINDS.join(", ")} (no rent, cap-rate or value lines)`);
      if (!FACT_STATES.includes(b.state)) err(`${w} benefit ${b.id}`, "unknown evidence state");
      refs(`${w} benefit ${b.id}`, b.sourceIds);
    }
    if (o.scores) {
      for (const [k, v] of Object.entries(o.scores.values)) {
        if (typeof v !== "number" || v < 0 || v > SCORE_MAX) err(`${w} scores`, `${k} must be 0-${SCORE_MAX}`);
      }
      if (!o.scores.scoredBy.trim()) err(`${w} scores`, "scores need the name of who gave them");
    }
    if (o.renderSourceId !== null) {
      const s = source.get(o.renderSourceId);
      if (!s) err(w, `unknown render source ${o.renderSourceId}`);
      else if (!CONCEPT_SOURCE_TYPES.includes(s.type)) warn(w, "a render is conceptual media; it should be typed ai_concept_image or design_board");
    }
  }

  for (const msg of weightProblems(p.weights)) err("weights", msg);

  // Property link.
  if (p.property) {
    if (synthetic) err("property", "a synthetic project cannot link to a real property");
    if (!UUID.test(p.property.property_uuid)) err("property", "property_uuid is not a UUID");
    if (opts.properties) {
      const hit = opts.properties.find((x) => x.property_uuid === p.property?.property_uuid);
      if (!hit) err("property", "no Phase 1 property has this property_uuid");
      else if (hit.lead_id !== p.property.lead_id) err("property", `lead_id does not match the Phase 1 record (${hit.lead_id})`);
    } else {
      warn("property", "link not checked against Phase 1 records in this view");
    }
  }
  return issues;
}
