// lib/dance8/moves/body.ts
//
// Per-frame body measurements from a PoseCapture, in the dancer's own units so
// distance from the camera does not change them: lengths are in torso lengths
// (shoulder midpoint to hip midpoint, a rolling median), widths in body-widths
// (the take's shoulder width when facing the camera). Pure and deterministic:
// the same capture gives the same numbers.

import { P, type PoseCapture } from "../contracts/moves";

/** A frame counts when the shoulders and hips are this visible on average. */
export const MIN_CORE_VISIBILITY = 0.5;
/** A foot point counts toward the floor line when at least this visible. */
export const MIN_FOOT_VISIBILITY = 0.3;
/** Window for the rolling torso length (seconds either side). */
export const SCALE_WINDOW_SEC = 1;
/** Window for the rolling floor line (seconds either side). */
export const FLOOR_WINDOW_SEC = 2;
/** Feet this far above the floor line (torso lengths) count as off the floor. */
export const AIR_FOOT = 0.15;
/** Phone cameras see about 64 degrees across the long side: focal length ≈ 0.8 × the long side in pixels. */
export const FOCAL_PER_LONG_SIDE = 0.8;
/** An adult torso (shoulder midpoint to hip midpoint) is about half a metre: turns 3D metres into torso lengths. */
export const TORSO_M = 0.5;
/** Frames either side averaged for the 3D depth of each point. */
export const WORLD_Z_SMOOTH = 3;

const CORE = [P.left_shoulder, P.right_shoulder, P.left_hip, P.right_hip];
const LEFT_FOOT = [P.left_ankle, P.left_heel, P.left_foot_index];
const RIGHT_FOOT = [P.right_ankle, P.right_heel, P.right_foot_index];
/** Joints whose speed is the body's energy. */
export const ENERGY_JOINTS = [P.nose, P.left_shoulder, P.right_shoulder, P.left_elbow, P.right_elbow, P.left_wrist, P.right_wrist,
  P.left_hip, P.right_hip, P.left_knee, P.right_knee, P.left_ankle, P.right_ankle];

export interface BodySeries {
  fps: number;
  /** Capture seconds per frame. */
  t: Float64Array;
  /** 1 when the frame has a usable body. */
  ok: Uint8Array;
  /** Mean visibility of the core joints (0 when no body). */
  vis: Float64Array;
  /** Pixel positions, 33 × [x, y] per frame (NaN when no body). */
  px: Float64Array[];
  /** 3D positions from the hip midpoint in metres, 33 × [x, y, z] per frame (NaN when absent). */
  wpts: Float64Array[];
  /** Depth (z) of each point from the 3D estimate, smoothed over ±WORLD_Z_SMOOTH frames: depth is the noisiest axis. */
  wz: Float64Array[];
  hipX: Float64Array;
  hipY: Float64Array;
  /** Rolling torso length in pixels. */
  scale: Float64Array;
  /** The take's shoulder width when facing the camera, in torso lengths. */
  bodyWidthRatio: number;
  /** Rolling floor line (pixel y of the feet on the floor). */
  floorY: Float64Array;
  /** Lowest point of each foot (pixel y; NaN when not visible). */
  footY: [Float64Array, Float64Array];
  /** Hip height over the floor in torso lengths. */
  hipHeight: Float64Array;
  /** Both feet off the floor. */
  airborne: Uint8Array;
  /** Hip height against standing height (1 standing). */
  levelRatio: Float64Array;
  /** Turn so far in degrees, unwrapped, with left/right label swaps undone. */
  yaw: Float64Array;
  /** 1 facing the camera, -1 back to it, 0 unsure. */
  facing: Int8Array;
  /** Focal length in pixels (for toward/away travel). */
  focalPx: number;
  width: number;
  height: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const quantile = (xs: ArrayLike<number>, q: number) => {
  const s = Array.from(xs).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1) + 0.5)))];
};
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/** Rolling statistic of finite values in [i - r, i + r]. */
function rolling(x: Float64Array, r: number, stat: (w: number[]) => number): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const w: number[] = [];
    for (let j = Math.max(0, i - r); j <= Math.min(x.length - 1, i + r); j++) if (Number.isFinite(x[j])) w.push(x[j]);
    out[i] = w.length ? stat(w) : NaN;
  }
  return out;
}

/** Centered moving average over finite values (radius in frames). */
export function smooth(x: Float64Array, r: number): Float64Array {
  return rolling(x, r, (w) => w.reduce((a, b) => a + b, 0) / w.length);
}

