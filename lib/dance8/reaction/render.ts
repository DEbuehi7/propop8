// lib/dance8/reaction/render.ts
//
// Draws a planned window frame by frame. Brightness and size follow the
// measured energy, smoothed so nothing strobes; onset-like peaks become
// travelling light (never a beat mark); verified chord changes become a
// landing ring on the floor. Reduced motion keeps every line still and lets
// only a one-second average of the loudness change the brightness. Pure: the
// same track, window and features give the same bytes.

import { createHash } from "node:crypto";
import type { FeatureName } from "../../stuttr/visualFeatures";
import { INTENSITIES, type PlannedWindow, type ReactionEvent, type ReactionTrack } from "./contracts";
import { LightBuffer, PALETTE, rng, type RGB } from "./draw";

export type Features = Record<FeatureName, Float64Array>;

const FADE_FRAMES = 8;
/** Largest brightness change between frames: 4% normally, 1% in reduced motion. */
const MAX_STEP = { normal: 0.04, reduced: 0.01 };
const KNOT_SEC = 0.6;

/** One-pole follower with separate attack and release, warmed up on the frames before the window. */
export function follow(series: Float64Array, start: number, frames: number, attack: number, release: number, preRoll = 24): Float64Array {
  const out = new Float64Array(frames);
  let v = series[Math.max(0, start - preRoll)] ?? 0;
  for (let m = Math.max(0, start - preRoll); m < start + frames; m++) {
    const x = series[Math.min(series.length - 1, m)] ?? 0;
    v += (x - v) * (x > v ? attack : release);
    if (m >= start) out[m - start] = v;
  }
  return out;
}

/** Centred moving average over 2 * half + 1 frames (reduced motion). */
export function average(series: Float64Array, start: number, frames: number, half = 12): Float64Array {
  const out = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    let s = 0;
    let n = 0;
    for (let m = start + k - half; m <= start + k + half; m++) {
      if (m < 0 || m >= series.length) continue;
      s += series[m];
      n++;
    }
    out[k] = n ? s / n : 0;
  }
  return out;
}

interface Env { rms: Float64Array; low: Float64Array; mid: Float64Array; high: Float64Array; bright: Float64Array; travel: Float64Array }

function envelopes(w: PlannedWindow, f: Features, reduced: boolean): Env {
  const pick = (n: FeatureName) => (reduced ? average(f[n], w.startFrame, w.frames) : follow(f[n], w.startFrame, w.frames, 0.5, 0.12));
  const rms = pick("rms");
  const low = pick("low");
  const mid = pick("mid");
  const high = pick("high");
  const gain = INTENSITIES[w.intensity];
  const step = reduced ? MAX_STEP.reduced : MAX_STEP.normal;
  const bright = new Float64Array(w.frames);
  let b = gain * (0.3 + 0.7 * rms[0]);
  for (let k = 0; k < w.frames; k++) {
    const target = gain * (0.3 + 0.7 * rms[k]);
    b += Math.max(-step, Math.min(step, target - b));
    const fade = Math.min(1, (k + 1) / FADE_FRAMES, (w.frames - k) / FADE_FRAMES);
    bright[k] = b * fade;
  }
  // How far lane light has travelled: the running sum of mid energy (still in reduced motion).
  const travel = new Float64Array(w.frames);
  let s = 0;
  for (let k = 0; k < w.frames; k++) {
    if (!reduced) s += 0.012 + 0.03 * mid[k];
    travel[k] = s;
  }
  return { rms, low, mid, high, bright, travel };
}

interface Px { x: number; y: number; w: number; h: number }
const zonePx = (w: PlannedWindow, W: number, H: number): Px => ({ x: w.zone.x * W, y: w.zone.y * H, w: w.zone.w * W, h: w.zone.h * H });

