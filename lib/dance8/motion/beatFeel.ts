// lib/dance8/motion/beatFeel.ts
//
// Beat feel: where the song departs, slightly, from its own rhythm. For every
// counted beat it reads the song's saved onset pattern (Stuttr's analysis
// fingerprint; Dance8 never reads the masters, D8-14) and compares the beat
// with the song's own habit at that place in the bar, the same way the audit
// compares a property with its own months rather than an industry average:
//
//   steady      the beat lands where the song usually puts it
//   push, drag  the hit comes early or late against the grid (30 ms or more)
//   syncopated  the "and" after the beat is much louder than usual while the
//               beat itself is softer: the accent has moved off the beat
//   dropped     the beat is all but silent (a stop, a break)
//   unknown     no onset pattern to read, or the beat is outside it
//
// Measurements only (GOV-14): the choice of what a dancer does with them is
// ./landing.ts. Unknown is never guessed (EDO-4). Pure and deterministic.

import { ONSET_LATENCY_SEC, readSyncFingerprint, type SyncFingerprint } from "../../stuttr/analysis";

export type FeelKind = "steady" | "push" | "drag" | "syncopated" | "dropped" | "unknown";

/** Search radius for a beat's own hit, in beats. Wider would catch a sixteenth-note pickup. */
export const FEEL_WINDOW_BEATS = 0.2;
/** Search radius for the "and" (half a beat after), in beats. */
export const AND_WINDOW_BEATS = 0.125;
/** A hit this far from where the song usually lands is pushed or dragged. */
export const SHIFT_MIN_SEC = 0.03;
/** A beat below this share of the song's usual strength at that place in the bar is dropped. */
export const DROPPED_BELOW = 0.3;
/** Syncopated: the "and" at least this many times its usual strength... */
export const AND_LOUDER = 1.5;
/** ...while the beat itself is at most this share of its usual strength. */
export const BEAT_SOFTER = 0.85;

export interface FeelBeat {
  /** Beat index from bar 0 (the plan's beat). */
  beat: number;
  gridSec: number;
  beatSec: number;
  /** Place in the bar (beat index modulo beats per bar). */
  pos: number;
}

export interface BeatFeel {
  beat: number;
  gridSec: number;
  kind: FeelKind;
  /** How far the beat's hit is from where this song usually lands, in ms (negative = early). Null when there is no hit to time. */
  shiftMs: number | null;
  /** Song time of the beat's own hit, when there is one. */
  hitSec: number | null;
  /** The beat's strength against the song's usual strength at that place in the bar (1 = usual). */
  onRatio: number | null;
  /** The "and"'s strength against its usual strength (1 = usual). */
  andRatio: number | null;
  /** Song time of the "and" hit, when it is strong enough to land on. */
  andSec: number | null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r2 = (x: number) => Math.round(x * 100) / 100;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The strongest onset between two song times, timed to a fraction of a frame. Null when the range is outside the pattern. */
function peak(values: ArrayLike<number>, frameSec: number, fromSec: number, toSec: number): { value: number; sec: number } | null {
  const a = Math.ceil((fromSec - ONSET_LATENCY_SEC) / frameSec);
  const b = Math.floor((toSec - ONSET_LATENCY_SEC) / frameSec);
  if (a < 0 || b >= values.length || b < a) return null;
  let arg = a;
  for (let f = a + 1; f <= b; f++) if (values[f] > values[arg]) arg = f;
  // Parabolic interpolation through the peak and its neighbours.
  let d = 0;
  if (arg > 0 && arg < values.length - 1) {
    const l = values[arg - 1], c = values[arg], r = values[arg + 1];
    const den = l - 2 * c + r;
    if (den < 0) d = Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den));
  }
  return { value: values[arg], sec: (arg + d) * frameSec + ONSET_LATENCY_SEC };
}

