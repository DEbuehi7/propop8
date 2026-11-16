// lib/dance8/gridPipeline.ts
//
// Renders an Ocular Director grid plan (lib/dance8/render/grid.ts) for a song
// in the Stuttr library: one silent video per block, joined, with the song's
// Stuttr voice master under it (never the Suno master, D8-14), and a manifest
// beside the video listing every block, cell, warning and hash. Offline: no
// network and nothing paid for. Clips are read, never written.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { castDrift, loadManifest, type Ctx } from "../stuttr/commands";
import { pickMaster } from "../stuttr/library";
import type { CueMap, VisualClipLibrary } from "./contracts/scene";
import { songPaths, withCast } from "./pipeline";
import { AI_DISCLOSURE } from "./render/disclosure";
import { chooseRenderFps, parseRate } from "./render/fps";
import { gridBlockArgs, gridMuxArgs, MAX_PULSES_PER_SEC, resolveGrid, type GridIssue, type GridPlan } from "./render/grid";

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
  /** Font for the disclosure caption on a final. */
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
export function gridRender(c: Ctx, trackId: string, planPath: string, r: GridRequest = {}): GridRenderResult {
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
  const used = [...new Set((plan.blocks ?? []).flatMap((b) => (b.cells ?? []).map((x) => x.clipId)))];
  const files = new Map(library.clips.map((x) => [x.id, join(p.clipDir, x.file)]));
  const missing = used.filter((id) => files.has(id) && !existsSync(files.get(id)!));
  if (missing.length) throw new Error(`clip file(s) missing in ${p.clipDir}: ${missing.map((id) => basename(files.get(id)!)).join(", ")}`);
  let fps = r.fps;
  if (fps === undefined) {
    const choice = chooseRenderFps(used.filter((id) => files.has(id)).map((id) => probeVideo(files.get(id)!).rate));
    fps = choice.fps;
    if (choice.uneven.length) log(`note: clips at ${choice.uneven.join(", ")} fps do not divide evenly into ${fps} fps and may judder`);
  }

  const res = resolveGrid(plan, map, library, { fps, approved: !!r.approved });
  if (!res.ok) throw new Error(`the grid plan does not check out:\n${res.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  for (const w of res.warnings) log(`warning: ${w.path}: ${w.message}`);

  const pick = pickMaster(t, { final: !!r.approved, key: r.master, extraProblem: (m) => castDrift(c, m) });
  if ("error" in pick) throw new Error(pick.error);
  if (pick.warning) log(`warning: ${pick.warning}`);
  const master = pick.master;
  const audioPath = join(c.library, master.path);

  let caption: { text: string; fontFile: string; seconds: number } | undefined;
  if (r.approved) {
    const font = r.font ?? FONT_GUESSES.find((f) => existsSync(f));
    if (!font) throw new Error("no font found for the AI disclosure caption; pass --font FILE");
    caption = { text: AI_DISCLOSURE, fontFile: font, seconds: Math.min(4, res.totalFrames / fps) };
  }

  const renders = join(p.dir, "renders");
  const name = `${trackId}-grid-${plan.id.replace(/[^A-Za-z0-9._-]/g, "_")}-${r.approved ? "final" : "draft"}`;
  const out = join(renders, `${name}.mp4`);
  const work = join(renders, `.${name}.blocks`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  try {
    const parts: string[] = [];
    for (const b of res.blocks) {
      const part = join(work, `block-${String(b.index).padStart(3, "0")}.mp4`);
      log(`block ${b.index + 1}/${res.blocks.length}: bars ${b.startBar}-${b.endBar}, ${b.layout}, ${b.frames} frames`);
      ffmpeg(gridBlockArgs(b, { width: res.width, height: res.height, fps, style: plan.style, clipPath: (id) => files.get(id)!, outPath: part }));
      parts.push(part);
    }
    const list = join(work, "blocks.txt");
    writeFileSync(list, parts.map((x) => `file '${x.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    ffmpeg(gridMuxArgs({ listPath: list, audioPath, audioOffsetSec: res.audioOffsetSec, totalFrames: res.totalFrames, fps, outPath: out, caption }));
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
    trackId, final: !!r.approved, fps, width: res.width, height: res.height,
    audio: { master: master.key, status: master.status, sha256: master.sha256, offsetSec: res.audioOffsetSec },
    tempo: map.tempo, firstDownbeatSec: map.firstDownbeatSec ?? 0,
    totalFrames: res.totalFrames,
    blocks: res.blocks.map((b) => ({
      bars: [b.startBar, b.endBar], layout: b.layout, startSec: b.startSec, endSec: b.endSec, frames: b.frames, pulseEverySec: b.pulseEverySec,
      cells: b.cells.map((x) => ({ clipId: x.clipId, primary: x.primary, time: x.time, inSec: x.inSec, holdFrames: x.holdFrames, rect: x.rect })),
    })),
    warnings: res.warnings, checks, output: { file: basename(out), sha256: sha256File(out) },
  }, null, 2) + "\n");
  const failed = checks.filter((x) => !x.pass);
  if (failed.length) throw new Error(`rendered, but ${failed.map((x) => `${x.name} (${x.detail})`).join("; ")}; see ${basename(manifest)}`);
  log(`${out}\n  ${res.totalFrames} frames at ${fps} fps; manifest ${basename(manifest)}`);
  return { out, manifest, warnings: res.warnings, totalFrames: res.totalFrames, fps };
}