/** Events in this window that are alive on music frame m, with their age 0-1. */
function alive(events: ReactionEvent[], kind: ReactionEvent["kind"], m: number, rate: number, life = KNOT_SEC): { e: ReactionEvent; age: number }[] {
  const out: { e: ReactionEvent; age: number }[] = [];
  for (const e of events) {
    if (e.kind !== kind) continue;
    const age = (m - e.frame) / (life * rate);
    if (age >= 0 && age < 1) out.push({ e, age });
  }
  return out;
}

function loom(buf: LightBuffer, w: PlannedWindow, z: Px, k: number, t: number, env: Env, ev: ReactionEvent[], rate: number, reduced: boolean): void {
  const r = rng(w.seed);
  const T = 7;
  const colours: RGB[] = [PALETTE.white, PALETTE.gold, PALETTE.cyan, PALETTE.brown, PALETTE.magenta, PALETTE.white, PALETTE.gold];
  const threads = Array.from({ length: T }, (_, i) => ({ f: 1.2 + r() * 1.6, ph: r() * Math.PI * 2, om: reduced ? 0 : 0.6 + r() * 0.8, y: z.y + (z.h * (i + 0.5)) / T, c: colours[i] }));
  const b = env.bright[k];
  const amp = (z.h / T) * (reduced ? 0.22 : 0.35 * (0.25 + 0.75 * env.low[k]));
  const S = 48;
  const yAt = (th: (typeof threads)[number], s: number) => th.y + amp * Math.sin(2 * Math.PI * th.f * s + th.ph + th.om * t);
  for (const th of threads) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= S; i++) pts.push([z.x + (z.w * i) / S, yAt(th, i / S)]);
    buf.polyline(pts, 1.8, th.c, b * 0.85);
  }
  const m = w.startFrame + k;
  for (const kind of ["onset_like", "lyric_chop"] as const) {
    for (const { e, age } of alive(ev, kind, m, rate)) {
      const fall = (1 - age) * (1 - age);
      const th = threads[rng(w.seed ^ e.frame)() * T | 0];
      const x = z.x + z.w * age;
      // The knot is clipped to the zone, so it never pokes past the threads' ends.
      const xa = Math.max(z.x, x - 22);
      const xb = Math.min(z.x + z.w, x + 22);
      buf.glow(xa, yAt(th, (xa - z.x) / z.w), xb, yAt(th, (xb - z.x) / z.w), 3, kind === "lyric_chop" ? PALETTE.magenta : PALETTE.gold, b * fall * 1.6);
      buf.glow(x, z.y, x, z.y + z.h, 1.2, PALETTE.white, b * fall * 0.45);
    }
  }
}

