// lib/dance8/reaction/draw.ts
//
// A small additive light buffer for the reaction layer: anti-aliased lines and
// polylines on black, so an editor composites the result with Screen blend.
// Pure TypeScript with no canvas or GPU, so a frame is the same bytes on every
// computer (D8-25 asks for repeatable output at the same seed).

export type RGB = readonly [number, number, number];

/** TRI-02 accents and the TRI-01 identity strands (black disappears on Screen, so it is not used). */
export const PALETTE = {
  cyan: [0.0, 0.72, 0.86] as RGB,
  gold: [0.96, 0.72, 0.26] as RGB,
  magenta: [0.86, 0.22, 0.66] as RGB,
  white: [0.86, 0.86, 0.84] as RGB,
  brown: [0.62, 0.4, 0.24] as RGB,
};

export class LightBuffer {
  readonly data: Float32Array;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Float32Array(width * height * 3);
  }

  clear(): void { this.data.fill(0); }

  private add(x: number, y: number, c: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 3;
    this.data[i] += c[0] * a;
    this.data[i + 1] += c[1] * a;
    this.data[i + 2] += c[2] * a;
  }

  /** A segment `width` px wide with a one-pixel soft edge, added as light. */
  line(x0: number, y0: number, x1: number, y1: number, width: number, c: RGB, alpha: number): void {
    if (alpha <= 0 || width <= 0) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const half = width / 2 + 0.5;
    const steep = Math.abs(dy) > Math.abs(dx);
    // Walk the major axis; on each step cover the cross-axis span the segment can touch.
    const [a0, a1] = steep ? [Math.min(y0, y1), Math.max(y0, y1)] : [Math.min(x0, x1), Math.max(x0, x1)];
    const from = Math.floor(a0 - half);
    const to = Math.ceil(a1 + half);
    const slope = steep ? (dy === 0 ? 0 : dx / dy) : (dx === 0 ? 0 : dy / dx);
    const reach = Math.ceil(half * Math.sqrt(1 + slope * slope)) + 1;
    for (let m = from; m <= to; m++) {
      const cross = steep ? x0 + (m - y0) * slope : y0 + (m - x0) * slope;
      for (let n = Math.floor(cross - reach); n <= Math.ceil(cross + reach); n++) {
        const px = steep ? n : m;
        const py = steep ? m : n;
        // Distance from the pixel centre to the segment.
        let t = len2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (x0 + t * dx);
        const ey = py - (y0 + t * dy);
        const cover = half - Math.sqrt(ex * ex + ey * ey);
        if (cover > 0) this.add(px, py, c, alpha * Math.min(1, cover));
      }
    }
  }

  /** A line with a wide, faint halo under it, so thin light still reads over a bright picture. */
  glow(x0: number, y0: number, x1: number, y1: number, width: number, c: RGB, alpha: number): void {
    this.line(x0, y0, x1, y1, width * 4, c, alpha * 0.14);
    this.line(x0, y0, x1, y1, width, c, alpha);
  }

  polyline(pts: readonly (readonly [number, number])[], width: number, c: RGB, alpha: number, closed = false, halo = true): void {
    const seg = (a: readonly [number, number], b: readonly [number, number]) => (halo ? this.glow(a[0], a[1], b[0], b[1], width, c, alpha) : this.line(a[0], a[1], b[0], b[1], width, c, alpha));
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]);
    if (closed && pts.length > 2) seg(pts[pts.length - 1], pts[0]);
  }

  /** 8-bit RGB with a soft roll-off, so overlapping light never clips hard. */
  toRgb24(): Uint8Array {
    const out = new Uint8Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      out[i] = v <= 0 ? 0 : Math.round(255 * (1 - Math.exp(-1.6 * v)));
    }
    return out;
  }
}

/** mulberry32: a seeded, repeatable random sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
