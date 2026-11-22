// lib/dance8/render/house.ts
//
// The house look of an edit (docs/DANCE8_OCULAR_DIRECTOR.md, "Edit lists"),
// approved on the EDO v2 draft: performers stand in a deep teal studio with
// the Kirtled beat light behind them (D8-21 geometry, the pattern view), a
// gold rim on their matte, gold hairline frames on grid cells, a gold
// triangle at each landing, and one grade over everything (teal shadows, gold
// highlights, a little grain and vignette). Pixel work in plain TypeScript on
// Float32 RGB (0..1, interleaved), so a frame is the same on every computer;
// the grain comes from a fixed seed.

import { LightBuffer, PALETTE, rng, type RGB } from "../reaction/draw";
import { drawKirtled, kirtledViewGeometry } from "./kirtledView";
import type { Rect } from "./grid";

export interface Img { w: number; h: number; d: Float32Array }
export interface Matte { w: number; h: number; d: Float32Array }

export const GOLD: RGB = PALETTE.gold;
export const INK: RGB = [0.018, 0.05, 0.058];
export const TEAL: RGB = [0.035, 0.24, 0.26];

/** Phone takes run bright and cool: their light is warmed and lowered into the gold of the studio. */
const WARM = [0.97 * 0.9, 0.93 * 0.9, 0.86 * 0.9];

export const img = (w: number, h: number): Img => ({ w, h, d: new Float32Array(w * h * 3) });

/** Bilinear sample of region [x0,y0,rw,rh] of an 8-bit image (ch channels, first 3 used) into w x h, averaging several taps when shrinking. */
export function resample(src: Uint8Array, sw: number, sh: number, ch: number, x0: number, y0: number, rw: number, rh: number, w: number, h: number, stride = sw): Float32Array {
  const out = new Float32Array(w * h * 3);
  const sx = rw / w, sy = rh / h;
  const nx = Math.min(3, Math.max(1, Math.ceil(sx))), ny = Math.min(3, Math.max(1, Math.ceil(sy)));
  const inv = 1 / (255 * nx * ny);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ny; j++) {
        const fy = Math.min(sh - 1.001, Math.max(0, y0 + (y + (j + 0.5) / ny) * sy - 0.5));
        const iy = Math.floor(fy), ty = fy - iy;
        for (let i = 0; i < nx; i++) {
          const fx = Math.min(sw - 1.001, Math.max(0, x0 + (x + (i + 0.5) / nx) * sx - 0.5));
          const ix = Math.floor(fx), tx = fx - ix;
          const a = (iy * stride + ix) * ch, c = a + stride * ch;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          r += src[a] * w00 + src[a + ch] * w10 + src[c] * w01 + src[c + ch] * w11;
          g += src[a + 1] * w00 + src[a + ch + 1] * w10 + src[c + 1] * w01 + src[c + ch + 1] * w11;
          b += src[a + 2] * w00 + src[a + ch + 2] * w10 + src[c + 2] * w01 + src[c + ch + 2] * w11;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = r * inv; out[o + 1] = g * inv; out[o + 2] = b * inv;
    }
  }
  return out;
}

/**
 * The region of a picture that fills a w x h cell ("cover"), from crop box
 * `box` (fractions), pushed in `zoom` times, centred on (fx, fy) of the box as
 * far as the box allows (the middle by default).
 */
export function coverRegion(sw: number, sh: number, box: readonly number[], w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5): [number, number, number, number] {
  const x0 = box[0] * sw, y0 = box[1] * sh, x1 = box[2] * sw, y1 = box[3] * sh;
  let rw = (x1 - x0) / zoom, rh = (y1 - y0) / zoom;
  if (rw / rh > w / h) rw = rh * (w / h); else rh = rw / (w / h);
  const cx = Math.min(Math.max(x0 + fx * (x1 - x0), x0 + rw / 2), x1 - rw / 2);
  const cy = Math.min(Math.max(y0 + fy * (y1 - y0), y0 + rh / 2), y1 - rh / 2);
  return [Math.max(0, cx - rw / 2), Math.max(0, cy - rh / 2), rw, rh];
}

/** A picture (8-bit RGB) filling a w x h cell. */
export function cover(src: Uint8Array, sw: number, sh: number, box: readonly number[], w: number, h: number, zoom = 1, stride = sw, fx = 0.5, fy = 0.5): Img {
  const [x, y, rw, rh] = coverRegion(sw, sh, box, w, h, zoom, fx, fy);
  return { w, h, d: resample(src, sw, sh, 3, x, y, rw, rh, w, h, stride) };
}

