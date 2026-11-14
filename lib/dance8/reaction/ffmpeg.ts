// lib/dance8/reaction/ffmpeg.ts
//
// ffmpeg argument lists for the reaction layer. Pure: returns arguments and
// never runs anything. Overlays are silent; a composite takes its sound from
// the source footage exactly once and cuts on whole frames, so the picture
// never drifts from the music.

export interface Rate { num: number; den: number }
const q = (r: Rate) => `${r.num}/${r.den}`;
const sec = (frames: number, r: Rate) => (frames * r.den) / r.num;

/** Raw RGB frames on stdin to a silent H.264 overlay on black (composite with Screen blend). */
export function overlayEncodeArgs(o: { width: number; height: number; fps: Rate; outPath: string }): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${o.width}x${o.height}`, "-r", q(o.fps), "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", o.outPath,
  ];
}

const trim = (start: number, frames: number) =>
  `[0:v]trim=start_frame=${start}:end_frame=${start + frames},setpts=PTS-STARTPTS`;
const atrim = (start: number, frames: number, fps: Rate) =>
  `[0:a]atrim=start=${sec(start, fps).toFixed(6)}:end=${sec(start + frames, fps).toFixed(6)},asetpts=PTS-STARTPTS[a]`;

/** The source footage for one window, with its own sound, cut on whole frames. */
export function baseExcerptArgs(o: { basePath: string; startFrame: number; frames: number; fps: Rate; outPath: string }): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-i", o.basePath,
    "-filter_complex", `${trim(o.startFrame, o.frames)}[v];${atrim(o.startFrame, o.frames, o.fps)}`,
    "-map", "[v]", "-map", "[a]", "-frames:v", String(o.frames),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outPath,
  ];
}

/** The overlay Screen-blended over the source footage, with the source's sound once. */
export function compositeArgs(o: { basePath: string; overlayPath: string; startFrame: number; frames: number; fps: Rate; outPath: string }): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y", "-i", o.basePath, "-i", o.overlayPath,
    "-filter_complex",
    `${trim(o.startFrame, o.frames)},format=gbrp[b];[1:v]format=gbrp[o];[b][o]blend=all_mode=screen,format=yuv420p[v];${atrim(o.startFrame, o.frames, o.fps)}`,
    "-map", "[v]", "-map", "[a]", "-frames:v", String(o.frames),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outPath,
  ];
}

/** Joins same-format parts listed in a concat file without re-encoding. */
export function concatArgs(listPath: string, outPath: string): string[] {
  return ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outPath];
}
