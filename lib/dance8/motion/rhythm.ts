// lib/dance8/motion/rhythm.ts
//
// CHOIR8: one rhythmic movement grammar for every performer (the choir
// proposal of 2 Nov 2026). The beat says when; the role says how. Each count
// of an eight-count phrase carries an intent (load, travel, release, accent,
// resolve), movement modes (lateral, forward/back, vertical, rotation, orbit,
// compound) and a direction; a soloist, a choir row, a breaker and a skater
// each express that intent their own way, so they move together without
// moving identically. Relationships vary it by section: unison, a wave that
// travels through the choir's rows, or call and response.
//
// Deterministic and pure: the same cue map and cast give the same plan. The
// beat grid is the cue map's (D8-01). While the cue map is still a draft its
// grid is unchecked, so every count is DEFER (EDO-4: unknown timing never
// becomes a confident movement). Skaters never take a trick from this
// grammar: their tricks stay one per chord change (D8-16).

import type { DecisionGate } from "../contracts/decision";
import type { Cue, CueMap } from "../contracts/scene";
import type { MusicSection } from "../contracts/signal";
import { barToSec } from "../authoring/validateCueMap";
import type { BeatFeel } from "./beatFeel";
import type { Landing } from "./landing";

export type MotionMode = "lateral" | "forward_back" | "vertical" | "rotation" | "orbit" | "compound";
export type Intent = "load" | "travel" | "release" | "accent" | "resolve";
export type Role = "soloist" | "choir" | "breaker" | "skater";
export type ChoirRow = "front" | "mid" | "rear";
export type Relationship = "unison" | "wave" | "call_response";
export type Contact = "planted" | "stepping" | "rolling" | "airborne";

export interface CountStep {
  count: number;
  intent: Intent;
  modes: MotionMode[];
  /** Stage direction [right, up, toward the camera], before mirroring. */
  direction: readonly [number, number, number];
  /** Turn in degrees (positive = to the performer's right), before mirroring. */
  turnDeg: number;
  arrow: string;
}

const D = Math.SQRT1_2;
/** The proposal's eight-count phrase: one suggestion, fitted to the song's own grid. */
export const EIGHT_COUNT: readonly CountStep[] = [
  { count: 1, intent: "load", modes: ["lateral", "forward_back"], direction: [D, 0, D], turnDeg: 0, arrow: "↗" },
  { count: 2, intent: "resolve", modes: ["vertical"], direction: [0, -1, 0], turnDeg: 0, arrow: "↓" },
  { count: 3, intent: "travel", modes: ["lateral", "forward_back"], direction: [-D, 0, -D], turnDeg: 0, arrow: "↖" },
  { count: 4, intent: "release", modes: ["rotation"], direction: [0, 0, 0], turnDeg: -90, arrow: "↶" },
  { count: 5, intent: "travel", modes: ["lateral"], direction: [1, 0, 0], turnDeg: 0, arrow: "→" },
  { count: 6, intent: "accent", modes: ["vertical"], direction: [0, 1, 0], turnDeg: 0, arrow: "↑" },
  { count: 7, intent: "release", modes: ["orbit"], direction: [0, 0, 0], turnDeg: 180, arrow: "⟳" },
  { count: 8, intent: "resolve", modes: ["compound"], direction: [0, 0, 0], turnDeg: 0, arrow: "◎" },
];

