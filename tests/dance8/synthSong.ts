/**
 * Synthetic songs for the sync tests: drum-like bursts, random hats and short
 * tones, and the same song as a phone in a room would hear it. No real music.
 */
import { ANALYSIS_SR } from "../../lib/stuttr/analysis";

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function synthSong(seconds: number, seed: number, loopBars = 0): Float32Array {
  const sr = ANALYSIS_SR, x = new Float32Array(Math.round(seconds * sr)), rnd = mulberry32(seed);
  const beat = 0.6;
  const burst = (at: number, len: number, f: (u: number, k: number) => number) => {
    const i0 = Math.round(at * sr);
    for (let k = 0; k < len * sr && i0 + k < x.length; k++) x[i0 + k] += f(k / sr, k);
  };
  const pattern: number[][] = [];
  for (let b = 0; b * 4 * beat < seconds; b++) {
    const src = loopBars ? pattern[b % loopBars] : undefined;
    const hats = src ?? Array.from({ length: 16 }, () => (rnd() < 0.5 ? 0.2 + 0.6 * rnd() : 0));
    if (loopBars && !src) pattern.push(hats);
    for (let k = 0; k < 4; k++) {
      const t = b * 4 * beat + k * beat;
      burst(t, 0.15, (u) => 0.8 * Math.sin(2 * Math.PI * 60 * u) * Math.exp(-u * 30));
      if (k % 2) burst(t, 0.12, () => 0.4 * (rnd() * 2 - 1));
    }
    hats.forEach((a, s) => { if (a) burst(b * 4 * beat + (s * beat) / 4, 0.03, (u) => a * (rnd() * 2 - 1) * Math.exp(-u * 120)); });
    if (!loopBars && rnd() < 0.7) { const f = 300 + 600 * rnd(); burst(b * 4 * beat + beat * Math.floor(rnd() * 8) / 2, 0.25, (u) => 0.3 * Math.sin(2 * Math.PI * f * u) * Math.exp(-u * 8)); }
  }
  return x;
}
/** The song from `fromSec`, through a room (echoes), a phone mic (low-pass), quieter, with hiss. */
export function heardByPhone(song: Float32Array, fromSec: number, seconds: number, seed: number, leadSilenceSec = 0): Float32Array {
  const sr = ANALYSIS_SR, rnd = mulberry32(seed), lead = Math.round(leadSilenceSec * sr);
  const out = new Float32Array(Math.round(seconds * sr));
  const i0 = Math.round(fromSec * sr);
  const echoes: [number, number][] = [[0, 1], [0.007, 0.5], [0.013, 0.35], [0.023, 0.25], [0.037, 0.15], [0.061, 0.1]];
  for (let k = lead; k < out.length; k++) {
    let v = 0;
    for (const [d, g] of echoes) { const j = i0 + k - lead - Math.round(d * sr); if (j >= 0 && j < song.length) v += g * song[j]; }
    out[k] = 0.3 * v;
  }
  let lp = 0;
  for (let k = 0; k < out.length; k++) { lp += 0.35 * (out[k] - lp); out[k] = lp + 0.01 * (rnd() * 2 - 1); }
  return out;
}