function cypher(buf: LightBuffer, w: PlannedWindow, z: Px, k: number, env: Env, ev: ReactionEvent[], rate: number, reduced: boolean): void {
  const b = env.bright[k];
  // The stage ring marks where the performer stands; three floor rays leave it 120 degrees apart in plan
  // (the TRI-01 seed seen in perspective) and start outside the ring, so they stay clear of a performer
  // standing in it. The zone is set per window to match the footage.
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h * 0.4;
  const rx = z.w * 0.16;
  const ry = z.h * 0.18;
  const ring = (scale: number): [number, number][] => Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    return [cx + rx * scale * Math.cos(a), cy + ry * scale * Math.sin(a)];
  });
  const R0 = 1.25;
  const R1 = 3.4;
  // Beyond the ring, rays toward the camera are stretched, as the floor nearer the lens is in perspective.
  const floor = (theta: number, r: number): [number, number] => {
    const near = Math.sin(theta) > 0 && r > R0 ? R0 + (r - R0) * 2.4 : r;
    return [cx + rx * r * Math.cos(theta), cy + ry * near * Math.sin(theta)];
  };
  const rays: { theta: number; c: RGB }[] = [{ theta: Math.PI / 2, c: PALETTE.gold }, { theta: Math.PI / 2 + (2 * Math.PI) / 3, c: PALETTE.cyan }, { theta: Math.PI / 2 + (4 * Math.PI) / 3, c: PALETTE.magenta }];
  // Where a ray leaves the zone, so lines stop at its edge.
  const inside = ([x, y]: [number, number]) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  const reach = (theta: number) => { let r = R0; while (r < R1 && inside(floor(theta, r + 0.05))) r += 0.05; return r; };
  buf.polyline(ring(1), 1.2, PALETTE.white, b * 0.45);
  const r = rng(w.seed);
  for (const ray of rays) {
    const end = reach(ray.theta);
    if (end <= R0) continue;
    const [x0, y0] = floor(ray.theta, R0);
    const [x1, y1] = floor(ray.theta, end);
    buf.glow(x0, y0, x1, y1, 1.4, ray.c, b * 0.7);
    const D = 5;
    const off = r();
    for (let d = 0; d < D; d++) {
      const s = (((env.travel[k] + off + d / D) % 1) + 1) % 1;
      const a = R0 + (end - R0) * s;
      const [ax, ay] = floor(ray.theta, a);
      const [bx, by] = floor(ray.theta, Math.min(end, a + (end - R0) * 0.07));
      buf.glow(ax, ay, bx, by, 2.4, ray.c, b * 0.9);
    }
  }
  const m = w.startFrame + k;
  if (!reduced) {
    for (const { e, age } of alive(ev, "onset_like", m, rate)) {
      const ray = rays[rng(w.seed ^ e.frame)() * 3 | 0];
      const end = reach(ray.theta);
      const a = R0 + (end - R0) * age;
      const [ax, ay] = floor(ray.theta, a);
      const [bx, by] = floor(ray.theta, Math.min(end, a + (end - R0) * 0.12));
      buf.glow(ax, ay, bx, by, 2.8, PALETTE.white, b * (1 - age) * (1 - age) * 1.5);
    }
  }
  // Landing rings only on chord changes a person verified (D8-16).
  for (const { age } of alive(ev, "chord_change", m, rate, 0.5)) {
    buf.polyline(ring(reduced ? 1.12 : 1 + 0.35 * age), 2, PALETTE.gold, b * (reduced ? 0.7 : (1 - age) * 1.4));
  }
}

function chamber(buf: LightBuffer, w: PlannedWindow, z: Px, k: number, t: number, env: Env, reduced: boolean): void {
  const b = env.bright[k];
  const cx = z.x + z.w / 2;
  const cy = z.y + z.h / 2;
  // Outer contour (about 2.5 R) plus spikes stay inside half the zone's short side.
  const R = Math.min(z.w, z.h) * 0.16;
  const r = rng(w.seed);
  const theta0 = -Math.PI / 2 + (r() - 0.5) * 0.4 + (reduced ? 0 : 0.05 * t);
  const colours: RGB[] = [PALETTE.cyan, PALETTE.gold, PALETTE.magenta];
  const N = 96;
  let outer: [number, number][] = [];
  for (let j = 0; j < 3; j++) {
    const base = R * (1 + 0.45 * j) * (reduced ? 1 : 1 + 0.12 * env.low[k]);
    const kj = 9 + 3 * j;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 2 * Math.PI;
      const ripple = reduced ? 0 : 0.05 * env.high[k] * Math.sin(kj * a + 2.1 * t);
      const rad = base * (1 + 0.12 * Math.cos(3 * (a - theta0)) + ripple);
      pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
    }
    buf.polyline(pts, 1.6, colours[j], b * (0.95 - 0.15 * j));
    outer = pts;
  }
  if (reduced) return;
  // Spikes, inspired by ferrofluid but simulated: lengths follow mid energy, not a magnetic field.
  const spikes = 18;
  for (let i = 0; i < spikes; i++) {
    const p = outer[Math.floor(r() * N)];
    const lenScale = 0.5 + 0.5 * r();
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    const d = Math.hypot(dx, dy) || 1;
    const len = R * 0.45 * env.mid[k] * lenScale;
    buf.glow(p[0], p[1], p[0] + (dx / d) * len, p[1] + (dy / d) * len, 1.4, PALETTE.gold, b * 0.95);
  }
}

