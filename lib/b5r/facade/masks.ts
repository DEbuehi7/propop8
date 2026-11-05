/**
 * Protected masks and module eligibility (study steps 03-07, section 12.2
 * "Mask Engine" and "Module Selector").
 *
 * A cell is a bay on one floor. Masks mark what inside it must stay clear:
 * windows, egress, utilities, historic fabric and maintenance access.
 * canPlace() answers one question deterministically: may this module go on
 * this cell in this option? A refusal always says why, and a refusal on a
 * mask names the gate it would fail, so an option file that ignores the UI
 * is still caught by the gate engine (an obstruction is a FAIL, never a low
 * score: B5R-19).
 *
 * v0.2 (owner, 2026-11-04: "loosen"). A module either covers a cell or sits
 * beside what is protected in it:
 *   - screens, fins and advanced modules (placement "cell": F3, F6, F7) sit in
 *     front of the whole cell, so they cover every mask in it;
 *   - finishes, panels, signs and service doors (placement "wall" or
 *     "local": F1, F2, F4, F5) sit on the opaque wall and never cover a mask.
 *     They may go beside one when the BESIDE table allows it and enough
 *     opaque wall is left, and the gate for that mask must then review them.
 * Nothing ever covers egress or historic fabric. Only a justified F3 covers
 * a resident or stair window; other common-area windows may take F3 without
 * one. Utilities and maintenance access are covered only by F5.
 */
import { isModuleId, moduleOf } from "./catalogue";
import {
  MASK_KINDS, RESIDENT_ROOMS,
  type FacadeCell, type FacadeGateId, type FacadeMask, type FacadeOption, type FacadeProject, type MaskKind, type ModuleId, type RoomUse,
} from "./contracts";

export interface MaskRule {
  /** Modules that may sit in front of this protected area. */
  cover: readonly ModuleId[];
  /** May cover it only with a written justification and a source (rooms in JUSTIFY_ROOMS). */
  coverWithJustification: readonly ModuleId[];
  /** Wall and local modules that may sit on the opaque wall beside it, leaving it clear. */
  beside: readonly ModuleId[];
  /** The gate that fails if the area is obstructed, and that must review a module beside it. */
  gate: FacadeGateId;
  /** More gates a module beside it must pass (a panel around a window meets its flashing). */
  alsoReviews?: Partial<Record<ModuleId, FacadeGateId[]>>;
  why: string;
  besideWhy: string;
}

export const MASK_RULES: Record<MaskKind, MaskRule> = {
  window: {
    cover: ["F0"], coverWithJustification: ["F3"], beside: ["F1", "F2", "F4", "F5"], gate: "FG4", alsoReviews: { F2: ["FG3"] },
    why: "a window stays clear: nothing sits in front of it except a justified, tested F3 screen",
    besideWhy: "finishes, panels and signs may frame a window but never cross it",
  },
  egress: {
    cover: ["F0"], coverWithJustification: [], beside: ["F1", "F4"], gate: "FG1",
    why: "exits, fire escapes and rescue openings are never covered (INF-08, GOV-26)",
    besideWhy: "only paint or an address sign beside an exit; panels and service doors keep off exit surrounds and fire-escape anchors",
  },
  utility: {
    cover: ["F0", "F5"], coverWithJustification: [], beside: ["F1", "F2", "F4"], gate: "FG6",
    why: "meters, vents, risers and drains keep their access; only a removable F5 service module covers them",
    besideWhy: "a utility stays uncovered and reachable",
  },
  maintenance_access: {
    cover: ["F0", "F5"], coverWithJustification: [], beside: ["F1", "F2", "F4"], gate: "FG6",
    why: "inspection and maintenance access stays open; only a removable F5 service module covers it",
    besideWhy: "the access point stays uncovered and reachable",
  },
  historic: {
    cover: ["F0"], coverWithJustification: [], beside: ["F1", "F4"], gate: "FG5",
    why: "historic fabric is kept and repaired; nothing covers it",
    besideWhy: "only paint or a sign beside historic fabric, after historic review; panels change how it reads",
  },
};

/** Rooms whose window needs a justification before an F3 screen covers it. */
export const JUSTIFY_ROOMS: readonly RoomUse[] = [...RESIDENT_ROOMS, "stair"];

/** A wall or local module needs at least this share of the cell to be opaque wall once the masks are kept clear. */
export const MIN_CLEAR_WALL = 0.3;

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
/** Plain names for a protected area, with and without an article. */
export const MASK_NOUN: Record<MaskKind, string> = { window: "window", egress: "exit", utility: "utility", historic: "historic fabric", maintenance_access: "access point" };
const A_MASK: Record<MaskKind, string> = { window: "a window", egress: "an exit", utility: "a utility", historic: "historic fabric", maintenance_access: "an access point" };

