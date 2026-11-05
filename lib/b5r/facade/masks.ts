/**
 * Protected masks and module eligibility (study steps 03-07, section 12.2
 * "Mask Engine" and "Module Selector").
 *
 * A cell is a bay on one floor. Masks mark what inside it must stay clear:
 * resident windows, egress, utilities, historic fabric and maintenance
 * access. canPlace() answers one question deterministically: may this module
 * go on this cell in this option? A refusal always says why, and a refusal
 * on a mask names the gate it would fail, so an option file that ignores the
 * UI is still caught by the gate engine (an obstruction is a FAIL, never a
 * low score: B5R-19).
 */
import { isModuleId, moduleOf } from "./catalogue";
import {
  MASK_KINDS, RESIDENT_ROOMS,
  type FacadeCell, type FacadeGateId, type FacadeMask, type FacadeOption, type FacadeProject, type MaskKind, type ModuleId,
} from "./contracts";

export interface MaskRule {
  allowed: readonly ModuleId[];
  /** Allowed only with a written justification and a source in the option. */
  withJustification: readonly ModuleId[];
  gate: FacadeGateId;
  why: string;
}

export const MASK_RULES: Record<MaskKind, MaskRule> = {
  window: {
    allowed: ["F0"], withJustification: ["F3"], gate: "FG4",
    why: "a window stays clear: no paint, panel, sign or fin over it; only a justified, tested F3 screen",
  },
  egress: {
    allowed: ["F0"], withJustification: [], gate: "FG1",
    why: "exits, fire escapes and rescue openings are never covered or crowded (INF-08, GOV-26)",
  },
  utility: {
    allowed: ["F0", "F5"], withJustification: [], gate: "FG6",
    why: "meters, vents, risers and drains keep their access; only a removable F5 service module",
  },
  maintenance_access: {
    allowed: ["F0", "F5"], withJustification: [], gate: "FG6",
    why: "inspection and maintenance access stays open; only a removable F5 service module",
  },
  historic: {
    allowed: ["F0"], withJustification: [], gate: "FG5",
    why: "historic fabric is kept and repaired; any change needs historic review first",
  },
};

export type ConflictKind = "mask" | "survey" | "catalogue";

export type Placement =
  | { ok: true; notes: string[] }
  | { ok: false; kind: ConflictKind; gate: FacadeGateId | null; reason: string };

export interface Conflict {
  cellId: string;
  moduleId: string;
  kind: ConflictKind;
  gate: FacadeGateId | null;
  reason: string;
}

interface Index {
  cell: Map<string, FacadeCell>;
  masks: Map<string, FacadeMask[]>;
}
const cache = new WeakMap<FacadeProject, Index>();
function index(p: FacadeProject): Index {
  const hit = cache.get(p);
  if (hit) return hit;
  const cell = new Map(p.cells.map((c) => [c.id, c]));
  const masks = new Map<string, FacadeMask[]>();
  for (const m of p.masks) masks.set(m.cellId, [...(masks.get(m.cellId) ?? []), m]);
  const ix = { cell, masks };
  cache.set(p, ix);
  return ix;
}

export function cellById(p: FacadeProject, id: string): FacadeCell | undefined {
  return index(p).cell.get(id);
}

/** Masks on a cell, in MASK_KINDS order, so the first reason given is always the same. */
export function masksOf(p: FacadeProject, cellId: string): FacadeMask[] {
  const ms = index(p).masks.get(cellId) ?? [];
  return [...ms].sort((a, b) => MASK_KINDS.indexOf(a.kind) - MASK_KINDS.indexOf(b.kind) || a.id.localeCompare(b.id));
}

/** The module on a cell. An unknown module id reads as F0 here; checkOption reports it and validation stops the call. */
export function moduleAt(option: FacadeOption, cellId: string): ModuleId {
  const m = option.assignments[cellId];
  return isModuleId(m) ? m : "F0";
}

function justified(option: FacadeOption, cellId: string, kind: MaskKind): boolean {
  return option.justifications.some(
    (j) => j.cellId === cellId && j.maskKind === kind && j.reason.trim().length > 0 && j.sourceIds.length > 0,
  );
}

const label = (k: MaskKind) => k.replace("_", " ");

/** Every protected area on the cell this module would cover, with the gate each would fail. */
export function maskRefusals(p: FacadeProject, cell: FacadeCell, moduleId: ModuleId, option: FacadeOption): { gate: FacadeGateId; reason: string; justifiable: boolean }[] {
  if (moduleId === "F0") return [];
  const out: { gate: FacadeGateId; reason: string; justifiable: boolean }[] = [];
  for (const m of masksOf(p, cell.id)) {
    const rule = MASK_RULES[m.kind];
    if (rule.allowed.includes(moduleId)) continue;
    if (rule.withJustification.includes(moduleId)) {
      if (!justified(option, cell.id, m.kind)) out.push({ gate: rule.gate, reason: `${moduleId} over a ${label(m.kind)} needs a written justification and a source: ${rule.why}`, justifiable: true });
      continue;
    }
    out.push({ gate: rule.gate, reason: `Protected ${label(m.kind)}: ${rule.why}`, justifiable: false });
  }
  return out;
}