export interface RenderedWindow {
  frames: number;
  /** sha256 over every raw RGB frame: the repeatability anchor, independent of the video encoder. */
  framesSha256: string;
}

/**
 * The window's frames one at a time (RGB, width x height), so a long window
 * never sits in memory. Throws when the window is held: callers fall back to
 * the source footage.
 */
export function* frameStream(track: ReactionTrack, w: PlannedWindow, f: Features, size: { width: number; height: number }): Generator<Uint8Array> {
  if (!w.renderable) throw new Error(`window ${w.id} is held: nothing is drawn`);
  const reduced = track.reducedMotion;
  const rate = track.fps.num / track.fps.den;
  const env = envelopes(w, f, reduced);
  const ev = track.events.filter((e) => e.window === w.id);
  const buf = new LightBuffer(size.width, size.height);
  const z = zonePx(w, size.width, size.height);
  for (let k = 0; k < w.frames; k++) {
    buf.clear();
    const t = (w.startFrame + k) / rate;
    if (w.family === "GENOME_LOOM") loom(buf, w, z, k, t, env, ev, rate, reduced);
    else if (w.family === "ALGORITHMIC_CYPHER") cypher(buf, w, z, k, env, ev, rate, reduced);
    else chamber(buf, w, z, k, t, env, reduced);
    yield buf.toRgb24();
  }
}

/** Renders a whole window, handing each frame to `onFrame`, and hashes the raw frames. */
export function renderWindow(
  track: ReactionTrack, w: PlannedWindow, f: Features, size: { width: number; height: number },
  onFrame: (k: number, rgb: Uint8Array) => void = () => {},
): RenderedWindow {
  const hash = createHash("sha256");
  let k = 0;
  for (const rgb of frameStream(track, w, f, size)) {
    hash.update(rgb);
    onFrame(k++, rgb);
  }
  return { frames: k, framesSha256: hash.digest("hex") };
}

/**
 * Flash count, for the photosensitivity check: the frame is cut into a 4 x 4
 * grid; a flash is a rise and a fall of at least 10% of full brightness in one
 * tile. Returns the most flashes any tile has inside any one second.
 */
export function maxFlashesPerSecond(tileLuma: Float64Array[], rate: number): number {
  let worst = 0;
  for (const series of tileLuma) {
    const flashes: number[] = [];
    let lo = series[0] ?? 0;
    let hi = series[0] ?? 0;
    let rising = true;
    for (let k = 1; k < series.length; k++) {
      const v = series[k];
      if (rising) {
        if (v > hi) hi = v;
        if (hi - v >= 0.1 && hi - lo >= 0.1) { flashes.push(k); rising = false; lo = v; }
        else if (v < lo) { lo = v; hi = v; }
      } else {
        if (v < lo) lo = v;
        if (v - lo >= 0.1) { rising = true; hi = v; }
      }
    }
    for (let i = 0; i < flashes.length; i++) {
      let n = 0;
      for (let j = i; j < flashes.length && flashes[j] - flashes[i] < rate; j++) n++;
      worst = Math.max(worst, n);
    }
  }
  return worst;
}

/** Mean brightness (0-1) of each tile of a 4 x 4 grid. */
export function tileLuma(rgb: Uint8Array, width: number, height: number, grid = 4): number[] {
  const out = new Array(grid * grid).fill(0);
  const counts = new Array(grid * grid).fill(0);
  for (let y = 0; y < height; y++) {
    const ty = Math.min(grid - 1, Math.floor((y * grid) / height));
    for (let x = 0; x < width; x++) {
      const tx = Math.min(grid - 1, Math.floor((x * grid) / width));
      const i = (y * width + x) * 3;
      out[ty * grid + tx] += (0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]) / 255;
      counts[ty * grid + tx]++;
    }
  }
  return out.map((v, i) => v / counts[i]);
}
