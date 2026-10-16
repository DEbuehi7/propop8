// lib/dance8/harmony/pathSolver.ts
//
// Song-to-Kirtled path solver. Turns an approved song's chord changes into
// dancer moves across the Kirtled floor. Pure, deterministic, never throws.
//
// Rules:
//  - The song leads. Each move lands exactly on the beat its chord starts.
//  - Neighbors (one shared side) take one crossing. Farther chords take the
//    shortest route; the triangles on the way are pass-throughs that glow dimly.
//  - Speed limit: one crossing per slot, where a slot is the shortest of
//    half a beat, one beat or two beats that lasts at least MIN_CROSSING_SEC.
//    Earlier crossings start before the chord so the last one lands on it,
//    never before the previous chord has started. If they don't fit, the
//    dancers leap instead (crash flash), and the leap is labeled as such.
//  - A key change comes only from the timeline's key segments (word TI).
//  - Unresolved chords and unapproved approximations hold the last stance.
//  - Nothing here makes sound: every move and leap carries sounding: false.

import type { TempoSegment } from "../contracts/scene";
import type {
  DrumCue, HarmonyTimeline, KeySegment, KirtledLeap, KirtledMove, KirtledPlan, KirtledStance,
  MoveWord, SideKind, Triad,
} from "../contracts/harmony";
import { keyTriads, pathBetween, sameTriad, triadNotes, walkPath } from "./lattice";
import { readChord } from "./chords";

/** Shortest time a dancer needs to cross one side, in seconds. */
export const MIN_CROSSING_SEC = 0.4;
const SLOT_CHOICES = [0.5, 1, 2];
const EPS = 1e-9;

export type HarmonyIssueCode =
  | "schema_version"
  | "tempo_invalid"
  | "duplicate_id"
  | "position_invalid"
  | "event_order"
  | "key_invalid"
  | "chord_unreadable"
  | "approximation_unapproved"
  | "not_approved"
  | "approval_incomplete";

export interface HarmonyIssue {
  code: HarmonyIssueCode;
  path: string;
  message: string;
}

export interface KirtledPlanResult {
  ok: boolean;
  issues: HarmonyIssue[];
  /** Null when the timeline or tempo is structurally broken. */
  plan: KirtledPlan | null;
}

// ---------------- beat-grid clock (shares the cue map's tempo segments) ----------------

function tempoProblems(tempo: TempoSegment[]): string[] {
  const out: string[] = [];
  if (!Array.isArray(tempo) || tempo.length === 0) return ["at least one tempo segment is required"];
  tempo.forEach((s, i) => {
    if (!(Number.isInteger(s.startBar) && s.startBar >= 0)) out.push(`tempo[${i}].startBar must be a whole bar >= 0`);
    if (!(typeof s.bpm === "number" && Number.isFinite(s.bpm) && s.bpm > 0)) out.push(`tempo[${i}].bpm must be > 0`);
    if (!(Number.isInteger(s.beatsPerBar) && s.beatsPerBar > 0)) out.push(`tempo[${i}].beatsPerBar must be a whole number > 0`);
    if (i === 0 && s.startBar !== 0) out.push("tempo[0] must start at bar 0");
    if (i > 0 && !(s.startBar > tempo[i - 1].startBar)) out.push(`tempo[${i}] must start after tempo[${i - 1}]`);
  });
  return out;
}

/** Absolute beat (from bar 0, beat 0) where each tempo segment starts. */
function segmentBeatStarts(tempo: TempoSegment[]): number[] {
  const starts = [0];
  for (let i = 1; i < tempo.length; i++) {
    starts.push(starts[i - 1] + (tempo[i].startBar - tempo[i - 1].startBar) * tempo[i - 1].beatsPerBar);
  }
  return starts;
}

function segmentForBar(tempo: TempoSegment[], bar: number): number {
  let k = 0;
  for (let i = 0; i < tempo.length; i++) if (tempo[i].startBar <= bar) k = i;
  return k;
}

export function beatsInBar(tempo: TempoSegment[], bar: number): number {
  return tempo[segmentForBar(tempo, bar)].beatsPerBar;
}

/** Absolute beat index of (bar, beat). */
export function absBeat(tempo: TempoSegment[], bar: number, beat: number): number {
  const k = segmentForBar(tempo, bar);
  return segmentBeatStarts(tempo)[k] + (bar - tempo[k].startBar) * tempo[k].beatsPerBar + beat;
}

function segmentForBeat(tempo: TempoSegment[], beats: number): number {
  const starts = segmentBeatStarts(tempo);
  let k = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= beats + EPS) k = i;
  return k;
}

