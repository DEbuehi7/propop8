// lib/dance8/editPipeline.ts
//
// Renders an edit list (contracts/edit.ts, checked by render/edit.ts) for a
// song in the Stuttr library, frame by frame in the house look
// (render/house.ts), with the song's Stuttr voice master under it (never the
// Suno master, D8-14) and a manifest beside the video: the check's metrics,
// every source and its slow-down, warnings and hashes. Offline: no network and
// nothing paid for. Clips and takes are read, never written.

import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, openSync, readSync, closeSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import sharp from "sharp";
import { castDrift, loadManifest, type Ctx } from "../stuttr/commands";
import { pickMaster } from "../stuttr/library";
import type { EditList } from "./contracts/edit";
import type { PrincipalList } from "./contracts/instrument";
import type { CueMap, VisualClipLibrary } from "./contracts/scene";
import { songPaths, withCast } from "./pipeline";
import { AI_DISCLOSURE } from "./render/disclosure";
import { ACCENT_SEC, acrosticOf, barLength, barPhase, beatSec, framePlan, isCaps, lyricAt, performerAlpha, resolveEdit, stillViewAt, tokenTimes, type EditResolution, type PlannedCell, type ResolvedContent } from "./render/edit";
import { gridMuxArgs, type GridIssue, type LyricTiming } from "./render/grid";
import {
  addLight, blit, cover, dim, floorImage, frameRect, gradient, grade, img, kirtledLight, paste, placePerformer, shade, spriteFromRgba, studio, toRgb24, traceImage, triangleBurst, viewMapper,
  type Img, type Sprite,
} from "./render/house";
import { LightBuffer, type RGB } from "./reaction/draw";
import { maxFlashesPerSecond, tileLuma } from "./reaction/render";
import type { MoveTrack, PoseCapture } from "./contracts/moves";
import { BONES, JOINTS, MIN_TRACE_VISIBILITY, bodyAt, buildTrace, centreOf, floorHits, type Trace } from "./moves/trace";
import { movesPaths } from "./moves/files";
import { buildScore, scoreCsv, type ScoreInput, type VisualScore } from "./render/score";
import type { HarmonyTimeline } from "./contracts/harmony";
import { readFeatures, validateFeatures } from "../stuttr/visualFeatures";
import { onsetPeaks } from "./reaction/plan";

export const EDIT_MANIFEST_SCHEMA = "dance8.edit-render.v1";

const TEXT_FONTS = ["/usr/share/fonts/opentype/inter/Inter-SemiBold.otf", "/Library/Fonts/Inter-SemiBold.otf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"];
const DISPLAY_FONTS = ["/usr/share/fonts/opentype/inter/InterDisplay-Black.otf", "/Library/Fonts/InterDisplay-Black.otf", "/System/Library/Fonts/Supplemental/Arial Black.ttf"];

const sha256File = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

export interface EditRequest {
  approved?: boolean;
  fps?: number;
  master?: string;
  /** Render only song seconds [from, to): a preview of part of the edit. */
  from?: number;
  to?: number;
  /** Draw at this height instead of the aspect's full size (a lighter draft); the width follows. */
  height?: number;
  /** Check and report only; render nothing. */
  checkOnly?: boolean;
  font?: string;
  displayFont?: string;
  /** The reduced-flash version: no triangle bursts, flares or downbeat pulses, and the floor's strikes softened. */
  calm?: boolean;
}

export interface EditRenderResult {
  out: string | null;
  manifest: string | null;
  resolution: EditResolution;
  warnings: GridIssue[];
}

// ---------- reading video ----------

function probe(path: string): { w: number; h: number } {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", path], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${basename(path)}`);
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return { w, h };
}

