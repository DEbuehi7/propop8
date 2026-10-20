// lib/dance8/moves/sync.ts
//
// Links a filmed take to the song (canon D8-02: the capture clock and the
// musical clock never mix without a checked conversion). The take's own audio,
// picked up by the phone while the song played from a speaker, is turned into
// the same onset pattern Stuttr saved with the song's analysis, and the two
// are slid against each other. The best match must be clearly better than any
// other position, or the take is refused and the person gives the offset.

import { ANALYSIS_SR, ONSET_HOP, onsetEnvelope, readSyncFingerprint, type SyncFingerprint } from "../../stuttr/analysis";
import type { CaptureSync } from "../contracts/moves";

/** Weakest accepted correlation at the match. */
export const SYNC_MIN_R = 0.3;
/** The match must beat the best position at least a second away by this much. */
export const SYNC_MIN_MARGIN = 0.1;
/** At least this much of the take must overlap the song. */
export const SYNC_MIN_OVERLAP_SEC = 8;
/** The two halves of the take may disagree by at most this much... */
export const SYNC_MAX_DRIFT_MS = 40;
/** ...each searched this close to the whole take's match. */
export const DRIFT_SEARCH_SEC = 0.2;

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The take's onset pattern, prepared exactly like the song's fingerprint. */
export function takePattern(audio: ArrayLike<number>, sr = ANALYSIS_SR): Float64Array {
  return onsetEnvelope(audio, sr).map(Math.sqrt);
}

/** Removes slow swells (a moving average about a second wide) so loudness changes do not drive the match. */
export function detrend(x: Float64Array, radius: number): Float64Array {
  const pre = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) pre[i + 1] = pre[i] + x[i];
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - radius), b = Math.min(x.length, i + radius + 1);
    out[i] = x[i] - (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

/**
 * Removes what repeats bar after bar (the average of the same moment one and
 * two bars either side), leaving fills, vocals and arrangement changes. Without
 * this a drum loop matches almost as well one bar off as at the right place.
 */
export function deloop(x: Float64Array, periodFrames: number): Float64Array {
  const at = (p: number) => {
    if (p < 0 || p > x.length - 1) return NaN;
    const i = Math.floor(p), f = p - i;
    return i + 1 < x.length ? x[i] * (1 - f) + x[i + 1] * f : x[i];
  };
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let sum = 0, cnt = 0;
    for (const k of [-2, -1, 1, 2]) { const v = at(i + k * periodFrames); if (Number.isFinite(v)) { sum += v; cnt++; } }
    out[i] = cnt ? x[i] - sum / cnt : x[i];
  }
  return out;
}

export interface OnsetMatch {
  /** Take frame j lines up with song frame j + lag (fractional). */
  lag: number;
  r: number;
  rNext: number;
  overlap: number;
}

/**
 * Pearson correlation of the two patterns over their overlap at every lag in
 * [lo, hi] (frames), with at least minOverlap frames shared.
 */
export function matchOnsets(song: Float64Array, take: Float64Array, minOverlap: number, range?: [number, number], awayFrames = 0): OnsetMatch | null {
  const lo = Math.max(range ? range[0] : -Infinity, minOverlap - take.length);
  const hi = Math.min(range ? range[1] : Infinity, song.length - minOverlap);
  if (lo > hi) return null;
  const ps = (x: Float64Array) => { const s = new Float64Array(x.length + 1), q = new Float64Array(x.length + 1);
    for (let i = 0; i < x.length; i++) { s[i + 1] = s[i] + x[i]; q[i + 1] = q[i] + x[i] * x[i]; } return [s, q]; };
  const [ss, sq] = ps(song), [ts, tq] = ps(take);
  const rAt = new Map<number, number>();
  let best = -Infinity, bestLag = lo;
  for (let L = Math.ceil(lo); L <= hi; L++) {
    const j0 = Math.max(0, -L), j1 = Math.min(take.length, song.length - L);
    const n = j1 - j0;
    if (n < minOverlap) continue;
    let xy = 0;
    for (let j = j0; j < j1; j++) xy += take[j] * song[j + L];
    const sx = ts[j1] - ts[j0], sy = ss[j1 + L] - ss[j0 + L];
    const vx = tq[j1] - tq[j0] - (sx * sx) / n, vy = sq[j1 + L] - sq[j0 + L] - (sy * sy) / n;
    const r = vx > 0 && vy > 0 ? (xy - (sx * sy) / n) / Math.sqrt(vx * vy) : 0;
    rAt.set(L, r);
    if (r > best) { best = r; bestLag = L; }
  }
  if (best === -Infinity) return null;
  let rNext = -1;
  for (const [L, r] of rAt) if (Math.abs(L - bestLag) > awayFrames && r > rNext) rNext = r;
  // Parabolic refinement between neighbouring lags.
  const a = rAt.get(bestLag - 1), c = rAt.get(bestLag + 1);
  let lag = bestLag;
  if (a !== undefined && c !== undefined) {
    const den = a - 2 * best + c;
    if (den < 0) lag += Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den)));
  }
  const j0 = Math.max(0, -bestLag), j1 = Math.min(take.length, song.length - bestLag);
  return { lag, r: best, rNext, overlap: j1 - j0 };
}

