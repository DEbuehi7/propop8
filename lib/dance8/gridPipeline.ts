// lib/dance8/gridPipeline.ts
//
// Renders an Ocular Director grid plan (lib/dance8/render/grid.ts) for a song
// in the Stuttr library: one silent video per block, joined, with the song's
// Stuttr voice master under it (never the Suno master, D8-14), and a manifest
// beside the video listing every block, cell, warning and hash. Offline: no
// network and nothing paid for. Clips are read, never written.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { castDrift, loadManifest, type Ctx } from "../stuttr/commands";
import { pickMaster } from "../stuttr/library";
import type { HarmonyTimeline } from "./contracts/harmony";
import type { KirtledEventMap, PrincipalList } from "./contracts/instrument";
import type { CueMap, VisualClipLibrary } from "./contracts/scene";
import { checkEventMap, type PlayedHit } from "./harmony/eventMap";
import { songPaths, withCast } from "./pipeline";
import { AI_DISCLOSURE } from "./render/disclosure";
import { chooseRenderFps, parseRate } from "./render/fps";
import { gridBlockArgs, gridJoinArgs, gridMuxArgs, lyricsCellArgs, MAX_PULSES_PER_SEC, resolveGrid, type GridIssue, type GridPlan, type LyricTiming, type ResolvedCell } from "./render/grid";
import { kirtledFrames } from "./render/kirtledView";

export const GRID_MANIFEST_SCHEMA = "dance8.grid-render.v1";

const FONT_GUESSES = [
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

function ffmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`);
}

/** Streams generated frames into an H.264 file. */
async function encodeFrames(frames: Iterable<Uint8Array>, o: { width: number; height: number; fps: number; outPath: string }): Promise<void> {
  const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${o.width}x${o.height}`, "-r", String(o.fps), "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", o.outPath], { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (d) => { err += String(d); });
  const done = new Promise<void>((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg failed: ${err.trim().split("\n").pop()}`)))));
  for (const f of frames) if (!ff.stdin.write(f)) await new Promise<void>((r) => ff.stdin.once("drain", () => r()));
  ff.stdin.end();
  await done;
}

function probeVideo(path: string): { rate: number; frames: number | null } {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=r_frame_rate,nb_read_packets", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${basename(path)}`);
  const s = (JSON.parse(r.stdout) as { streams: { r_frame_rate?: string; nb_read_packets?: string }[] }).streams[0] ?? {};
  return { rate: parseRate(s.r_frame_rate ?? ""), frames: s.nb_read_packets ? Number(s.nb_read_packets) : null };
}

export interface GridRequest {
  /** Final: approved clips and master only, with the AI disclosure. */
  approved?: boolean;
  /** Override the frame rate; by default the clips' own rate. */
  fps?: number;
  /** Which voice master plays, when the song has more than one approved. */
  master?: string;
  /** Font for the lyrics view and the disclosure caption on a final. */
  font?: string;
}

export interface GridRenderResult {
  out: string;
  manifest: string;
  warnings: GridIssue[];
  totalFrames: number;
  fps: number;
}

