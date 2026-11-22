// lib/dance8/render/kirtledView.ts
//
// The Kirtled instrument drawn for the grid (canon D8-21): a Y of three equal
// arms at 120 degrees around a triangular hub, each arm one strip of eight
// triangles read from the hub out (KIRTLED_ARMS). Three views:
//
//   pattern   the beat's light: a gold pulse travels from the hub to the tips
//             once a bar on the verified grid and the hub warms on each
//             downbeat. A slow travelling light, never a flash (D8-03, D8-25).
//             Not a camera, and nothing is played.
//   overhead  the stand-in for CAM-KIR-01 until there is footage: the whole
//             instrument at rest, and on each played event (an approved event
//             map, harmony/eventMap.ts) the chord's triangles light and a ring
//             marks the hand on the triangle it plays.
//   detail    the stand-in for CAM-KIR-02: the same, close on the triangle the
//             block's first event plays, held for the whole block.
//
// Nothing lights without an event, and an event exists only for a chord a
// person verified (D8-25). Pure TypeScript on the reaction layer's light
// buffer, so a frame is the same bytes on every computer.

import { LightBuffer, PALETTE, type RGB } from "../reaction/draw";

export type Pt = readonly [number, number];
export interface KirtledGeometry {
  hub: [Pt, Pt, Pt];
  /** arms[a][k]: triangle k (0 = next to the hub) of arm a (A, B, C), as three corners. */
  arms: [Pt, Pt, Pt][][];
  /** Arm directions in degrees, screen coordinates (y down). */
  angles: number[];
}

/** Arm directions: the stem points down and the two branches up, 120 degrees apart. */
export const ARM_ANGLES = [90, 210, 330];

/**
 * The instrument fitted to a w x h box. Each strip alternates outward- and
 * inward-pointing equilateral triangles, eight in all, four and a half sides
 * long; the hub's corners sit between the arms, so each arm leaves a hub side.
 */
export function kirtledGeometry(w: number, h: number): KirtledGeometry {
  // Reach of an arm from the centre: hub inradius (0.29 side) + 4.5 sides, 47% of the short side.
  // The stem reaches down further than the branches reach up, so the centre sits a little high.
  const side = (Math.min(w, h) * 0.47) / 4.79;
  const cx = w / 2;
  const cy = h / 2 - Math.min(w, h) * 0.1175;
  const tri = (side * Math.sqrt(3)) / 2;
  const hubSide = tri * 1.15;
  const r0 = hubSide / (2 * Math.sqrt(3));
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (ang: number, along: number, across: number): Pt => {
    const a = rad(ang);
    return [cx + Math.cos(a) * along - Math.sin(a) * across, cy + Math.sin(a) * along + Math.cos(a) * across];
  };
  const hubR = hubSide / Math.sqrt(3);
  const hub = ARM_ANGLES.map((a) => at(a + 60, hubR, 0)) as [Pt, Pt, Pt];
  const arms = ARM_ANGLES.map((ang) => {
    const base = (i: number) => at(ang, r0 + i * side, -tri / 2);
    const top = (i: number) => at(ang, r0 + side / 2 + i * side, tri / 2);
    const out: [Pt, Pt, Pt][] = [];
    for (let k = 0; k < 8; k++) {
      const i = k >> 1;
      out.push(k % 2 === 0 ? [base(i), base(i + 1), top(i)] : [top(i), base(i + 1), top(i + 1)]);
    }
    return out;
  });
  return { hub, arms, angles: ARM_ANGLES };
}

export interface KirtledHit {
  /** Seconds from bar 0 (the first downbeat). */
  sec: number;
  /** The triangle played ("A1" .. "C8"). */
  triangle: string;
  hand: "left" | "right";
  /** The chord's triangles, lit until the next event. */
  lights: readonly string[];
}

export interface KirtledViewInput {
  width: number;
  height: number;
  fps: number;
  /** Seconds from bar 0 (the first downbeat) of the first frame. */
  startSec: number;
  frames: number;
  /** The verified tempo. */
  bpm: number;
  beatsPerBar: number;
  /** Default "pattern". */
  view?: "pattern" | "overhead" | "detail";
  /** Played events from a checked event map, in time order (overhead and detail only). */
  hits?: readonly KirtledHit[];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ARM_INDEX: Record<string, number> = { A: 0, B: 1, C: 2 };
const triAt = (g: KirtledGeometry, id: string) => g.arms[ARM_INDEX[id[0]]]?.[Number(id.slice(1)) - 1];
const centroid = (t: readonly Pt[]): Pt => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];

/** The instrument scaled `zoom` times about the centre of the box, then moved so `focus` sits in the middle. */
function zoomed(w: number, h: number, zoom: number, focus: string): KirtledGeometry {
  const g = kirtledGeometry(w * zoom, h * zoom);
  const f = triAt(g, focus);
  const [fx, fy] = f ? centroid(f) : [(w * zoom) / 2, (h * zoom) / 2];
  const dx = w / 2 - fx;
  const dy = h / 2 - fy;
  const move = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  return { hub: g.hub.map(move) as [Pt, Pt, Pt], arms: g.arms.map((arm) => arm.map((t) => t.map(move) as [Pt, Pt, Pt])), angles: g.angles };
}

