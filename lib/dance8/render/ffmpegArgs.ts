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
  /** Seconds into the song where this render starts (shorts/teasers). */
  audioOffsetSec?: number;
  /**
   * Beat punch: a quick zoom on every bar line that eases back out, so the
   * music visibly moves the picture. 0.04-0.08 reads well; 0 or absent = off.
   */
  punch?: number;
  /** Small caption burned in for the first `seconds` (e.g. the AI disclosure). */
  caption?: { text: string; fontFile: string; seconds: number };
  /** Bold lyric captions, each shown for its own time range (render time). */
  lyrics?: { fontFile: string; lines: { text: string; startSec: number; endSec: number }[] };
}

/** Escapes text for ffmpeg drawtext inside a filtergraph. */
export function escapeDrawtext(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");
}

/** Greedy word wrap; a single word longer than the row stays whole. */
export function wrapWords(text: string, maxChars: number): string[] {
  const rows: string[] = [];
  let cur = "";
  for (const word of text.trim().split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > maxChars) {
      rows.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) rows.push(cur);
  return rows;
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
  if (o.audioOffsetSec && o.audioOffsetSec > 0) args.push("-ss", o.audioOffsetSec.toFixed(6));
  args.push("-i", o.audioPath);

  const parts: string[] = [];
  cuts.forEach((cut, i) => {
    const frames = frameAt(cut.endSec, o.fps) - frameAt(cut.startSec, o.fps);
    // Rounding can push the last frame one past the end of the clip; pull the
    // in-point back instead so every shot has exactly `frames` frames.
    const clipFrames = Math.floor(byId.get(cut.clipId)!.durationSec * o.fps);
    const inFrame = Math.max(0, Math.min(frameAt(cut.clipInSec, o.fps), clipFrames - frames));
    let chain =
      `[${i}:v]fps=${o.fps},scale=${o.width}:${o.height}:force_original_aspect_ratio=increase,` +
      `crop=${o.width}:${o.height},setsar=1,trim=start_frame=${inFrame}:end_frame=${inFrame + frames},setpts=PTS-STARTPTS`;
    if (o.punch && o.punch > 0) {
      // Every cut starts on a bar line, so local time mod bar length is the
      // time since the last downbeat. Scale up, then crop back to size.
      const barSec = (cut.endSec - cut.startSec) / (cut.endBar - cut.startBar);
      const z = `(1+${o.punch}*exp(-9*mod(t\\,${barSec.toFixed(6)})))`;
      chain +=
        `,scale=w='trunc(${o.width}*${z}/2)*2':h='trunc(${o.height}*${z}/2)*2':eval=frame` +
        `,crop=${o.width}:${o.height},setsar=1`;
    }
    parts.push(`${chain}[v${i}]`);
  });
  const concat = `${cuts.map((_, i) => `[v${i}]`).join("")}concat=n=${cuts.length}:v=1:a=0`;
  const overlays: string[] = [];
  // Lyric lines are wrapped to the frame width and each row centred.
  const lyricPx = Math.round(Math.min(o.height / 26, o.width / 14));
  const perRow = Math.max(8, Math.floor(o.width / (lyricPx * 0.66)));
  for (const line of o.lyrics?.lines ?? []) {
    const rows = wrapWords(line.text, perRow);
    rows.forEach((row, r) => {
      const y = Math.round(o.height * 0.7 + (r - (rows.length - 1) / 2) * lyricPx * 1.25);
      overlays.push(
        `drawtext=fontfile='${o.lyrics!.fontFile}':text='${escapeDrawtext(row)}':` +
          `fontsize=${lyricPx}:fontcolor=white:borderw=${Math.max(2, Math.round(lyricPx / 18))}:bordercolor=black@0.85:` +
          `x=(w-tw)/2:y=${y}:enable='between(t\\,${line.startSec.toFixed(3)}\\,${line.endSec.toFixed(3)})'`,
      );
    });
  }
  if (o.caption) {
    const c = o.caption;
    overlays.push(
      `drawtext=fontfile='${c.fontFile}':text='${escapeDrawtext(c.text)}':` +
        `fontsize=h/48:fontcolor=white@0.9:box=1:boxcolor=black@0.45:boxborderw=8:` +
        `x=(w-tw)/2:y=h-th-h/14:enable='lt(t\\,${c.seconds})'`,
    );
  }
  parts.push(overlays.length ? `${concat}[vcat]` : `${concat}[vout]`);
  if (overlays.length) parts.push(`[vcat]${overlays.join(",")}[vout]`);

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
