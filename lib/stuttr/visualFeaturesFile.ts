// lib/stuttr/visualFeaturesFile.ts
//
// Measures an audio file's visual features (lib/stuttr/visualFeatures.ts) and
// saves them for Dance8's reaction layer, which never opens the audio itself
// (canon D8-14). The audio is only read.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { decodeFloat } from "./commands";
import { FEATURE_SR, visualFeatures, type Rational, type VisualFeatureTrack } from "./visualFeatures";

/** "24", "30", "24000/1001" or "23.976" as an exact ratio. */
export function parseFps(text: string): Rational {
  const t = text.trim();
  const m = /^(\d+)\/(\d+)$/.exec(t);
  if (m && Number(m[1]) > 0 && Number(m[2]) > 0) return { num: Number(m[1]), den: Number(m[2]) };
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) throw new Error(`--fps takes 24, 30 or 24000/1001, not ${text}`);
  for (const [approx, r] of [[23.976, { num: 24000, den: 1001 }], [29.97, { num: 30000, den: 1001 }], [59.94, { num: 60000, den: 1001 }]] as const) if (Math.abs(v - approx) < 0.01) return r;
  if (Number.isInteger(v)) return { num: v, den: 1 };
  throw new Error(`--fps ${text} is not a standard rate`);
}

export function writeVisualFeatures(audioPath: string, outPath: string, fps: Rational, trackId: string): VisualFeatureTrack {
  const sha256 = createHash("sha256").update(readFileSync(audioPath)).digest("hex");
  const track = visualFeatures(decodeFloat(audioPath, FEATURE_SR), FEATURE_SR, fps, { trackId, file: basename(audioPath), sha256 });
  writeFileSync(outPath, `${JSON.stringify(track, null, 2)}\n`);
  return track;
}
