/**
 * A synthetic dancer for the move tests (canon D8-17). No real person: a
 * scripted stick body, projected through a phone-like camera, with the same
 * 33 points and conventions MediaPipe Pose gives (image x, y as fractions of
 * the frame, y down; world in metres from the hip midpoint, y down, z away
 * from the camera), plus seeded tracking noise.
 */
import { P, type PoseCapture, type PoseFrame } from "../../lib/dance8/contracts/moves";

export interface DancerState {
  /** Metres to the right of the camera axis. */
  x: number;
  /** Metres from the camera. */
  depth: number;
  /** Hip midpoint over the floor, metres (0.96 standing). */
  hipHeight: number;
  /** Degrees; 0 faces the camera. */
  yaw: number;
  /** 0 arms hanging, 1 overhead. */
  armLift: number;
  /** Metres the wrists swing forward (left) and back (right). */
  armSwing: number;
  headNod: number;
  /** Each foot's lift over the floor, metres (left, right). */
  footLift: [number, number];
}

export const STAND: DancerState = { x: 0, depth: 3.5, hipHeight: 0.96, yaw: 0, armLift: 0, armSwing: 0, headNod: 0, footLift: [0, 0] };

export interface Camera { width: number; height: number; focalPx: number; heightM: number }
export const PHONE: Camera = { width: 720, height: 1280, focalPx: 0.8 * 1280, heightM: 1.0 };

/** Local body points: [lateral (left +), up, forward] in metres from the hip midpoint. */
function localPoints(s: DancerState): [number, number, number][] {
  const pts: [number, number, number][] = Array.from({ length: 33 }, () => [0, 0, 0]);
  const set = (k: number, a: number, u: number, f: number) => { pts[k] = [a, u, f]; };
  const nod = s.headNod;
  set(P.nose, 0, 0.68 - nod, 0.09);
  for (const [k, a, f] of [[P.left_eye_inner, 0.02, 0.08], [P.left_eye, 0.035, 0.08], [P.left_eye_outer, 0.05, 0.075]] as const) { set(k, a, 0.71 - nod, f); }
  for (const [k, a, f] of [[P.right_eye_inner, -0.02, 0.08], [P.right_eye, -0.035, 0.08], [P.right_eye_outer, -0.05, 0.075]] as const) { set(k, a, 0.71 - nod, f); }
  set(P.left_ear, 0.075, 0.67 - nod, 0); set(P.right_ear, -0.075, 0.67 - nod, 0);
  set(P.mouth_left, 0.03, 0.63 - nod, 0.08); set(P.mouth_right, -0.03, 0.63 - nod, 0.08);
  set(P.left_shoulder, 0.19, 0.5, 0); set(P.right_shoulder, -0.19, 0.5, 0);
  const lift = s.armLift;
  const lerp = (a: number, b: number) => a + (b - a) * lift;
  for (const side of [1, -1]) {
    const L = side === 1;
    const swing = L ? s.armSwing : -s.armSwing;
    set(L ? P.left_elbow : P.right_elbow, side * lerp(0.24, 0.3), lerp(0.24, 0.75), swing / 2);
    set(L ? P.left_wrist : P.right_wrist, side * lerp(0.26, 0.3), lerp(0.0, 1.0), swing);
    const w = pts[L ? P.left_wrist : P.right_wrist];
    set(L ? P.left_pinky : P.right_pinky, w[0] + side * 0.02, w[1] - 0.06, w[2]);
    set(L ? P.left_index : P.right_index, w[0], w[1] - 0.07, w[2] + 0.02);
    set(L ? P.left_thumb : P.right_thumb, w[0] - side * 0.01, w[1] - 0.04, w[2] + 0.03);
    set(L ? P.left_hip : P.right_hip, side * 0.1, 0, 0);
    const footUp = s.footLift[L ? 0 : 1];
    const leg = Math.max(0.1, s.hipHeight - 0.08 - footUp);
    const kneeF = leg < 0.9 ? Math.sqrt(Math.max(0, 0.45 * 0.45 - (leg / 2) ** 2)) : 0;
    set(L ? P.left_knee : P.right_knee, side * 0.1, -leg / 2, kneeF);
    set(L ? P.left_ankle : P.right_ankle, side * 0.1, -leg, 0);
    set(L ? P.left_heel : P.right_heel, side * 0.1, -leg - 0.04, -0.05);
    set(L ? P.left_foot_index : P.right_foot_index, side * 0.1, -leg - 0.05, 0.13);
  }
  return pts;
}

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface SynthOptions {
  fps?: number;
  camera?: Camera;
  /** Tracking noise: image pixels and world metres (1 sigma). */
  noisePx?: number;
  noiseM?: number;
  seed?: number;
  /** Swap left and right labels while the back faces the camera, as pose trackers sometimes do. */
  swapWhenBack?: boolean;
  /** Frames (by index) with no body found. */
  lost?: (i: number) => boolean;
}

