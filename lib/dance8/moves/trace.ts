// lib/dance8/moves/trace.ts
//
// The dancer's measured body on the song clock, for the Ocular Director's
// Dance8 analysis cell and the Kirtled floor. Built on the owner's synced take
// (canon D8-17); this is the one place its capture seconds become song seconds
// (D8-02: songSec = captureSec + sync.songAtCapture0). Pure and deterministic.
//
// These are measurements, not judgements. A footfall is a foot coming to rest
// on the take's own floor line after being off it; it is not a DO word (words.ts
// decides those, and a person approves the track). Where the camera lost the
// body nothing is drawn and nothing is guessed.

import { P, type CaptureSync, type PoseCapture } from "../contracts/moves";
import { bodySeries, smooth, type BodySeries } from "./body";

/** One point as fractions of the video frame (y down), with the model's visibility. */
export interface TracePoint { x: number; y: number; v: number }
/** The 33 MediaPipe points, or null where no body was found. */
export type TraceBody = TracePoint[] | null;

/** Lines of the drawn skeleton (MediaPipe's pose connections without the face). */
export const BONES: readonly (readonly [number, number])[] = [
  [P.left_shoulder, P.right_shoulder], [P.left_shoulder, P.left_hip], [P.right_shoulder, P.right_hip], [P.left_hip, P.right_hip],
  [P.left_shoulder, P.left_elbow], [P.left_elbow, P.left_wrist], [P.right_shoulder, P.right_elbow], [P.right_elbow, P.right_wrist],
  [P.left_hip, P.left_knee], [P.left_knee, P.left_ankle], [P.right_hip, P.right_knee], [P.right_knee, P.right_ankle],
  [P.left_ankle, P.left_heel], [P.left_heel, P.left_foot_index], [P.left_ankle, P.left_foot_index],
  [P.right_ankle, P.right_heel], [P.right_heel, P.right_foot_index], [P.right_ankle, P.right_foot_index],
];
/** Joints drawn as dots. */
export const JOINTS: readonly number[] = [
  P.nose, P.left_shoulder, P.right_shoulder, P.left_elbow, P.right_elbow, P.left_wrist, P.right_wrist,
  P.left_hip, P.right_hip, P.left_knee, P.right_knee, P.left_ankle, P.right_ankle,
];
/** A point is drawn when at least this visible. */
export const MIN_TRACE_VISIBILITY = 0.4;
/**
 * A foot is on the floor within this many torso lengths of its own floor line
 * (the lowest it gets within FOOT_FLOOR_SEC either side), and lifted when it was
 * at least LIFTED above it or dropping at DROP_SPEED torso lengths a second.
 * Small on purpose: a groove's steps lift a foot a few centimetres.
 */
export const ON_FLOOR = 0.03;
export const LIFTED = 0.07;
export const DROP_SPEED = 0.6;
export const FOOT_FLOOR_SEC = 1;
/** Frames looked back for the lift or the drop. */
export const LOOKBACK_FRAMES = 5;
/** Two footfalls of one foot at least this far apart. */
export const MIN_FOOTFALL_GAP_SEC = 0.2;

export interface Footfall {
  songSec: number;
  foot: "left" | "right";
  /** Where the foot came down, as fractions of the video frame. */
  x: number;
  y: number;
  /** Fastest downward speed in the frames before, in torso lengths a second. */
  impact: number;
}

/** A dancer's take ready to draw: the capture, its clock link and the derived series. */
export interface Trace {
  cap: PoseCapture;
  songAtCapture0: number;
  series: BodySeries;
  footfalls: Footfall[];
}

export const songSecOf = (sync: Pick<CaptureSync, "songAtCapture0">, captureSec: number) => captureSec + sync.songAtCapture0;
export const captureSecOf = (sync: Pick<CaptureSync, "songAtCapture0">, songSec: number) => songSec - sync.songAtCapture0;

function frameBody(cap: PoseCapture, k: number): TraceBody {
  const f = cap.frames[k];
  if (!f?.image) return null;
  const out: TracePoint[] = [];
  for (let j = 0; j < 33; j++) out.push({ x: f.image[4 * j], y: f.image[4 * j + 1], v: f.image[4 * j + 3] });
  return out;
}

/**
 * The body at song second `songSec`: the two nearest frames blended, each the
 * mean of itself and its neighbours (`smoothFrames` either side) to calm the
 * model's jitter. Null when the nearest frame has no body.
 */
export function bodyAt(cap: PoseCapture, sync: Pick<CaptureSync, "songAtCapture0">, songSec: number, smoothFrames = 1): TraceBody {
  const pos = (captureSecOf(sync, songSec) - cap.video.videoStartSec) * cap.fps;
  if (pos < -0.5 || pos > cap.frames.length - 0.5) return null;
  const k0 = Math.max(0, Math.min(cap.frames.length - 1, Math.floor(pos)));
  const k1 = Math.min(cap.frames.length - 1, k0 + 1);
  const a = Math.max(0, Math.min(1, pos - k0));
  const avg = (k: number): TraceBody => {
    const bodies: TracePoint[][] = [];
    for (let j = k - smoothFrames; j <= k + smoothFrames; j++) { const b = frameBody(cap, j); if (b) bodies.push(b); }
    if (!frameBody(cap, k) || !bodies.length) return null;
    return bodies[0].map((_, i) => {
      let x = 0, y = 0, v = 0;
      for (const b of bodies) { x += b[i].x; y += b[i].y; v += b[i].v; }
      return { x: x / bodies.length, y: y / bodies.length, v: v / bodies.length };
    });
  };
  const b0 = avg(k0), b1 = avg(k1);
  if (!b0) return a > 0.5 ? b1 : null;
  if (!b1) return a <= 0.5 ? b0 : null;
  return b0.map((p, i) => ({ x: p.x + (b1[i].x - p.x) * a, y: p.y + (b1[i].y - p.y) * a, v: Math.min(p.v, b1[i].v) }));
}