const unknown = (b: FeelBeat): BeatFeel => ({
  beat: b.beat, gridSec: b.gridSec, kind: "unknown", shiftMs: null, hitSec: null, onRatio: null, andRatio: null, andSec: null,
});

/**
 * The feel of each beat, from onset strengths (one value per frame, frame f at
 * f * frameSec) or nothing. The song's habits come from the same beats: the
 * median strength of the beat and of its "and" at each place in the bar, and
 * the median timing of every hit (so a grid that sits a little early or late
 * all song long is not an anomaly).
 */
export function measureFeel(onsets: { values: ArrayLike<number>; frameSec: number } | null, beats: readonly FeelBeat[]): BeatFeel[] {
  if (!onsets || !beats.length) return beats.map(unknown);
  const { values, frameSec } = onsets;
  const raw = beats.map((b) => ({
    b,
    on: peak(values, frameSec, b.gridSec - FEEL_WINDOW_BEATS * b.beatSec, b.gridSec + FEEL_WINDOW_BEATS * b.beatSec),
    and: peak(values, frameSec, b.gridSec + (0.5 - AND_WINDOW_BEATS) * b.beatSec, b.gridSec + (0.5 + AND_WINDOW_BEATS) * b.beatSec),
  }));
  const usualOn = new Map<number, number>();
  const usualAnd = new Map<number, number>();
  for (const pos of new Set(beats.map((b) => b.pos))) {
    const at = raw.filter((x) => x.b.pos === pos);
    usualOn.set(pos, median(at.flatMap((x) => (x.on ? [x.on.value] : []))));
    usualAnd.set(pos, median(at.flatMap((x) => (x.and ? [x.and.value] : []))));
  }
  // The song's usual timing: the median offset of beats that have a real hit.
  const offsets = raw.flatMap((x) => {
    const u = usualOn.get(x.b.pos) ?? 0;
    return x.on && u > 0 && x.on.value >= DROPPED_BELOW * u ? [x.on.sec - x.b.gridSec] : [];
  });
  const usualOffset = median(offsets);

  return raw.map(({ b, on, and }) => {
    if (!on || !and) return unknown(b);
    const u = usualOn.get(b.pos) ?? 0;
    const ua = usualAnd.get(b.pos) ?? 0;
    if (u <= 0) {
      // This place in the bar is usually silent: nothing to depart from.
      return { beat: b.beat, gridSec: b.gridSec, kind: "steady", shiftMs: null, hitSec: null, onRatio: null, andRatio: null, andSec: null };
    }
    const onRatio = on.value / u;
    const andRatio = ua > 0 ? and.value / ua : null;
    const strongAnd = andRatio !== null && andRatio >= AND_LOUDER;
    const andSec = strongAnd ? r3(and.sec) : null;
    if (onRatio < DROPPED_BELOW) {
      return { beat: b.beat, gridSec: b.gridSec, kind: "dropped", shiftMs: null, hitSec: null, onRatio: r2(onRatio), andRatio: andRatio === null ? null : r2(andRatio), andSec };
    }
    const shift = on.sec - b.gridSec - usualOffset;
    const shiftMs = Math.round(shift * 1000);
    const kind: FeelKind = strongAnd && onRatio <= BEAT_SOFTER ? "syncopated"
      : Math.abs(shift) >= SHIFT_MIN_SEC ? (shift < 0 ? "push" : "drag") : "steady";
    return {
      beat: b.beat, gridSec: b.gridSec, kind, shiftMs, hitSec: r3(on.sec), onRatio: r2(onRatio),
      andRatio: andRatio === null ? null : r2(andRatio), andSec: kind === "syncopated" ? andSec : null,
    };
  });
}

/** measureFeel from a saved analysis fingerprint (absent in analyses made before 19 Oct 2026). */
export function feelFromFingerprint(fp: SyncFingerprint | undefined, beats: readonly FeelBeat[]): BeatFeel[] {
  return measureFeel(fp ? { values: readSyncFingerprint(fp), frameSec: fp.frameSec } : null, beats);
}
