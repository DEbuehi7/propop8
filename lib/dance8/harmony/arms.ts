// lib/dance8/harmony/arms.ts
//
// The Kirtled instrument's three arms (canon D8-21, a SPEC; CONCEPTUAL under
// TRI-06). The R and P crossings link the 24 triads into three closed cycles
// of eight (the octatonic systems), so each 120-degree arm holds one cycle as
// a strip of eight triangles. Pure and deterministic; nothing here is built
// hardware.

import type { Triad } from "../contracts/harmony";
import { cross, sameTriad, triad, triadName, triadNotes } from "./lattice";

export interface KirtledArm {
  arm: "A" | "B" | "C";
  /** From the hub out; neighbours alternate R then P, and the last is the first's P neighbour. */
  strip: Triad[];
  /** The pitch classes the arm uses, ascending. */
  notes: number[];
}

const ALL: Triad[] = Array.from({ length: 24 }, (_, i) => triad(i >> 1, i & 1 ? "min" : "maj"));

/**
 * The three arms, each walked R, P, R, P ... from its major triad with the
 * lowest root: arm A starts on C, B on Db, C on D.
 */
export function kirtledArms(): KirtledArm[] {
  const seen: Triad[] = [];
  const arms: KirtledArm[] = [];
  for (const start of ALL) {
    if (start.quality !== "maj" || seen.some((s) => sameTriad(s, start))) continue;
    const strip = [start];
    for (let k = 0; k < 7; k++) strip.push(cross(strip[k], k % 2 === 0 ? "R" : "P"));
    seen.push(...strip);
    const notes = [...new Set(strip.flatMap(triadNotes))].sort((a, b) => a - b);
    arms.push({ arm: (["A", "B", "C"] as const)[arms.length], strip, notes });
  }
  return arms;
}

/** Which arm a triad sits on. */
export function armOf(t: Triad, arms: KirtledArm[] = kirtledArms()): KirtledArm["arm"] {
  const a = arms.find((x) => x.strip.some((s) => sameTriad(s, t)));
  if (!a) throw new Error(`${triadName(t)} is on no arm`);
  return a.arm;
}