/** Frames of a file from `start` seconds at `fps`, read forward only. */
class FrameReader {
  private proc: ChildProcessByStdio<null, Readable, null>;
  private chunks: Buffer[] = [];
  private have = 0;
  private ended = false;
  private wake: (() => void) | null = null;
  private idx = -1;
  private frame: Uint8Array;
  readonly bytes: number;
  constructor(file: string, readonly start: number, readonly w: number, readonly h: number, readonly fps: number) {
    this.bytes = w * h * 3;
    this.frame = new Uint8Array(this.bytes);
    this.proc = spawn("ffmpeg", ["-v", "error", "-ss", Math.max(0, start).toFixed(4), "-i", file, "-vf", `fps=${fps}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "ignore"] });
    this.proc.stdout.on("data", (c: Buffer) => {
      this.chunks.push(c); this.have += c.length;
      if (this.have > this.bytes * 3) this.proc.stdout.pause();
      this.wake?.();
    });
    this.proc.stdout.on("end", () => { this.ended = true; this.wake?.(); });
  }
  private async next(): Promise<boolean> {
    while (this.have < this.bytes && !this.ended) await new Promise<void>((r) => { this.wake = r; this.proc.stdout.resume(); });
    this.wake = null;
    if (this.have < this.bytes) return false;
    const out = new Uint8Array(this.bytes);
    let off = 0;
    while (off < this.bytes) {
      const c = this.chunks[0], take = Math.min(c.length, this.bytes - off);
      out.set(c.subarray(0, take), off); off += take;
      if (take === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(take);
    }
    this.have -= this.bytes;
    if (this.have < this.bytes * 2) this.proc.stdout.resume();
    this.frame = out;
    return true;
  }
  /** The frame showing second `sec` of the file (the last one once the file ends). */
  async at(sec: number): Promise<Uint8Array> {
    const i = Math.floor((sec - Math.max(0, this.start)) * this.fps + 1e-3);
    while (this.idx < i) { if (!(await this.next())) break; this.idx++; }
    return this.frame;
  }
  /** Stops reading: closes the pipe first, so an ffmpeg blocked on a full pipe ends too. */
  close(): void { this.proc.stdout.destroy(); this.proc.kill("SIGKILL"); }
}

// ---------- type ----------

/** The family and style a font file names (OpenType name table), for Pango. */
export function fontName(path: string): string {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(12); readSync(fd, head, 0, 12, 0);
    const n = head.readUInt16BE(4);
    const dir = Buffer.alloc(16 * n); readSync(fd, dir, 0, dir.length, 12);
    for (let i = 0; i < n; i++) {
      if (dir.toString("latin1", i * 16, i * 16 + 4) !== "name") continue;
      const off = dir.readUInt32BE(i * 16 + 8), len = dir.readUInt32BE(i * 16 + 12);
      const t = Buffer.alloc(len); readSync(fd, t, 0, len, off);
      const count = t.readUInt16BE(2), store = t.readUInt16BE(4);
      const names = new Map<number, string>();
      for (let r = 0; r < count; r++) {
        const p = 6 + r * 12, platform = t.readUInt16BE(p), id = t.readUInt16BE(p + 6), l = t.readUInt16BE(p + 8), o = t.readUInt16BE(p + 10);
        const raw = t.subarray(store + o, store + o + l);
        if (platform === 3 || platform === 0) { const sw = Buffer.from(raw); sw.swap16(); if (!names.has(id) || platform === 3) names.set(id, sw.toString("utf16le")); }
        else if (platform === 1 && !names.has(id)) names.set(id, raw.toString("latin1"));
      }
      const family = names.get(16) ?? names.get(1) ?? "Sans";
      const style = (names.get(17) ?? names.get(2) ?? "").replace(/^Regular$/i, "");
      return style ? `${family}, ${style}` : `${family},`;
    }
  } finally { closeSync(fd); }
  return "Sans,";
}

interface Run { text: string; color: RGB; alpha: number }
const hex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

class Type {
  private cache = new Map<string, Sprite>();
  constructor(private text: { file: string; name: string }, private display: { file: string; name: string }, private scale: number) {}
  async sprite(key: string, runs: Run[], o: { display?: boolean; size: number; maxW: number; align?: "centre" | "left"; shadow?: boolean; pill?: boolean }): Promise<Sprite> {
    const k = `${key}|${o.maxW}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const f = o.display ? this.display : this.text;
    const markup = runs.map((r) => `<span foreground="${hex(r.color)}" alpha="${Math.round(r.alpha * 100)}%">${esc(r.text)}</span>`).join(" ");
    const size = Math.max(8, Math.round(o.size * this.scale));
    const { data, info } = await sharp({ text: { text: markup, font: `${f.name} ${size}`, fontfile: f.file, rgba: true, width: Math.max(16, Math.round(o.maxW)), align: o.align ?? "centre", dpi: 72 } })
      .raw().toBuffer({ resolveWithObject: true });
    const s = spriteFromRgba(new Uint8Array(data), info.width, info.height, { shadow: o.shadow ?? true, pill: o.pill });
    if (this.cache.size > 3000) this.cache.clear();
    this.cache.set(k, s);
    return s;
  }
}

const WHITE: RGB = [0.97, 0.96, 0.93];
const GOLDT: RGB = [0.98, 0.76, 0.3];

// ---------- the render ----------

/** The song, the edit list and everything the check needs, read from the library and checked. */
export function loadEdit(c: Ctx, trackId: string, editPath: string, o: { fps: number; approved: boolean }) {
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap) || !existsSync(p.clips)) throw new Error(`no plan yet; run: npm run dance8 -- plan ${trackId}`);
  const file = resolve(editPath);
  if (!existsSync(file)) throw new Error(`no edit list at ${file}`);
  const edit = readJson<EditList>(file);
  const map = withCast(c, t, p, readJson<CueMap>(p.cuemap)).map;
  const library = readJson<VisualClipLibrary>(p.clips);
  const lyricsFile = join(p.dir, `${trackId}.lyrics.json`);
  const lyrics = existsSync(lyricsFile) ? readJson<LyricTiming>(lyricsFile) : null;
  const principalsFile = join(p.dir, `${trackId}.principals.json`);
  const principals = existsSync(principalsFile) ? readJson<PrincipalList>(principalsFile) : null;
  const res = resolveEdit(edit, map, library, { fps: o.fps, approved: o.approved, lyrics, principals });
  return { t, p, file, edit, map, library, lyricsFile, lyrics, res };
}

type Motion = { trace: Trace; track: MoveTrack; midX: number; energy: Map<number, number | null>; hits: ReturnType<typeof floorHits> };

/**
 * The song's measured low and high band energy from Stuttr's saved feature track (Dance8 never opens the
 * master, D8-14), each scaled to its own 99th percentile; null when the song has no feature track.
 */
function loadFeatureBands(c: Ctx, trackId: string, log: (l: string) => void): { at: (sec: number) => { low: number; high: number } } | null {
  const file = join(songPaths(c, trackId).dir, `${trackId}.features.json`);
  if (!existsSync(file)) { log(`no feature track at ${file}: the trace's pulse strip shows the beat and the body only`); return null; }
  const v = validateFeatures(JSON.parse(readFileSync(file, "utf8")));
  if (!v.track) throw new Error(`the feature track ${basename(file)} does not check out: ${v.errors.join("; ")}`);
  const f = readFeatures(v.track), rate = v.track.fps.num / v.track.fps.den;
  const p99 = (a: ArrayLike<number>) => { const x = Array.from(a).sort((p, q) => p - q); return Math.max(1e-6, x[Math.floor(0.99 * (x.length - 1))]); };
  const lo = p99(f.low), hi = p99(f.high);
  return { at: (sec: number) => { const k = Math.round(sec * rate); if (k < 0 || k >= f.low.length) return { low: 0, high: 0 }; return { low: Math.min(1, f.low[k] / lo), high: Math.min(1, f.high[k] / hi) }; } };
}

