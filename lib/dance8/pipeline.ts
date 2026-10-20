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
import { skateTricks, trickClipShape } from "./harmony/skateTricks";
import { KIRTLED_SKATE_TRICKS } from "../canon/vocab";
import { danceBriefs, danceCovered } from "./moves/dancers";
import { loadCapture, loadTakes, movesPaths } from "./moves/files";
import { kirtledDance } from "./moves/kirtled";
import { CARVE_LABEL, VERSION_LABEL, styleTricks, type Carve } from "./moves/skaters";
import { danceRules, type StyleProfile } from "./moves/style";

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
  tricks: string;
  readme: string;
  standIn: string;
  /** The owner's dance against the Kirtled plan, and its floor lights (canon D8-17). */
  kirtledDance: string;
  /** Motion rules from the owner's dance for the Gate 1 scorer (a draft MappingBundle). */
  rules: string;
  /** The style profile across every song he has danced to. */
  style: string;
}

export function songPaths(c: Ctx, trackId: string): SongPaths {
  const dir = join(c.library, trackId, "dance8");
  const f = (s: string) => join(dir, `${trackId}.${s}`);
  return {
    dir,
    analysis: join(c.library, trackId, "analysis", `${trackId}.analysis.json`),
    cuemap: f("cuemap.json"), harmony: f("harmony.json"), kirtled: f("kirtled.json"),
    clips: f("clips.json"), clipDir: join(dir, "clips"), briefs: f("briefs.json"), tricks: f("tricks.json"), readme: join(dir, "README.txt"),
    standIn: join(dir, "clips", `${STAND_IN_CLIP_ID}.mp4`),
    kirtledDance: f("kirtled-dance.json"), rules: f("dance-rules.json"), style: join(c.library, "dance8-style.json"),
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
  /** Skaters play Kirtled in this scene (canon D8-16): write the trick timeline and trick shots. */
  skate?: string;
  /** Dancers perform the owner's dance in these scenes (canon D8-17): dance shots with references cut from his takes. */
  dance?: string[];
  /** How many skaters the crew has (canon D8-18; default eight, D8-11). */
  crew?: number;
}

type TrickIn = { trick: string; atSec: number; version?: string; crew?: "solo" | "half" | "all"; crewCount?: number; carve?: Carve };
const BASE_VERSION: Record<string, string> = { handplant_roll: "handplant_roll", ollie_leap: "ollie_standard", board_freeze: "freeze_low" };
const isBase = (t: TrickIn) => (!t.version || t.version === t.trick || t.version === BASE_VERSION[t.trick]) && (!t.crew || t.crew === "solo");

/**
 * One shot per trick the song uses that has no clip yet in the skate scene;
 * with the owner's dance (canon D8-18), one per trick version and crew size.
 */
export function trickBriefs(
  tricks: TrickIn[], sceneId: string, lib: VisualClipLibrary, map: Pick<CueMap, "aspect" | "tempo">, g: (typeof GENERATORS)[string],
): ShotBrief[] {
  const barSec = Math.max(...map.tempo.map((t) => (t.beatsPerBar * 60) / t.bpm));
  const shape = trickClipShape(barSec);
  const aspect = map.aspect;
  const live = lib.clips.filter((c) => c.trick && c.sceneId === sceneId && c.approvalStatus !== "retired");
  const has = (t: TrickIn) => live.some((c) => c.trick!.trick === t.trick
    && (isBase(t) || ((c.trick!.version ?? t.trick) === (t.version ?? t.trick) && (c.trick!.crew ?? "solo") === (t.crew ?? "solo"))));
  const groups = new Map<string, { t: TrickIn; uses: number; carves: Set<Carve> }>();
  for (const t of tricks) {
    const key = isBase(t) ? t.trick : `${t.trick}|${t.version}|${t.crew ?? "solo"}`;
    const gr = groups.get(key) ?? { t, uses: 0, carves: new Set<Carve>() };
    gr.uses++;
    if (t.carve && t.carve !== "in_place") gr.carves.add(t.carve);
    groups.set(key, gr);
  }
  const order = KIRTLED_SKATE_TRICKS.map((k) => k.trick as string);
  return [...groups.values()].filter((gr) => !has(gr.t))
    .sort((a, b) => order.indexOf(a.t.trick) - order.indexOf(b.t.trick) || (a.t.version ?? "").localeCompare(b.t.version ?? "") || (a.t.crew ?? "").localeCompare(b.t.crew ?? ""))
    .map(({ t, uses, carves }): ShotBrief => {
      const label = KIRTLED_SKATE_TRICKS.find((k) => k.trick === t.trick)!.label;
      const base = isBase(t);
      const n = t.crewCount ?? 1;
      const who = n <= 1 ? "One skater" : `${n} skaters in unison`;
      const ver = t.version && t.version !== t.trick ? `-${t.version}` : "";
      return {
        id: base ? `trick-${t.trick}-${sceneId}` : `trick-${t.trick}${ver}-${t.crew ?? "solo"}-${sceneId}`, kind: "trick", trick: t.trick,
        ...(base ? {} : { trickVersion: t.version, crew: t.crew ?? "solo", crewCount: n }),
        cueId: "", section: "", sceneId, camera: "wide", voice: null, lyric: null,
        songStartSec: 0, songEndSec: 0, generateSec: Math.min(g.maxSec, Math.max(g.minSec, Math.ceil(shape.minClipSec))), keyframesSec: [shape.landingSec], aspect, cropTo: null,
        generator: g.id, resolution: g.resolution, referenceSetId: null, mouth: "hidden",
        notes: [
          base ? `${label}. Used ${uses} times in this song (canon D8-16).` : `${label}: a ${VERSION_LABEL[t.version ?? t.trick] ?? t.version}, picked by your dance (canon D8-18). Used ${uses} times in this song.`,
          `${who}, full body in frame, on the ${sceneId} set${carves.size ? `, ${[...carves].map((cv) => CARVE_LABEL[cv]).join(" or ")}` : ""}. The board lands at ${shape.landingSec} s (one bar in) and the clip runs at least ${shape.minClipSec} s; trim it so it does, or give the real landing time with approve-clip --landing.`,
          "Wide shot, no face close-up, no text or logos.",
        ],
      };
    });
}

/** The fixed bundle versions for the dance rules until a live motion library is wired (Gate 1 fixtures are version 1). */
const RULE_VERSIONS = { motionLibraryVersion: 1, transitionGraphVersion: 1, runtimePolicyVersion: 1 };

/** In dance scenes, a cue the takes cover gets dance shots instead of a generic b-roll shot. */
function withoutDanceBroll(briefs: ShotBrief[], dance: ShotBrief[], lib: VisualClipLibrary, map: CueMap, scenes: string[]): ShotBrief[] {
  const danced = new Set(dance.map((b) => b.cueId));
  for (const c of lib.clips) if (c.danceLock && c.approvalStatus !== "retired") {
    for (const q of map.cues) if (q.sceneId === c.sceneId && scenes.includes(q.sceneId)) danced.add(q.id);
  }
  return briefs.filter((b) => !(b.kind === "broll" && danced.has(b.cueId)));
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

  // Notes about a draft only matter when that draft was written: a kept cue map
  // already has your scenes and lyrics, a kept harmony your chords.
  const mapKept = kept.includes(basename(p.cuemap));
  const harmonyKept = kept.includes(basename(p.harmony));
  const notes = draft.notes.filter((n) =>
    /lyric|scene names|no backing vocals/.test(n) ? !mapKept : /no clear chord|no key given/.test(n) ? !harmonyKept : true);

  const kirtled = planKirtled(harmony, map.tempo, { requireApproved: false });
  writeJson(p.kirtled, kirtled);
  const g = o.final ? GENERATORS["kling-4.0"] : GENERATORS["kling-4.0-flash"];
  let briefs = shotBriefs(map, lib, g);
  const takes = loadTakes(c.library, trackId);
  let trickNote: string | null = null;
  if (o.skate) {
    if (!kirtled.plan) throw new Error("the Kirtled plan did not solve, so there are no tricks; see the harmony file");
    const tr = skateTricks(kirtled.plan);
    // Your dance picks each trick's version, crew and carve (canon D8-18); without takes, D8-16 as it was.
    const tricks = takes.length ? styleTricks(tr.tricks, takes, map, { crewSize: o.crew }) : tr.tricks;
    writeJson(p.tricks, { sceneId: o.skate, tricks, skipped: tr.skipped, ...(takes.length ? { styledBy: takes.map((t) => t.takeId) } : {}) });
    briefs.push(...trickBriefs(tricks, o.skate, lib, map, g));
    trickNote = `${tr.tricks.length} skate tricks on chord changes in scene ${o.skate} (${tr.skipped} faster changes left to the floor lights)${takes.length ? `, styled by your ${takes.length === 1 ? "take" : `${takes.length} takes`}` : ""}`;
    if (!map.cues.some((q) => q.sceneId === o.skate)) log(`note: no section uses scene ${o.skate} yet; set sceneId to ${o.skate} where the skaters play`);
  }
  let danceNote: string | null = null;
  if (o.dance?.length) {
    for (const sc of o.dance) if (!map.cues.some((q) => q.sceneId === sc)) log(`note: no section uses scene ${sc} yet; set sceneId to ${sc} where the dancers dance`);
    if (!takes.length) {
      danceNote = `no takes yet for the dance scenes; film yourself and run: npm run dance8 -- moves ${trackId} <video>`;
    } else {
      const videos = Object.fromEntries(takes.map((t) => [t.takeId, loadCapture(c.library, trackId, t.takeId)?.video.file ?? t.takeId]));
      const dance = danceBriefs(map, lib, takes, videos, o.dance, g);
      const missing = cutReferences(c, trackId, dance);
      briefs = [...withoutDanceBroll(briefs, dance, lib, map, o.dance), ...dance];
      danceNote = dance.length
        ? `${dance.length} dance shots from your takes in ${o.dance.join(", ")}${missing ? `; ${missing} reference(s) not cut (the video is not where it was; run moves again with it)` : ""}`
        : `no dance shots: your takes don't read 3 s or more of ${o.dance.join(", ")} well enough (the camera needs most beats of a bar)`;
    }
  }
  writeJson(p.briefs, briefs);
  // Your dance against the Kirtled plan, its floor lights, and your motion rules.
  let kirtledNote: string | null = null;
  if (takes.length && kirtled.plan) {
    const kd = kirtledDance(kirtled.plan, takes, map);
    writeJson(p.kirtledDance, kd);
    kirtledNote = `your moves matched ${kd.matched} of the ${kd.covered} chord changes your takes cover; ${kd.lights.length} stomps flash the floor`;
  }
  let rulesNote: string | null = null;
  const profile = !takes.length && existsSync(p.style) ? readJson<StyleProfile>(p.style) : null;
  if (takes.length || profile) {
    const rules = danceRules(map, takes.length ? { tracks: takes } : { profile: profile! }, RULE_VERSIONS, nowOf(c));
    writeJson(p.rules, rules);
    rulesNote = `${rules.rules.length} motion rule(s) from ${rules.source === "takes" ? "your takes of this song" : "your style profile"} (draft)`;
  }


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
    `  ${basename(p.briefs)}   ${briefs.length} shots still to generate for ${g.label} (${lyricIdx} lip sync, ${briefs.filter((b) => b.kind === "trick").length} tricks, ${briefs.filter((b) => b.kind === "dance").length} dance, ${briefs.filter((b) => b.kind === "broll").length} b-roll)`,
    ...mouths.map((m) => `  ${m}   mouth openness, 24 fps`),
    ...(trickNote ? [`  ${basename(p.tricks)}   ${trickNote}`] : []),
    ...(danceNote ? [`  moves/refs/   ${danceNote}`] : []),
    ...(kirtledNote ? [`  ${basename(p.kirtledDance)}   ${kirtledNote}`] : []),
    ...(rulesNote ? [`  ${basename(p.rules)}   ${rulesNote}`] : []),
    "",
    "Check by ear",
    ...notes.map((n) => `  - ${n}`),
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
  if (trickNote) log(trickNote);
  if (danceNote) log(danceNote);
  if (kirtledNote) log(kirtledNote);
  if (rulesNote) log(rulesNote);
  log(`${briefs.length} shots still to generate (${lyricIdx} lip sync, ${briefs.filter((b) => b.kind === "trick").length} tricks, ${briefs.filter((b) => b.kind === "dance").length} dance, ${briefs.filter((b) => b.kind === "broll").length} b-roll)`);
  if (kept.length) log(`kept your ${kept.join(", ")} (use --replace to rebuild ${kept.length > 1 ? "them" : "it"})`);
  if (issues.length) log(`warning: the cue map has ${issues.length} problem(s); see README.txt`);
  for (const n of notes.slice(0, 3)) log(`note: ${n}`);
  return p;
}

/**
 * Cuts each dance shot's reference from the take's video into moves/refs/
 * (no sound: Kling Motion Control needs only the motion). Returns how many
 * could not be cut because the video is not where it was.
 */
function cutReferences(c: Ctx, trackId: string, dance: ShotBrief[]): number {
  const refs = movesPaths(c.library, trackId).refs;
  let missing = 0;
  for (const b of dance) {
    const m = b.motionRef!;
    const path = loadCapture(c.library, trackId, m.takeId)?.video.path;
    if (!path || !existsSync(path)) { missing++; continue; }
    mkdirSync(refs, { recursive: true });
    const from = Math.max(0, m.captureStartSec);
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(from), "-i", path, "-t", String(Math.round((m.captureEndSec - from) * 1000) / 1000),
      "-an", "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", join(refs, `${b.id}.mp4`)]);
    if (r.status !== 0) { missing++; continue; }
    m.refFile = `moves/refs/${b.id}.mp4`;
  }
  return missing;
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
    ...(b.kind === "trick" && b.trick ? { trick: {
      trick: b.trick, landingSec: Math.min(b.keyframesSec[0] ?? 0, Math.round((f.durationSec / 2) * 1000) / 1000),
      ...(b.trickVersion ? { version: b.trickVersion } : {}), ...(b.crew ? { crew: b.crew } : {}),
    } } : {}),
    ...(b.kind === "dance" && b.motionRef ? { danceLock: { takeId: b.motionRef.takeId, songStartSec: b.songStartSec, captureStartSec: b.motionRef.captureStartSec } } : {}),
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
    log(`added ${id} (${b.kind === "lip_sync" ? `lip sync, ${b.voice} from ${b.songStartSec} s` : b.kind === "trick" ? `${b.trick}${b.trickVersion ? ` (${b.trickVersion}, ${b.crew})` : ""}, landing at ${clip.trick?.landingSec} s` : b.kind === "dance" ? `your dance from song ${b.songStartSec} s` : "b-roll"}, ${info.durationSec} s) as a draft`);
  }
  writeJson(p.clips, lib);
  // Dance shots still waiting: the saved ones no dancer clip covers yet.
  const dance = saved.filter((b) => b.kind === "dance" && !danceCovered(lib, b.sceneId, b.songStartSec, b.songEndSec));
  const scenes = [...new Set(saved.filter((b) => b.kind === "dance").map((b) => b.sceneId))];
  const left: ShotBrief[] = [...withoutDanceBroll(shotBriefs(map, lib, GENERATORS["kling-4.0-flash"]), dance, lib, map, scenes), ...dance];
  if (existsSync(p.tricks)) {
    const tr = readJson<{ sceneId: string; tricks: TrickIn[] }>(p.tricks);
    left.push(...trickBriefs(tr.tricks, tr.sceneId, lib, map, GENERATORS["kling-4.0-flash"]));
  }
  writeJson(p.briefs, left);
  if (skipped) log(`${skipped} video file(s) didn't match a shot id and were left alone`);
  log(`${added.length} clip(s) added; ${lib.clips.filter((x) => x.approvalStatus === "draft").length} waiting for your check; ${left.length} shots still to generate`);
  if (added.length) log(`check each one, then: npm run dance8 -- approve-clip ${trackId} ${added[0].id} --drift 0.1   (your score: 0 = matches the references, 1 = unrecognisable)`);
  return added;
}

/** A person's check of a clip. The drift score is theirs; nothing here guesses it. */
export function setClipStatus(
  c: Ctx, trackId: string, clipId: string, status: "approved" | "retired", drift?: number, landingSec?: number,
): VisualClip {
  const p = songPaths(c, trackId);
  const lib = readJson<VisualClipLibrary>(p.clips);
  const clip = lib.clips.find((x) => x.id === clipId);
  if (!clip) throw new Error(`no clip "${clipId}" in ${basename(p.clips)}`);
  if (landingSec !== undefined) {
    if (!clip.trick) throw new Error(`${clipId} is not a trick clip; --landing is for trick clips`);
    if (!(landingSec >= 0 && landingSec < clip.durationSec)) throw new Error(`--landing must be between 0 and ${clip.durationSec} s`);
    clip.trick.landingSec = Math.round(landingSec * 1000) / 1000;
  }
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