/** (bar, beat) for an absolute beat index. */
export function posAt(tempo: TempoSegment[], beats: number): { bar: number; beat: number } {
  const k = segmentForBeat(tempo, beats);
  const into = beats - segmentBeatStarts(tempo)[k];
  const bpb = tempo[k].beatsPerBar;
  const barsInto = Math.floor(into / bpb + EPS);
  const beat = Math.round((into - barsInto * bpb) * 1e6) / 1e6;
  return { bar: tempo[k].startBar + barsInto, beat };
}

/** Seconds from bar 0 to an absolute beat index (rounded to the microsecond, like barToSec). */
export function secAtBeat(tempo: TempoSegment[], beats: number): number {
  const starts = segmentBeatStarts(tempo);
  let sec = 0;
  for (let i = 0; i < tempo.length; i++) {
    if (beats <= starts[i]) break;
    const end = i + 1 < tempo.length ? starts[i + 1] : Infinity;
    sec += ((Math.min(beats, end) - starts[i]) * 60) / tempo[i].bpm;
  }
  return Math.round(sec * 1e6) / 1e6;
}

/** Beats per crossing at this tempo. */
export function slotBeats(bpm: number, minCrossingSec = MIN_CROSSING_SEC): number {
  for (const s of SLOT_CHOICES) if ((s * 60) / bpm >= minCrossingSec - EPS) return s;
  return SLOT_CHOICES[SLOT_CHOICES.length - 1];
}

// ---------------- validation ----------------

export function validateHarmony(
  timeline: HarmonyTimeline,
  tempo: TempoSegment[],
  opts: { requireApproved?: boolean } = {},
): { ok: boolean; issues: HarmonyIssue[]; structural: boolean } {
  const issues: HarmonyIssue[] = [];
  let structural = false;
  const add = (code: HarmonyIssueCode, path: string, message: string, blocks = false) => {
    issues.push({ code, path, message });
    if (blocks) structural = true;
  };

  if (timeline.schemaVersion !== 1) add("schema_version", "schemaVersion", "must be 1", true);
  const tp = tempoProblems(tempo);
  tp.forEach((m) => add("tempo_invalid", "tempo", m, true));
  const tempoOk = tp.length === 0;

  const posProblem = (bar: unknown, beat: unknown): string | null => {
    if (!(typeof bar === "number" && Number.isInteger(bar) && bar >= 0)) return "startBar must be a whole bar >= 0";
    if (!(typeof beat === "number" && Number.isFinite(beat) && beat >= 0)) return "startBeat must be a number >= 0";
    if (tempoOk && beat >= beatsInBar(tempo, bar) - EPS) return `startBeat must be below ${beatsInBar(tempo, bar)} in bar ${bar}`;
    return null;
  };

  const ids = new Set<string>();
  let prev = -Infinity;
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  events.forEach((e, i) => {
    const p = `events[${i}]`;
    if (typeof e.id !== "string" || e.id.length === 0) add("duplicate_id", `${p}.id`, "id is required", true);
    else if (ids.has(e.id)) add("duplicate_id", `${p}.id`, `duplicate event id ${e.id}`, true);
    ids.add(e.id);
    const pp = posProblem(e.startBar, e.startBeat);
    if (pp) {
      add("position_invalid", p, pp, true);
    } else if (tempoOk) {
      const at = absBeat(tempo, e.startBar, e.startBeat);
      if (!(at > prev + EPS)) add("event_order", p, "chord changes must be in time order with no two at the same moment", true);
      prev = at;
    }
    const r = readChord(e.symbol);
    if (!r.readable) add("chord_unreadable", `${p}.symbol`, r.note);
    if (opts.requireApproved && r.status === "approximate" && !e.approvedBy) {
      add("approximation_unapproved", p, `${e.symbol}: ${r.note}; needs approvedBy before it can move the dancers`);
    }
  });

  let prevKey = -Infinity;
  (timeline.keys ?? []).forEach((k, i) => {
    const p = `keys[${i}]`;
    const pp = posProblem(k.startBar, k.startBeat);
    if (pp) { add("key_invalid", p, pp, true); return; }
    if (!(Number.isInteger(k.tonic) && k.tonic >= 0 && k.tonic <= 11)) add("key_invalid", `${p}.tonic`, "tonic must be a whole number 0-11", true);
    if (k.quality !== "maj" && k.quality !== "min") add("key_invalid", `${p}.quality`, "quality must be maj or min", true);
    if (tempoOk) {
      const at = absBeat(tempo, k.startBar, k.startBeat);
      if (!(at > prevKey + EPS)) add("key_invalid", p, "key segments must be in time order", true);
      prevKey = at;
    }
  });

  if (opts.requireApproved) {
    if (timeline.approvalStatus !== "approved") add("not_approved", "approvalStatus", "the chord timeline must be approved before rendering");
    else if (!timeline.approvedBy || !timeline.approvedAt) add("approval_incomplete", "approvalStatus", "approvedBy and approvedAt are required");
  }
  return { ok: issues.length === 0, issues, structural };
}

