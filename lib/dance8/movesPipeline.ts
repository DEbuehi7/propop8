// lib/dance8/movesPipeline.ts
//
// File side of `dance8 moves` (canon D8-17), for a song in the Stuttr library:
//
//   prepareTakes  each video: probe it, sync its sound to the song (or take
//                 the person's offset), and cut it into still frames in a
//                 temporary folder for the pose tracker.
//   saveTakes     the tracker's body points → <id>/dance8/moves/<take>.poses.json,
//                 the dance on the song's grid → <take>.moves.json, and a
//                 readout in README.txt.
//   rereadTakes   rebuild every .moves.json from saved poses (after the cue map
//                 or a threshold changes) without filming or tracking again.
//
// Rules: the videos are read where the person keeps them and never copied
// into the library or the repo; frames live in a temporary folder that is
// removed afterwards. Dance8 reads the song's saved analysis, never its audio
// (D8-14). Nothing here approves anything: every take is a draft.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { SongAnalysis } from "../stuttr/analysis";
import { decodeFloat, loadManifest, type Ctx } from "../stuttr/commands";
import type { CaptureSync, MoveTrack, PoseCapture, PoseFrame } from "./contracts/moves";
import type { CueMap } from "./contracts/scene";
import { manualSync, syncTake } from "./moves/sync";
import { buildMoveTrack, readoutLines, wordLines } from "./moves/track";
import { songPaths } from "./pipeline";

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const nowOf = (c: Ctx) => (c.now ? c.now() : new Date().toISOString());
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v) + "\n");

/** Frames per second sampled from each video. */
export const CAPTURE_FPS = 30;
/** Frames are scaled so their short side is at most this (the tracker works at 256 px). */
export const FRAME_SHORT_SIDE = 720;

/** Google's pose models (Apache-2.0), downloaded once into the library. */
export const POSE_MODELS = {
  full: { id: "pose_landmarker_full", url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task" },
  heavy: { id: "pose_landmarker_heavy", url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task" },
} as const;
export type PoseModel = keyof typeof POSE_MODELS;
export const TRACKER_LIBRARY = "@mediapipe/tasks-vision@1.0.1";

export interface MovesPaths {
  dir: string;
  readme: string;
  poses: (take: string) => string;
  moves: (take: string) => string;
}

export function movesPaths(c: Ctx, trackId: string): MovesPaths {
  const dir = join(songPaths(c, trackId).dir, "moves");
  return { dir, readme: join(dir, "README.txt"), poses: (t) => join(dir, `${t}.poses.json`), moves: (t) => join(dir, `${t}.moves.json`) };
}

export interface SongForMoves {
  trackId: string;
  title: string;
  map: CueMap;
  analysis: SongAnalysis | null;
}

export function songForMoves(c: Ctx, trackId: string): SongForMoves {
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap)) throw new Error(`no cue map yet; run: npm run dance8 -- plan ${trackId}`);
  return { trackId, title: t.title, map: readJson<CueMap>(p.cuemap), analysis: existsSync(p.analysis) ? readJson<SongAnalysis>(p.analysis) : null };
}

const run = (cmd: string, args: string[]) => spawnSync(cmd, args, { maxBuffer: 2 ** 28 });
export const hasTool = (cmd: string) => run(cmd, ["-version"]).status === 0;