/** Separable box blur, two passes (close to a Gaussian of the same reach). */
export function blurMatte(m: Matte, r: number): Matte {
  const R = Math.max(1, Math.round(r));
  let a: Float32Array = m.d;
  let b: Float32Array = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, horiz: boolean) => {
    const W = m.w, H = m.h, n = horiz ? W : H, lines = horiz ? H : W;
    for (let l = 0; l < lines; l++) {
      let acc = 0;
      const at = (i: number) => src[horiz ? l * W + Math.min(n - 1, Math.max(0, i)) : Math.min(n - 1, Math.max(0, i)) * W + l];
      for (let i = -R; i <= R; i++) acc += at(i);
      for (let i = 0; i < n; i++) {
        dst[horiz ? l * W + i : i * W + l] = acc / (2 * R + 1);
        acc += at(i + R + 1) - at(i - R);
      }
    }
  };
  for (let k = 0; k < 2; k++) { pass(a, b, true); [a, b] = [b, a]; pass(a, b, false); [a, b] = [b, a]; }
  return { w: m.w, h: m.h, d: a };
}

const GRADIENTS = new Map<string, Float32Array>();
/** Deep teal light falling off to ink: the studio's ground. */
export function gradient(w: number, h: number): Float32Array {
  const key = `${w}x${h}`;
  let g = GRADIENTS.get(key);
  if (!g) {
    g = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = Math.hypot((x - w / 2) / (w * 0.62), (y - h * 0.42) / (h * 0.62));
      const k = Math.max(0, 1 - r) ** 1.4;
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) g[o + c] = INK[c] + (TEAL[c] - INK[c]) * k;
    }
    if (GRADIENTS.size > 64) GRADIENTS.clear();
    GRADIENTS.set(key, g);
  }
  return g;
}

/** Light from a light buffer, rolled off as the reaction layer does. */
function lightOf(buf: LightBuffer, gain = 1): Float32Array {
  const out = new Float32Array(buf.data.length);
  for (let i = 0; i < out.length; i++) { const v = buf.data[i] * gain; out[i] = v <= 0 ? 0 : 1 - Math.exp(-1.6 * v); }
  return out;
}

const PHASES = 32;
const LIGHTS = new Map<string, Float32Array>();
/**
 * The Kirtled as light, w x h. pattern: the beat's light at `phase` (0..1 in
 * the bar, kept to 32 steps). overhead and detail: at rest, a little brighter
 * than the instrument cells of a grid plan so a drawn stand-in reads in a small
 * cell (they light no chord until a person verifies the chords, D8-25).
 */
export function kirtledLight(view: "pattern" | "overhead" | "detail", w: number, h: number, phase: number): Float32Array {
  const q = view === "pattern" ? Math.floor(phase * PHASES) % PHASES : 0;
  const key = `${view}:${w}x${h}:${q}`;
  let l = LIGHTS.get(key);
  if (!l) {
    const buf = new LightBuffer(w, h);
    const lineW = Math.max(1, Math.min(w, h) / (view === "detail" ? 120 : 260));
    drawKirtled(buf, kirtledViewGeometry(w, h, view), { view, t: (q + 0.5) / PHASES, barSec: 1, lineW });
    l = lightOf(buf, view === "pattern" ? 1.4 : 1.8);
    if (LIGHTS.size > 160) LIGHTS.clear();
    LIGHTS.set(key, l);
  }
  return l;
}

const STUDIOS = new Map<string, Float32Array>();
/** The studio behind a performer: the ground with the beat light drawn larger than the cell, its hub behind the head. */
export function studio(w: number, h: number, phase: number): Img {
  const q = Math.floor(phase * PHASES) % PHASES;
  const key = `${w}x${h}:${q}`;
  let s = STUDIOS.get(key);
  if (!s) {
    const bw = Math.round(w * 1.45), bh = Math.round(h * 1.45);
    const light = kirtledLight("pattern", bw, bh, (q + 0.5) / PHASES);
    LIGHTS.delete(`pattern:${bw}x${bh}:${q}`);
    const x0 = Math.floor((bw - w) / 2), y0 = Math.floor((bh - h) / 2) + Math.round(h * 0.06);
    const g = gradient(w, h);
    s = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      const ly = Math.min(bh - 1, y + y0);
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3, lo = (ly * bw + Math.min(bw - 1, x + x0)) * 3;
        s[o] = g[o] + light[lo] * 0.5; s[o + 1] = g[o + 1] + light[lo + 1] * 0.5; s[o + 2] = g[o + 2] + light[lo + 2] * 0.5;
      }
    }
    if (STUDIOS.size > 120) STUDIOS.clear();
    STUDIOS.set(key, s);
  }
  return { w, h, d: s.slice() };
}