/** Renders a choreography (capture seconds → state) into a PoseCapture. */
export function synthCapture(stateAt: (t: number) => DancerState, durationSec: number, o: SynthOptions = {}): PoseCapture {
  const fps = o.fps ?? 30, cam = o.camera ?? PHONE, rnd = mulberry32(o.seed ?? 7);
  const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const npx = o.noisePx ?? 1.5, nm = o.noiseM ?? 0.01;
  const frames: PoseFrame[] = [];
  const n = Math.round(durationSec * fps);
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    if (o.lost?.(i)) { frames.push({ t, image: null, world: null }); continue; }
    const s = stateAt(t);
    const th = (s.yaw * Math.PI) / 180;
    const left = [Math.cos(th), 0, Math.sin(th)], fwd = [Math.sin(th), 0, -Math.cos(th)];
    let pts = localPoints(s).map(([a, u, f]) => [a * left[0] + f * fwd[0], -u, a * left[2] + f * fwd[2]]);
    const back = Math.cos(th) < -0.3;
    if (o.swapWhenBack && back) {
      const sw = pts.slice();
      for (let k = 1; k < 33; k++) {
        const name = Object.keys(P).find((q) => P[q as keyof typeof P] === k)!;
        const twin = name.startsWith("left_") ? name.replace("left_", "right_") : name.startsWith("right_") ? name.replace("right_", "left_") : name;
        sw[k] = pts[P[twin as keyof typeof P]];
      }
      pts = sw;
    }
    const faceVis = Math.cos(th) > 0.2 ? 0.98 : Math.cos(th) < -0.2 ? 0.15 : 0.5;
    const image: number[] = [], world: number[] = [];
    pts.forEach(([wx, wy, wz], k) => {
      const xc = s.x + wx, yc = cam.heightM - s.hipHeight + wy, zc = s.depth + wz;
      const u = cam.width / 2 + (cam.focalPx * xc) / zc + npx * gauss();
      const v = cam.height / 2 + (cam.focalPx * yc) / zc + npx * gauss();
      const vis = k <= P.mouth_right ? faceVis : 0.95;
      image.push(u / cam.width, v / cam.height, (wz * cam.focalPx) / (s.depth * cam.width), vis);
      world.push(wx + nm * gauss(), wy + nm * gauss(), wz + nm * gauss(), vis);
    });
    frames.push({ t, image, world });
  }
  return {
    schemaVersion: 1, takeId: "synthetic", fps,
    video: { file: "synthetic.mp4", sha256: "0".repeat(64), width: cam.width, height: cam.height, durationSec, videoStartSec: 0, audioStartSec: 0 },
    model: { id: "synthetic", sha256: "0".repeat(64), library: "tests/dance8/synthDancer.ts", delegate: "CPU" },
    capturedAt: "2026-10-19T00:00:00Z",
    frames,
  };
}

const smoothstep = (x: number) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/**
 * The scripted test dance at 100 BPM, bar 0 at song 0.5 s, video starting at
 * song 0.2 s (so capture t = song - 0.2). Each move sits in its own bar:
 *   0-1 groove · 2 travel 0.9 m right · 3 groove · 4 spin 360 · 5 groove ·
 *   6 drop to low on beat 0 · 7 rise on beat 0 · 8 jump on beat 2 ·
 *   9 right-foot stomps on beats 1 and 3 · 10 freeze beats 0-2 · 11 groove.
 */
export const SCRIPT = { bpm: 100, firstDownbeatSec: 0.5, songAtCapture0: 0.2, bars: 12 };

export function scriptedDance(t: number): DancerState {
  const beat = 60 / SCRIPT.bpm;
  const song = t + SCRIPT.songAtCapture0;
  const pos = (song - SCRIPT.firstDownbeatSec) / beat; // beats from bar 0
  const b = Math.floor(pos / 4), k = pos - 4 * b;     // bar, beat in bar (fractional)
  const s: DancerState = { ...STAND, footLift: [0, 0] };
  // The groove: a bounce on every beat, arms swinging, a nod, a little hip sway.
  const ph = 2 * Math.PI * pos;
  const groove = (amt: number) => {
    s.hipHeight = 0.96 - amt * 0.03 * (1 - Math.cos(ph)) / 2;
    s.armSwing = amt * 0.18 * Math.sin(ph / 2);
    s.headNod = amt * 0.015 * (1 - Math.cos(ph)) / 2;
    s.x += amt * 0.04 * Math.sin(ph / 2);
  };
  // Where the dancer stands: 0.9 m right after bar 2.
  s.x = b < 2 ? 0 : b === 2 ? 0.9 * smoothstep(k / 4) : 0.9;
  const ease = (from: number, to: number, x: number) => from + (to - from) * smoothstep(x);
  if (b === 10 && k < 3) return { ...s, hipHeight: 0.96, armSwing: 0, headNod: 0 }; // freeze
  if (b === 9 && k >= 3.6) { groove(ease(1, 0, (k - 3.6) / 0.4)); return s; }       // settle into the freeze
  groove(1);
  if (b === 4) s.yaw = 360 * smoothstep(k / 3.6);
  if (b === 6) s.hipHeight = ease(0.96, 0.6, k / 0.5) - 0.01 * (1 - Math.cos(ph)) / 2;
  if (b === 7) s.hipHeight = ease(0.6, 0.96, k / 0.5) - 0.01 * (1 - Math.cos(ph)) / 2;
  if (b === 8) {
    const air = 0.4 / beat, k0 = 2 - air / 2;
    if (k >= k0 && k < k0 + air) { const h = 0.3 * Math.sin((Math.PI * (k - k0)) / air); s.hipHeight += h; s.footLift = [h, h]; }
  }
  if (b === 9) {
    for (const hit of [1, 3]) {
      const d = k - hit; // beats relative to the stomp: lift, then slam down in about 70 ms
      if (d > -0.6 && d <= -0.12) s.footLift[1] = 0.2 * smoothstep((d + 0.6) / 0.48);
      else if (d > -0.12 && d < 0) s.footLift[1] = 0.2 * (-d / 0.12);
    }
  }
  return s;
}
