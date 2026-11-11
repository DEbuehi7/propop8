// lib/stuttr/visualFeatures.ts
//
// How loud the song is, and where its energy sits (low, mid, high), on every
// video frame, plus an onset-like strength. Stuttr owns the masters, so Stuttr
// measures this and saves it; Dance8's visual reaction layer reads only the
// saved file (canon D8-14, D8-25). Pure: decoded mono samples in, numbers out,
// the same samples give the same file every time.
//
// What it is not: these are energy measurements, not beats, chords, notes,
// lyrics or moves. A Dance8 effect may brighten with them; it may not claim a
// beat, a chord change or a move from them (GOV-14, D8-25).
//
//   Frame k covers song time [k, k+1) / fps on the musical clock (D8-02).
//   rms:    root-mean-square of the samples inside the frame.
//   bands:  magnitude in 20-250, 250-2000 and 2000-8000 Hz from a 2048-point
//           Hann FFT centred on the frame.
//   onset:  the strongest spectral-flux value (lib/stuttr/analysis.ts) inside
//           the frame; "onset-like" because it is never checked by ear.
//   Each is square-rooted and scaled to 0-1 at its 99.5th percentile over the
//   whole song, then stored as 0-255 in base64.

import { createHash } from "node:crypto";
import { fft, onsetEnvelope, ONSET_HOP } from "./analysis";

export const VISUAL_FEATURES_SCHEMA = "stuttr-visual-features-1";
export const FEATURE_SR = 22050;
const NFFT = 2048;
const HANN = Float64Array.from({ length: NFFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));
export const BANDS = { low: [20, 250], mid: [250, 2000], high: [2000, 8000] } as const;
export const FEATURE_NAMES = ["rms", "low", "mid", "high", "onset"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export interface Rational { num: number; den: number }

export interface VisualFeatureTrack {
  schema: typeof VISUAL_FEATURES_SCHEMA;
  trackId: string;
  /** The audio measured: its file name and the sha256 of its bytes. */
  source: { file: string; sha256: string };
  sampleRate: number;
  fps: Rational;
  frames: number;
  durationSec: number;
  evidence: "MEASURED_AUDIO_FEATURES";
  limits: string;
  q8: Record<FeatureName, string>;
}

export const FEATURE_LIMITS = "Energy and spectrum per video frame, measured from the audio. Not beats, chords, notes, lyrics or moves: nothing here is checked by ear.";

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

function scaleQ8(v: Float64Array): Uint8Array {
  const s = Float64Array.from(v, Math.sqrt);
  const sorted = Float64Array.from(s).sort();
  const p = sorted[Math.min(sorted.length - 1, Math.floor(0.995 * sorted.length))] || 1;
  const q = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) q[i] = Math.min(255, Math.round((255 * s[i]) / p));
  return q;
}

/** Frames a song of `samples` at `sr` fills at `fps` (whole frames only, as ffmpeg counts them). */
export function frameCount(samples: number, sr: number, fps: Rational): number {
  return Math.floor((samples * fps.num) / (sr * fps.den) + 1e-9);
}

