// lib/dance8/moves/words.ts
//
// The owner's dance as Kirtled move words (canon D8-17, decided 2026-10-19):
//
//   DO      STOMP   one foot hits down hard on a beat
//   RA      ROLL    the hips move at least half a body-width within a bar
//   LA      FLIP    the hips change level without travelling
//   KA      SPIN    the body turns 180 degrees or more within a bar
//   TI      JUMP    both feet leave the floor
//   FREEZE  FREEZE  holding still for a beat or more
//
// Detected on the capture clock, timed on the musical clock through the
// checked sync. Every word keeps a size (how big the move was) because the
// skaters' versions are chosen from it (D8-18). All words are recorded; when
// several fall together (a jumping spin is TI and KA) each is kept.

import { KIRTLED_BODY_MOVES } from "../../canon/vocab";
import type { CaptureSync, MoveName, MoveWord, MoveWordId } from "../contracts/moves";
import type { MovementLevel } from "../contracts/motion";
import { quantile, smooth, TORSO_M, type BodySeries } from "./body";
import { LEVEL_BANDS, STILL_SPEED, steadyHipX, type Speeds } from "./beats";
import type { SongGrid } from "./grid";

/** A stomp: the foot comes down at least this fast (torso lengths per second)... */
export const STOMP_SPEED = 2.5;
/** ...after being lifted at least this high (torso lengths)... */
export const FOOT_LIFT = 0.15;
/** ...lands within this share of a beat of a beat, with the other foot on the floor. */
export const STOMP_ON_BEAT = 0.2;
/** A foot this close to the floor line (torso lengths) is on the floor. */
export const FOOT_ON_FLOOR = 0.1;
/** Travel: half a body-width within a bar (D8-17). */
export const TRAVEL_MIN = 0.5;
/** Toward or away from the camera only counts once the body's size in the frame changes this much (8%). */
export const DEPTH_MIN_CHANGE = 0.08;
/** Turn: 180 degrees within a bar (D8-17); a phone reads turns to about this many degrees. */
export const TURN_MIN = 180;
export const TURN_TOLERANCE = 15;
/** A move has stopped when the hips travel less than this (body-widths) over a beat, or turn less than this (degrees) over half a beat. */
export const MOVE_STOPPED = 0.1;
export const TURN_STOPPED = 20;
/** A jump: both feet off the floor for at least this many frames. */
export const AIR_MIN_FRAMES = 2;
/** A freeze: still for at least a beat (D8-17). */
export const FREEZE_MIN_BEATS = 1;
/** A level change must hold a beat (a jump's landing crouch does not count). */
export const LEVEL_HOLD_BEATS = 1;
export const LEVEL_HYSTERESIS = 0.04;

const MOVE_OF = Object.fromEntries(KIRTLED_BODY_MOVES.map((m) => [m.word, m.move])) as Record<MoveWordId, MoveName>;
const ORDER = KIRTLED_BODY_MOVES.map((m) => m.word as MoveWordId);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

type Band = "floor" | "low" | "mid";
const BAND_RANK: Record<Band, number> = { floor: 0, low: 1, mid: 2 };
/** Level band for FLIP; "high" (on the toes, in the air) is jump territory, so it counts as standing here. */
const band = (r: number): Band => (r < LEVEL_BANDS.floor ? "floor" : r < LEVEL_BANDS.low ? "low" : "mid");

