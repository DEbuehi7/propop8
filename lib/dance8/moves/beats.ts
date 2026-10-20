// lib/dance8/moves/beats.ts
//
// The dance per beat of the song: energy, level, the body zones that lead,
// travel, turn, jumps, stillness and where in the beat the body hits hardest.
// Measured on the capture clock, placed on the musical clock through the
// checked sync (D8-02). A beat the camera cannot read is "unknown" with null
// values, never filled in (Gate 1: known zero ≠ unknown).

import type { BodyZone, MovementLevel } from "../contracts/motion";
import { P, type CaptureSync, type MoveBeat } from "../contracts/moves";
import { ENERGY_JOINTS, quantile, smooth, TORSO_M, type BodySeries } from "./body";
import type { SongGrid } from "./grid";

/** Mean joint speed (torso lengths per second, about 2 m/s) that counts as full energy. */
export const ENERGY_FULL = 4;
/** Below this mean joint speed the body is still. */
export const STILL_SPEED = 0.35;
/** A beat is read when confidence reaches this. */
export const MIN_BEAT_CONFIDENCE = 0.5;
/** Level bands on the hip-height ratio (1 = standing). */
export const LEVEL_BANDS = { floor: 0.4, low: 0.75, high: 1.12 } as const;
/** A zone leads when it reaches this share of the strongest zone (and ZONE_MIN on its own scale); at most two lead. */
export const ZONE_LEAD = 0.6;
export const ZONE_MIN = 0.25;
/** Frames used either side for speeds (3 at 30 fps is a 0.2 s span), which keeps tracking jitter out. */
export const SPEED_SPAN = 3;

/**
 * Each zone's joints, what they move against (null: the room), and a typical
 * lively speed for that zone (torso lengths per second).
 */
export const ZONES: Record<BodyZone, { joints: number[]; anchor: number[] | null; ref: number }> = {
  head: { joints: [P.nose, P.left_ear, P.right_ear], anchor: [P.left_shoulder, P.right_shoulder], ref: 1 },
  arms: { joints: [P.left_elbow, P.right_elbow, P.left_wrist, P.right_wrist], anchor: [P.left_shoulder, P.right_shoulder], ref: 3 },
  torso: { joints: [P.left_shoulder, P.right_shoulder], anchor: [P.left_hip, P.right_hip], ref: 1 },
  hips: { joints: [P.left_hip, P.right_hip], anchor: null, ref: 1.5 },
  legs: { joints: [P.left_knee, P.right_knee], anchor: [P.left_hip, P.right_hip], ref: 1.5 },
  feet: { joints: [P.left_ankle, P.right_ankle, P.left_foot_index, P.right_foot_index], anchor: null, ref: 2 },
};
const ZONE_ORDER: BodyZone[] = ["head", "arms", "torso", "hips", "legs", "feet"];

export function levelOf(ratio: number): MovementLevel {
  return ratio < LEVEL_BANDS.floor ? "floor" : ratio < LEVEL_BANDS.low ? "low" : ratio < LEVEL_BANDS.high ? "mid" : "high";
}

export interface Speeds {
  energy: Float64Array;
  zones: Record<BodyZone, Float64Array>;
}

/** Per-frame speeds, over ±SPEED_SPAN frames. */
export function speeds(b: BodySeries): Speeds {
  const n = b.t.length;
  const at = (joints: number[], anchor: number[] | null) => {
    const out = new Float64Array(n).fill(NaN);
    for (let i = 0; i < n; i++) if (b.ok[i]) out[i] = spanSpeed(b, joints, anchor, i, SPEED_SPAN);
    return out;
  };
  const zones = Object.fromEntries(ZONE_ORDER.map((z) => [z, at(ZONES[z].joints, ZONES[z].anchor)])) as Record<BodyZone, Float64Array>;
  return { energy: at(ENERGY_JOINTS, null), zones };
}

/**
 * Mean speed of `joints` over ±span frames, in torso lengths per second.
 * Across and up-down from the image (precise), toward the camera from the 3D
 * estimate's depth (smoothed), so an arm swinging at the camera still counts.
 * With no anchor the motion is through the room; with one it is against it.
 */
function spanSpeed(b: BodySeries, joints: number[], anchor: number[] | null, i: number, span: number): number {
  const a = Math.max(0, i - span), c = Math.min(b.t.length - 1, i + span);
  if (a === c || !b.ok[a] || !b.ok[c]) return NaN;
  const dt = b.t[c] - b.t[a];
  const img = (f: number, k: number, ax: 0 | 1) => b.px[f][2 * k + ax] - (anchor ? anchor.reduce((s, q) => s + b.px[f][2 * q + ax], 0) / anchor.length : 0);
  const dep = (f: number, k: number) => b.wz[f][k] - (anchor ? anchor.reduce((s, q) => s + b.wz[f][q], 0) / anchor.length : 0);
  let sum = 0, cnt = 0;
  for (const k of joints) {
    const dx = (img(c, k, 0) - img(a, k, 0)) / b.scale[i], dy = (img(c, k, 1) - img(a, k, 1)) / b.scale[i];
    const dzRaw = (dep(c, k) - dep(a, k)) / TORSO_M;
    const d = Math.hypot(dx, dy, Number.isFinite(dzRaw) ? dzRaw : 0);
    if (Number.isFinite(d)) { sum += d; cnt++; }
  }
  return cnt ? sum / cnt / dt : NaN;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : NaN);