export function bodySeries(cap: PoseCapture): BodySeries {
  const n = cap.frames.length;
  const { width: W, height: H } = cap.video;
  const fps = cap.fps;
  const t = new Float64Array(n), ok = new Uint8Array(n), vis = new Float64Array(n);
  const px: Float64Array[] = [], wpts: Float64Array[] = [];
  const hipX = new Float64Array(n).fill(NaN), hipY = new Float64Array(n).fill(NaN);
  const torso = new Float64Array(n).fill(NaN), shoulderW = new Float64Array(n).fill(NaN);
  const lowFoot = new Float64Array(n).fill(NaN);
  const footY: [Float64Array, Float64Array] = [new Float64Array(n).fill(NaN), new Float64Array(n).fill(NaN)];
  const rawYaw = new Float64Array(n).fill(NaN);
  const front = new Float64Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const f = cap.frames[i];
    t[i] = f.t;
    const p = new Float64Array(66).fill(NaN), wp = new Float64Array(99).fill(NaN);
    px.push(p); wpts.push(wp);
    if (f.world) for (let k = 0; k < 33; k++) { wp[3 * k] = f.world[4 * k]; wp[3 * k + 1] = f.world[4 * k + 1]; wp[3 * k + 2] = f.world[4 * k + 2]; }
    if (!f.image) continue;
    const im = f.image;
    for (let k = 0; k < 33; k++) { p[2 * k] = im[4 * k] * W; p[2 * k + 1] = im[4 * k + 1] * H; }
    const v = CORE.reduce((a, k) => a + im[4 * k + 3], 0) / CORE.length;
    vis[i] = v;
    if (v < MIN_CORE_VISIBILITY) continue;
    ok[i] = 1;
    const mx = (a: number, b: number) => (p[2 * a] + p[2 * b]) / 2, my = (a: number, b: number) => (p[2 * a + 1] + p[2 * b + 1]) / 2;
    hipX[i] = mx(P.left_hip, P.right_hip); hipY[i] = my(P.left_hip, P.right_hip);
    torso[i] = Math.hypot(mx(P.left_shoulder, P.right_shoulder) - hipX[i], my(P.left_shoulder, P.right_shoulder) - hipY[i]);
    shoulderW[i] = Math.hypot(p[2 * P.left_shoulder] - p[2 * P.right_shoulder], p[2 * P.left_shoulder + 1] - p[2 * P.right_shoulder + 1]);
    [LEFT_FOOT, RIGHT_FOOT].forEach((foot, s) => {
      let y = -Infinity;
      for (const k of foot) if (im[4 * k + 3] >= MIN_FOOT_VISIBILITY) y = Math.max(y, p[2 * k + 1]);
      if (y > -Infinity) footY[s][i] = y;
    });
    const lf = Math.max(Number.isFinite(footY[0][i]) ? footY[0][i] : -Infinity, Number.isFinite(footY[1][i]) ? footY[1][i] : -Infinity);
    if (lf > -Infinity) lowFoot[i] = lf;
    if (f.world) {
      const w = f.world;
      // Left minus right, shoulders and hips together, in the floor plane: 0° faces the camera.
      const vx = (w[4 * P.left_shoulder] - w[4 * P.right_shoulder] + w[4 * P.left_hip] - w[4 * P.right_hip]) / 2;
      const vz = (w[4 * P.left_shoulder + 2] - w[4 * P.right_shoulder + 2] + w[4 * P.left_hip + 2] - w[4 * P.right_hip + 2]) / 2;
      rawYaw[i] = (Math.atan2(vz, vx) * 180) / Math.PI;
    }
    const nose = im[4 * P.nose + 3];
    front[i] = nose >= 0.6 ? 1 : nose < 0.35 ? -1 : 0;
  }

  const wz: Float64Array[] = Array.from({ length: n }, () => new Float64Array(33).fill(NaN));
  for (let k = 0; k < 33; k++) {
    const z = smooth(Float64Array.from(wpts, (w) => w[3 * k + 2]), WORLD_Z_SMOOTH);
    for (let i = 0; i < n; i++) wz[i][k] = z[i];
  }
  const scale = rolling(torso, Math.round(SCALE_WINDOW_SEC * fps), median);
  const bodyWidthRatio = quantile(Array.from(shoulderW, (w, i) => w / scale[i]), 0.9) || 0.8;
  const floorY = rolling(lowFoot, Math.round(FLOOR_WINDOW_SEC * fps), (w) => quantile(w, 0.9));
  const hipHeight = new Float64Array(n).fill(NaN), airborne = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    hipHeight[i] = (floorY[i] - hipY[i]) / scale[i];
    if (Number.isFinite(lowFoot[i]) && (floorY[i] - lowFoot[i]) / scale[i] > AIR_FOOT) airborne[i] = 1;
  }
  const standing = quantile(Array.from(hipHeight).filter((_, i) => ok[i] && !airborne[i]), 0.75);
  const levelRatio = hipHeight.map((h) => h / standing);

  // Yaw: unwrap, and undo a left/right label swap (a jump of about 180° in one frame;
  // a real spin turns at most ~25° a frame at 30 fps).
  const yaw = new Float64Array(n).fill(NaN);
  let acc = NaN, prev = NaN;
  for (let i = 0; i < n; i++) {
    if (!ok[i] || !Number.isFinite(rawYaw[i])) continue;
    if (!Number.isFinite(prev)) { acc = 0; prev = rawYaw[i]; yaw[i] = 0; continue; }
    let d = wrap(rawYaw[i] - prev);
    if (Math.abs(d) > 100) d = wrap(d - 180);
    acc += d;
    prev = prev + d; // track the corrected heading, not the raw label
    yaw[i] = acc;
  }
  // Facing: debounced over three frames.
  const facing = new Int8Array(n);
  let state = 0, run = 0, cand = 0;
  for (let i = 0; i < n; i++) {
    const f = Number.isFinite(front[i]) ? front[i] : 0;
    if (f !== 0 && f === cand) run++; else { cand = f; run = f !== 0 ? 1 : 0; }
    if (run >= 3) state = cand;
    facing[i] = state;
  }

  return {
    fps, t, ok, vis, px, wpts, wz, hipX, hipY, scale, bodyWidthRatio, floorY, footY, hipHeight, airborne, levelRatio, yaw, facing,
    focalPx: FOCAL_PER_LONG_SIDE * Math.max(W, H), width: W, height: H,
  };
}