/** Takes read as body points (D8-17): the capture, its sync and the move track's per-beat energy. */
function loadMotion(c: Ctx, trackId: string, edit: EditList, log: (l: string) => void): Map<string, Motion> {
  const motion = new Map<string, Motion>();
  for (const [id, tk] of Object.entries(edit.takes)) {
    if (!tk.motion) continue;
    const mp = movesPaths(c.library, trackId);
    if (!existsSync(mp.poses(tk.motion)) || !existsSync(mp.moves(tk.motion))) throw new Error(`take "${id}": no body points for ${tk.motion}; run: npm run dance8 -- moves ${trackId} <the video>`);
    const track = readJson<MoveTrack>(mp.moves(tk.motion));
    const trace = buildTrace(readJson<PoseCapture>(mp.poses(tk.motion)), track.sync);
    // Energy is drawn against this take's own strong beats (its 90th percentile = full), so a groove reads; the numbers stay the track's.
    const known = track.beats.filter((b) => b.status === "known" && b.energy !== null).map((b) => b.energy as number).sort((a, b) => a - b);
    const full = known.length ? Math.max(1e-6, known[Math.floor(0.9 * (known.length - 1))]) : 1;
    const hipXs = trace.series.hipX.filter(Number.isFinite).sort((a, b) => a - b);
    const midX = hipXs.length ? hipXs[hipXs.length >> 1] / trace.series.width : 0.5;
    motion.set(id, { trace, track, midX, energy: new Map(track.beats.map((b) => [b.beat, b.status === "known" && b.energy !== null ? Math.min(1, b.energy / full) : null])), hits: floorHits(trace.footfalls) });
    log(`take ${id}: body points from ${tk.motion}, ${trace.footfalls.length} footfalls, moves ${track.approvalStatus}`);
  }
  return motion;
}

