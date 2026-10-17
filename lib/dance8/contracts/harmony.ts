// lib/dance8/contracts/harmony.ts
//
// Harmony layer for Kirtled, the triangular instrument. Kirtled's floor is a
// Tonnetz: every triangle is a major or minor triad, and two triangles that
// share a side share two notes. A song's chord changes, placed on the beat
// grid of its cue map, become moves across that floor.
//
// This file covers song-following mode only. The approved master recording is
// the only audio; Kirtled draws the harmony and never adds a note. That is why
// every move carries `sounding: false`. A Kirtled remix that plays its own
// notes is a separate, versioned derivative and is not part of this contract.
//
// Positions are bars and beats, like the cue map. Seconds come from the cue
// map's tempo segments, so audio, cuts and moves share one clock.

/** 0 = C ... 11 = B. */
export type PitchClass = number;

export type TriadQuality = "maj" | "min";

export interface Triad {
  root: PitchClass;
  quality: TriadQuality;
}

/**
 * The three ways to cross a side. Each keeps two notes and moves one:
 * R (relative, e.g. C <-> Am), L (leading-tone, C <-> Em), P (parallel, C <-> Cm).
 */
export type SideKind = "R" | "L" | "P";

/**
 * verified: the chord maps exactly to one triangle or to two that share a side.
 * approximate: drawn as a simpler triad; needs a person's approval before it moves anyone.
 * unresolved: no honest shape (diminished, augmented, no chord). Dancers hold.
 */
export type HarmonyStatus = "verified" | "approximate" | "unresolved";

export interface KeySegment {
  startBar: number;
  startBeat: number;
  tonic: PitchClass;
  quality: TriadQuality;
}

/** One chord change, as heard in the approved master. */
export interface HarmonyEvent {
  id: string;
  /** 0-based bar and beat (beat may be fractional, < beats in that bar). */
  startBar: number;
  startBeat: number;
  /** Chord symbol as written, e.g. "Am", "Cmaj7", "G7", "N.C.". */
  symbol: string;
  /** Who approved an approximation. Without it, an approximate chord holds. */
  approvedBy?: string;
}

export interface HarmonyTimeline {
  id: string;
  schemaVersion: 1;
  trackId: string;
  analysisProfileId: string;
  /** Optional, for in-key preferences and explicit key changes. Never inferred from distance. */
  keys?: KeySegment[];
  events: HarmonyEvent[];
  approvalStatus: "draft" | "approved";
  approvedBy?: string;
  approvedAt?: string;
}

/** Kirtled move words used in song-following mode. */
export type MoveWord = "RA" | "LA" | "KA" | "TI";

/** Light/edge-flash family for a crossing. In song-following mode it is a light cue, never a sound. */
export type DrumCue = "kick" | "hihat" | "snare" | "crash";

/** What the floor shows from one chord change until the next. */
export interface KirtledStance {
  eventId: string;
  startBar: number;
  startBeat: number;
  startSec: number;
  status: HarmonyStatus;
  /** Triangle the three dancers stand on; null only before the first resolved chord. */
  anchor: Triad | null;
  /** Triangles lit at full brightness (one, or two for a seventh-chord diamond). */
  lit: Triad[];
  /** Why the dancers held instead of moving, when they did. */
  hold?: "unresolved" | "needs_approval";
}

/** One side crossing. */
export interface KirtledMove {
  eventId: string;
  atBar: number;
  atBeat: number;
  atSec: number;
  from: Triad;
  to: Triad;
  side: SideKind;
  word: MoveWord;
  cue: DrumCue;
  /** True on the way to the chord (the triangle only glows dimly). */
  passThrough: boolean;
  /** Song-following mode never adds sound. */
  sounding: false;
}

/**
 * The dancers relocate in one step, landing on the chord change.
 * key_change: the timeline's key segments change here (word TI). A key change
 * is only ever taken from the timeline, never guessed from distance.
 * too_far_for_tempo: the route needs more crossings than fit since the last
 * chord (no word; a crash flash only).
 */
export interface KirtledLeap {
  eventId: string;
  atBar: number;
  atBeat: number;
  atSec: number;
  from: Triad;
  to: Triad;
  crossingsNeeded: number;
  reason: "key_change" | "too_far_for_tempo";
  word: "TI" | null;
  cue: "crash";
  sounding: false;
}

export interface KirtledPlan {
  timelineId: string;
  mode: "song_following";
  stances: KirtledStance[];
  moves: KirtledMove[];
  leaps: KirtledLeap[];
}
