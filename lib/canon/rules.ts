// lib/canon/rules.ts
//
// Small deterministic checks the studies asked to be executable rather than
// remembered: the triadic seed test (three members, one origin, 120 degrees
// apart), the EDO genome record check, and the musical sync grid. No I/O.

import { EDO_FAMILIES, EDO_GENOME_STATUSES, SEMANTIC_STATES, TRIADIC_SEED } from "./vocab";

// ---------------------------------------------------------------------------
// Triadic seed: theta(i) = theta0 + 120 * i, i = 0, 1, 2.
// ---------------------------------------------------------------------------

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Plan angles of the three primary members for a starting angle. */
export function triadicAngles(theta0Deg: number): [number, number, number] {
  return [0, 1, 2].map((i) => norm360(theta0Deg + TRIADIC_SEED.planSpacingDeg * i)) as [number, number, number];
}

export interface TriadicUnit {
  /** Plan angle of each primary member, degrees. */
  memberAnglesDeg: number[];
  /** Number of distinct junctions the primary members meet at. Canon: exactly one. */
  originCount: number;
}

export type TriadicIssue = "member_count" | "origin" | "spacing";

/**
 * The G0 source-lock test: exactly three primary members, one shared origin,
 * and neighbours 120 degrees apart in plan (within `toleranceDeg`). Passing it
 * says the geometry is the canonical seed; it says nothing about structure.
 */
export function checkTriadicUnit(unit: TriadicUnit, toleranceDeg = 0.5): TriadicIssue[] {
  const issues: TriadicIssue[] = [];
  if (unit.memberAnglesDeg.length !== TRIADIC_SEED.members) issues.push("member_count");
  if (unit.originCount !== 1) issues.push("origin");
  if (unit.memberAnglesDeg.length === TRIADIC_SEED.members) {
    const a = unit.memberAnglesDeg.map(norm360).sort((x, y) => x - y);
    const gaps = [a[1] - a[0], a[2] - a[1], 360 - a[2] + a[0]];
    if (gaps.some((g) => Math.abs(g - TRIADIC_SEED.planSpacingDeg) > toleranceDeg)) issues.push("spacing");
  }
  return issues;
}

// ---------------------------------------------------------------------------
// EDO genome record. "Every approved output is traceable to a family, genome
// parameters, seed and version."
// ---------------------------------------------------------------------------

export interface EdoGenomeRecord {
  id: string;
  family: string;
  topology: { organization: string; cellCount: number; branchFactor: number; recursionDepth: number };
  geometry: { base: string; secondary?: string; tertiary?: string; symmetry: number; irregularity: number };
  connectivity: { type: string; density: number; loops: boolean };
  material: Record<string, string>;
  signal: { color: string; intensity: number };
  function: Record<string, boolean>;
  seed: number;
  status: string;
}

/** IDs look like AIM-EDO-GM-014: a two-letter family code and a three-digit serial. */
export const EDO_GENOME_ID = /^AIM-EDO-[A-Z]{2}-\d{3}$/;

const in01 = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;

/** Returns the problems with a record; an empty list means it is well-formed. */
export function checkGenomeRecord(r: EdoGenomeRecord): string[] {
  const out: string[] = [];
  if (!EDO_GENOME_ID.test(r.id)) out.push("id must look like AIM-EDO-XX-000");
  if (!EDO_FAMILIES.some((f) => f.id === r.family)) out.push(`unknown family ${r.family}`);
  if (!Number.isInteger(r.seed) || r.seed < 0) out.push("seed must be a non-negative integer");
  if (!(EDO_GENOME_STATUSES as readonly string[]).includes(r.status)) out.push(`unknown status ${r.status}`);
  if (!Number.isInteger(r.topology.cellCount) || r.topology.cellCount < 1) out.push("cellCount must be a positive integer");
  if (!Number.isInteger(r.topology.recursionDepth) || r.topology.recursionDepth < 0) out.push("recursionDepth must be a non-negative integer");
  if (!(r.topology.branchFactor > 0)) out.push("branchFactor must be positive");
  for (const [k, v] of [["symmetry", r.geometry.symmetry], ["irregularity", r.geometry.irregularity], ["connectivity.density", r.connectivity.density], ["signal.intensity", r.signal.intensity]] as const) {
    if (!in01(v)) out.push(`${k} must be between 0 and 1`);
  }
  if (!SEMANTIC_STATES.some((s) => s.color === r.signal.color)) out.push(`signal colour ${r.signal.color} is not a semantic state colour`);
  return out;
}

/** The example record from the EDO surface study (p.11), kept as the reference shape. */
export const GUILD_NAVIGATION_EXAMPLE: EdoGenomeRecord = {
  id: "AIM-EDO-GM-014",
  family: "EDO_GUILD_MESH",
  topology: { organization: "decentralized", cellCount: 18, branchFactor: 3.2, recursionDepth: 4 },
  geometry: { base: "voronoi", secondary: "braided", tertiary: "branching", symmetry: 0.12, irregularity: 0.68 },
  connectivity: { type: "interdependent_mesh", density: 0.57, loops: true },
  material: { base: "charcoal", structure: "bronze", secondary: "terracotta" },
  signal: { color: "cyan", intensity: 0.16 },
  function: { humanWayfinding: true, robotNavigation: true, digitalTwinAnchor: true },
  seed: 48172,
  status: "prototype",
};

// ---------------------------------------------------------------------------
// Musical sync grid.
// ---------------------------------------------------------------------------

/** Video frames per beat. 120 BPM at 24 fps = 12. */
export function framesPerBeat(bpm: number, fps: number): number {
  if (!(bpm > 0) || !(fps > 0)) throw new Error("bpm and fps must be positive");
  return (60 / bpm) * fps;
}

/** Video frames per bar. 4/4 at 120 BPM and 24 fps = 48. */
export function framesPerBar(bpm: number, fps: number, beatsPerBar: number): number {
  return framesPerBeat(bpm, fps) * beatsPerBar;
}
