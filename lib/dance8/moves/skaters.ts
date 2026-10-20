// lib/dance8/moves/skaters.ts
//
// The owner's dance styles the skaters (canon D8-18, decided 2026-10-19)
// without changing which trick lands on which chord change (D8-16):
//
//   turn    KA version: under 180° a handplant roll, 180-359 a 180 spin, 360+ a 360
//   jump    TI ollie size: low, mid or high by the jump height; standard without one
//   freeze  HOLD freeze pose: low when the freeze is low or on the floor, high standing
//   energy  skaters doing the trick: solo, half the crew or all, by thirds of energy
//   travel  carve direction between tricks: the way the dancer went, or in place
//
// Where no take covers a trick it keeps D8-16's base version, one skater, in
// place, and says so (fromDance null). Pure and deterministic.

import type { CueMap } from "../contracts/scene";
import type { MoveBeat, MoveTrack } from "../contracts/moves";
import type { TrickEvent } from "../harmony/skateTricks";
import { LEVEL_BANDS } from "./beats";
import { TURN_TOLERANCE } from "./words";

export type Crew = "solo" | "half" | "all";
export type Carve = "screen_left" | "screen_right" | "toward_camera" | "away_from_camera" | "in_place";

/** Ollie bands on the dancer's jump (metres): under 0.15 low, under 0.3 mid, otherwise high. */
export const OLLIE_BANDS = { low: 0.15, mid: 0.3 } as const;
/** Energy thirds (D8-18). */
export const CREW_THIRDS = [1 / 3, 2 / 3] as const;
/** Net travel since the last trick below this (body-widths) carves in place. */
export const CARVE_MIN = 0.5;
/** Canon D8-11: eight dancers. */
export const DEFAULT_CREW = 8;

export interface StyledTrick extends TrickEvent {
  /** Song seconds (the trick's bar-clock time plus the first downbeat). */
  songSec: number;
  /** spin_180, ollie_high, freeze_low...; RA and LA have one version, the trick itself. */
  version: string;
  crew: Crew;
  crewCount: number;
  carve: Carve;
  fromDance: {
    takeId: string;
    energy: number | null;
    turnDeg: number | null;
    jumpM: number | null;
    freeze: "low" | "high" | null;
    travel: { x: number; toward: number };
  } | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : NaN);
const known = (t: MoveTrack, from: number, to: number) => t.beats.filter((b) => b.status === "known" && b.songSec >= from - 1e-9 && b.songSec < to - 1e-9);

/** The take that reads the bar before a moment best (most known beats; then the first take id). */
export function bestTake(tracks: MoveTrack[], from: number, to: number): MoveTrack | null {
  let best: MoveTrack | null = null, n = 0;
  for (const t of [...tracks].sort((a, b) => a.takeId.localeCompare(b.takeId))) {
    const k = known(t, from, to).length;
    if (k > n) { best = t; n = k; }
  }
  return best;
}

export function kaVersion(turnDeg: number | null): string {
  const d = Math.abs(turnDeg ?? 0);
  return d >= 360 - TURN_TOLERANCE ? "spin_360" : d >= 180 - TURN_TOLERANCE ? "spin_180" : "handplant_roll";
}
export function ollieVersion(jumpM: number | null): string {
  return jumpM === null ? "ollie_standard" : jumpM < OLLIE_BANDS.low ? "ollie_low" : jumpM < OLLIE_BANDS.mid ? "ollie_mid" : "ollie_high";
}
export function crewFor(energy: number | null, size = DEFAULT_CREW): { crew: Crew; crewCount: number } {
  const crew: Crew = energy === null || energy < CREW_THIRDS[0] ? "solo" : energy < CREW_THIRDS[1] ? "half" : "all";
  return { crew, crewCount: crew === "solo" ? 1 : crew === "half" ? Math.ceil(size / 2) : size };
}
export function carveOf(travel: { x: number; toward: number }): Carve {
  if (Math.hypot(travel.x, travel.toward) < CARVE_MIN) return "in_place";
  return Math.abs(travel.x) >= Math.abs(travel.toward) ? (travel.x > 0 ? "screen_right" : "screen_left") : travel.toward > 0 ? "toward_camera" : "away_from_camera";
}

