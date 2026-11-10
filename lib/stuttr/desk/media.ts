// lib/stuttr/desk/media.ts
//
// What a media file really is, measured with ffprobe and ffmpeg, never read
// from its extension: codec, sample rate, channels, bit depth, length and
// peak level, and (for video) size, frame rate and whether the rate varies.
// Reads only; writes nothing.

import { spawnSync } from "node:child_process";
import type { MediaProbe } from "./reconcile";
import { parseRate } from "../../dance8/render/fps";

export const hasTool = (name: "ffmpeg" | "ffprobe") => spawnSync(name, ["-version"]).status === 0;

export function probeAudio(path: string): MediaProbe {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample:format=duration", "-of", "json", path], { encoding: "utf8" });
  const fail = (error: string): MediaProbe => ({ codec: null, sampleRate: null, channels: null, bitsPerSample: null, durationSec: null, peakDb: null, error });
  if (r.status !== 0) return fail(r.stderr.trim().split("\n").pop() || "ffprobe failed");
  let j: { streams?: Record<string, string | number>[]; format?: { duration?: string } };
  try { j = JSON.parse(r.stdout); } catch { return fail("unreadable ffprobe output"); }
  const s = j.streams?.[0];
  if (!s) return fail("no audio stream");
  const num = (v: unknown) => (v === undefined || v === null || v === "" || Number(v) === 0 ? null : Number(v));
  const d = Number(j.format?.duration);
  const v = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const peak = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(v.stderr ?? "");
  return {
    codec: typeof s.codec_name === "string" ? s.codec_name : null,
    sampleRate: num(s.sample_rate), channels: num(s.channels), bitsPerSample: num(s.bits_per_raw_sample) ?? num(s.bits_per_sample),
    durationSec: Number.isFinite(d) ? Math.round(d * 1e6) / 1e6 : null,
    peakDb: peak ? (peak[1] === "-inf" ? -Infinity : Number(peak[1])) : null,
  };
}

export interface VideoProbe {
  width: number;
  height: number;
  durationSec: number;
  /** r_frame_rate as a number, and as ffprobe gave it ("24000/1001"). */
  fps: number;
  fpsText: string;
  /** avg_frame_rate differs from r_frame_rate: the clip's frame rate varies (VFR). */
  variableRate: boolean;
  hasAudio: boolean;
}

export function probeVideo(path: string): VideoProbe | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate:format=duration", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout) as { streams?: { codec_type: string; width?: number; height?: number; r_frame_rate?: string; avg_frame_rate?: string }[]; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const d = Number(j.format?.duration);
  if (!v || !v.width || !v.height || !Number.isFinite(d)) return null;
  const fps = parseRate(v.r_frame_rate ?? "");
  const avg = parseRate(v.avg_frame_rate ?? "");
  return {
    width: v.width, height: v.height, durationSec: Math.round(d * 1000) / 1000, fps, fpsText: v.r_frame_rate ?? "?",
    variableRate: Number.isFinite(avg) && Number.isFinite(fps) && Math.abs(avg - fps) / fps > 0.01,
    hasAudio: !!j.streams?.some((s) => s.codec_type === "audio"),
  };
}