/** Frame indices whose capture time lies in [c0, c1). Frames are evenly spaced from t[0]. */
export function framesIn(b: BodySeries, c0: number, c1: number): number[] {
  const n = b.t.length;
  if (!n) return [];
  const i0 = Math.max(0, Math.ceil((c0 - b.t[0]) * b.fps - 1e-9));
  const i1 = Math.min(n, Math.ceil((c1 - b.t[0]) * b.fps - 1e-9));
  const out: number[] = [];
  for (let i = i0; i < i1; i++) out.push(i);
  return out;
}

export function beatFeatures(b: BodySeries, sp: Speeds, grid: SongGrid, sync: CaptureSync): MoveBeat[] {
  const n = b.t.length;
  if (!n) return [];
  const s0 = b.t[0] + sync.songAtCapture0, s1 = b.t[n - 1] + 1 / b.fps + sync.songAtCapture0;
  const out: MoveBeat[] = [];
  for (const g of grid.beats(s0, s1)) {
    const c0 = g.songSec - sync.songAtCapture0, c1 = c0 + g.beatSec;
    const idx = framesIn(b, c0, c1);
    const expected = Math.max(1, Math.round(g.beatSec * b.fps));
    if (idx.length < expected * 0.5) continue; // the take starts or ends inside this beat
    const okIdx = idx.filter((i) => b.ok[i]);
    const confidence = r3(mean(idx.map((i) => b.vis[i])) * (okIdx.length / idx.length));
    const base: MoveBeat = {
      beat: g.beat, bar: g.bar, beatInBar: g.beatInBar, songSec: g.songSec, status: "unknown", confidence,
      energy: null, level: null, levelRatio: null, zones: [], travel: null, turnDeg: null, airborne: null, still: null, accent: null,
    };
    if (confidence < MIN_BEAT_CONFIDENCE || okIdx.length < 2) { out.push(base); continue; }
    const speed = mean(okIdx.map((i) => sp.energy[i]).filter(Number.isFinite));
    const ratio = quantile(okIdx.map((i) => b.levelRatio[i]), 0.5);
    const act = ZONE_ORDER.map((z) => [z, mean(okIdx.map((i) => sp.zones[z][i]).filter(Number.isFinite)) / ZONES[z].ref] as const)
      .filter(([, a]) => Number.isFinite(a));
    const top = Math.max(0, ...act.map(([, a]) => a));
    const zones = act.filter(([, a]) => a >= ZONE_MIN && a >= ZONE_LEAD * top).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([z]) => z);
    const first = okIdx[0], last = okIdx[okIdx.length - 1];
    const W = (i: number) => b.bodyWidthRatio * b.scale[i];
    const travel = {
      x: r3((b.hipX[last] - b.hipX[first]) / W(last)),
      toward: r3((b.focalPx * (1 / b.scale[first] - 1 / b.scale[last])) / b.bodyWidthRatio),
    };
    const yaws = okIdx.map((i) => b.yaw[i]).filter(Number.isFinite);
    let air = false;
    for (let k = 1; k < okIdx.length; k++) if (b.airborne[okIdx[k]] && b.airborne[okIdx[k - 1]]) air = true;
    // Accent: the fastest moment within half a beat either side of the beat.
    const around = framesIn(b, c0 - g.beatSec / 2, c0 + g.beatSec / 2).filter((i) => b.ok[i] && Number.isFinite(sp.energy[i]));
    let peak = -1;
    for (const i of around) if (peak < 0 || sp.energy[i] > sp.energy[peak]) peak = i;
    out.push({
      ...base,
      status: "known",
      energy: r3(Math.min(1, Math.max(0, speed / ENERGY_FULL))),
      level: Number.isFinite(ratio) ? levelOf(ratio) : null,
      levelRatio: Number.isFinite(ratio) ? r3(ratio) : null,
      zones,
      travel,
      turnDeg: yaws.length >= 2 ? Math.round(yaws[yaws.length - 1] - yaws[0]) : null,
      airborne: air,
      still: speed < STILL_SPEED,
      accent: peak >= 0 ? r3((b.t[peak] - c0) / g.beatSec) : null,
    });
  }
  return out;
}

/** Smoothed hip x over about a beat (removes the sway of a groove), for travel. */
export function steadyHipX(b: BodySeries, beatFrames: number): Float64Array {
  return smooth(b.hipX, Math.max(1, Math.round(beatFrames / 2)));
}