export function detectWords(b: BodySeries, sp: Speeds, grid: SongGrid, sync: CaptureSync): MoveWord[] {
  const n = b.t.length;
  const out: MoveWord[] = [];
  if (n < 3) return out;
  const songOf = (i: number) => b.t[i] + sync.songAtCapture0;
  const typicalBeat = grid.beatSec(Math.max(0, grid.at(songOf(Math.floor(n / 2)))?.bar ?? 0)) * b.fps;
  const beatFrames = (i: number) => {
    const g = grid.at(songOf(i));
    return Math.max(1, Math.round((g ? g.beatSec : typicalBeat / b.fps) * b.fps));
  };
  const barFrames = (i: number) => {
    const g = grid.at(songOf(i));
    return Math.max(2, Math.round(g ? grid.beatsPerBar(g.bar) * g.beatSec * b.fps : 4 * typicalBeat));
  };
  const push = (word: MoveWordId, i: number, size: number, detail: string) => {
    const s = songOf(i);
    const g = grid.at(s);
    if (!g) return;
    out.push({ word, move: MOVE_OF[word], songSec: r3(s), bar: g.bar, beatInBar: r2(g.beatInBar), size: r2(size), detail });
  };
  const okAt = (i: number) => i >= 0 && i < n && b.ok[i] === 1;
  // Each foot's lowest point, median of three frames: jitter out, the landing frame kept.
  const foot = b.footY.map((y) => y.map((_, i) => {
    const w = [y[i - 1], y[i], y[i + 1]].filter(Number.isFinite).sort((p, q) => p - q);
    return w.length ? w[w.length >> 1] : NaN;
  })) as [Float64Array, Float64Array];
  const height = (s: 0 | 1, i: number) => (b.floorY[i] - foot[s][i]) / b.scale[i];

  // ---- RA: travel of half a body-width within a bar
  const hx = steadyHipX(b, typicalBeat);
  const travel = (j: number, i: number) => {
    if (!okAt(j) || !okAt(i)) return null;
    const x = (hx[i] - hx[j]) / (b.bodyWidthRatio * b.scale[i]);
    const dl = Math.log(b.scale[i] / b.scale[j]);
    const toward = Math.abs(dl) < DEPTH_MIN_CHANGE ? 0 : (b.focalPx * (1 / b.scale[j] - 1 / b.scale[i])) / b.bodyWidthRatio;
    return Number.isFinite(x) && Number.isFinite(toward) ? { x, toward, dist: Math.hypot(x, toward) } : null;
  };
  const dir = (t: { x: number; toward: number }) =>
    Math.abs(t.x) >= Math.abs(t.toward) ? (t.x > 0 ? "screen right" : "screen left") : t.toward > 0 ? "toward the camera" : "away from the camera";
  // One move counts once: after a word, the next window starts where the move
  // stopped (or a bar later, so a long walk is one RA per bar).
  for (let i = 0, from = 0; i < n; i++) {
    if (!okAt(i)) continue;
    const bf = barFrames(i), bt = beatFrames(i);
    const j = Math.max(i - bf, from);
    const tr = travel(j, i);
    if (!tr || tr.dist < TRAVEL_MIN) continue;
    let k = i + 1;
    while (k < n && k < i + bf) { const step = travel(k - bt, k); if (step && step.dist < MOVE_STOPPED) break; k++; }
    let best = tr;
    for (let q = i + 1; q <= Math.min(n - 1, k); q++) { const t2 = travel(Math.max(q - bf, from), q); if (t2 && t2.dist > best.dist) best = t2; }
    push("RA", i, best.dist, `${r2(best.dist)} body-widths, ${dir(best)}`);
    from = k;
    i = k;
  }

  // ---- LA: a change of level, held a beat, without travel
  const lr = smooth(b.levelRatio, Math.max(1, Math.round(typicalBeat / 4)));
  let cur: Band | null = null;
  for (let i = 0; i < n; i++) {
    if (!okAt(i) || !Number.isFinite(lr[i])) continue;
    const lo: Band = band(lr[i] - LEVEL_HYSTERESIS), hi: Band = band(lr[i] + LEVEL_HYSTERESIS);
    if (cur === null) { cur = band(lr[i]); continue; }
    if (lo !== hi || lo === cur) continue;
    const c: Band = lo;
    const bt = beatFrames(i);
    let held = true;
    for (let k = i; k <= Math.min(n - 1, i + bt * LEVEL_HOLD_BEATS); k++) if (okAt(k) && Number.isFinite(lr[k]) && band(lr[k]) !== c) { held = false; break; }
    if (!held) continue;
    let air = false;
    for (let k = Math.max(0, i - Math.round(bt / 2)); k <= Math.min(n - 1, i + bt); k++) if (b.airborne[k]) air = true;
    const half = Math.round(barFrames(i) / 2);
    const tr = travel(Math.max(0, i - half), Math.min(n - 1, i + half));
    const from: Band = cur;
    cur = c;
    if (air || (tr && tr.dist >= TRAVEL_MIN)) continue; // a jump or a travelling move, not a FLIP
    const med = (a: number, z: number) => quantile(Array.from(lr.subarray(Math.max(0, a), Math.min(n, z))), 0.5);
    const size = Math.abs(med(i, i + bt) - med(i - bt, i));
    const down = BAND_RANK[c] < BAND_RANK[from];
    push("LA", i, size, `${down ? "drop" : "rise"} to ${c === "floor" ? "the floor" : c === "mid" ? "standing" : "low"}`);
  }

  // ---- KA: a turn of 180 degrees or more within a bar
  const turnIn = (j: number, i: number) => {
    let mn = Infinity, mx = -Infinity, changes = 0, last = 0;
    for (let k = Math.max(0, j); k <= i; k++) {
      if (Number.isFinite(b.yaw[k])) { mn = Math.min(mn, b.yaw[k]); mx = Math.max(mx, b.yaw[k]); }
      const f = b.facing[k];
      if (f !== 0) { if (last !== 0 && f !== last) changes++; last = f; }
    }
    return Math.max(mx > mn ? mx - mn : 0, 180 * changes);
  };
  const turning = (k: number, bt: number) => {
    const a = b.yaw[Math.max(0, k - Math.round(bt / 2))], c = b.yaw[k];
    return !(Number.isFinite(a) && Number.isFinite(c)) || Math.abs(c - a) >= TURN_STOPPED;
  };
  for (let i = 0, from = 0; i < n; i++) {
    if (!okAt(i)) continue;
    const bf = barFrames(i), bt = beatFrames(i);
    if (turnIn(Math.max(i - bf, from), i) < TURN_MIN - TURN_TOLERANCE) continue;
    let k = i + 1;
    while (k < n && k < i + bf && turning(k, bt)) k++;
    let size = 0;
    for (let q = i; q <= Math.min(n - 1, k); q++) size = Math.max(size, turnIn(Math.max(q - bf, from), q));
    push("KA", i, Math.round(size / 5) * 5, `turned about ${Math.round(size / 5) * 5} degrees`);
    from = k;
    i = k;
  }

  // ---- TI: both feet off the floor (timed at the landing)
  for (let i = 0; i < n; ) {
    if (!(okAt(i) && b.airborne[i])) { i++; continue; }
    let j = i, top = 0;
    while (j < n && okAt(j) && b.airborne[j]) {
      const lowest = Math.max(b.footY[0][j], b.footY[1][j]);
      if (Number.isFinite(lowest)) top = Math.max(top, (b.floorY[j] - lowest) / b.scale[j]);
      j++;
    }
    if (j - i >= AIR_MIN_FRAMES) push("TI", Math.min(n - 1, j), top * TORSO_M, `jump about ${r2(top * TORSO_M)} m`);
    i = j + 1;
  }

  // ---- DO: one foot hits down hard on a beat, the other on the floor
  for (const s of [0, 1] as const) {
    const other = (1 - s) as 0 | 1;
    let last = -Infinity;
    for (let i = 4; i < n; i++) {
      if (!okAt(i) || !okAt(i - 1)) continue;
      // The frame it lands, and it stays down the next frame too.
      if (!(height(s, i) < FOOT_ON_FLOOR) || !(height(s, i - 1) >= FOOT_ON_FLOOR) || !okAt(i + 1) || !(height(s, i + 1) < FOOT_ON_FLOOR)) continue;
      let peak = 0;
      for (let k = i - 3; k <= i; k++) {
        if (!okAt(k) || !okAt(k - 1)) continue;
        const v = ((foot[s][k] - foot[s][k - 1]) * b.fps) / b.scale[k];
        if (Number.isFinite(v)) peak = Math.max(peak, v);
      }
      if (peak < STOMP_SPEED) continue;
      let up = 0, lifted = false; // lifted for two frames running within the quarter second before
      for (let k = Math.max(0, i - Math.round(b.fps / 4)); k < i; k++) { up = okAt(k) && height(s, k) >= FOOT_LIFT ? up + 1 : 0; if (up >= 2) lifted = true; }
      if (!lifted || !(height(other, i) < FOOT_ON_FLOOR)) continue;
      let air = false;
      for (let k = Math.max(0, i - 4); k <= Math.min(n - 1, i + 1); k++) if (b.airborne[k]) air = true;
      if (air || i - last < beatFrames(i) / 4) continue;
      const near = grid.nearest(songOf(i));
      if (!near || Math.abs(near.offBeats) > STOMP_ON_BEAT) continue;
      push("DO", i, peak, `${s === 0 ? "left" : "right"} foot`);
      last = i;
    }
  }

  // ---- FREEZE: still for a beat or more
  for (let i = 0; i < n; ) {
    const still = (k: number) => okAt(k) && Number.isFinite(sp.energy[k]) && sp.energy[k] < STILL_SPEED;
    if (!still(i)) { i++; continue; }
    let j = i;
    while (j + 1 < n && (still(j + 1) || (j + 2 < n && still(j + 2)))) j++; // a single dropped frame does not break a hold
    const held = b.t[j] - b.t[i] + 1 / b.fps;
    const bs = beatFrames(i) / b.fps;
    if (held >= FREEZE_MIN_BEATS * bs) {
      const ratio = quantile(Array.from(b.levelRatio.subarray(i, j + 1)), 0.5);
      const lvl: MovementLevel | "unknown" = Number.isFinite(ratio) ? (ratio < LEVEL_BANDS.floor ? "floor" : ratio < LEVEL_BANDS.low ? "low" : ratio < LEVEL_BANDS.high ? "mid" : "high") : "unknown";
      push("FREEZE", i, held / bs, `held ${r2(held / bs)} beats, ${lvl === "mid" ? "standing" : lvl}`);
    }
    i = j + 1;
  }

  return out.sort((a, c) => a.songSec - c.songSec || ORDER.indexOf(a.word) - ORDER.indexOf(c.word));
}
