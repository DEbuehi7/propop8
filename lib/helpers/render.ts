// lib/helpers/render.ts
//
// Pure builders for the helper clips: the ffmpeg arguments and the WebVTT
// captions. Nothing here runs a process; scripts/media/helpers.ts does.
//
// Output: H.264 High, yuv420p, 30 fps constant, no audio, MP4 with the index
// at the front (+faststart) so a browser starts playing before it has the
// whole file. Phone screen recordings are variable frame rate and full-range
// colour; the fps filter and the format conversion make them uniform.

import { HELPER_WIDTH, type Caption, type Helper } from "./registry";

export const HELPER_FPS = 30;
/** x264 quality: higher is smaller. 28 keeps UI text legible at 540 px wide. */
export const HELPER_CRF = 28;

const sec = (n: number) => n.toFixed(3);

export function helperFfmpegArgs(h: Helper, sourcePath: string, outPath: string): string[] {
  if (h.segments.length === 0) throw new Error(`${h.id}: no segments`);
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const [a, b] of h.segments) {
    if (!(b > a) || a < 0) throw new Error(`${h.id}: bad segment [${a}, ${b}]`);
    args.push("-ss", sec(a), "-t", sec(b - a), "-i", sourcePath);
  }
  const each = h.segments.map(
    (_, i) =>
      `[${i}:v]fps=${HELPER_FPS},crop=iw:${h.crop.height}:0:${h.crop.y},` +
      `scale=${HELPER_WIDTH}:-2:flags=lanczos:out_range=tv,setsar=1,setpts=PTS-STARTPTS[v${i}]`,
  );
  const joined = `${h.segments.map((_, i) => `[v${i}]`).join("")}concat=n=${h.segments.length}:v=1:a=0,format=yuv420p[out]`;
  args.push(
    "-filter_complex", [...each, joined].join(";"),
    "-map", "[out]", "-an",
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", String(HELPER_CRF),
    "-r", String(HELPER_FPS),
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}

export function posterFfmpegArgs(h: Helper, videoPath: string, outPath: string): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-ss", sec(h.posterAt), "-i", videoPath, "-frames:v", "1", "-q:v", "4", outPath];
}

function stamp(t: number): string {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

export function toVtt(captions: readonly Caption[]): string {
  const cues = captions.map((c, i) => `${i + 1}\n${stamp(c.from)} --> ${stamp(c.to)}\n${c.text}`);
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