interface Probe { durationSec: number; videoStartSec: number; audioStartSec: number | null }
function probeVideo(path: string): Probe {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,start_time:format=duration", "-of", "json", path]);
  if (r.status !== 0) throw new Error(`ffprobe could not read ${basename(path)}`);
  const j = JSON.parse(String(r.stdout)) as { streams: { codec_type: string; start_time?: string }[]; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${basename(path)} has no video`);
  const a = j.streams.find((s) => s.codec_type === "audio");
  return { durationSec: Number(j.format.duration ?? 0), videoStartSec: Number(v.start_time ?? 0) || 0, audioStartSec: a ? Number(a.start_time ?? 0) || 0 : null };
}

async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

export function takeIdFor(file: string, taken: Set<string>): string {
  const base = basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "take";
  let id = base, k = 2;
  while (taken.has(id)) id = `${base}-${k++}`;
  taken.add(id);
  return id;
}

export interface PreparedTake {
  takeId: string;
  videoPath: string;
  sha256: string;
  probe: Probe;
  sync: CaptureSync;
  frameDir: string;
  frames: number;
  width: number;
  height: number;
  fps: number;
}

/**
 * Sync first (it is quick, and a take that cannot be placed on the song is no
 * use), then frames. Throws with the reason and the fix when a take is refused.
 */
export async function prepareTakes(
  c: Ctx, song: SongForMoves, videos: string[], o: { offsetSec?: number; fps?: number } = {},
): Promise<PreparedTake[]> {
  const log = logOf(c);
  if (!hasTool("ffmpeg") || !hasTool("ffprobe")) throw new Error("ffmpeg is not installed. On a Mac: brew install ffmpeg");
  if (o.offsetSec === undefined && !song.analysis?.sync) {
    throw new Error(`the song's analysis has no sync fingerprint yet; run: npm run stuttr -- analyze ${song.trackId}`);
  }
  const mp = movesPaths(c, song.trackId);
  const taken = new Set(existsSync(mp.dir) ? readdirSync(mp.dir).filter((f) => f.endsWith(".poses.json")).map((f) => f.replace(/\.poses\.json$/, "")) : []);
  const tempo = song.map.tempo[0];
  const barSec = (tempo.beatsPerBar * 60) / tempo.bpm;
  const out: PreparedTake[] = [];
  for (const videoPath of videos) {
    if (!existsSync(videoPath)) throw new Error(`no such video: ${videoPath}`);
    const probe = probeVideo(videoPath);
    const sha256 = await sha256File(videoPath);
    const takeId = takeIdFor(videoPath, taken);
    let sync: CaptureSync;
    if (o.offsetSec !== undefined) {
      sync = manualSync(o.offsetSec, nowOf(c));
      log(`${takeId}: using your offset, video second 0 = song second ${o.offsetSec}`);
    } else {
      if (probe.audioStartSec === null) throw new Error(`${basename(videoPath)} has no sound to sync by; give the song second at the start of the video with --offset`);
      const audio = decodeFloat(videoPath);
      const r = syncTake(song.analysis!.sync!, audio, probe.audioStartSec, nowOf(c), { barSec });
      if (!r.ok) {
        throw new Error(`${basename(videoPath)}: could not sync by ear: ${r.why}. Film with the song playing out loud, or give the song second at the start of the video with --offset (best guess: ${r.sync.songAtCapture0})`);
      }
      sync = r.sync;
      log(`${takeId}: synced by ear, video second 0 = song second ${sync.songAtCapture0} (match ${sync.r} vs ${sync.rNext})`);
    }
    const fps = o.fps ?? CAPTURE_FPS;
    const frameDir = mkdtempSync(join(tmpdir(), "dance8-frames-"));
    const s = FRAME_SHORT_SIDE;
    const scale = `scale='if(gt(iw,ih),-2,min(${s},iw))':'if(gt(iw,ih),min(${s},ih),-2)'`;
    const r = run("ffmpeg", ["-v", "error", "-i", videoPath, "-an", "-vf", `fps=${fps},${scale}`, "-q:v", "3", join(frameDir, "%06d.jpg")]);
    if (r.status !== 0) { rmSync(frameDir, { recursive: true, force: true }); throw new Error(`ffmpeg could not cut ${basename(videoPath)} into frames: ${String(r.stderr).trim().split("\n").pop()}`); }
    const frames = readdirSync(frameDir).filter((f) => f.endsWith(".jpg")).length;
    const dim = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(frameDir, "000001.jpg")]);
    const [width, height] = String(dim.stdout).trim().split(",").map(Number);
    if (!frames || !width || !height) { rmSync(frameDir, { recursive: true, force: true }); throw new Error(`no frames came out of ${basename(videoPath)}`); }
    log(`${takeId}: ${frames} frames at ${fps} fps, ${width}×${height}`);
    out.push({ takeId, videoPath, sha256, probe, sync, frameDir, frames, width, height, fps });
  }
  return out;
}