/**
 * Draws one moment of a view into `buf` (cleared first). `t` is seconds from
 * bar 0; the pattern reads only its place in the bar, the overhead and detail
 * views light the chord of the last hit at or before `t`.
 */
export function drawKirtled(
  buf: LightBuffer, g: KirtledGeometry,
  o: { view: "pattern" | "overhead" | "detail"; t: number; barSec: number; lineW: number; hits?: readonly KirtledHit[] },
): void {
  const { view, t, barSec, lineW } = o;
  const hits = o.hits ?? [];
  buf.clear();
  if (view === "pattern") {
    const phase = (((t % barSec) + barSec) % barSec) / barSec; // 0 at the downbeat
    // Hub: warms at the downbeat and settles over the bar.
    const warm = Math.exp(-phase * 5);
    buf.polyline(g.hub, lineW * 1.6, mix(PALETTE.gold, PALETTE.white, warm * 0.5), 0.55 + 0.45 * warm, true);
    // The pulse: a soft head travelling hub to tip over the bar, with a fading tail.
    const head = phase * 8;
    g.arms.forEach((arm) => {
      arm.forEach((tri, k) => {
        const d = head - (k + 0.5);
        const pulse = d >= -0.6 && d <= 3 ? Math.exp(-((d < 0 ? d * 2.2 : d / 1.4) ** 2)) : 0;
        buf.polyline(tri, lineW * (1 + pulse * 0.9), mix(PALETTE.gold, PALETTE.white, pulse * 0.35), 0.22 + 0.78 * pulse, true, pulse > 0.05);
      });
    });
    return;
  }
  // At rest: every triangle in a steady base light, the hub a little brighter.
  buf.polyline(g.hub, lineW * 1.4, PALETTE.gold, 0.5, true, false);
  const cur = [...hits].reverse().find((x) => x.sec <= t + 1e-9);
  const lit = new Set(cur?.lights ?? []);
  const since = cur ? t - cur.sec : Infinity;
  const strike = Math.exp(-since / 0.35); // bright on the hit, settling to a held glow until the next event
  g.arms.forEach((arm, a) => {
    arm.forEach((tri, k) => {
      const id = `${"ABC"[a]}${k + 1}`;
      if (lit.has(id)) buf.polyline(tri, lineW * (1.8 + strike * 1.4), mix(PALETTE.cyan, PALETTE.white, strike * 0.5), 0.6 + 0.4 * strike, true, true);
      else buf.polyline(tri, lineW, PALETTE.gold, 0.3, true, false);
    });
  });
  // The hand: a ring closing on the triangle it plays, from a sixth of a second before the hit until it lifts.
  for (const x of hits) {
    const d = t - x.sec;
    if (d < -0.18 || d > 0.45) continue;
    const tri = triAt(g, x.triangle);
    if (!tri) continue;
    const [cx, cy] = centroid(tri);
    const side = Math.hypot(tri[1][0] - tri[0][0], tri[1][1] - tri[0][1]);
    const r = side * (d < 0 ? 0.3 + (-d / 0.18) * 0.25 : 0.3);
    const alpha = d < 0 ? 1 + d / 0.18 : 1 - d / 0.45;
    const ring: Pt[] = Array.from({ length: 24 }, (_, i) => [cx + Math.cos((i / 24) * 2 * Math.PI) * r, cy + Math.sin((i / 24) * 2 * Math.PI) * r]);
    buf.polyline(ring, lineW * 1.6, x.hand === "left" ? PALETTE.cyan : PALETTE.magenta, Math.max(0, alpha), true, true);
  }
}

/** The instrument geometry a view draws: the whole Y, or for the detail camera 2.6 times closer on `focus`. */
export function kirtledViewGeometry(w: number, h: number, view: "pattern" | "overhead" | "detail", focus = "A1"): KirtledGeometry {
  return view === "detail" ? zoomed(w, h, 2.6, focus) : kirtledGeometry(w, h);
}

/** Frame after frame as 8-bit RGB (w * h * 3 bytes each). */
export function* kirtledFrames(o: KirtledViewInput): Generator<Uint8Array> {
  const view = o.view ?? "pattern";
  const hits = [...(o.hits ?? [])].sort((a, b) => a.sec - b.sec);
  const endSec = o.startSec + o.frames / o.fps;
  // The detail camera holds on one triangle for the whole block: the block's first event, else the last before it.
  const focus = (hits.find((x) => x.sec >= o.startSec - 1e-9 && x.sec < endSec) ?? [...hits].reverse().find((x) => x.sec < o.startSec))?.triangle ?? "A1";
  const g = kirtledViewGeometry(o.width, o.height, view, focus);
  const buf = new LightBuffer(o.width, o.height);
  const lineW = Math.max(1, Math.min(o.width, o.height) / (view === "detail" ? 120 : 260));
  const barSec = (o.beatsPerBar * 60) / o.bpm;
  for (let f = 0; f < o.frames; f++) {
    drawKirtled(buf, g, { view, t: o.startSec + f / o.fps, barSec, lineW, hits });
    yield buf.toRgb24();
  }
}
