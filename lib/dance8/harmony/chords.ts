// lib/dance8/harmony/chords.ts
//
// Reads a chord symbol and says how honestly Kirtled can draw it.
// Pure, deterministic, never throws.
//
//   verified     exact: one triangle (C, Am), or two that share a side
//                (Cmaj7 = C + Em, Am7 = Am + C, C6 = C + Am).
//   approximate  drawn as its plain triad (G7 -> G, Csus4 -> C). A person
//                must approve it before it moves the dancers.
//   unresolved   no honest triangle (dim, aug, no chord). Dancers hold.
//
// Symbols nobody can read are unresolved and flagged `readable: false`.

import type { HarmonyStatus, PitchClass, Triad } from "../contracts/harmony";
import { triad, triadName, triadNotes } from "./lattice";

export interface ChordReading {
  symbol: string;
  readable: boolean;
  status: HarmonyStatus;
  /** Triangle the dancers stand on. */
  anchor: Triad | null;
  /** Triangles lit at full brightness. */
  lit: Triad[];
  /** Plain-language explanation, for review screens. */
  note: string;
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NO_CHORD = /^(n\.?\s*c\.?|no\s*chord|none|\?|-|x)$/i;

function readNote(s: string): { pc: PitchClass; rest: string } | null {
  const m = /^([A-G])((?:#|b|♯|♭)*)(.*)$/.exec(s);
  if (!m) return null;
  let pc = LETTER[m[1]];
  for (const ch of m[2]) pc += ch === "#" || ch === "♯" ? 1 : -1;
  return { pc: ((pc % 12) + 12) % 12, rest: m[3] };
}

type Shape =
  | { kind: "exact"; lit: (r: number) => Triad[] }
  | { kind: "approx"; base: "maj" | "min"; why: string }
  | { kind: "none"; why: string };

const SHAPES: [string[], Shape][] = [
  [["", "maj", "M", "major"], { kind: "exact", lit: (r) => [triad(r, "maj")] }],
  [["m", "min", "-", "mi", "minor"], { kind: "exact", lit: (r) => [triad(r, "min")] }],
  [["maj7", "M7", "Δ", "Δ7", "ma7", "j7"], { kind: "exact", lit: (r) => [triad(r, "maj"), triad(r + 4, "min")] }],
  [["m7", "min7", "-7", "mi7"], { kind: "exact", lit: (r) => [triad(r, "min"), triad(r + 3, "maj")] }],
  [["6", "maj6", "M6"], { kind: "exact", lit: (r) => [triad(r, "maj"), triad(r + 9, "min")] }],
  [["7", "9", "11", "13", "7b9", "7#9", "7#11", "7b13", "9sus4", "13sus4"],
    { kind: "approx", base: "maj", why: "a dominant chord has no single triangle; drawn as its major triad" }],
  [["sus", "sus4", "sus2", "7sus4", "7sus", "7sus2"],
    { kind: "approx", base: "maj", why: "a suspended chord has no third; drawn as the major triad" }],
  [["5"], { kind: "approx", base: "maj", why: "a power chord has no third; drawn as the major triad" }],
  [["add9", "add2", "add11", "maj9", "M9", "maj11", "maj13", "M13", "69", "6/9", "maj7#11"],
    { kind: "approx", base: "maj", why: "extra notes beyond the triangle; drawn as the major triad" }],
  [["m9", "m11", "m13", "madd9", "madd2", "madd11", "m6", "mmaj7", "mM7", "m(maj7)", "min9", "-9"],
    { kind: "approx", base: "min", why: "extra notes beyond the triangle; drawn as the minor triad" }],
  [["dim", "°", "o", "dim7", "°7", "o7", "m7b5", "ø", "ø7", "-7b5", "min7b5"],
    { kind: "none", why: "a diminished chord has no perfect fifth, so it is not a triangle" }],
  [["aug", "+", "+5", "#5", "aug7", "+7", "7#5", "7+"],
    { kind: "none", why: "an augmented chord has no perfect fifth, so it is not a triangle" }],
];

function lookup(suffix: string): Shape | null {
  const s = suffix.replace(/[()\s]/g, "");
  for (const [names, shape] of SHAPES) if (names.includes(s)) return shape;
  return null;
}

export function readChord(symbol: string): ChordReading {
  const raw = typeof symbol === "string" ? symbol.trim() : "";
  const unreadable = (why: string): ChordReading => ({
    symbol: raw, readable: false, status: "unresolved", anchor: null, lit: [], note: why,
  });
  if (raw.length === 0) return unreadable("empty chord symbol");
  if (NO_CHORD.test(raw)) {
    return { symbol: raw, readable: true, status: "unresolved", anchor: null, lit: [], note: "no chord here; dancers hold" };
  }

  // Optional slash bass at the end: "C/E", "Am7/G".
  let body = raw;
  let bass: PitchClass | null = null;
  const slash = /^(.+)\/([A-G](?:#|b|♯|♭)*)$/.exec(raw);
  if (slash) {
    const b = readNote(slash[2]);
    if (b && b.rest === "") {
      body = slash[1];
      bass = b.pc;
    }
  }

  const root = readNote(body);
  if (!root) return unreadable(`cannot read a root note in "${raw}"`);
  const shape = lookup(root.rest);
  if (!shape) return unreadable(`unknown chord quality "${root.rest}" in "${raw}"`);

  if (shape.kind === "none") {
    return { symbol: raw, readable: true, status: "unresolved", anchor: null, lit: [], note: shape.why };
  }

  const lit = shape.kind === "exact" ? shape.lit(root.pc) : [triad(root.pc, shape.base)];
  let status: HarmonyStatus = shape.kind === "exact" ? "verified" : "approximate";
  let note =
    shape.kind === "exact"
      ? lit.length === 1
        ? `${raw} is the ${triadName(lit[0])} triangle`
        : `${raw} is ${triadName(lit[0])} and ${triadName(lit[1])} sharing a side`
      : `${shape.why} (${triadName(lit[0])})`;

  if (bass !== null) {
    const tones = new Set(lit.flatMap(triadNotes));
    if (!tones.has(bass) && status === "verified") {
      status = "approximate";
      note = `bass note is outside the chord; drawn as ${lit.map(triadName).join(" + ")}`;
    }
  }
  return { symbol: raw, readable: true, status, anchor: lit[0], lit, note };
}