export async function editRender(c: Ctx, trackId: string, editPath: string, r: EditRequest = {}): Promise<EditRenderResult> {
  const log = c.log ?? ((l: string) => console.log(l));
  const fps = r.fps ?? 24;
  const { t, p, file, edit, lyricsFile, lyrics, res } = loadEdit(c, trackId, editPath, { fps, approved: !!r.approved });
  for (const w of res.warnings) log(`warning: ${w.path}: ${w.message}`);
  if (!res.ok) throw new Error(`the edit list does not check out:\n${res.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  const m = res.metrics!;
  log(`checked: ${m.layoutChanges} layout changes, all at musical edges; the singer's face covers ${m.faceOnScreenPct}% of the sung time (${m.faceQuarterFramePct}% at a quarter of the frame or more, ${m.faceLargestPct}% the largest picture); ${m.storyClipsUsed} story clips${m.stillsUsed ? ` and ${m.stillsUsed} still${m.stillsUsed === 1 ? "" : "s"}` : ""}, each placed once; slowest ${((m.maxStretch - 1) * 100).toFixed(1)}%`);
  if (r.checkOnly) return { out: null, manifest: null, resolution: res, warnings: res.warnings };

  // Files.
  const takeFile = (id: string) => join(p.dir, edit.takes[id].file);
  for (const id of Object.keys(edit.takes)) if (!existsSync(takeFile(id))) throw new Error(`take "${id}" is missing: ${takeFile(id)}`);
  const motion = loadMotion(c, trackId, edit, log);
  const features = loadFeatureBands(c, trackId, log);
  const sourceFile = (sid: string) => { const s = res.sources[sid]; return s.still ? join(p.dir, s.still) : join(p.clipDir, s.clip!.file); };
  for (const sid of Object.keys(res.sources)) if (!existsSync(sourceFile(sid))) throw new Error(`${res.sources[sid].still ? "still" : "clip file"} missing: ${sourceFile(sid)}`);
  const pick = pickMaster(t, { final: !!r.approved, key: r.master, extraProblem: (x) => castDrift(c, x) });
  if ("error" in pick) throw new Error(pick.error);
  if (pick.warning) log(`warning: ${pick.warning}`);
  const audioPath = join(c.library, pick.master.path);
  const textFont = r.font ?? TEXT_FONTS.find((f) => existsSync(f));
  if (!textFont) throw new Error("no font found for the lyrics and labels; pass --font FILE");
  const displayFont = r.displayFont ?? DISPLAY_FONTS.find((f) => existsSync(f)) ?? textFont;

  // Size: the aspect's frame, or a lighter draft height.
  const H = r.height ? Math.max(144, Math.round(r.height / 2) * 2) : res.height;
  const W = Math.round((res.width * H) / res.height / 2) * 2;
  const k = H / res.height;
  /** Type sizes and margins are set in 720-line units. */
  const u = H / 720;
  const scaleRect = (x: { x: number; y: number; w: number; h: number }) => ({ x: x.x * k, y: x.y * k, w: x.w * k, h: x.h * k });
  const slots = Object.fromEntries(Object.entries(res.slots).map(([l, s]) => [l, Object.fromEntries(Object.entries(s).map(([n, x]) => [n, scaleRect(x!)]))])) as EditResolution["slots"];
  const view = { ...res, slots };
  const type = new Type({ file: textFont, name: fontName(textFont) }, { file: displayFont, name: fontName(displayFont) }, H / 720);

  const from = Math.max(0, r.from ?? 0), to = Math.min(res.endSec, r.to ?? res.endSec);
  if (!(to > from)) throw new Error("--from must be before --to and inside the edit");
  const readers = new Map<string, FrameReader>();
  const sizes = new Map<string, { w: number; h: number }>();
  const sizeOf = (f: string) => { let s = sizes.get(f); if (!s) { s = probe(f); sizes.set(f, s); } return s; };
  const stills = new Map<string, { data: Uint8Array; w: number; h: number }>();
  const stillOf = (sid: string) => {
    let st = stills.get(sid);
    if (!st) {
      const f = sourceFile(sid), z = probe(f);
      const r = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: z.w * z.h * 3 + 1024 });
      if (r.status !== 0 || r.stdout.length < z.w * z.h * 3) throw new Error(`could not read the still ${basename(f)}`);
      st = { data: new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, z.w * z.h * 3), w: z.w, h: z.h };
      stills.set(sid, st);
    }
    return st;
  };
  /** A story source filling a w x h cell at song second tt: a clip's frame, or a still where its move has reached. */
  const storyImage = async (sid: string, tt: number, w: number, h: number, zoom: number): Promise<Img> => {
    const s = res.sources[sid];
    if (s.still) {
      const st = stillOf(sid), v = stillViewAt(s, tt);
      return cover(st.data, st.w, st.h, s.crop, w, h, zoom * v.zoom, st.w, v.x, v.y);
    }
    const sec = s.inSec + (tt - s.origin) / s.stretch;
    let rd = readers.get(sid);
    if (!rd) { const f = sourceFile(sid); const z = sizeOf(f); rd = new FrameReader(f, sec, z.w, z.h, fps); readers.set(sid, rd); }
    return cover(await rd.at(sec), rd.w, rd.h, s.crop, w, h, zoom);
  };
  const takeFrame = async (id: string, tt: number) => {
    const tk = edit.takes[id], sec = tt + tk.songAt0Sec;
    let rd = readers.get(`take:${id}`);
    if (!rd) { const f = takeFile(id); const z = sizeOf(f); rd = new FrameReader(f, sec, z.w, z.h, fps); readers.set(`take:${id}`, rd); }
    return { data: await rd.at(sec), pw: rd.w / 2, ph: rd.h };
  };

  const backdrop = async (e: ResolvedContent, w: number, h: number, tt: number, perf: number): Promise<Img> => {
    const bd = e.backdropR;
    const one = async (src: string | undefined, d: number, push: number): Promise<Img> => {
      if (!src) return studio(w, h, barPhase(res, tt));
      const s = res.sources[src];
      const z = 1 + push * Math.max(0, Math.min(1, (tt - s.origin) / (s.end - s.origin)));
      const im = await storyImage(src, tt, w, h, z);
      const dd = 1 - (1 - d) * perf;
      for (let i = 0; i < im.d.length; i++) im.d[i] *= dd;
      return im;
    };
    const im = await one(bd?.source, bd?.dim ?? 1, bd?.push ?? 0);
    if (bd?.then) {
      const a = Math.max(0, Math.min(1, (tt - bd.then.t0) / Math.max(1e-6, bd.then.t1 - bd.then.t0)));
      const e2 = a < 0.5 ? 4 * a ** 3 : 1 - (-2 * a + 2) ** 3 / 2;
      if (e2 > 0) { const b2 = await one(bd.then.source, bd.then.dim, 0); for (let i = 0; i < im.d.length; i++) im.d[i] = im.d[i] * (1 - e2) + b2.d[i] * e2; }
    }
    return im;
  };

  /** What the trace cell draws at song second tt, all from the take's measured body. */
  const TRAIL_SEC = 1.2;
  const traceFrame = (m: Motion, tt: number) => {
    const sync = { songAtCapture0: m.trace.songAtCapture0 }, cap = m.trace.cap;
    const trails = { left: [] as [number, number, number][], right: [] as [number, number, number][], centre: [] as [number, number, number][] };
    for (let a = TRAIL_SEC; a >= 0; a -= 1 / fps) {
      const b = bodyAt(cap, sync, tt - a);
      if (!b) continue;
      const foot = (i: number, j: number) => (b[i].v >= MIN_TRACE_VISIBILITY && b[j].v >= MIN_TRACE_VISIBILITY ? [(b[i].x + b[j].x) / 2, Math.max(b[i].y, b[j].y), a] as [number, number, number] : null);
      const l = foot(29, 31), rr = foot(30, 32), ce = centreOf(b);
      if (l) trails.left.push(l);
      if (rr) trails.right.push(rr);
      if (ce) trails.centre.push([ce.x, ce.y, a]);
    }
    const c0 = centreOf(bodyAt(cap, sync, tt - 0.25)), c1 = centreOf(bodyAt(cap, sync, tt));
    const bpb = res.tempo[0].beatsPerBar, beat = beatSec(res, tt), span = beat * bpb;
    const bi = Math.floor((tt - res.firstDownbeatSec) / beat + 1e-6), beats: { ago: number; down: boolean; energy: number | null }[] = [];
    for (let k = bi; k >= 0; k--) {
      const ago = tt - (res.firstDownbeatSec + k * beat);
      if (ago > span) break;
      beats.push({ ago, down: k % bpb === 0, energy: m.energy.get(k) ?? null });
    }
    const recent = m.trace.footfalls.filter((x) => x.songSec <= tt && tt - x.songSec <= span);
    const N = 48;
    return {
      body: bodyAt(cap, sync, tt), bones: BONES, joints: JOINTS, trails, trailSec: TRAIL_SEC,
      falls: m.trace.footfalls.filter((x) => x.songSec <= tt && tt - x.songSec <= 0.45).map((x) => ({ foot: x.foot, x: x.x, y: x.y, ago: tt - x.songSec })),
      travel: c0 && c1 ? { dx: c1.x - c0.x, dy: c1.y - c0.y } : null,
      prints: recent.map((x) => ({ foot: x.foot, x: x.x, y: x.y, ago: tt - x.songSec })),
      strip: {
        spanSec: span,
        audio: features ? Array.from({ length: N }, (_, i) => features.at(tt - span + (span * i) / (N - 1))) : null,
        beats, falls: recent.map((x) => ({ ago: tt - x.songSec, foot: x.foot })),
      },
      minVisibility: MIN_TRACE_VISIBILITY,
    };
  };

  const cellImage = async (cell: PlannedCell, w: number, h: number, tt: number): Promise<Img> => {
    const e = cell.entry;
    if (!e) { const g = img(w, h); g.d.set(gradient(w, h)); return g; }
    if (e.kind === "story") {
      const z = 1 + (e.push ?? 0) * Math.max(0, Math.min(1, (tt - e.t0) / (e.t1 - e.t0)));
      return storyImage(e.source, tt, w, h, z);
    }
    if (e.kind === "take") {
      const perf = performerAlpha(e, tt);
      const bg = await backdrop(e, w, h, tt, perf);
      if (perf <= 0) return bg;
      const f = await takeFrame(e.take, tt);
      let box = edit.views[e.view].box as number[];
      if (e.viewFrom) {
        const a = Math.max(0, Math.min(1, (tt - e.t0) / (beatSec(res, e.t0) / 2)));
        const ea = a < 0.5 ? 4 * a ** 3 : 1 - (-2 * a + 2) ** 3 / 2;
        const b0 = edit.views[e.viewFrom].box;
        box = b0.map((v, i) => v + (box[i] - v) * ea);
      }
      return placePerformer(bg, f.data, f.pw, f.ph, box, e.fit ?? "stage", perf);
    }
    if (e.kind === "trace") {
      const m = motion.get(e.take)!;
      const z = sizeOf(takeFile(e.take));
      return traceImage(w, h, traceFrame(m, tt), viewMapper(edit.views[e.view].box, "stage", z.w / 2, z.h, w, h));
    }
    if (e.kind === "kirtled" && e.view === "floor") {
      const m = motion.get(e.take!)!;
      const bpb = res.tempo[0].beatsPerBar, beatNow = Math.floor((tt - res.firstDownbeatSec) / beatSec(res, tt) + 1e-6);
      const hits = m.hits.filter((x) => x.sec <= tt && tt - x.sec <= 0.6).map((x) => ({ triangle: x.triangle, hand: x.hand, ago: tt - x.sec }));
      const energy = m.energy.get(beatNow) ?? null;
      const sync = { songAtCapture0: m.trace.songAtCapture0 };
      const hipAt = (a: number) => { const ce = centreOf(bodyAt(m.trace.cap, sync, tt - a)); return ce ? ce.x - m.midX : null; };
      const trail: [number, number][] = [];
      for (let a = 1; a >= 0; a -= 2 / fps) { const x = hipAt(a); if (x !== null) trail.push([a, x]); }
      const now = hipAt(0);
      return floorImage(w, h, { barPhase: barPhase(res, tt), beatsPerBar: bpb, energy: r.calm && energy !== null ? energy * 0.5 : energy, hits, hips: now === null ? null : { now, trail } });
    }
    if (e.kind === "kirtled") {
      if (e.view === "studio") return studio(w, h, barPhase(res, tt));
      const g = img(w, h), gr = gradient(w, h);
      for (let i = 0; i < g.d.length; i++) g.d[i] = gr[i] * 0.55;
      addLight(g, kirtledLight(e.view as "pattern" | "overhead" | "detail", w, h, barPhase(res, tt)), w, h, 1);
      return g;
    }
    const g = img(w, h), gr = gradient(w, h);
    for (let i = 0; i < g.d.length; i++) g.d[i] = gr[i] * 0.8;
    return g;
  };

  type Drawn = PlannedCell & { drawn?: [number, number, number, number]; layerAlpha: number };
  const irect = (x: { x: number; y: number; w: number; h: number }): [number, number, number, number] =>
    [Math.max(0, Math.round(x.x)), Math.max(0, Math.round(x.y)), Math.min(W, Math.round(x.x + x.w)), Math.min(H, Math.round(x.y + x.h))];
  const composeLayer = async (cells: Drawn[], tt: number): Promise<Img> => {
    const f = img(W, H), g = gradient(W, H);
    for (let i = 0; i < f.d.length; i++) f.d[i] = g[i] * 0.35;
    for (const c of cells) {
      let [x0, y0, x1, y1] = irect(c.rect);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      const im = await cellImage(c, x1 - x0, y1 - y0, tt);
      dim(im, c.now);
      let part: { x: number; y: number; w: number; h: number } | undefined;
      if (c.clip) {
        const [a, b, cc, d] = irect(c.clip);
        const X0 = Math.max(a, x0), Y0 = Math.max(b, y0), X1 = Math.min(cc, x1), Y1 = Math.min(d, y1);
        if (X1 - X0 < 1 || Y1 - Y0 < 1) continue;
        part = { x: X0 - x0, y: Y0 - y0, w: X1 - X0, h: Y1 - Y0 };
        [x0, y0, x1, y1] = [X0, Y0, X1, Y1];
      }
      paste(f, im, x0, y0, c.alpha, part);
      c.drawn = [x0, y0, x1, y1];
    }
    return f;
  };

  const burst = new LightBuffer(W, H);
  const acro = new Map<string, { letter: string; sec: number }[]>();
  const draftNote = `${trackId.toUpperCase()} ${edit.id} draft, not for release`;

  const renderFrame = async (tt: number, kf: number): Promise<Uint8Array> => {
    const plan = framePlan(view, tt);
    const layers = plan.layers.map((l) => ({ alpha: l.alpha, cells: l.cells.map((c) => ({ ...c, layerAlpha: l.alpha })) as Drawn[] }));
    let f: Img;
    if (layers.length === 2) {
      const a = await composeLayer(layers[0].cells, tt), b = await composeLayer(layers[1].cells, tt), e = layers[1].alpha;
      for (let i = 0; i < a.d.length; i++) a.d[i] = a.d[i] * (1 - e) + b.d[i] * e;
      f = a;
    } else f = await composeLayer(layers[0].cells, tt);
    const top = layers[layers.length - 1].cells;
    const blk = res.blocks[plan.to];
    const prim = top.find((c) => c.cell === (blk.primary ?? Object.keys(blk.cells)[0])) ?? top[0];
    const R = prim ? prim.rect : { x: 0, y: 0, w: W, h: H };
    if (!r.calm) for (const a of res.accents) triangleBurst(f, burst, tt - a, ACCENT_SEC, R.x + R.w / 2, R.y + R.h / 2, Math.max(R.w, R.h) * 0.75);
    if (!r.calm) for (const fl of res.flares) {
      const d = (tt - fl) / barLength(res, fl + 1e-3);
      if (d >= 0 && d < 1) addLight(f, kirtledLight("pattern", W, H, barPhase(res, tt)), W, H, 0.38 * Math.sin(Math.PI * d));
    }
    grade(f, kf);

    // The type layer (GOV-23): frames, lyrics, labels.
    const b = plan.kind === "steady" || plan.progress >= 0.5 ? res.blocks[plan.to] : res.blocks[plan.from];
    if (top.some((c) => c.layout !== "one")) {
      const ph = barPhase(res, tt) * barLength(res, tt);
      const pulse = r.calm ? 0 : Math.exp(-ph / 0.22);
      // The light is on the now cell (nine-view), else on the singer, else on the primary.
      const blkTo = res.blocks[plan.to];
      const singerCell = top.find((c) => c.entry?.kind === "take" && edit.takes[c.entry.take]?.role === "singer")?.cell;
      const leadCell = singerCell ?? blkTo.primary ?? Object.keys(blkTo.cells)[0];
      for (const c of top) {
        if (c.layout === "one" || !c.drawn) continue;
        const lead = blkTo.now?.length ? c.now : c.cell === leadCell ? 1 : 0;
        frameRect(f, ...c.drawn, (0.35 + 0.25 * lead + 0.4 * lead * pulse) * c.alpha);
      }
    }
    const la = lyricAt(lyrics, tt);
    const style = res.endCard && tt >= res.endCard.at ? null : b.lyrics;
    if (la && style && la.opacity > 0 && lyrics) {
      const line = lyrics.lines[la.index];
      const { tokens, times } = tokenTimes(line);
      const ns = times.filter((x) => x !== null && tt >= x).length;
      const runs: Run[] = tokens.map((tok, j) => {
        const tm = times[j];
        if (tm === null) return { text: tok, color: isCaps(tok) ? GOLDT : WHITE, alpha: 1 };
        if (isCaps(tok) || j === ns - 1) return tt >= tm || isCaps(tok) ? { text: tok, color: GOLDT, alpha: 1 } : { text: tok, color: WHITE, alpha: 0.5 };
        return tt >= tm ? { text: tok, color: WHITE, alpha: 1 } : { text: tok, color: WHITE, alpha: 0.5 };
      });
      const singer = top.find((c) => c.entry?.kind === "take" && edit.takes[c.entry.take]?.role === "singer" && c.drawn);
      const lyr = top.find((c) => c.entry?.kind === "lyrics" && c.drawn);
      if (style === "band" && singer?.drawn) {
        const [x0, y0, x1, y1] = singer.drawn;
        const s = await type.sprite(`band:${la.index}:${ns}`, runs, { size: 28, maxW: (x1 - x0) - 32 * u });
        shade(f, x0, x1, Math.round(y1 - (y1 - y0) * 0.28), y1, 0.55 * la.opacity);
        blit(f, s, x0 + (x1 - x0 - s.w) / 2, y1 - s.h - 8 * u, la.opacity);
      } else if (style === "hook") {
        const s = await type.sprite(`hook:${la.index}:${ns}`, runs, { display: true, size: 48, maxW: 1160 * u });
        shade(f, 0, W, H - Math.round(200 * u), H, 0.5 * la.opacity);
        blit(f, s, (W - s.w) / 2, H - s.h - 30 * u, la.opacity);
      } else if (style === "cell" && lyr?.drawn) {
        const [x0, y0, x1, y1] = lyr.drawn;
        const s = await type.sprite(`cell:${la.index}:${ns}`, runs, { display: true, size: 27, maxW: (x1 - x0) - 24 * u });
        blit(f, s, x0 + (x1 - x0 - s.w) / 2, y0 + (y1 - y0 - s.h) / 2, la.opacity);
      }
    }
    if (b.acrostic) {
      const singer = top.find((c) => c.entry?.kind === "take" && edit.takes[c.entry.take]?.role === "singer" && c.drawn);
      if (!acro.has(b.acrostic)) acro.set(b.acrostic, acrosticOf(lyrics, b.acrostic));
      const letters = acro.get(b.acrostic)!;
      const nextLand = res.blocks[b.index + 1]?.start ?? res.endSec;
      const fade = Math.max(0, Math.min(1, (nextLand - tt) / 0.3));
      if (singer?.drawn) for (const [j, x] of letters.entries()) {
        if (tt < x.sec) continue;
        const s = await type.sprite(`acro:${x.letter}`, [{ text: x.letter, color: GOLDT, alpha: 1 }], { display: true, size: 40, maxW: 200 * u });
        blit(f, s, singer.drawn[2] - 14 * u - (letters.length - j) * 36 * u, singer.drawn[1] + 4 * u, Math.min(1, (tt - x.sec) / 0.15) * fade);
      }
    }
    for (const c of top) {
      const e = c.entry;
      if (!e || !c.drawn) continue;
      const [x0, y0, x1, y1] = c.drawn;
      if (x1 - x0 < 140 * u || y1 - y0 < 60 * u) continue;
      const label = e.kind === "take" ? (edit.takes[e.take]?.standIn ? "stand-in" : null)
        : e.kind === "trace" ? (motion.get(e.take)?.track.approvalStatus === "approved" ? "Dance8 trace" : "Dance8 trace, measured, draft")
        : e.kind === "kirtled" ? (e.title ? null : e.view === "overhead" ? "Kirtled overhead, stand-in" : e.view === "detail" ? "Kirtled detail, stand-in" : e.view === "floor" ? "Kirtled floor: beat and body, no chords" : "Kirtled beat light") : null;
      if (!label) continue;
      const s = await type.sprite(`lab:${label}`, [{ text: label, color: [0.92, 0.92, 0.9], alpha: 0.9 }], { size: 13, maxW: 400 * u, align: "left", shadow: false, pill: true });
      blit(f, s, x0 + 4 * u, y0 + 4 * u, 0.9 * c.alpha);
    }
    const titled = top.find((c) => c.entry?.kind === "kirtled" && c.entry.title && c.drawn);
    if (titled && titled.entry?.kind === "kirtled" && titled.entry.title) {
      const e = titled.entry, ti = e.title!;
      const op = Math.max(0, Math.min(1, (tt - e.t0 - 0.15) / 0.5)) * Math.max(0, Math.min(1, (e.t1 - 0.05 - tt) / 0.25));
      const [x0, y0, x1, y1] = titled.drawn!;
      const s1 = await type.sprite(`title:${ti.text}`, [{ text: ti.text, color: [0.98, 0.78, 0.34], alpha: 1 }], { display: true, size: 150, maxW: 1000 * u });
      blit(f, s1, (x0 + x1 - s1.w) / 2, (y0 + y1) / 2 - s1.h / 2 - 40 * u, op);
      if (ti.note) {
        const s2 = await type.sprite(`note:${ti.note}`, [{ text: ti.note, color: [0.92, 0.92, 0.9], alpha: 0.85 }], { size: 19, maxW: 900 * u });
        blit(f, s2, (x0 + x1 - s2.w) / 2, (y0 + y1) / 2 + 70 * u, op * 0.9);
      }
    }
    if (res.endCard && tt >= res.endCard.at) {
      const s = await type.sprite(`end:${res.endCard.text}`, [{ text: res.endCard.text, color: [0.98, 0.78, 0.34], alpha: 1 }], { display: true, size: 96, maxW: 600 * u });
      blit(f, s, (W - s.w) / 2, H - s.h - 70 * u, Math.min(1, (tt - res.endCard.at) / 0.25));
    }
    if (!r.approved) {
      const s = await type.sprite("draftnote", [{ text: draftNote, color: [0.9, 0.9, 0.88], alpha: 0.55 }], { size: 12, maxW: 600 * u, align: "left", shadow: false });
      blit(f, s, W - s.w - 4 * u, H - s.h, 0.8);
    }
    const level = Math.min(1, tt / 0.4, Math.max(0, (res.endSec - tt) / 0.5));
    return toRgb24(f, level);
  };

  // Encode.
  const renders = join(p.dir, "renders");
  mkdirSync(renders, { recursive: true });
  const part = r.from !== undefined || r.to !== undefined ? `-${from.toFixed(1)}-${to.toFixed(1)}` : "";
  const name = `${trackId}-edit-${edit.id.replace(/[^A-Za-z0-9._-]/g, "_")}-${r.approved ? "final" : "draft"}${r.calm ? "-calm" : ""}${H !== res.height ? `-${H}p` : ""}${part}`;
  const out = join(renders, `${name}.mp4`);
  const picture = join(renders, `.${name}.picture.mp4`);
  const enc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(fps), "-i", "pipe:0",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", picture], { stdio: ["pipe", "ignore", "pipe"] }) as ChildProcessByStdio<Writable, null, Readable>;
  let encErr = "";
  let encClosed = false;
  enc.stderr.on("data", (d) => { encErr += String(d); });
  enc.stdin.on("error", () => { /* reported from the exit code below */ });
  const encoded = new Promise<void>((ok, no) => enc.on("close", (code) => { encClosed = true; if (code === 0) ok(); else no(new Error(`ffmpeg failed: ${encErr.trim().split("\n").pop()}`)); }));
  const k0 = Math.round(from * fps), k1 = Math.round(to * fps);
  const started = Date.now();
  const lumas: Float64Array[] = [];
  try {
    for (let kf = k0; kf < k1; kf++) {
      const frame = await renderFrame(kf / fps, kf);
      lumas.push(Float64Array.from(tileLuma(frame, W, H)));
      if (encClosed) break;
      if (!enc.stdin.write(frame)) await Promise.race([new Promise<void>((ok) => enc.stdin.once("drain", () => ok())), encoded.catch(() => undefined)]);
      if ((kf - k0) % 240 === 0) log(`  ${(kf / fps).toFixed(2)} s  frame ${kf - k0}/${k1 - k0}  ${Math.round((Date.now() - started) / 1000)} s`);
    }
    enc.stdin.end();
    await encoded;
  } finally {
    for (const rd of readers.values()) rd.close();
  }
  const total = k1 - k0;
  // Photosensitivity: the most flashes in any one second, in any part of the frame (workflow limit: 3).
  const tiles: Float64Array[] = lumas.length ? Array.from(lumas[0], (_, i) => Float64Array.from(lumas, (f) => f[i])) : [];
  const flashes = tiles.length ? maxFlashesPerSecond(tiles, fps) : 0;
  if (flashes > 3) log(`warning: up to ${flashes} flashes a second in part of the frame; the limit is 3 (render the calm version with --calm)`);
  const caption = r.approved ? { text: AI_DISCLOSURE, fontFile: textFont, seconds: Math.min(4, total / fps) } : undefined;
  const mux = gridMuxArgs({ picturePath: picture, audioPath, audioOffsetSec: from, totalFrames: total, fps, outPath: out, caption });
  const mr = spawnSync("ffmpeg", mux, { encoding: "utf8" });
  rmSync(picture, { force: true });
  if (mr.status !== 0) throw new Error(`ffmpeg failed: ${(mr.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`);

  const manifest = `${out}.edit.json`;
  writeFileSync(manifest, JSON.stringify({
    schema: EDIT_MANIFEST_SCHEMA,
    edit: { id: edit.id, file, sha256: sha256File(file) },
    trackId, final: !!r.approved, calm: !!r.calm, fps, width: W, height: H, fromSec: from, toSec: to, totalFrames: total,
    metrics: res.metrics, flashesPerSecondMax: flashes,
    blocks: res.blocks.map((x) => ({ id: x.id, land: x.land, start: x.start, layout: x.layout, transition: x.transition, cells: x.cells, why: x.why })),
    sources: Object.values(res.sources).map((s) => (s.still
      ? { id: s.id, still: s.still, approved: !!s.approved, origin: s.origin, end: s.end, move: s.move, sha256: sha256File(sourceFile(s.id)) }
      : { id: s.id, clip: s.clip!.id, approvalStatus: s.clip!.approvalStatus, origin: s.origin, end: s.end, inSec: s.inSec, stretch: s.stretch })),
    notUsed: edit.notUsed ?? {},
    takes: Object.entries(edit.takes).map(([id, x]) => ({ id, file: x.file, role: x.role, standIn: x.standIn, songAt0Sec: x.songAt0Sec, motion: x.motion ?? null,
      moves: motion.get(id) ? { approvalStatus: motion.get(id)!.track.approvalStatus, sync: motion.get(id)!.track.sync, footfalls: motion.get(id)!.trace.footfalls.length, poseModel: motion.get(id)!.trace.cap.model } : null })),
    lyrics: lyrics ? { file: basename(lyricsFile), status: lyrics.status, sha256: sha256File(lyricsFile) } : null,
    audio: { master: pick.master.key, status: pick.master.status, sha256: pick.master.sha256, offsetSec: from },
    fonts: [basename(textFont), basename(displayFont)],
    warnings: res.warnings, output: { file: basename(out), sha256: sha256File(out) },
  }, null, 2) + "\n");
  log(`${out}\n  ${total} frames at ${fps} fps in ${Math.round((Date.now() - started) / 1000)} s; manifest ${basename(manifest)}`);
  return { out, manifest, resolution: res, warnings: res.warnings };
}