export function visualFeatures(x: Float32Array, sr: number, fps: Rational, meta: { trackId: string; file: string; sha256: string }): VisualFeatureTrack {
  if (!(fps.num > 0 && fps.den > 0)) throw new Error("fps must be a positive ratio");
  const frames = frameCount(x.length, sr, fps);
  const frameSec = fps.den / fps.num;
  const rms = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    const a = Math.floor(k * frameSec * sr);
    const b = Math.min(x.length, Math.floor((k + 1) * frameSec * sr));
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    rms[k] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  // Band magnitudes from a Hann FFT centred on each frame's middle.
  const bands = { low: new Float64Array(frames), mid: new Float64Array(frames), high: new Float64Array(frames) };
  const binHz = sr / NFFT;
  const ranges = Object.fromEntries(Object.entries(BANDS).map(([k, [lo, hi]]) => [k, [Math.max(1, Math.ceil(lo / binHz)), Math.min(NFFT / 2, Math.floor(hi / binHz))]])) as Record<keyof typeof BANDS, [number, number]>;
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const scale = 4 / NFFT;
  for (let k = 0; k < frames; k++) {
    const c = Math.round((k + 0.5) * frameSec * sr);
    for (let i = 0; i < NFFT; i++) {
      const s = c - NFFT / 2 + i;
      re[i] = s >= 0 && s < x.length ? x[s] * HANN[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (const key of ["low", "mid", "high"] as const) {
      const [lo, hi] = ranges[key];
      let e = 0;
      for (let b = lo; b <= hi; b++) e += (re[b] * re[b] + im[b] * im[b]) * scale * scale;
      bands[key][k] = Math.sqrt(e);
    }
  }

  const env = onsetEnvelope(x, sr);
  const envSec = ONSET_HOP / sr;
  const onset = new Float64Array(frames);
  for (let k = 0; k < frames; k++) {
    const a = Math.floor((k * frameSec) / envSec);
    const b = Math.max(a, Math.ceil(((k + 1) * frameSec) / envSec) - 1);
    let m = 0;
    for (let i = a; i <= b && i < env.length; i++) m = Math.max(m, env[i]);
    onset[k] = m;
  }
  const q8 = {
    rms: scaleQ8(rms), low: scaleQ8(bands.low), mid: scaleQ8(bands.mid), high: scaleQ8(bands.high), onset: scaleQ8(onset),
  };
  return {
    schema: VISUAL_FEATURES_SCHEMA, trackId: meta.trackId, source: { file: meta.file, sha256: meta.sha256 },
    sampleRate: sr, fps: { num: fps.num, den: fps.den }, frames, durationSec: r6(x.length / sr),
    evidence: "MEASURED_AUDIO_FEATURES", limits: FEATURE_LIMITS,
    q8: Object.fromEntries(FEATURE_NAMES.map((n) => [n, Buffer.from(q8[n]).toString("base64")])) as Record<FeatureName, string>,
  };
}

/** The features as 0-1 numbers per frame. */
export function readFeatures(t: VisualFeatureTrack): Record<FeatureName, Float64Array> {
  return Object.fromEntries(FEATURE_NAMES.map((n) => [n, Float64Array.from(Buffer.from(t.q8[n], "base64"), (v) => v / 255)])) as Record<FeatureName, Float64Array>;
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Checks a saved feature file; problems are listed, never repaired. */
export function validateFeatures(raw: unknown): { track: VisualFeatureTrack | null; errors: string[] } {
  const errors: string[] = [];
  const o = raw as Partial<VisualFeatureTrack> | null;
  if (!o || typeof o !== "object") return { track: null, errors: ["not a JSON object"] };
  if (o.schema !== VISUAL_FEATURES_SCHEMA) errors.push(`schema must be ${VISUAL_FEATURES_SCHEMA}`);
  if (!o.source || typeof o.source.file !== "string" || !HEX64.test(o.source.sha256 ?? "")) errors.push("source needs file and a 64-character sha256");
  if (!o.fps || !(o.fps.num > 0) || !(o.fps.den > 0)) errors.push("fps must be {num, den}");
  if (!Number.isInteger(o.frames) || (o.frames as number) < 1) errors.push("frames must be a whole number");
  if (o.evidence !== "MEASURED_AUDIO_FEATURES") errors.push("evidence must be MEASURED_AUDIO_FEATURES");
  for (const n of FEATURE_NAMES) {
    const s = o.q8?.[n];
    if (typeof s !== "string") { errors.push(`q8.${n} missing`); continue; }
    if (Buffer.from(s, "base64").length !== o.frames) errors.push(`q8.${n} has the wrong number of frames`);
  }
  return errors.length ? { track: null, errors } : { track: o as VisualFeatureTrack, errors };
}

/** sha256 of a saved feature file's text, which the reaction track records. */
export const featuresSha256 = (text: string) => createHash("sha256").update(text).digest("hex");
