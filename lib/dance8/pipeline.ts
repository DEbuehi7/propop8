// lib/dance8/pipeline.ts
//
// File side of Dance8 for a song in the Stuttr library (~/StuttrLibrary):
//
//   plan          analysis + lyrics + approved takes -> cue map, harmony,
//                 Kirtled plan, clip library (with a labelled stand-in), shot
//                 list, mouth tracks, README, all in <id>/dance8/.
//   clips         Kling downloads named after their brief -> copied into
//                 <id>/dance8/clips/ and listed as draft clips.
//   approve-clip  a person's check: records the drift score they judged.
//
// Rules: reads Stuttr's analysis and approved takes only, never the masters
// (canon D8-14). Files a person may have edited (cue map, harmony, clip
// library) are never overwritten unless replace is set; derived files (Kirtled
// plan, shot list, README) are rebuilt from them every time. Nothing here
// approves anything on its own.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { SongAnalysis } from "../stuttr/analysis";
import { loadManifest, mouthTrack, type Ctx } from "../stuttr/commands";
import { voiceKey } from "../stuttr/library";
import { GENERATORS } from "./authoring/generators";
import { parseKey, planSong, STAND_IN_CLIP_ID } from "./authoring/plan";
import { shotBriefs, type ShotBrief } from "./authoring/shotBriefs";
import { validateCueMap } from "./authoring/validateCueMap";
import type { HarmonyTimeline } from "./contracts/harmony";
import { FRAME_SIZE, type AspectRatio, type CueMap, type VisualClip, type VisualClipLibrary } from "./contracts/scene";
import { planKirtled } from "./harmony/pathSolver";

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const nowOf = (c: Ctx) => (c.now ? c.now() : new Date().toISOString());
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

export interface SongPaths {
  dir: string;
  analysis: string;
  cuemap: string;
  harmony: string;
  kirtled: string;
  clips: string;
  clipDir: string;
  briefs: string;
  readme: string;
  standIn: string;
}

export function songPaths(c: Ctx, trackId: string): SongPaths {
  const dir = join(c.library, trackId, "dance8");
  const f = (s: string) => join(dir, `${trackId}.${s}`);
  return {
    dir,
    analysis: join(c.library, trackId, "analysis", `${trackId}.analysis.json`),
    cuemap: f("cuemap.json"), harmony: f("harmony.json"), kirtled: f("kirtled.json"),
    clips: f("clips.json"), clipDir: join(dir, "clips"), briefs: f("briefs.json"), readme: join(dir, "README.txt"),
    standIn: join(dir, "clips", `${STAND_IN_CLIP_ID}.mp4`),
  };
}

/** The labelled stand-in: plain black, so previews play before footage exists. A final render refuses it. */
export function standInClip(aspect: AspectRatio, createdAt: string): VisualClip {
  return {
    id: STAND_IN_CLIP_ID, schemaVersion: 1, sceneId: "placeholder", camera: "wide", durationSec: 10, aspect,
    file: `${STAND_IN_CLIP_ID}.mp4`, source: { type: "human_authored", createdAt, license: "proprietary" },
    drift: { status: "known", driftScore: 0, method: "solid_black_stand_in_no_reference" }, approvalStatus: "approved", mouthVisible: false,
  } as VisualClip;
}

export interface PlanOptions {
  key?: string;
  aspect?: AspectRatio;
  /** Size the shot list for Kling 4.0 finals instead of Flash drafts. */
  final?: boolean;
  /** Rebuild the cue map, harmony and clip library even if they exist. */
  replace?: boolean;
}