/**
 * A performer from a packed take (picture | matte, 8-bit RGB, pw x ph each
 * half) placed on `bg`. stage: the whole crop, standing on the bottom of the
 * cell, its cut edges feathered; cover: the crop fills the cell. The matte
 * gets a gold rim, and the picture is warmed into the gold light. `alpha`
 * fades the performer.
 */
export function placePerformer(bg: Img, pack: Uint8Array, pw: number, ph: number, box: readonly number[], fit: "stage" | "cover", alpha: number): Img {
  const out = bg;
  if (alpha <= 0) return out;
  const W = out.w, H = out.h, stride = pw * 2;
  let x0: number, y0: number, rw: number, rh: number, dx: number, dy: number, w: number, h: number;
  if (fit === "cover") {
    [x0, y0, rw, rh] = coverRegion(pw, ph, box, W, H);
    dx = 0; dy = 0; w = W; h = H;
  } else {
    x0 = box[0] * pw; y0 = box[1] * ph; rw = (box[2] - box[0]) * pw; rh = (box[3] - box[1]) * ph;
    const s = Math.min(W / rw, H / rh);
    w = Math.max(2, Math.round(rw * s)); h = Math.max(2, Math.round(rh * s));
    dx = Math.floor((W - w) / 2); dy = H - h;
  }
  const col = resample(pack, pw, ph, 3, x0, y0, rw, rh, w, h, stride);
  const mat = resample(pack.subarray(pw * 3), pw, ph, 3, x0, y0, rw, rh, w, h, stride);
  const a: Matte = { w, h, d: new Float32Array(w * h) };
  const fe = Math.max(6, Math.round(h * 0.05));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = mat[(y * w + x) * 3];
    if (fit === "stage") {
      if (dx > 0) v *= Math.min(1, x / fe, (w - 1 - x) / fe);
      if (dy > 0) v *= Math.min(1, y / fe);
    }
    a.d[y * w + x] = Math.max(0, Math.min(1, v)) * alpha;
  }
  const rim = blurMatte(a, Math.max(2, h / 110));
  for (let y = 0; y < h; y++) {
    const oy = y + dy;
    if (oy < 0 || oy >= H) continue;
    for (let x = 0; x < w; x++) {
      const ox = x + dx;
      if (ox < 0 || ox >= W) continue;
      const i = y * w + x, o = (oy * W + ox) * 3, c = i * 3;
      const av = a.d[i], glow = Math.max(0, rim.d[i] - av) * 0.6;
      for (let k = 0; k < 3; k++) {
        let v = col[c + k] * WARM[k];
        v = v + 0.16 * (v - 0.5) * (1 - Math.abs(2 * v - 1));
        out.d[o + k] = v * av + out.d[o + k] * (1 - av) + GOLD[k] * glow;
      }
    }
  }
  return out;
}

/** Dims a cell the light has left (nine-view): darker and less saturated, never black. */
export function dim(im: Img, now: number): void {
  if (now >= 1) return;
  const k = 0.62 + 0.38 * now, s = 0.6 + 0.4 * now, d = im.d;
  for (let i = 0; i < d.length; i += 3) {
    const L = (d[i] + d[i + 1] + d[i + 2]) / 3;
    d[i] = (L + (d[i] - L) * s) * k; d[i + 1] = (L + (d[i + 1] - L) * s) * k; d[i + 2] = (L + (d[i + 2] - L) * s) * k;
  }
}