export function styleTricks(
  tricks: TrickEvent[], tracks: MoveTrack[], map: Pick<CueMap, "tempo" | "firstDownbeatSec">, opts: { crewSize?: number } = {},
): StyledTrick[] {
  const origin = map.firstDownbeatSec ?? 0;
  const seg = map.tempo[0];
  const beat = 60 / seg.bpm, bar = seg.beatsPerBar * beat;
  let prev = -Infinity;
  return [...tricks].sort((a, b) => a.atSec - b.atSec).map((t) => {
    const songSec = Math.round((t.atSec + origin) * 1e6) / 1e6;
    const take = bestTake(tracks, songSec - bar, songSec + beat);
    const since = Number.isFinite(prev) ? prev : songSec - 2 * bar;
    prev = songSec;
    const base: StyledTrick = {
      ...t, songSec,
      version: t.cue === "KA" ? "handplant_roll" : t.cue === "TI" ? "ollie_standard" : t.cue === "HOLD" ? "freeze_low" : t.trick,
      ...crewFor(null, opts.crewSize), carve: "in_place", fromDance: null,
    };
    if (!take) return base;
    const lead = known(take, songSec - bar, songSec);
    const near = take.words.filter((w) => w.songSec >= songSec - bar - 1e-9 && w.songSec <= songSec + beat + 1e-9);
    // Turn: the bigger of the spins it read and the beats' own turning in the bar.
    const beatTurn = Math.abs(known(take, songSec - bar, songSec + beat).reduce((a, b) => a + (b.turnDeg ?? 0), 0));
    const turnDeg = Math.max(beatTurn, ...near.filter((w) => w.word === "KA").map((w) => w.size));
    const jumps = take.words.filter((w) => w.word === "TI" && Math.abs(w.songSec - songSec) <= beat + 1e-9).map((w) => w.size);
    const jumpM = jumps.length ? Math.max(...jumps) : null;
    // Freeze pose: the freeze around the held chord, else the level then.
    const fz = take.words.find((w) => w.word === "FREEZE" && w.songSec <= songSec + bar && w.songSec + w.size * beat >= songSec - beat);
    const lvlBeats: MoveBeat[] = fz ? known(take, fz.songSec, fz.songSec + w2(fz.size) * beat) : known(take, songSec - beat, songSec + beat);
    const ratio = mean(lvlBeats.map((b) => b.levelRatio ?? NaN).filter(Number.isFinite));
    const freeze: "low" | "high" | null = Number.isFinite(ratio) ? (ratio < LEVEL_BANDS.low ? "low" : "high") : null;
    const energyRaw = mean(lead.map((b) => b.energy ?? NaN).filter(Number.isFinite));
    const energy = Number.isFinite(energyRaw) ? r2(energyRaw) : null;
    const moved = known(take, since, songSec);
    const travel = { x: r2(moved.reduce((a, b) => a + (b.travel?.x ?? 0), 0)), toward: r2(moved.reduce((a, b) => a + (b.travel?.toward ?? 0), 0)) };
    const version = t.cue === "KA" ? kaVersion(turnDeg) : t.cue === "TI" ? ollieVersion(jumpM) : t.cue === "HOLD" ? `freeze_${freeze ?? "low"}` : t.trick;
    return {
      ...base, version, ...crewFor(energy, opts.crewSize), carve: carveOf(travel),
      fromDance: { takeId: take.takeId, energy, turnDeg: Math.round(turnDeg), jumpM: jumpM === null ? null : r2(jumpM), freeze, travel },
    };
  });
}
const w2 = (beats: number) => Math.max(1, beats);

export const VERSION_LABEL: Record<string, string> = {
  handplant_roll: "handplant roll", spin_180: "180 spin", spin_360: "360 spin",
  ollie_standard: "big ollie leap", ollie_low: "low ollie leap", ollie_mid: "ollie leap, mid height", ollie_high: "high ollie leap",
  freeze_low: "low board-assisted freeze", freeze_high: "standing board-assisted freeze",
  floor_carve: "floor carve", kickflip_sweep: "kickflip sweep",
};
export const CARVE_LABEL: Record<Carve, string> = {
  screen_left: "carving toward screen left", screen_right: "carving toward screen right",
  toward_camera: "carving toward the camera", away_from_camera: "carving away from the camera", in_place: "turning in place",
};