export function planTrack(c: Ctx, trackId: string, o: PlanOptions = {}): SongPaths {
  const log = logOf(c);
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.analysis)) throw new Error(`no analysis yet; run: npm run stuttr -- analyze ${trackId}`);
  const analysis = readJson<SongAnalysis>(p.analysis);
  const key = o.key ? parseKey(o.key) : undefined;
  if (o.key && !key) throw new Error(`--key must look like Eb, F#, Am or Cm (got "${o.key}")`);
  const lyricsFile = t.files.find((f) => f.role === "lyrics");
  const lyrics = lyricsFile ? readFileSync(join(c.library, lyricsFile.path), "utf8") : undefined;
  const leads = [...new Set(t.voices.filter((v) => v.sourceRole === "vocals" && v.status === "approved").map((v) => v.voice))];
  const draft = planSong({
    analysis, lyrics, key: key ?? undefined, aspect: o.aspect,
    leadVoice: leads.length === 1 ? leads[0] : undefined,
  });
  mkdirSync(p.clipDir, { recursive: true });

  const kept: string[] = [];
  const keepOr = <T>(path: string, fresh: T): T => {
    if (existsSync(path) && !o.replace) { kept.push(basename(path)); return readJson<T>(path); }
    writeJson(path, fresh);
    return fresh;
  };
  const map = keepOr<CueMap>(p.cuemap, draft.map);
  const harmony = keepOr<HarmonyTimeline>(p.harmony, draft.harmony);
  const lib = keepOr<VisualClipLibrary>(p.clips, { version: 1, clips: [standInClip(map.aspect, nowOf(c))] });
  if (!existsSync(p.standIn)) {
    const [w, h] = FRAME_SIZE[map.aspect];
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=${w}x${h}:r=24:d=10`, "-c:v", "libx264", "-pix_fmt", "yuv420p", p.standIn]);
    if (r.status !== 0) log("note: could not make the black stand-in clip (is ffmpeg installed?)");
  }

  const kirtled = planKirtled(harmony, map.tempo, { requireApproved: false });
  writeJson(p.kirtled, kirtled);
  const g = o.final ? GENERATORS["kling-4.0"] : GENERATORS["kling-4.0-flash"];
  const briefs = shotBriefs(map, lib, g);
  writeJson(p.briefs, briefs);

  // Mouth tracks for every approved take that doesn't have one yet.
  const mouths: string[] = [];
  for (const v of t.voices.filter((x) => x.status === "approved")) {
    const file = join(p.dir, `${trackId}.${voiceKey(v.voice)}.${v.lang}${v.sourceRole === "backing_vocals" ? ".backing" : ""}.mouth.json`);
    if (!existsSync(file)) {
      try {
        mouthTrack({ ...c, log: () => {} }, trackId, v.voice, v.lang, v.sourceRole);
      } catch (e) {
        log(`note: no mouth track for ${v.voice}: ${(e as Error).message}`);
        continue;
      }
    }
    mouths.push(basename(file));
  }

  const issues = validateCueMap(map, lib).issues;
  const lyricIdx = briefs.filter((b) => b.kind === "lip_sync").length;
  const readme = [
    `${t.title}: Dance8 files (${map.approvalStatus}; built by plan from ${basename(p.analysis)})`,
    "",
    `${map.tempo[0].bpm} BPM, ${map.tempo[0].beatsPerBar}/4, first downbeat at ${map.firstDownbeatSec ?? 0} s; ${analysis.bars} bars.`,
    `Sections: ${map.cues.map((q) => `${q.id} (bars ${q.startBar}-${q.endBar}, scene ${q.sceneId})`).join(", ")}.`,
    "",
    "Files",
    `  ${basename(p.cuemap)}   sections and sung lines${kept.includes(basename(p.cuemap)) ? " (kept: yours)" : " (new draft)"}`,
    `  ${basename(p.harmony)}  chords per change${kept.includes(basename(p.harmony)) ? " (kept: yours)" : " (new draft)"}`,
    `  ${basename(p.kirtled)}  Kirtled floor plan (light cues only, no sound)`,
    `  ${basename(p.clips)}    footage library${kept.includes(basename(p.clips)) ? " (kept: yours)" : " (stand-in only)"}`,
    `  ${basename(p.briefs)}   ${briefs.length} shots still to generate for ${g.label} (${lyricIdx} lip sync, ${briefs.length - lyricIdx} b-roll)`,
    ...mouths.map((m) => `  ${m}   mouth openness, 24 fps`),
    "",
    "Check by ear",
    ...draft.notes.map((n) => `  - ${n}`),
    ...(issues.length ? ["", "Cue map checks", ...issues.map((i) => `  - ${i.code} ${i.path}: ${i.message}`)] : []),
    "",
    "Next",
    `  Name each Kling download after its shot id in ${basename(p.briefs)}, put them in one folder, then:`,
    `  npm run dance8 -- clips ${trackId} ~/Downloads`,
    "",
  ].join("\n");
  writeFileSync(p.readme, readme);

  log(`plan: ${p.dir}`);
  log(`${map.cues.length} sections, ${map.vocals?.length ?? 0} sung phrases, ${harmony.events.length} chord changes, ${kirtled.plan?.moves.length ?? 0} Kirtled moves`);
  log(`${briefs.length} shots still to generate (${lyricIdx} lip sync, ${briefs.length - lyricIdx} b-roll)`);
  if (kept.length) log(`kept your ${kept.join(", ")} (use --replace to rebuild ${kept.length > 1 ? "them" : "it"})`);
  if (issues.length) log(`warning: the cue map has ${issues.length} problem(s); see README.txt`);
  for (const n of draft.notes.slice(0, 3)) log(`note: ${n}`);
  return p;
}

// ---------- Clips ----------

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

/** The brief a downloaded file is for: its name is the brief id, optionally followed by a take number. */
export function briefForFile(fileName: string, briefs: ShotBrief[]): ShotBrief | null {
  const stem = basename(fileName, extname(fileName)).trim();
  const byLength = [...briefs].sort((a, b) => b.id.length - a.id.length || a.id.localeCompare(b.id));
  for (const b of byLength) {
    if (stem === b.id) return b;
    if (stem.startsWith(b.id) && /^[-_ ]\(?\d{1,3}\)?$/.test(stem.slice(b.id.length))) return b;
  }
  return null;
}

/** Nearest supported aspect ratio, if within 3%. */
export function aspectOf(width: number, height: number): AspectRatio | null {
  const r = width / height;
  let best: AspectRatio | null = null;
  let d = Infinity;
  for (const [a, [w, h]] of Object.entries(FRAME_SIZE) as [AspectRatio, readonly [number, number]][]) {
    const e = Math.abs(Math.log(r / (w / h)));
    if (e < d) { d = e; best = a; }
  }
  return d <= Math.log(1.03) ? best : null;
}

/** A draft clip record for a file made from a brief. */
export function clipFromBrief(
  b: ShotBrief, f: { id: string; file: string; durationSec: number; aspect: AspectRatio }, createdAt: string,
): VisualClip {
  return {
    id: f.id, schemaVersion: 1, sceneId: b.sceneId, camera: b.camera, durationSec: f.durationSec, aspect: f.aspect, file: f.file,
    source: { type: "ai_generated", generator: b.generator, ...(b.referenceSetId ? { referenceSetId: b.referenceSetId } : {}), promptId: b.id, createdAt, license: "proprietary" },
    drift: { status: "unknown", driftScore: null }, approvalStatus: "draft",
    ...(b.kind === "lip_sync" ? { mouthVisible: true, lipSync: { voice: b.voice!, songStartSec: b.songStartSec } } : b.mouth === "hidden" ? { mouthVisible: false } : {}),
  } as VisualClip;
}

function probe(path: string): { durationSec: number; width: number; height: number } | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const j = JSON.parse(r.stdout) as { streams?: { width: number; height: number }[]; format?: { duration?: string } };
  const s = j.streams?.[0];
  const d = Number(j.format?.duration);
  return s && Number.isFinite(d) ? { durationSec: Math.round(d * 1000) / 1000, width: s.width, height: s.height } : null;
}

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

export function ingestClips(c: Ctx, trackId: string, folder: string): VisualClip[] {
  const log = logOf(c);
  const p = songPaths(c, trackId);
  if (!existsSync(p.cuemap) || !existsSync(p.clips)) throw new Error(`no plan yet; run: npm run dance8 -- plan ${trackId}`);
  if (!existsSync(folder)) throw new Error(`${folder} does not exist`);
  const map = readJson<CueMap>(p.cuemap);
  const lib = readJson<VisualClipLibrary>(p.clips);
  const saved = existsSync(p.briefs) ? readJson<ShotBrief[]>(p.briefs) : [];
  const current = shotBriefs(map, lib, GENERATORS["kling-4.0-flash"]);
  const briefs = [...new Map([...saved, ...current].map((b) => [b.id, b])).values()];
  mkdirSync(p.clipDir, { recursive: true });

  const added: VisualClip[] = [];
  const names = readdirSync(folder).filter((n) => VIDEO_EXT.has(extname(n).toLowerCase())).sort();
  let skipped = 0;
  for (const name of names) {
    const b = briefForFile(name, briefs);
    if (!b) { skipped++; continue; }
    const src = join(folder, name);
    const info = probe(src);
    if (!info) { log(`${name}: could not read it as video; skipped`); continue; }
    const id = basename(name, extname(name)).trim().replace(/[^A-Za-z0-9_-]+/g, "-");
    const file = `${id}${extname(name).toLowerCase()}`;
    const dest = join(p.clipDir, file);
    const hash = sha(src);
    if (existsSync(dest) && sha(dest) !== hash) { log(`${name}: a different ${file} is already in the library; rename the new one (e.g. ${id}-2) and run again`); continue; }
    const existing = lib.clips.find((x) => x.id === id);
    if (existing && existsSync(dest)) { log(`${name}: already in the library`); continue; }
    const measured = aspectOf(info.width, info.height);
    const aspect = measured === map.aspect || b.cropTo === map.aspect ? map.aspect : measured;
    if (!aspect) { log(`${name}: ${info.width}x${info.height} is not a supported shape; skipped`); continue; }
    if (aspect !== map.aspect) log(`warning: ${name} is ${aspect}, the video is ${map.aspect}; it won't be used until it matches`);
    if (info.durationSec + 0.25 < b.generateSec) log(`warning: ${name} is ${info.durationSec} s; the brief asked for ${b.generateSec} s, so shots may be shortened`);
    copyFileSync(src, dest);
    const clip = clipFromBrief(b, { id, file, durationSec: info.durationSec, aspect }, nowOf(c));
    lib.clips = [...lib.clips.filter((x) => x.id !== id), clip].sort((x, y) => x.id.localeCompare(y.id));
    added.push(clip);
    log(`added ${id} (${b.kind === "lip_sync" ? `lip sync, ${b.voice} from ${b.songStartSec} s` : "b-roll"}, ${info.durationSec} s) as a draft`);
  }
  writeJson(p.clips, lib);
  const left = shotBriefs(map, lib, GENERATORS["kling-4.0-flash"]);
  writeJson(p.briefs, left);
  if (skipped) log(`${skipped} video file(s) didn't match a shot id and were left alone`);
  log(`${added.length} clip(s) added; ${lib.clips.filter((x) => x.approvalStatus === "draft").length} waiting for your check; ${left.length} shots still to generate`);
  if (added.length) log(`check each one, then: npm run dance8 -- approve-clip ${trackId} ${added[0].id} --drift 0.1   (your score: 0 = matches the references, 1 = unrecognisable)`);
  return added;
}

/** A person's check of a clip. The drift score is theirs; nothing here guesses it. */
export function setClipStatus(c: Ctx, trackId: string, clipId: string, status: "approved" | "retired", drift?: number): VisualClip {
  const p = songPaths(c, trackId);
  const lib = readJson<VisualClipLibrary>(p.clips);
  const clip = lib.clips.find((x) => x.id === clipId);
  if (!clip) throw new Error(`no clip "${clipId}" in ${basename(p.clips)}`);
  if (status === "approved") {
    if (drift === undefined || !(drift >= 0 && drift <= 1)) throw new Error("approve-clip needs --drift with your score from 0 (matches the references) to 1 (unrecognisable)");
    const map = existsSync(p.cuemap) ? readJson<CueMap>(p.cuemap) : null;
    if (map && drift > map.maxDriftScore) logOf(c)(`note: ${drift} is above this video's limit of ${map.maxDriftScore}; the clip is approved but won't be used`);
    clip.drift = { status: "known", driftScore: drift, method: "human_review", checkedAt: nowOf(c) };
  }
  clip.approvalStatus = status;
  writeJson(p.clips, lib);
  logOf(c)(`${clipId} is now ${status}`);
  return clip;
}