export interface SyncResult {
  sync: CaptureSync;
  ok: boolean;
  why: string | null;
}

/**
 * Finds the song second at capture second 0. `audioStartSec` is when the
 * take's first audio sample plays (ffprobe start_time), since its video and
 * audio streams may not start together.
 */
export function syncTake(
  fp: SyncFingerprint, audio: ArrayLike<number>, audioStartSec: number, checkedAt: string, opts: { barSec?: number; sr?: number } = {},
): SyncResult {
  const sr = opts.sr ?? ANALYSIS_SR;
  const frameSec = ONSET_HOP / sr;
  if (Math.abs(fp.frameSec - frameSec) > 1e-6) throw new Error(`the song's fingerprint uses ${fp.frameSec} s frames, the take ${frameSec} s`);
  const radius = Math.round(1 / frameSec);
  // The fingerprint is already square-rooted (on a 0-255 scale); correlation ignores the scale.
  const prep = (x: Float64Array) => { const d = detrend(x, radius); return opts.barSec ? deloop(d, opts.barSec / frameSec) : d; };
  const songPat = prep(readSyncFingerprint(fp));
  const take = prep(takePattern(audio, sr));
  const minOverlap = Math.round(SYNC_MIN_OVERLAP_SEC / frameSec);
  const m = matchOnsets(songPat, take, Math.min(minOverlap, Math.max(1, take.length - 1)), undefined, radius);
  const base: CaptureSync = { method: "onset_match", songAtCapture0: 0, r: null, rNext: null, driftMs: null, overlapSec: null, status: "checked", checkedAt };
  if (!m) return { sync: base, ok: false, why: "the take is too short to match against the song" };
  // Drift: each half of the take matched on its own, within a second of the whole.
  let driftMs: number | null = null;
  const half = Math.floor(take.length / 2);
  if (half >= minOverlap) {
    const w = Math.round(DRIFT_SEARCH_SEC / frameSec);
    const near: [number, number] = [Math.round(m.lag) - w, Math.round(m.lag) + w];
    const h1 = matchOnsets(songPat, take.subarray(0, half), Math.round(minOverlap / 2), near);
    // The second half's frame j is the whole take's frame half + j, so its lag is the whole lag + half.
    const h2 = matchOnsets(songPat, take.subarray(half), Math.round(minOverlap / 2), [near[0] + half, near[1] + half]);
    if (h1 && h2) driftMs = Math.round((h2.lag - half - h1.lag) * frameSec * 1000);
  }
  const sync: CaptureSync = {
    ...base,
    songAtCapture0: r3(m.lag * frameSec - audioStartSec),
    r: r3(m.r), rNext: r3(m.rNext), driftMs, overlapSec: r3(m.overlap * frameSec),
  };
  const why =
    m.overlap * frameSec < SYNC_MIN_OVERLAP_SEC ? `only ${sync.overlapSec} s of the take overlaps the song`
    : m.r < SYNC_MIN_R ? `the song is hard to hear in the take (match ${sync.r}, need ${SYNC_MIN_R})`
    : m.r - m.rNext < SYNC_MIN_MARGIN ? `the match (${sync.r}) is not clearly better than another position (${sync.rNext})`
    : driftMs !== null && Math.abs(driftMs) > SYNC_MAX_DRIFT_MS ? `the two halves of the take disagree by ${driftMs} ms`
    : null;
  return { sync, ok: why === null, why };
}

/** The person's own offset, when the audio cannot be matched. */
export function manualSync(songAtCapture0: number, checkedAt: string): CaptureSync {
  return { method: "manual", songAtCapture0: r3(songAtCapture0), r: null, rNext: null, driftMs: null, overlapSec: null, status: "manual", checkedAt };
}