/** Pastes `src` into `dst` at (x, y), optionally only part [cx, cy, cw, ch] of it, blended by alpha. */
export function paste(dst: Img, src: Img, x: number, y: number, alpha = 1, part?: Rect): void {
  const px = part ? part.x : 0, py = part ? part.y : 0, pw = part ? part.w : src.w, ph = part ? part.h : src.h;
  for (let j = 0; j < ph; j++) {
    const oy = y + j;
    if (oy < 0 || oy >= dst.h) continue;
    for (let i = 0; i < pw; i++) {
      const ox = x + i;
      if (ox < 0 || ox >= dst.w) continue;
      const o = (oy * dst.w + ox) * 3, s = ((py + j) * src.w + px + i) * 3;
      if (alpha >= 1) { dst.d[o] = src.d[s]; dst.d[o + 1] = src.d[s + 1]; dst.d[o + 2] = src.d[s + 2]; }
      else for (let k = 0; k < 3; k++) dst.d[o + k] = dst.d[o + k] * (1 - alpha) + src.d[s + k] * alpha;
    }
  }
}

/** Adds light (0..1 per channel) scaled by `k`, offset to (x, y). */
export function addLight(dst: Img, light: Float32Array, lw: number, lh: number, k: number, x = 0, y = 0): void {
  for (let j = 0; j < lh; j++) {
    const oy = y + j;
    if (oy < 0 || oy >= dst.h) continue;
    for (let i = 0; i < lw; i++) {
      const ox = x + i;
      if (ox < 0 || ox >= dst.w) continue;
      const o = (oy * dst.w + ox) * 3, s = (j * lw + i) * 3;
      dst.d[o] += light[s] * k; dst.d[o + 1] += light[s + 1] * k; dst.d[o + 2] += light[s + 2] * k;
    }
  }
}

/** A gold triangle opening from (cx, cy) over ACCENT seconds after a landing (`d` seconds in). */
export function triangleBurst(dst: Img, buf: LightBuffer, d: number, dur: number, cx: number, cy: number, size: number): void {
  if (d < 0 || d >= dur) return;
  const r = (1 - (1 - d / dur) ** 3) * size, a = 0.5 * (1 - d / dur);
  const pts = [270, 30, 150].map((deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)] as const);
  buf.clear();
  buf.polyline(pts, Math.max(1.5, dst.h / 360), GOLD, a * 1.6, true, true);
  addLight(dst, lightOf(buf), buf.width, buf.height, 1);
}

const GRAINS = new Map<string, Float32Array[]>();
const VIGNETTES = new Map<string, Float32Array>();
/**
 * The grade over the whole picture: shadows toward teal, highlights toward
 * gold, a touch less saturation, a soft S-curve, the vignette, then grain from
 * a fixed seed (frame k uses field k mod 6).
 */
export function grade(f: Img, k: number): void {
  const key = `${f.w}x${f.h}`;
  let vig = VIGNETTES.get(key);
  if (!vig) {
    vig = new Float32Array(f.w * f.h);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const r = Math.min(1, Math.hypot((x - f.w / 2) / (f.w / 2), (y - f.h / 2) / (f.h / 2)) / 1.2);
      vig[y * f.w + x] = 1 - 0.3 * r ** 2.2;
    }
    VIGNETTES.set(key, vig);
  }
  let grains = GRAINS.get(key);
  if (!grains) {
    const rand = rng(1121);
    grains = Array.from({ length: 6 }, () => {
      const g = new Float32Array(f.w * f.h);
      for (let i = 0; i < g.length; i += 2) {
        const u = Math.max(1e-9, rand()), v = rand(), m = Math.sqrt(-2 * Math.log(u)) * 0.03;
        g[i] = m * Math.cos(2 * Math.PI * v);
        if (i + 1 < g.length) g[i + 1] = m * Math.sin(2 * Math.PI * v);
      }
      return g;
    });
    GRAINS.set(key, grains);
  }
  const grain = grains[((k % 6) + 6) % 6];
  const SH = [-0.035, 0.012, 0.04], HL = [0.045, 0.016, -0.035];
  const d = f.d;
  const curve = (v: number) => { v = v < 0 ? 0 : v > 1 ? 1 : v; return v + 0.2 * (v - 0.5) * (1 - Math.abs(2 * v - 1)); };
  for (let p = 0, i = 0; p < vig.length; p++, i += 3) {
    let L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const sh = (1 - L) * (1 - L), hl = L * L;
    let r = d[i] + sh * SH[0] + hl * HL[0], g = d[i + 1] + sh * SH[1] + hl * HL[1], b = d[i + 2] + sh * SH[2] + hl * HL[2];
    L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = L + (r - L) * 0.9; g = L + (g - L) * 0.9; b = L + (b - L) * 0.9;
    const vg = vig[p], gr = grain[p];
    d[i] = curve(r) * vg + gr; d[i + 1] = curve(g) * vg + gr; d[i + 2] = curve(b) * vg + gr;
  }
}

