// lib/dance8/authoring/mouthTrack.ts
//
// Builds a mouth track from decoded mono samples. Pure and deterministic:
// the same samples and parameters always give the same frames.
//
//   1. Loudness of each video frame's samples (RMS, in dBFS).
//   2. Reference = a high percentile of the voiced frames, so a quiet or loud
//      take maps the same way; frames under the gate are closed.
//   3. Openness = position inside the range below the reference, 0..1.
//   4. Opening is immediate; closing is limited per frame, so the mouth
//      doesn't flicker shut between syllables.

import { framesPerBeat } from "../../canon/rules";
import type { MouthParams, MouthTrack } from "../contracts/mouth";

/** D8-03 sync reference: 24 fps (12 frames per beat at 120 BPM). */
export const MOUTH_FPS = 24;
export const MOUTH_DEFAULTS: MouthParams = { gateDb: -50, rangeDb: 30, refPercentile: 95, closePerFrame: 0.34 };

// Keeps the fps tied to the canon sync rule; fails loudly if either drifts.
if (framesPerBeat(120, MOUTH_FPS) !== 12) throw new Error("mouth fps no longer matches the D8-03 sync reference");

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** RMS loudness in dBFS of each frame; frame i covers samples [floor(i*sr/fps), floor((i+1)*sr/fps)). */
export function frameLoudnessDb(samples: ArrayLike<number>, sampleRate: number, fps = MOUTH_FPS, fullScale = 32768): number[] {
  if (!(sampleRate > 0) || !(fps > 0)) throw new Error("sample rate and fps must be > 0");
  const n = samples.length;
  const frames = Math.ceil((n * fps) / sampleRate);
  const out: number[] = [];
  for (let i = 0; i < frames; i++) {
    const a = Math.floor((i * sampleRate) / fps);
    const b = Math.min(n, Math.floor(((i + 1) * sampleRate) / fps));
    let sum = 0;
    for (let k = a; k < b; k++) {
      const v = samples[k] / fullScale;
      sum += v * v;
    }
    const rms = b > a ? Math.sqrt(sum / (b - a)) : 0;
    out.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
  }
  return out;
}

/** Value at percentile p (0..100) of sorted values, nearest-rank on the lower side. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor((Math.min(100, Math.max(0, p)) / 100) * (s.length - 1))];
}

export function mouthOpenness(loudnessDb: number[], params: MouthParams = MOUTH_DEFAULTS): { open: number[]; refDb: number | null } {
  const voiced = loudnessDb.filter((d) => d >= params.gateDb);
  const ref = percentile(voiced, params.refPercentile);
  if (ref === null) return { open: loudnessDb.map(() => 0), refDb: null };
  const floor = ref - params.rangeDb;
  const open: number[] = [];
  let prev = 0;
  for (const d of loudnessDb) {
    const raw = d < params.gateDb ? 0 : Math.min(1, Math.max(0, (d - floor) / params.rangeDb));
    const v = Math.max(raw, prev - params.closePerFrame, 0);
    prev = v;
    open.push(round3(v));
  }
  return { open, refDb: round3(ref) };
}

export function buildMouthTrack(
  samples: ArrayLike<number>,
  sampleRate: number,
  meta: Omit<MouthTrack, "schemaVersion" | "clock" | "fps" | "open" | "params" | "refDb" | "id"> & { id?: string },
  params: MouthParams = MOUTH_DEFAULTS,
): MouthTrack {
  const { open, refDb } = mouthOpenness(frameLoudnessDb(samples, sampleRate, MOUTH_FPS), params);
  const id = meta.id ?? `${meta.trackId}.${meta.voice.toLowerCase()}.${meta.lang}${meta.role === "backing_vocals" ? ".backing" : ""}.mouth`;
  return { ...meta, id, schemaVersion: 1, clock: "song_seconds", fps: MOUTH_FPS, startSec: round3(meta.startSec), open, params, refDb };
}

/** Openness at a song time; closed outside the take. */
export function mouthAt(t: MouthTrack, songSec: number): number {
  const f = Math.floor((songSec - t.startSec) * t.fps + 1e-9);
  return f >= 0 && f < t.open.length ? t.open[f] : 0;
}

export function checkMouthTrack(t: MouthTrack): string[] {
  const out: string[] = [];
  if (t.schemaVersion !== 1) out.push("schemaVersion must be 1");
  if (t.clock !== "song_seconds") out.push("clock must be song_seconds (D8-02)");
  if (t.fps !== MOUTH_FPS) out.push(`fps must be ${MOUTH_FPS} (D8-03)`);
  if (!(Number.isFinite(t.startSec) && t.startSec >= 0)) out.push("startSec must be >= 0");
  if (!/^[0-9a-f]{64}$/.test(t.source?.sha256 ?? "")) out.push("source.sha256 must be a sha256 hex digest");
  t.open.forEach((v, i) => {
    if (!(Number.isFinite(v) && v >= 0 && v <= 1)) out.push(`open[${i}] must be between 0 and 1`);
  });
  return out;
}