/** How each role expresses an intent (the proposal's shared-intent table). */
export const EXPRESSION: Record<Role, Record<Intent, { doing: string; contact: Contact }>> = {
  soloist: {
    load: { doing: "bends the knees and shifts weight, torso leaning with it", contact: "planted" },
    travel: { doing: "a step or diagonal sway toward the audience", contact: "stepping" },
    release: { doing: "lifts the chest and opens the arms", contact: "planted" },
    accent: { doing: "extends one arm on the vocal accent", contact: "planted" },
    resolve: { doing: "settles into a supported, centred stance", contact: "planted" },
  },
  choir: {
    load: { doing: "knees soften, weight shifts", contact: "planted" },
    travel: { doing: "a small step or diagonal sway", contact: "stepping" },
    release: { doing: "chest lifts, hands open", contact: "planted" },
    accent: { doing: "a hand, shoulder or head accent", contact: "planted" },
    resolve: { doing: "back to a supported neutral stance", contact: "planted" },
  },
  breaker: {
    load: { doing: "lowers the stance", contact: "planted" },
    travel: { doing: "toprock or footwork", contact: "stepping" },
    release: { doing: "a jump or spin", contact: "airborne" },
    accent: { doing: "a hit or a freeze", contact: "planted" },
    resolve: { doing: "a controlled landing", contact: "planted" },
  },
  skater: {
    load: { doing: "compresses on the board", contact: "rolling" },
    travel: { doing: "rolls or carves", contact: "rolling" },
    release: { doing: "holds the line (tricks come from chord changes, D8-16)", contact: "rolling" },
    accent: { doing: "a shoulder or arm accent while rolling", contact: "rolling" },
    resolve: { doing: "rolls out, centred over the board", contact: "rolling" },
  },
};

export interface Performer {
  id: string;
  role: Role;
  /** Choir row, for the wave. */
  row?: ChoirRow;
}

/** The first deliverable's cast: a soloist, three choir rows, a breaker and a skater. */
export const DEFAULT_CAST: readonly Performer[] = [
  { id: "soloist", role: "soloist" },
  { id: "choir-front", role: "choir", row: "front" },
  { id: "choir-mid", role: "choir", row: "mid" },
  { id: "choir-rear", role: "choir", row: "rear" },
  { id: "breaker", role: "breaker" },
  { id: "skater", role: "skater" },
];

/** Section -> relationship, unless the plan says otherwise. */
export const RELATIONSHIP_BY_SECTION: Record<MusicSection, Relationship> = {
  intro: "unison", verse: "unison", build: "wave", chorus: "wave", break: "call_response", outro: "unison", unknown: "unison",
};
const SECTION_INTENSITY: Record<MusicSection, number> = { intro: 0.6, verse: 0.8, build: 0.9, chorus: 1, break: 0.7, outro: 0.6, unknown: 0.7 };
const ROLE_AMPLITUDE: Record<Role, number> = { soloist: 1, choir: 0.6, breaker: 1, skater: 0.8 };
const WAVE_DELAY: Record<ChoirRow, number> = { front: 0, mid: 1, rear: 2 };
/** Above this tempo each count takes two beats: a full-body sway on every beat would be frantic. */
export const HALF_TIME_ABOVE_BPM = 130;

/** A stable 0..1 per performer, so each keeps the same small style difference every time (no random offsets). */
function styleOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 999;
}

export interface PerformerMove {
  id: string;
  role: Role;
  row?: ChoirRow;
  /** The count this performer is on (a wave delays the rows). */
  count: number;
  intent: Intent;
  doing: string;
  modes: MotionMode[];
  direction: [number, number, number];
  turnDeg: number;
  arrow: string;
  amplitude: number;
  contact: Contact;
  /** False while holding (call and response, or the wave not yet arrived). */
  active: boolean;
  /** Which hit this performer lands on, once the song's beat feel is applied (./landing). Active moves only. */
  landing?: Landing;
  /** Song time of that hit; null when holding through a dropped beat. */
  hitSec?: number | null;
}

export interface PlannedCount {
  /** Beat index from bar 0. */
  beat: number;
  timeSec: number;
  phrase: number;
  count: number;
  gate: DecisionGate;
  /** The song's feel on this count (./beatFeel), once measured. */
  feel?: BeatFeel;
  moves: PerformerMove[];
}