/** May this module go on this cell in this option? One reason is returned: a hard block before one a justification could lift. */
export function canPlace(p: FacadeProject, cell: FacadeCell, moduleId: ModuleId, option: FacadeOption): Placement {
  const mod = moduleOf(moduleId);
  if (mod.status === "disabled") {
    return { ok: false, kind: "catalogue", gate: null, reason: `${mod.id} ${mod.name} is disabled in FIS-Flat v0.1. ${mod.procurement}` };
  }
  if (moduleId === "F0") return { ok: true, notes: [] };
  if (cell.geometryState === "UNMEASURED") {
    return { ok: false, kind: "survey", gate: null, reason: "NEEDS SURVEY: this cell has not been measured or observed, so only F0 (retain / repair) until it is" };
  }
  if (mod.status === "pilot" && cell.geometryState !== "SURVEY_VERIFIED") {
    return { ok: false, kind: "survey", gate: null, reason: `${mod.id} ${mod.name} needs survey-verified wind and seismic attachment zones` };
  }
  const blocked = maskRefusals(p, cell, moduleId, option);
  const first = blocked.find((b) => !b.justifiable) ?? blocked[0];
  if (first) return { ok: false, kind: "mask", gate: first.gate, reason: first.reason };
  const ms = masksOf(p, cell.id);
  if (moduleId === "F4" && cell.floor !== 0 && !["lobby", "mail_delivery", "parking"].includes(cell.roomUse)) {
    return { ok: false, kind: "catalogue", gate: null, reason: "F4 wayfinding goes at street level, on entry and service routes" };
  }
  if (moduleId === "F5" && !ms.some((m) => m.kind === "utility" || m.kind === "maintenance_access")) {
    return { ok: false, kind: "catalogue", gate: null, reason: "F5 service access goes only where there is a utility or inspection point to protect" };
  }
  const notes: string[] = [];
  for (const m of ms) {
    if (MASK_RULES[m.kind].withJustification.includes(moduleId)) notes.push(`${mod.id} over a ${label(m.kind)}: justified in this option; ${MASK_RULES[m.kind].gate} must review it`);
  }
  if (cell.roomUse === "sro_room" && mod.placement === "cell") {
    notes.push("SRO room: small losses of daylight, air or view are disproportionately harmful");
  }
  if (mod.status === "pilot") notes.push(`${mod.id} is a later pilot module: an option using it stays at DEFER in v0.1`);
  if (mod.attached && cell.geometryState !== "SURVEY_VERIFIED") {
    notes.push("Attachment needs a survey-verified cell before EXECUTE (FG2)");
  }
  return { ok: true, notes };
}

/**
 * Every assignment in an option that breaks a rule. Options loaded from a
 * file are checked the same way as clicks, and every protected area a module
 * would cover is reported, not only the first.
 */
export function checkOption(p: FacadeProject, option: FacadeOption): Conflict[] {
  const out: Conflict[] = [];
  for (const [cellId, moduleId] of Object.entries(option.assignments).sort(([a], [b]) => a.localeCompare(b))) {
    const cell = cellById(p, cellId);
    if (!cell) {
      out.push({ cellId, moduleId, kind: "catalogue", gate: null, reason: "no such cell in this project" });
      continue;
    }
    if (!isModuleId(moduleId)) {
      out.push({ cellId, moduleId: String(moduleId), kind: "catalogue", gate: null, reason: "not a module in the FIS-Flat catalogue" });
      continue;
    }
    for (const r of maskRefusals(p, cell, moduleId, option)) out.push({ cellId, moduleId, kind: "mask", gate: r.gate, reason: r.reason });
    const r = canPlace(p, cell, moduleId, option);
    if (!r.ok && r.kind !== "mask") out.push({ cellId, moduleId, kind: r.kind, gate: r.gate, reason: r.reason });
  }
  return out;
}

/** Resident windows in the project, and how many of them an option leaves fully clear (F0). */
export function windowClearance(p: FacadeProject, option: FacadeOption): { residentWindows: number; clear: number; screened: string[] } {
  const cells = p.cells.filter((c) => RESIDENT_ROOMS.includes(c.roomUse) && masksOf(p, c.id).some((m) => m.kind === "window"));
  const screened = cells.filter((c) => moduleAt(option, c.id) !== "F0").map((c) => c.id);
  return { residentWindows: cells.length, clear: cells.length - screened.length, screened };
}
