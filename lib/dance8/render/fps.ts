// lib/dance8/render/fps.ts
//
// The frame rate a Dance8 render uses: the rate the clips were made at, so no
// frames are invented or dropped unevenly (a 24 fps clip in a 30 fps render
// repeats every fourth frame, which reads as judder on motion). Sources do not
// agree: Veo/Gemini clips are 24 fps, phones record 30 or 60, and Kling has
// been reported at 24 to 60 depending on the version. So the clips are
// measured, never assumed. Pure: the caller does the probing.

export const STANDARD_FPS = [24, 25, 30, 48, 50, 60] as const;

/** Rate used when nothing can be measured (the render's old fixed rate). */
export const FALLBACK_FPS = 30;

/** ffprobe's r_frame_rate ("24000/1001", "30/1") as a number; NaN if unreadable. */
export function parseRate(r: string): number {
  const [n, d] = r.trim().split("/").map(Number);
  return d === undefined ? n : d > 0 ? n / d : NaN;
}

/** Nearest standard rate within 1% (23.976 -> 24, 29.97 -> 30, 59.94 -> 60), else null. */
export function standardFps(rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  let best: number | null = null;
  let d = Infinity;
  for (const s of STANDARD_FPS) {
    const e = Math.abs(rate - s) / s;
    if (e < d) { d = e; best = s; }
  }
  return d <= 0.01 ? best : null;
}

export interface FpsChoice {
  /** Render rate. */
  fps: number;
  /** The clips' own rate it came from, or null when none could be measured. */
  sourceFps: number | null;
  /** Clip rates the render rate does not divide evenly (they will judder); re-export these. */
  uneven: number[];
}

/**
 * The rate most clips share wins; a tie goes to the lower rate. Above 30 it is
 * halved (48 -> 24, 50 -> 25, 60 -> 30): every other frame goes, evenly, and
 * the result plays on every platform. `uneven` lists rates that don't divide
 * by the render rate, e.g. a 30 fps clip in a 24 fps render.
 */
export function chooseRenderFps(rates: readonly number[]): FpsChoice {
  const counts = new Map<number, number>();
  for (const r of rates) {
    const s = standardFps(r);
    if (s !== null) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  if (counts.size === 0) return { fps: FALLBACK_FPS, sourceFps: null, uneven: [] };
  const [sourceFps] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const fps = sourceFps > 30 ? sourceFps / 2 : sourceFps;
  const uneven = [...counts.keys()].filter((r) => r % fps !== 0).sort((a, b) => a - b);
  return { fps, sourceFps, uneven };
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** A decimal as an exact fraction ("92.058" -> 92058/1000), from its text so no float error creeps in. */
export function exactRatio(text: string): { num: number; den: number } {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!m) throw new Error(`not a plain decimal: ${text}`);
  const den = 10 ** (m[2]?.length ?? 0);
  const num = Number(m[1]) * den + Number(m[2] ?? 0);
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/**
 * Frames per beat and per bar as exact fractions (canon D8-03: 120 BPM at 24
 * fps is 12 and 48). Rates like 24000/1001 and tempos like 92.058 give
 * fractions, and `integer` says whether every beat starts on a frame; when it
 * doesn't, cuts are placed on the nearest frame and drift is reset each bar.
 */
export function frameGrid(bpm: string, fps: { num: number; den: number }, beatsPerBar = 4): { perBeat: { num: number; den: number }; perBar: { num: number; den: number }; integer: boolean; barInteger: boolean } {
  const b = exactRatio(bpm);
  if (b.num <= 0 || fps.num <= 0 || fps.den <= 0) throw new Error("bpm and fps must be positive");
  // frames per beat = 60 / bpm * fps = 60 * b.den * fps.num / (b.num * fps.den)
  const reduce = (n: number, d: number) => { const g = gcd(n, d); return { num: n / g, den: d / g }; };
  const perBeat = reduce(60 * b.den * fps.num, b.num * fps.den);
  const perBar = reduce(perBeat.num * beatsPerBar, perBeat.den);
  return { perBeat, perBar, integer: perBeat.den === 1, barInteger: perBar.den === 1 };
}