/** The pose model in the library, downloaded once. */
export async function ensureModel(c: Ctx, model: PoseModel): Promise<{ path: string; sha256: string; id: string }> {
  const m = POSE_MODELS[model];
  const dir = join(c.library, ".models");
  const path = join(dir, `${m.id}.task`);
  // A model is a zip bundle of a few MB; anything else is a broken download.
  const whole = (p: string) => { const b = readFileSync(p); return b.length > 1_000_000 && b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])); };
  if (existsSync(path) && !whole(path)) { logOf(c)(`the saved ${m.id} model is incomplete; downloading it again`); rmSync(path); }
  if (!existsSync(path)) {
    logOf(c)(`downloading the body-tracking model (${m.id}, from Google, once)...`);
    let res: Response;
    try { res = await fetch(m.url); } catch (e) {
      throw new Error(`could not download the body-tracking model from Google (${(e as Error & { cause?: Error }).cause?.message ?? (e as Error).message}); check the internet connection and try again`);
    }
    if (!res.ok) throw new Error(`could not download ${m.url}: HTTP ${res.status}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    if (!whole(path)) { rmSync(path); throw new Error(`the ${m.id} download was not a model file; try again`); }
  }
  return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex"), id: m.id };
}

export interface TrackedTake {
  delegate: "GPU" | "CPU";
  frames: { image: number[] | null; world: number[] | null }[];
}

/** Writes the poses and the moves for each take, and the readout. */
export function saveTakes(
  c: Ctx, song: SongForMoves, prepared: PreparedTake[], tracked: TrackedTake[], model: { id: string; sha256: string },
): MoveTrack[] {
  const mp = movesPaths(c, song.trackId);
  mkdirSync(mp.dir, { recursive: true });
  const tracks: MoveTrack[] = [];
  prepared.forEach((p, k) => {
    const t = tracked[k];
    if (t.frames.length !== p.frames) throw new Error(`${p.takeId}: the tracker returned ${t.frames.length} frames for ${p.frames}`);
    const frames: PoseFrame[] = t.frames.map((f, i) => ({ t: Math.round((p.probe.videoStartSec + i / p.fps) * 1e4) / 1e4, image: f.image, world: f.world }));
    const cap: PoseCapture = {
      schemaVersion: 1, takeId: p.takeId,
      video: { file: basename(p.videoPath), sha256: p.sha256, width: p.width, height: p.height, durationSec: p.probe.durationSec, videoStartSec: p.probe.videoStartSec, audioStartSec: p.probe.audioStartSec },
      fps: p.fps, model: { id: model.id, sha256: model.sha256, library: TRACKER_LIBRARY, delegate: t.delegate }, capturedAt: nowOf(c), frames,
    };
    writeJson(mp.poses(p.takeId), cap);
    const track = buildMoveTrack(cap, p.sync, song.map, nowOf(c));
    writeFileSync(mp.moves(p.takeId), JSON.stringify(track, null, 1) + "\n");
    tracks.push(track);
  });
  writeReadme(c, song);
  return tracks;
}

/** Rebuilds every take's moves from its saved poses, keeping its sync unless an offset is given. */
export function rereadTakes(c: Ctx, song: SongForMoves, o: { offsetSec?: number } = {}): MoveTrack[] {
  const mp = movesPaths(c, song.trackId);
  if (!existsSync(mp.dir)) throw new Error(`no takes yet; run: npm run dance8 -- moves ${song.trackId} <your video>`);
  const takes = readdirSync(mp.dir).filter((f) => f.endsWith(".poses.json")).map((f) => f.replace(/\.poses\.json$/, "")).sort();
  if (!takes.length) throw new Error(`no takes yet; run: npm run dance8 -- moves ${song.trackId} <your video>`);
  const tracks = takes.map((take) => {
    const cap = readJson<PoseCapture>(mp.poses(take));
    const old = existsSync(mp.moves(take)) ? readJson<MoveTrack>(mp.moves(take)) : null;
    const sync = o.offsetSec !== undefined ? manualSync(o.offsetSec, nowOf(c)) : old?.sync;
    if (!sync) throw new Error(`${take}: no saved sync; give --offset`);
    const track = { ...buildMoveTrack(cap, sync, song.map, nowOf(c)), ...(old && old.approvalStatus !== "draft" && o.offsetSec === undefined ? { approvalStatus: old.approvalStatus } : {}) };
    writeFileSync(mp.moves(take), JSON.stringify(track, null, 1) + "\n");
    return track;
  });
  writeReadme(c, song);
  return tracks;
}

export function loadTakes(c: Ctx, trackId: string): MoveTrack[] {
  const mp = movesPaths(c, trackId);
  if (!existsSync(mp.dir)) return [];
  return readdirSync(mp.dir).filter((f) => f.endsWith(".moves.json")).sort().map((f) => readJson<MoveTrack>(join(mp.dir, f)));
}

function writeReadme(c: Ctx, song: SongForMoves) {
  const mp = movesPaths(c, song.trackId);
  const takes = loadTakes(c, song.trackId);
  const lines = [
    `${song.title}: your moves (canon D8-17), ${takes.length} take${takes.length === 1 ? "" : "s"}`,
    "",
    "Your videos stay where you keep them; these files hold only body points and",
    "measurements. Words: DO stomp, RA travel, LA drop or rise, KA turn, TI jump,",
    "FREEZE hold. Beats count from 1. Everything here is a draft for you to check.",
    "",
  ];
  for (const t of takes) lines.push(...readoutLines(t, song.map), ...wordLines(t, song.map), "");
  lines.push(`Rebuild after editing the cue map: npm run dance8 -- moves ${song.trackId}`, "");
  writeFileSync(mp.readme, lines.join("\n"));
}

export function cleanupTakes(prepared: PreparedTake[]) {
  for (const p of prepared) rmSync(p.frameDir, { recursive: true, force: true });
}
