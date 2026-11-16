// lib/dance8/render/kirtledView.ts
//
// The Kirtled instrument as a grid view (canon D8-21): a Y of three equal arms
// at 120 degrees around a triangular hub, each arm one strip of eight
// triangles read from the hub out (KIRTLED_ARMS). On the verified beat grid a
// gold pulse travels from the hub to the tips once per bar and the hub warms
// on each downbeat: a slow travelling light, never a flash (D8-03, D8-25). A
// chord is lit only when a person verified it (D8-25); without a verified
// chord the strips stay in their base light. Pure TypeScript on the reaction
// layer's light buffer, so a frame is the same bytes on every computer.

import { LightBuffer, PALETTE, type RGB } from "../reaction/draw";
import { KIRTLED_ARMS } from "../../canon/vocab";

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
  /** Verified chords as [bar-0 seconds, chord name] in time order; empty or absent: none is lit. */
  chords?: readonly (readonly [number, string])[];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Frame after frame as 8-bit RGB (w * h * 3 bytes each). */
export function* kirtledFrames(o: KirtledViewInput): Generator<Uint8Array> {
  const g = kirtledGeometry(o.width, o.height);
  const buf = new LightBuffer(o.width, o.height);
  const lineW = Math.max(1, Math.min(o.width, o.height) / 260);
  const barSec = (o.beatsPerBar * 60) / o.bpm;
  const chordAt = (t: number) => {
    let cur: string | null = null;
    for (const [s, name] of o.chords ?? []) if (s <= t + 1e-9) cur = name;
    return cur;
  };
  for (let f = 0; f < o.frames; f++) {
    const t = o.startSec + f / o.fps;
    const phase = (((t % barSec) + barSec) % barSec) / barSec; // 0 at the downbeat
    buf.clear();
    // Hub: warms at the downbeat and settles over the bar.
    const warm = Math.exp(-phase * 5);
    buf.polyline(g.hub, lineW * 1.6, mix(PALETTE.gold, PALETTE.white, warm * 0.5), 0.55 + 0.45 * warm, true);
    // The pulse: a soft head travelling hub to tip over the bar, with a fading tail.
    const head = phase * 8;
    const lit = chordAt(t);
    g.arms.forEach((arm, a) => {
      arm.forEach((tri, k) => {
        const d = head - (k + 0.5);
        const pulse = d >= -0.6 && d <= 3 ? Math.exp(-((d < 0 ? d * 2.2 : d / 1.4) ** 2)) : 0;
        const chord = lit !== null && KIRTLED_ARMS[a].strip[k] === lit;
        const colour = chord ? PALETTE.cyan : mix(PALETTE.gold, PALETTE.white, pulse * 0.35);
        const alpha = chord ? 1 : 0.22 + 0.78 * pulse;
        buf.polyline(tri, lineW * (chord ? 2.2 : 1 + pulse * 0.9), colour, alpha, true, pulse > 0.05 || chord);
      });
    });
    yield buf.toRgb24();
  }
}