export interface CuePlan {
  cueId: string;
  section: MusicSection;
  relationship: Relationship;
  bpm: number;
  beatsPerBar: number;
  beatsPerCount: number;
  startSec: number;
  endSec: number;
  gate: DecisionGate;
  reason: string;
  counts: PlannedCount[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const flip = (step: CountStep, mirrored: boolean) => (mirrored
  ? { direction: [r3(-step.direction[0]), r3(step.direction[1]), r3(step.direction[2])] as [number, number, number], turnDeg: -step.turnDeg, arrow: MIRROR[step.arrow] ?? step.arrow }
  : { direction: step.direction.map(r3) as [number, number, number], turnDeg: step.turnDeg, arrow: step.arrow });
const MIRROR: Record<string, string> = { "↗": "↖", "↖": "↗", "→": "←", "←": "→", "↶": "↷", "↷": "↶" };

function moveFor(p: Performer, step: CountStep, mirrored: boolean, amp: number, active: boolean): PerformerMove {
  const e = EXPRESSION[p.role][step.intent];
  const f = flip(step, mirrored);
  return {
    id: p.id, role: p.role, ...(p.row ? { row: p.row } : {}), count: step.count, intent: step.intent,
    doing: active ? e.doing : "holds a small planted sway", modes: active ? [...step.modes] : ["lateral"],
    direction: active ? f.direction : [0, 0, 0], turnDeg: active ? f.turnDeg : 0, arrow: active ? f.arrow : "·",
    amplitude: r3(active ? amp : amp * 0.25), contact: active ? e.contact : p.role === "skater" ? "rolling" : "planted", active,
  };
}

/**
 * One cue's counts. Phrases of eight counts fill the cue from its first
 * downbeat; every second phrase is mirrored, so a repeat reads as a variation.
 */
export function planCue(map: Pick<CueMap, "tempo" | "firstDownbeatSec" | "approvalStatus">, cue: Cue, cast: readonly Performer[] = DEFAULT_CAST, relationship?: Relationship): CuePlan {
  const seg = [...map.tempo].reverse().find((s) => s.startBar <= cue.startBar) ?? map.tempo[0];
  if (!seg) throw new Error("the cue map has no tempo");
  const beatsPerCount = seg.bpm > HALF_TIME_ABOVE_BPM ? 2 : 1;
  const rel = relationship ?? RELATIONSHIP_BY_SECTION[cue.section];
  const offset = map.firstDownbeatSec ?? 0;
  const verified = map.approvalStatus !== "draft";
  const gate: DecisionGate = verified ? "execute" : "defer";
  const startBeat = cue.startBar * seg.beatsPerBar;
  const endBeat = cue.endBar * seg.beatsPerBar;
  const secOfBeat = (b: number) => r3(offset + barToSec(map.tempo, Math.floor(b / seg.beatsPerBar)) + ((b % seg.beatsPerBar) * 60) / seg.bpm);
  const intensity = SECTION_INTENSITY[cue.section];
  const counts: PlannedCount[] = [];
  for (let b = startBeat, k = 0; b < endBeat; b += beatsPerCount, k++) {
    const phrase = Math.floor(k / 8);
    const mirrored = phrase % 2 === 1;
    const moves = cast.map((p) => {
      const amp = Math.min(1, ROLE_AMPLITUDE[p.role] * intensity * (0.9 + 0.2 * styleOf(p.id)));
      if (rel === "wave" && p.role === "choir") {
        const delayed = k - WAVE_DELAY[p.row ?? "front"];
        if (delayed < 0) return moveFor(p, EIGHT_COUNT[0], mirrored, amp, false);
        return moveFor(p, EIGHT_COUNT[delayed % 8], Math.floor(delayed / 8) % 2 === 1, amp, true);
      }
      const step = EIGHT_COUNT[k % 8];
      if (rel === "call_response") {
        const call = k % 8 < 4;
        if (p.role === "soloist") return moveFor(p, step, mirrored, amp, call);
        return moveFor(p, step, mirrored, amp * 0.7, !call);
      }
      return moveFor(p, step, mirrored, amp, true);
    });
    counts.push({ beat: b, timeSec: secOfBeat(b), phrase, count: (k % 8) + 1, gate, moves });
  }
  return {
    cueId: cue.id, section: cue.section, relationship: rel, bpm: seg.bpm, beatsPerBar: seg.beatsPerBar, beatsPerCount,
    startSec: secOfBeat(startBeat), endSec: secOfBeat(endBeat), gate,
    reason: verified ? "beat grid from the checked cue map" : "the cue map is still a draft, so its beat grid is unchecked: rehearse with these counts, don't film to them yet",
    counts,
  };
}

export function planSong(map: Pick<CueMap, "tempo" | "firstDownbeatSec" | "approvalStatus" | "cues">, cast: readonly Performer[] = DEFAULT_CAST): CuePlan[] {
  return map.cues.map((c) => planCue(map, c, cast));
}