/** A gold hairline round a rectangle, blended by `a`. */
export function frameRect(f: Img, x0: number, y0: number, x1: number, y1: number, a: number): void {
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= f.w || y >= f.h) return;
    const o = (y * f.w + x) * 3;
    for (let k = 0; k < 3; k++) f.d[o + k] = f.d[o + k] * (1 - a) + GOLD[k] * a;
  };
  for (let x = x0; x < x1; x++) { put(x, y0); put(x, y1 - 1); }
  for (let y = y0 + 1; y < y1 - 1; y++) { put(x0, y); put(x1 - 1, y); }
}

/** Darkens the bottom `rows` of a rectangle toward ink, strongest at the edge (where type sits). */
export function shade(f: Img, x0: number, x1: number, yTop: number, yBottom: number, strength: number): void {
  const n = Math.max(1, yBottom - yTop);
  for (let y = Math.max(0, yTop); y < Math.min(f.h, yBottom); y++) {
    const k = 1 - strength * ((y - yTop) / n);
    for (let x = Math.max(0, x0); x < Math.min(f.w, x1); x++) { const o = (y * f.w + x) * 3; f.d[o] *= k; f.d[o + 1] *= k; f.d[o + 2] *= k; }
  }
}

/** A sprite: premultiplied RGB and alpha, w x h. */
export interface Sprite { w: number; h: number; rgb: Float32Array; a: Float32Array }

/** Draws a sprite at (x, y) with opacity `op`. */
export function blit(f: Img, s: Sprite, x: number, y: number, op = 1): void {
  if (op <= 0) return;
  const X = Math.round(x), Y = Math.round(y);
  for (let j = 0; j < s.h; j++) {
    const oy = Y + j;
    if (oy < 0 || oy >= f.h) continue;
    for (let i = 0; i < s.w; i++) {
      const ox = X + i;
      if (ox < 0 || ox >= f.w) continue;
      const p = j * s.w + i, a = s.a[p] * op;
      if (a <= 0) continue;
      const o = (oy * f.w + ox) * 3;
      for (let k = 0; k < 3; k++) f.d[o + k] = s.rgb[p * 3 + k] * op + f.d[o + k] * (1 - a);
    }
  }
}

/** A sprite from straight (not premultiplied) 8-bit RGBA, with a soft shadow under it and a pill behind it if asked. */
export function spriteFromRgba(rgba: Uint8Array, w: number, h: number, o: { shadow?: boolean; pill?: boolean } = {}): Sprite {
  const pad = o.shadow || o.pill ? 10 : 2;
  const W = w + 2 * pad, H = h + 2 * pad;
  const a = new Float32Array(W * H), rgb = new Float32Array(W * H * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, p = (y + pad) * W + x + pad, al = rgba[s + 3] / 255;
    a[p] = al;
    for (let k = 0; k < 3; k++) rgb[p * 3 + k] = (rgba[s + k] / 255) * al;
  }
  if (o.shadow) {
    const sh = blurMatte({ w: W, h: H, d: a.slice() }, 3);
    for (let p = 0; p < a.length; p++) a[p] = Math.min(1, a[p] + sh.d[p] * 0.75 * (1 - a[p]));
  }
  if (o.pill) {
    const r = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const cx = Math.min(Math.max(x, r), W - r), d = Math.hypot(x - cx, y - r);
      const cover = Math.max(0, Math.min(1, r - d));
      const p = y * W + x, add = 0.59 * cover * (1 - a[p]);
      rgb[p * 3] += 0.02 * add; rgb[p * 3 + 1] += 0.055 * add; rgb[p * 3 + 2] += 0.063 * add;
      a[p] += add;
    }
  }
  return { w: W, h: H, rgb, a };
}

/** 8-bit RGB for the encoder, with an overall level (fades from and to black). */
export function toRgb24(f: Img, level = 1): Uint8Array {
  const out = new Uint8Array(f.d.length);
  for (let i = 0; i < f.d.length; i++) { const v = f.d[i] * level; out[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255); }
  return out;
}