// ---------- the visual score ----------

export interface ScoreRequest { fps?: number; features?: string; planFps?: number }

/**
 * Writes the edit's visual score (render/score.ts) beside its renders:
 * <song>/dance8/scores/<edit id>.score.json and .csv. Energy peaks come from
 * Stuttr's saved feature track (<song>/dance8/<song>.features.json, or
 * --features); Dance8 never opens the master for them (D8-14, D8-25).
 */
export function editScore(c: Ctx, trackId: string, editPath: string, r: ScoreRequest = {}): { json: string; csv: string; score: VisualScore } {
  const log = c.log ?? ((l: string) => console.log(l));
  const fps = r.fps ?? 24;
  const { p, file, edit, library, lyrics, res } = loadEdit(c, trackId, editPath, { fps, approved: false });
  if (!res.ok) throw new Error(`the edit list does not check out:\n${res.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  const motion = loadMotion(c, trackId, edit, log);
  const analysis = existsSync(p.analysis) ? readJson<{ gridVerified?: { by: string; at: string } }>(p.analysis) : null;
  const harmony = existsSync(p.harmony) ? readJson<HarmonyTimeline>(p.harmony) : null;
  const featuresFile = r.features ? resolve(r.features) : join(p.dir, `${trackId}.features.json`);
  let peaks: ScoreInput["peaks"] = [], featuresSource: ScoreInput["featuresSource"] = null;
  if (existsSync(featuresFile)) {
    const v = validateFeatures(JSON.parse(readFileSync(featuresFile, "utf8")));
    if (!v.track) throw new Error(`the feature track ${basename(featuresFile)} does not check out: ${v.errors.join("; ")}`);
    const f = readFeatures(v.track), rate = v.track.fps.num / v.track.fps.den;
    peaks = onsetPeaks(f.onset, 0, f.onset.length).map((k) => {
      const band = f.low[k] >= f.mid[k] && f.low[k] >= f.high[k] ? "low" : f.mid[k] >= f.high[k] ? "mid" : "high";
      return { songSec: k / rate, strength: f.onset[k], band } as const;
    });
    featuresSource = { file: basename(featuresFile), sha256: sha256File(featuresFile) };
  } else log(`no feature track at ${featuresFile}: energy peaks left out (npm run stuttr -- visual-features <master> --out ${featuresFile} --id ${trackId})`);
  const score = buildScore({
    edit, editSha256: sha256File(file), res, library, lyrics, gridVerified: analysis?.gridVerified ?? null, peaks, featuresSource, harmony,
    motion: Object.fromEntries([...motion].map(([id, m]) => [id, { track: m.track, footfalls: m.trace.footfalls, poseModel: m.trace.cap.model.id }])),
    planFps: r.planFps ?? 0,
  });
  const dir = join(p.dir, "scores");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, edit.id.replace(/[^A-Za-z0-9._-]/g, "_"));
  writeFileSync(`${base}.score.json`, JSON.stringify(score) + "\n");
  writeFileSync(`${base}.score.csv`, scoreCsv(score));
  const s = score.summary;
  log(`score: ${score.states.length} states (${Object.entries(s.states).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}); events: ${s.events.beats} beats, ${s.events.energyPeaks} energy peaks, ${s.events.vocalLines} sung lines, ${s.events.footfalls} footfalls, ${s.events.moveWords} move words, ${s.events.chords} chords${s.harmony ? ` (harmony ${s.harmony.status}: ${s.harmony.draws})` : ""}`);
  log(`${base}.score.json\n${base}.score.csv`);
  return { json: `${base}.score.json`, csv: `${base}.score.csv`, score };
}