// ---------------- solver ----------------

const CUE: Record<SideKind, DrumCue> = { R: "kick", L: "hihat", P: "snare" };
const WORD: Record<SideKind, MoveWord> = { R: "RA", L: "RA", P: "LA" };

function keyAt(keys: KeySegment[], tempo: TempoSegment[], beats: number): KeySegment | null {
  let found: KeySegment | null = null;
  for (const k of keys) if (absBeat(tempo, k.startBar, k.startBeat) <= beats + EPS) found = k;
  return found;
}

const sameKey = (x: KeySegment | null, y: KeySegment | null) =>
  x === y || (!!x && !!y && x.tonic === y.tonic && x.quality === y.quality);

export function planKirtled(
  timeline: HarmonyTimeline,
  tempo: TempoSegment[],
  opts: { minCrossingSec?: number; requireApproved?: boolean } = {},
): KirtledPlanResult {
  const v = validateHarmony(timeline, tempo, { requireApproved: opts.requireApproved });
  if (v.structural) return { ok: false, issues: v.issues, plan: null };

  const minSec = opts.minCrossingSec ?? MIN_CROSSING_SEC;
  const keys = timeline.keys ?? [];
  const stances: KirtledStance[] = [];
  const moves: KirtledMove[] = [];
  const leaps: KirtledLeap[] = [];

  let current: Triad | null = null;
  let lit: Triad[] = [];
  let prevBeat = -Infinity;
  // Key in force when the dancers last moved to a chord; a hold does not consume a key change.
  let standingKey: KeySegment | null = null;

  for (const e of timeline.events) {
    const T = absBeat(tempo, e.startBar, e.startBeat);
    const startSec = secAtBeat(tempo, T);
    const key = keyAt(keys, tempo, T);
    const keyChanged = current !== null && !sameKey(key, standingKey);
    const r = readChord(e.symbol);

    const hold: KirtledStance["hold"] =
      r.status === "unresolved" ? "unresolved" : r.status === "approximate" && !e.approvedBy ? "needs_approval" : undefined;

    if (hold || !r.anchor) {
      stances.push({ eventId: e.id, startBar: e.startBar, startBeat: e.startBeat, startSec, status: r.status, anchor: current, lit: [...lit], hold: hold ?? "unresolved" });
    } else {
      const target = r.anchor;
      if (current && !sameTriad(current, target)) {
        const keySet = key ? keyTriads(key.tonic, key.quality) : undefined;
        const sides = pathBetween(current, target, keySet);
        const n = sides.length;
        const slot = slotBeats(tempo[segmentForBeat(tempo, T)].bpm, minSec);
        const firstAt = T - (n - 1) * slot;
        const at = posAt(tempo, T);
        if (keyChanged) {
          leaps.push({ eventId: e.id, atBar: at.bar, atBeat: at.beat, atSec: startSec, from: current, to: target, crossingsNeeded: n, reason: "key_change", word: "TI", cue: "crash", sounding: false });
        } else if (firstAt > prevBeat + EPS) {
          const route = walkPath(current, sides);
          const pivot = route.map(triadNotes).reduce((acc, notes) => acc.filter((p) => notes.includes(p)));
          const spin = n >= 2 && pivot.length > 0;
          sides.forEach((side, i) => {
            const b = T - (n - 1 - i) * slot;
            const pos = posAt(tempo, b);
            moves.push({
              eventId: e.id, atBar: pos.bar, atBeat: pos.beat, atSec: secAtBeat(tempo, b),
              from: route[i], to: route[i + 1], side, word: spin ? "KA" : WORD[side], cue: CUE[side],
              passThrough: i < n - 1, sounding: false,
            });
          });
        } else {
          leaps.push({ eventId: e.id, atBar: at.bar, atBeat: at.beat, atSec: startSec, from: current, to: target, crossingsNeeded: n, reason: "too_far_for_tempo", word: null, cue: "crash", sounding: false });
        }
      }
      current = target;
      lit = r.lit;
      standingKey = key;
      stances.push({ eventId: e.id, startBar: e.startBar, startBeat: e.startBeat, startSec, status: r.status, anchor: current, lit: [...lit] });
    }
    prevBeat = T;
  }

  return {
    ok: v.ok,
    issues: v.issues,
    plan: { timelineId: timeline.id, mode: "song_following", stances, moves, leaps },
  };
}