/** Renders the plan at `planPath` for `trackId`; throws with every problem when the plan does not check out. */
export async function gridRender(c: Ctx, trackId: string, planPath: string, r: GridRequest = {}): Promise<GridRenderResult> {
  const log = c.log ?? ((l: string) => console.log(l));
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap) || !existsSync(p.clips)) throw new Error(`no plan yet; run: npm run dance8 -- plan ${trackId}`);
  const planFile = resolve(planPath);
  if (!existsSync(planFile)) throw new Error(`no grid plan at ${planFile}`);
  const plan = readJson<GridPlan>(planFile);
  const map = withCast(c, t, p, readJson<CueMap>(p.cuemap)).map;
  const library = readJson<VisualClipLibrary>(p.clips);

  // The clips' own frame rate, measured (render/fps.ts), unless overridden.
  const cams = new Set((plan.blocks ?? []).flatMap((b) => (b.cells ?? []).flatMap((x) => (x.view === "instrument" && x.camera ? [x.camera] : []))));
  const instrumentClips = library.clips.filter((x) => x.instrument && cams.has(x.instrument.camera)).map((x) => x.id);
  const used = [...new Set([...(plan.blocks ?? []).flatMap((b) => (b.cells ?? []).flatMap((x) => (x.clipId === undefined ? [] : [x.clipId]))), ...instrumentClips])];
  const files = new Map(library.clips.map((x) => [x.id, join(p.clipDir, x.file)]));
  const missing = used.filter((id) => files.has(id) && !existsSync(files.get(id)!));
  if (missing.length) throw new Error(`clip file(s) missing in ${p.clipDir}: ${missing.map((id) => basename(files.get(id)!)).join(", ")}`);
  let fps = r.fps;
  if (fps === undefined) {
    const choice = chooseRenderFps(used.filter((id) => files.has(id)).map((id) => probeVideo(files.get(id)!).rate));
    fps = choice.fps;
    if (choice.uneven.length) log(`note: clips at ${choice.uneven.join(", ")} fps do not divide evenly into ${fps} fps and may judder`);
  }

  const lyricsFile = join(p.dir, `${trackId}.lyrics.json`);
  const lyrics = existsSync(lyricsFile) ? readJson<LyricTiming>(lyricsFile) : null;
  // Who must have a view of its own, and the instrument's event map (checked against the chords).
  const principalsFile = join(p.dir, `${trackId}.principals.json`);
  const principals = existsSync(principalsFile) ? readJson<PrincipalList>(principalsFile) : null;
  const eventsFile = join(p.dir, `${trackId}.kirtled-events.json`);
  const eventMap = existsSync(eventsFile) ? readJson<KirtledEventMap>(eventsFile) : null;
  let hits: PlayedHit[] = [];
  if (eventMap) {
    const timeline = existsSync(p.harmony) ? readJson<HarmonyTimeline>(p.harmony) : null;
    const ev = checkEventMap(eventMap, map, timeline, { final: !!r.approved });
    if (!ev.ok) throw new Error(`the Kirtled event map does not check out:\n${ev.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
    for (const w of ev.warnings) log(`warning: event map: ${w.path}: ${w.message}`);
    hits = ev.hits;
  }
  const res = resolveGrid(plan, map, library, {
    fps, approved: !!r.approved, lyrics, principals,
    eventMap: eventMap ? { id: eventMap.id, approved: eventMap.status === "approved" && !!eventMap.approvedBy } : null,
  });
  if (!res.ok) throw new Error(`the grid plan does not check out:\n${res.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  for (const w of res.warnings) log(`warning: ${w.path}: ${w.message}`);

  const pick = pickMaster(t, { final: !!r.approved, key: r.master, extraProblem: (m) => castDrift(c, m) });
  if ("error" in pick) throw new Error(pick.error);
  if (pick.warning) log(`warning: ${pick.warning}`);
  const master = pick.master;
  const audioPath = join(c.library, master.path);

  const font = r.font ?? FONT_GUESSES.find((f) => existsSync(f));
  const usesLyrics = res.blocks.some((b) => b.cells.some((x) => x.view === "lyrics"));
  if (!font && (r.approved || usesLyrics)) throw new Error(`no font found for the ${usesLyrics ? "lyrics view" : "AI disclosure caption"}; pass --font FILE`);
  const caption = r.approved ? { text: AI_DISCLOSURE, fontFile: font!, seconds: Math.min(4, res.totalFrames / fps) } : undefined;

  const renders = join(p.dir, "renders");
  const name = `${trackId}-grid-${plan.id.replace(/[^A-Za-z0-9._-]/g, "_")}-${r.approved ? "final" : "draft"}`;
  const out = join(renders, `${name}.mp4`);
  const work = join(renders, `.${name}.blocks`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const parts: string[] = [];
    for (const b of res.blocks) {
      const tag = String(b.index).padStart(3, "0");
      const part = join(work, `block-${tag}.mp4`);
      log(`block ${b.index + 1}/${res.blocks.length}: bars ${b.startBar}-${b.endBar}, ${b.layout}, ${b.frames} frames`);
      // The lyrics and Kirtled views are drawn for this block, pre-roll included.
      const total = b.frames + b.prerollFrames;
      const views = new Map<number, string>();
      for (const [i, cell] of b.cells.entries()) {
        if (cell.view === "clip") continue;
        const file = join(work, `block-${tag}-${cell.view}${cell.camera ? `-${cell.camera}` : ""}.mp4`);
        const fromSec = cell.inSec - b.prerollFrames / fps;
        if (cell.view === "lyrics") {
          ffmpeg(lyricsCellArgs({ lyrics: lyrics!, width: cell.rect.w, height: cell.rect.h, fps, frames: total, fromSec, fontFile: font!, outPath: file }));
        } else {
          // The Kirtled pattern, or the drawn stand-in for an instrument camera that has no footage yet.
          const seg = [...map.tempo].reverse().find((t) => t.startBar <= b.startBar) ?? map.tempo[0];
          const view = cell.view === "instrument" ? (cell.camera === "CAM-KIR-02" ? "detail" : "overhead") : "pattern";
          await encodeFrames(kirtledFrames({ width: cell.rect.w, height: cell.rect.h, fps, startSec: b.startSec - b.prerollFrames / fps, frames: total, bpm: seg.bpm, beatsPerBar: seg.beatsPerBar, view, hits }),
            { width: cell.rect.w, height: cell.rect.h, fps, outPath: file });
        }
        views.set(i, file);
      }
      const cellPath = (cell: ResolvedCell, i: number) => (cell.view === "clip" ? files.get(cell.clipId)! : views.get(i)!);
      ffmpeg(gridBlockArgs(b, { width: res.width, height: res.height, fps, style: plan.style, cellPath, outPath: part }));
      parts.push(part);
    }
    const picture = join(work, "picture.mp4");
    ffmpeg(gridJoinArgs({ parts, frames: res.blocks.map((b) => b.frames), fade: res.transitionFrames, fps, outPath: picture }));
    ffmpeg(gridMuxArgs({ picturePath: picture, audioPath, audioOffsetSec: res.audioOffsetSec, totalFrames: res.totalFrames, fps, outPath: out, caption }));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const got = probeVideo(out).frames;
  const checks = [
    { name: "frame count", pass: got === res.totalFrames, detail: `${got} of ${res.totalFrames} frames` },
    { name: "beat pulse", pass: res.blocks.every((b) => b.pulseEverySec === null || 1 / b.pulseEverySec <= MAX_PULSES_PER_SEC + 1e-6), detail: `at most ${MAX_PULSES_PER_SEC} a second` },
  ];
  const manifest = `${out}.grid.json`;
  writeFileSync(manifest, JSON.stringify({
    schema: GRID_MANIFEST_SCHEMA,
    plan: { id: plan.id, file: planFile, sha256: sha256File(planFile) },
    trackId, final: !!r.approved, fps, width: res.width, height: res.height, transitionFrames: res.transitionFrames,
    lyrics: lyrics ? { file: basename(lyricsFile), status: lyrics.status, sha256: sha256File(lyricsFile) } : null,
    principals: principals ? { file: basename(principalsFile), ids: principals.principals.map((x) => x.id), sha256: sha256File(principalsFile) } : null,
    kirtledEvents: eventMap ? { file: basename(eventsFile), id: eventMap.id, status: eventMap.status, drawn: hits.length, of: eventMap.events.length, sha256: sha256File(eventsFile) } : null,
    audio: { master: master.key, status: master.status, sha256: master.sha256, offsetSec: res.audioOffsetSec },
    tempo: map.tempo, firstDownbeatSec: map.firstDownbeatSec ?? 0,
    totalFrames: res.totalFrames,
    blocks: res.blocks.map((b) => ({
      bars: [b.startBar, b.endBar], layout: b.layout, startSec: b.startSec, endSec: b.endSec, frames: b.frames, pulseEverySec: b.pulseEverySec,
      cells: b.cells.map((x) => ({ view: x.view, clipId: x.clipId, ...(x.camera ? { camera: x.camera } : {}), primary: x.primary, time: x.time, inSec: x.inSec, holdFrames: x.holdFrames, rect: x.rect })),
    })),
    warnings: res.warnings, checks, output: { file: basename(out), sha256: sha256File(out) },
  }, null, 2) + "\n");
  const failed = checks.filter((x) => !x.pass);
  if (failed.length) throw new Error(`rendered, but ${failed.map((x) => `${x.name} (${x.detail})`).join("; ")}; see ${basename(manifest)}`);
  log(`${out}\n  ${res.totalFrames} frames at ${fps} fps; manifest ${basename(manifest)}`);
  return { out, manifest, warnings: res.warnings, totalFrames: res.totalFrames, fps };
}
