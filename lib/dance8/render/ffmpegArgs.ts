// lib/dance8/render/ffmpegArgs.ts
//
// Builds the ffmpeg argument list that renders a cut plan over the song.
// Pure: returns arguments, never runs anything. Cut lengths are counted in
// whole frames from the track origin, so rounding never accumulates and the
// picture stays on the beat for the whole song.

import type { Cut, VisualClipLibrary } from "../contracts/scene";

export interface RenderOptions {
  clipDir: string;
  audioPath: string;
  outPath: string;
  width: number;
  height: number;
  fps: number;
}

export function frameAt(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

export function buildFfmpegArgs(cuts: Cut[], library: VisualClipLibrary, o: RenderOptions): string[] {
  if (cuts.length === 0) throw new Error("no cuts to render");
  const byId = new Map(library.clips.map((c) => [c.id, c]));
  const join = (dir: string, f: string) => (dir.endsWith("/") ? dir + f : `${dir}/${f}`);

  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const cut of cuts) {
    const clip = byId.get(cut.clipId);
    if (!clip) throw new Error(`cut ${cut.index} uses unknown clip ${cut.clipId}`);
    args.push("-i", join(o.clipDir, clip.file));
  }
  args.push("-i", o.audioPath);

  const parts: string[] = [];
  cuts.forEach((cut, i) => {
    const frames = frameAt(cut.endSec, o.fps) - frameAt(cut.startSec, o.fps);
    // Rounding can push the last frame one past the end of the clip; pull the
    // in-point back instead so every shot has exactly `frames` frames.
    const clipFrames = Math.floor(byId.get(cut.clipId)!.durationSec * o.fps);
    const inFrame = Math.max(0, Math.min(frameAt(cut.clipInSec, o.fps), clipFrames - frames));
    parts.push(
      `[${i}:v]fps=${o.fps},scale=${o.width}:${o.height}:force_original_aspect_ratio=increase,` +
        `crop=${o.width}:${o.height},setsar=1,trim=start_frame=${inFrame}:end_frame=${inFrame + frames},setpts=PTS-STARTPTS[v${i}]`,
    );
  });
  parts.push(`${cuts.map((_, i) => `[v${i}]`).join("")}concat=n=${cuts.length}:v=1:a=0[vout]`);

  const totalFrames = frameAt(cuts[cuts.length - 1].endSec, o.fps) - frameAt(cuts[0].startSec, o.fps);
  args.push(
    "-filter_complex", parts.join(";"),
    "-map", "[vout]",
    "-map", `${cuts.length}:a:0`,
    "-frames:v", String(totalFrames),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(o.fps),
    "-c:a", "aac", "-shortest",
    o.outPath,
  );
  return args;
}
