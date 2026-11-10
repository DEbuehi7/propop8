// lib/stuttr/desk/align.ts
//
// Time zero for a song's parts: where each stem sits against the full mix,
// measured by cross-correlation (FFT), never assumed. Pure: the caller decodes
// both files to mono samples at one rate.
//
// The offset is in samples at the analysis rate (1/8000 s at the default),
// with milliseconds for people. A result is trusted only when its peak stands
// clear of every other lag; otherwise the verdict is "unknown", never zero.

export const ALIGN_RATE = 8000;
/** How far apart a part and the mix may be and still be found. */
export const ALIGN_MAX_LAG_SEC = 1.5;
/** How much of the song is compared, from where the part first sounds. */
export const ALIGN_WINDOW_SEC = 30;
/** Within this, a part counts as aligned (a few samples at 48 kHz are inaudible; this is 40 at 8 kHz). */
export const ALIGN_TOLERANCE_MS = 5;
/** The peak must beat the best lag more than 10 ms away by this factor... */
export const ALIGN_MIN_PROMINENCE = 1.5;
/** ...and explain at least this much of the part (normalised correlation). */
export const ALIGN_MIN_CONFIDENCE = 0.1;

function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** First sample where the signal's 50 ms RMS passes -40 dBFS, or 0. */
export function firstSound(x: Float32Array, rate: number): number {
  const w = Math.max(1, Math.round(rate * 0.05));
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0;
    for (let k = i; k < i + w; k++) s += x[k] * x[k];
    if (Math.sqrt(s / w) > 0.01) return i;
  }
  return 0;
}

export interface Offset {
  /** Part start minus mix start, in samples at `rate` (positive: the part is late). Null when untrusted. */
  offsetSamples: number | null;
  rate: number;
  offsetMs: number | null;
  /** Normalised correlation at the peak, 0..1. */
  confidence: number;
  /** Peak over the best lag more than 10 ms away. */
  prominence: number;
  verdict: "aligned" | "offset" | "unknown";
}

/**
 * Where `part` sits against `mix`. Both mono, same rate. Compares a window
 * from where the part first sounds, over lags of +/- maxLagSec.
 */
export function measureOffset(mix: Float32Array, part: Float32Array, rate = ALIGN_RATE, o: { maxLagSec?: number; windowSec?: number } = {}): Offset {
  const maxLag = Math.round((o.maxLagSec ?? ALIGN_MAX_LAG_SEC) * rate);
  const win = Math.round((o.windowSec ?? ALIGN_WINDOW_SEC) * rate);
  const start = firstSound(part, rate);
  const p = part.subarray(start, Math.min(part.length, start + win));
  const m0 = Math.max(0, start - maxLag);
  const m = mix.subarray(m0, Math.min(mix.length, start + p.length + maxLag));
  const none: Offset = { offsetSamples: null, rate, offsetMs: null, confidence: 0, prominence: 0, verdict: "unknown" };
  if (p.length < rate || m.length < p.length) return none;
  let n = 1;
  while (n < m.length + p.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(m);
  br.set(p);
  fft(ar, ai, false);
  fft(br, bi, false);
  // corr[d] = sum_k m[k + d] p[k]: multiply by the conjugate of the part's spectrum.
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r; ai[i] = im;
  }
  fft(ar, ai, true);
  // In the window, d counts from m0; a lag of L samples means the part's content is at mix index start + L... so
  // the content at part[start] is found at mix[start - L]: offset = start - (m0 + d).
  let best = -Infinity, bestD = -1;
  const dMax = Math.min(m.length - p.length, 2 * maxLag + (start - m0 - maxLag));
  for (let d = 0; d <= dMax; d++) if (ar[d] > best) { best = ar[d]; bestD = d; }
  if (bestD < 0 || !(best > 0)) return none;
  const guard = Math.round(0.01 * rate);
  let second = 0;
  for (let d = 0; d <= dMax; d++) if (Math.abs(d - bestD) > guard && Math.abs(ar[d]) > second) second = Math.abs(ar[d]);
  let ep = 0, em = 0;
  for (let k = 0; k < p.length; k++) { ep += p[k] * p[k]; const v = m[bestD + k] ?? 0; em += v * v; }
  const confidence = ep > 0 && em > 0 ? Math.min(1, best / Math.sqrt(ep * em)) : 0;
  const prominence = second > 0 ? best / second : Infinity;
  const offsetSamples = start - (m0 + bestD);
  const offsetMs = Math.round((offsetSamples / rate) * 1000 * 1000) / 1000;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  if (prominence < ALIGN_MIN_PROMINENCE || confidence < ALIGN_MIN_CONFIDENCE) return { ...none, confidence: r3(confidence), prominence: r3(Math.min(prominence, 999)) };
  return {
    offsetSamples, rate, offsetMs, confidence: r3(confidence), prominence: r3(Math.min(prominence, 999)),
    verdict: Math.abs(offsetMs) <= ALIGN_TOLERANCE_MS ? "aligned" : "offset",
  };
}