/** The torso's centre (shoulders and hips) when all four are visible enough. */
export function centreOf(b: TraceBody): { x: number; y: number } | null {
  if (!b) return null;
  const pts = [P.left_shoulder, P.right_shoulder, P.left_hip, P.right_hip].map((i) => b[i]);
  if (pts.some((p) => p.v < MIN_TRACE_VISIBILITY)) return null;
  return { x: pts.reduce((s, p) => s + p.x, 0) / 4, y: pts.reduce((s, p) => s + p.y, 0) / 4 };
}

/**
 * Footfalls of each foot: the first frame a foot is back on its floor line
 * (within ON_FLOOR torso lengths) and nearly still, after it was lifted or
 * dropping in the frames before.
 */
export function footfalls(series: BodySeries, sync: Pick<CaptureSync, "songAtCapture0">): Footfall[] {
  const out: Footfall[] = [];
  const n = series.t.length;
  const sides: [0 | 1, "left" | "right", number[]][] = [
    [0, "left", [P.left_heel, P.left_foot_index, P.left_ankle]],
    [1, "right", [P.right_heel, P.right_foot_index, P.right_ankle]],
  ];
  for (const [s, foot, pts] of sides) {
    const y = smooth(series.footY[s], 1);
    // This foot's own floor line: in a stance one foot can sit higher in the picture than the other.
    const r = Math.round(FOOT_FLOOR_SEC * series.fps), floor = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let m = -Infinity;
      for (let j = Math.max(0, k - r); j <= Math.min(n - 1, k + r); j++) if (Number.isFinite(y[j]) && y[j] > m) m = y[j];
      floor[k] = m === -Infinity ? NaN : m;
    }
    // Height over the floor line and downward speed, in torso lengths.
    const up = new Float64Array(n), vy = new Float64Array(n);
    for (let k = 0; k < n; k++) up[k] = (floor[k] - y[k]) / series.scale[k];
    for (let k = 1; k < n; k++) vy[k] = ((y[k] - y[k - 1]) * series.fps) / series.scale[k];
    vy[0] = NaN;
    let last = -Infinity;
    for (let k = 1; k < n; k++) {
      if (!series.ok[k] || !Number.isFinite(up[k]) || !Number.isFinite(vy[k])) continue;
      const onFloor = up[k] <= ON_FLOOR && Math.abs(vy[k]) < DROP_SPEED * 0.5;
      if (!onFloor) continue;
      let lifted = false, impact = 0;
      for (let j = Math.max(1, k - LOOKBACK_FRAMES); j < k; j++) {
        if (!Number.isFinite(up[j]) || !Number.isFinite(vy[j])) continue;
        if (up[j] >= LIFTED || vy[j] >= DROP_SPEED) lifted = true;
        if (vy[j] > impact) impact = vy[j];
      }
      // The frame before must not already be at rest on the floor.
      const prevRest = Number.isFinite(up[k - 1]) && up[k - 1] <= ON_FLOOR && Math.abs(vy[k - 1]) < DROP_SPEED * 0.5;
      if (!lifted || prevRest) continue;
      const songSec = Math.round(songSecOf(sync, series.t[k]) * 1e6) / 1e6;
      if (songSec - last < MIN_FOOTFALL_GAP_SEC) continue;
      last = songSec;
      const px = pts.map((i) => series.px[k][2 * i]).filter(Number.isFinite);
      const x = px.length ? px.reduce((a, b) => a + b, 0) / px.length / series.width : NaN;
      out.push({ songSec, foot, x: Math.round(x * 1e4) / 1e4, y: Math.round((y[k] / series.height) * 1e4) / 1e4, impact: Math.round(impact * 100) / 100 });
    }
  }
  return out.sort((a, b) => a.songSec - b.songSec || a.foot.localeCompare(b.foot));
}

export function buildTrace(cap: PoseCapture, sync: Pick<CaptureSync, "songAtCapture0">): Trace {
  const series = bodySeries(cap);
  return { cap, songAtCapture0: sync.songAtCapture0, series, footfalls: footfalls(series, sync) };
}

/**
 * Kirtled floor lights for footfalls (rhythm only, never a chord: the harmony
 * stays HOLD until a person approves it, D8-25). The left foot walks arm B and
 * the right foot arm C, one triangle further from the hub each step, round the
 * strip's loop (D8-21: each strip is a loop). Times stay song seconds.
 */
export function floorHits(falls: readonly Footfall[]): { sec: number; triangle: string; hand: "left" | "right"; lights: string[] }[] {
  const next = { left: 0, right: 0 };
  return falls.map((f) => {
    const k = next[f.foot]++ % 8;
    const triangle = `${f.foot === "left" ? "B" : "C"}${k + 1}`;
    return { sec: f.songSec, triangle, hand: f.foot, lights: [triangle] };
  });
}
