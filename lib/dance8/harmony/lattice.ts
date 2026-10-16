// lib/dance8/harmony/lattice.ts
//
// Kirtled lattice math (the Tonnetz). Pure and deterministic.
//
// Corners: corner (a, b) holds pitch class 7a + 4b (mod 12). Moving right
// is a perfect fifth, up-right a major third, up-left a minor third.
// Triangles: up (U) triangles are major triads, down (D) triangles minor.
// Sides: two triangles that share a side share exactly two notes, and the
// one note that moves goes by a step. The three side types are the
// neo-Riemannian R, L and P.

import type { PitchClass, SideKind, Triad, TriadQuality } from "../contracts/harmony";

export const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const SIDES: readonly SideKind[] = ["R", "L", "P"];

export const mod12 = (n: number): PitchClass => ((n % 12) + 12) % 12;

export function triad(root: number, quality: TriadQuality): Triad {
  return { root: mod12(root), quality };
}

export function triadName(t: Triad): string {
  return NOTE_NAMES[t.root] + (t.quality === "min" ? "m" : "");
}

export const sameTriad = (x: Triad, y: Triad): boolean => x.root === y.root && x.quality === y.quality;

/** Pitch classes of a triad: root, third, fifth. */
export function triadNotes(t: Triad): PitchClass[] {
  return [t.root, mod12(t.root + (t.quality === "maj" ? 4 : 3)), mod12(t.root + 7)];
}

/** The triad across one side. Each operation undoes itself. */
export function cross(t: Triad, side: SideKind): Triad {
  const maj = t.quality === "maj";
  switch (side) {
    case "P":
      return triad(t.root, maj ? "min" : "maj");
    case "R":
      return maj ? triad(t.root + 9, "min") : triad(t.root + 3, "maj");
    case "L":
      return maj ? triad(t.root + 4, "min") : triad(t.root + 8, "maj");
  }
}

/** Which side separates two triads, or null when they do not share a side. */
export function sideBetween(x: Triad, y: Triad): SideKind | null {
  for (const s of SIDES) if (sameTriad(cross(x, s), y)) return s;
  return null;
}

/** Diatonic (in-key) major and minor triads. A minor key uses its relative major's six. */
export function keyTriads(tonic: PitchClass, quality: TriadQuality): Triad[] {
  const t = quality === "maj" ? tonic : mod12(tonic + 3);
  return [triad(t, "maj"), triad(t + 5, "maj"), triad(t + 7, "maj"), triad(t + 2, "min"), triad(t + 4, "min"), triad(t + 9, "min")];
}

export const inSet = (t: Triad, set: Triad[]): boolean => set.some((k) => sameTriad(k, t));

/**
 * Shortest route across sides from one triad to another. Ties are broken the
 * same way every time: fewest out-of-key triangles on the way (when a key is
 * given), then the side order R, L, P.
 */
export function pathBetween(from: Triad, to: Triad, keySet?: Triad[]): SideKind[] {
  if (sameTriad(from, to)) return [];
  const id = (t: Triad) => t.root * 2 + (t.quality === "min" ? 1 : 0);
  const dist = new Map<number, number>([[id(from), 0]]);
  let frontier: Triad[] = [from];
  while (frontier.length && !dist.has(id(to))) {
    const next: Triad[] = [];
    for (const t of frontier) {
      for (const s of SIDES) {
        const n = cross(t, s);
        if (!dist.has(id(n))) {
          dist.set(id(n), dist.get(id(t))! + 1);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  const total = dist.get(id(to))!;
  // Walk every shortest route (at most a few dozen on 24 triads) and keep the best.
  const found: { best: { sides: SideKind[]; out: number } | null } = { best: null };
  const walk = (t: Triad, sides: SideKind[], out: number) => {
    if (sides.length === total) {
      if (sameTriad(t, to) && (found.best === null || out < found.best.out)) found.best = { sides: [...sides], out };
      return;
    }
    for (const s of SIDES) {
      const n = cross(t, s);
      if (dist.get(id(n)) !== sides.length + 1) continue;
      const isWayPoint = sides.length + 1 < total;
      const penalty = isWayPoint && keySet && !inSet(n, keySet) ? 1 : 0;
      sides.push(s);
      walk(n, sides, out + penalty);
      sides.pop();
    }
  };
  walk(from, [], 0);
  return found.best!.sides;
}

/** Triads visited along a route, starting with `from`. */
export function walkPath(from: Triad, sides: SideKind[]): Triad[] {
  const out = [from];
  for (const s of sides) out.push(cross(out[out.length - 1], s));
  return out;
}

// ---- Geometry (for drawing the floor; the solver itself only needs triads) ----

/** A triangle on the lattice. U points up (major), D points down (minor). */
export interface LatticeTri {
  t: "U" | "D";
  a: number;
  b: number;
}

export const pcAt = (a: number, b: number): PitchClass => mod12(7 * a + 4 * b);

export function corners(tri: LatticeTri): [number, number][] {
  const { a, b } = tri;
  return tri.t === "U" ? [[a, b], [a + 1, b], [a, b + 1]] : [[a + 1, b], [a, b + 1], [a + 1, b + 1]];
}

export function triadAt(tri: LatticeTri): Triad {
  return tri.t === "U" ? triad(pcAt(tri.a, tri.b), "maj") : triad(pcAt(tri.a, tri.b + 1), "min");
}

/** The lattice triangle across one side. */
export function neighborTri(tri: LatticeTri, side: SideKind): LatticeTri {
  const { a, b } = tri;
  if (tri.t === "U") {
    if (side === "R") return { t: "D", a: a - 1, b };
    if (side === "L") return { t: "D", a, b };
    return { t: "D", a, b: b - 1 };
  }
  if (side === "R") return { t: "U", a: a + 1, b };
  if (side === "L") return { t: "U", a, b };
  return { t: "U", a, b: b + 1 };
}