/** Share of the cell left as opaque wall once every mask is kept clear (exact union of the mask rectangles). */
export function clearWallFraction(p: FacadeProject, cellId: string): number {
  const rs = masksOf(p, cellId).map((m) => m.rect);
  if (rs.length === 0) return 1;
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let covered = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]];
    const spans = rs.filter((r) => r.x <= x0 && r.x + r.w >= x1).map((r) => [r.y, r.y + r.h]).sort((a, b) => a[0] - b[0]);
    let len = 0;
    let end = -Infinity;
    for (const [a, b] of spans) {
      if (b <= end) continue;
      len += b - Math.max(a, end);
      end = b;
    }
    covered += (x1 - x0) * len;
  }
  return Math.max(0, Math.round((1 - covered) * 1e6) / 1e6);
}

const covers = (moduleId: ModuleId) => moduleOf(moduleId).placement === "cell";

export interface MaskRefusal {
  gate: FacadeGateId;
  reason: string;
  /** True when a written justification would lift it. */
  justifiable: boolean;
}

/** Every protected area on the cell this module would cover or crowd, with the gate each would fail. */
export function maskRefusals(p: FacadeProject, cell: FacadeCell, moduleId: ModuleId, option: FacadeOption): MaskRefusal[] {
  if (moduleId === "F0") return [];
  const out: MaskRefusal[] = [];
  for (const m of masksOf(p, cell.id)) {
    const rule = MASK_RULES[m.kind];
    if (!covers(moduleId)) {
      if (rule.cover.includes(moduleId) || rule.beside.includes(moduleId)) continue;
      out.push({ gate: rule.gate, reason: `${moduleId} beside ${A_MASK[m.kind]}: ${rule.besideWhy}`, justifiable: false });
      continue;
    }
    if (rule.cover.includes(moduleId)) continue;
    if (rule.coverWithJustification.includes(moduleId)) {
      if (!JUSTIFY_ROOMS.includes(cell.roomUse)) continue; // a common-area window may take F3 without one
      if (!justified(option, cell.id, m.kind)) out.push({ gate: rule.gate, reason: `${moduleId} over a ${cell.roomUse.replace("_", " ")} window needs a written justification and a source: ${rule.why}`, justifiable: true });
      continue;
    }
    out.push({ gate: rule.gate, reason: `Protected ${label(m.kind)}: ${rule.why}`, justifiable: false });
  }
  return out;
}

/** Gates that must review a wall or local module placed beside a mask (so none of them can be "not applicable"). */
export function besideGates(p: FacadeProject, cell: FacadeCell, moduleId: ModuleId): { kind: MaskKind; gates: FacadeGateId[] }[] {
  if (moduleId === "F0" || covers(moduleId)) return [];
  return masksOf(p, cell.id)
    .filter((m) => MASK_RULES[m.kind].beside.includes(moduleId))
    .map((m) => ({ kind: m.kind, gates: [MASK_RULES[m.kind].gate, ...(MASK_RULES[m.kind].alsoReviews?.[moduleId] ?? [])] }));
}

/** May this module go on this cell in this option? One reason is returned: a hard block before one a justification could lift. */
export function canPlace(p: FacadeProject, cell: FacadeCell, moduleId: ModuleId, option: FacadeOption): Placement {
  const mod = moduleOf(moduleId);
  if (mod.status === "disabled") {
    return { ok: false, kind: "catalogue", gate: null, reason: `${mod.id} ${mod.name} is disabled in FIS-Flat. ${mod.procurement}` };
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
  const beside = besideGates(p, cell, moduleId);
  if (!covers(moduleId) && moduleId !== "F5" && ms.length > 0) {
    const wall = clearWallFraction(p, cell.id);
    if (wall < MIN_CLEAR_WALL) {
      return { ok: false, kind: "catalogue", gate: null, reason: `Too little opaque wall: ${Math.round(wall * 100)}% is left once the protected areas stay clear (at least ${MIN_CLEAR_WALL * 100}% needed)` };
    }
  }
  const notes: string[] = [];
  for (const b of beside) notes.push(`${mod.id} sits beside the ${MASK_NOUN[b.kind]}, which stays clear; ${b.gates.join(" and ")} must review it`);
  for (const m of ms) {
    if (covers(moduleId) && MASK_RULES[m.kind].coverWithJustification.includes(moduleId)) {
      notes.push(JUSTIFY_ROOMS.includes(cell.roomUse)
        ? `${mod.id} over the window: justified in this option; ${MASK_RULES[m.kind].gate} must review it`
        : `${mod.id} over a common-area window; ${MASK_RULES[m.kind].gate} must review it`);
    }
  }
  if (cell.roomUse === "sro_room" && covers(moduleId)) {
    notes.push("SRO room: small losses of daylight, air or view are disproportionately harmful");
  }
  if (mod.status === "pilot") notes.push(`${mod.id} is a later pilot module: an option using it stays at DEFER`);
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

/** Resident windows in the project, and how many of them an option leaves uncovered (nothing in front of the glass). */
export function windowClearance(p: FacadeProject, option: FacadeOption): { residentWindows: number; clear: number; screened: string[] } {
  const cells = p.cells.filter((c) => RESIDENT_ROOMS.includes(c.roomUse) && masksOf(p, c.id).some((m) => m.kind === "window"));
  const screened = cells.filter((c) => covers(moduleAt(option, c.id))).map((c) => c.id);
  return { residentWindows: cells.length, clear: cells.length - screened.length, screened };
}
