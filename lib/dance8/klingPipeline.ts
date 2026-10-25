// lib/dance8/klingPipeline.ts
//
// File side of the Kling pack (./authoring/klingPack): reads the song's shot
// list, finds the reference folders in the private Stuttr library (making the
// ones a shot needs, with a starter text file to fill in, the first time),
// cuts each lip-sync shot's audio from the singer's approved take, and writes
// the pack to <song>/dance8/kling/:
//   index.html   one card per shot: files to upload, the prompt, the steps
//   prompts.txt  every prompt, in the same order
//   cards.json   the same cards, for tools
//   audio/       the lip-sync cuts (only that singer's voice)
// Nothing here uploads anything or calls Kling; generating stays Daniel's.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { loadManifest, type Ctx } from "../stuttr/commands";
import { voiceKey, type LibraryTrack, type VoiceTake } from "../stuttr/library";
import { GENERATORS } from "./authoring/generators";
import {
  CHARACTER_TEXT, compileCard, IMAGE_EXTS, isPlaceholderScene, packHtml, parseCast, parseFields, promptsText, SCENE_TEXT, sortCards,
  type CharacterRefs, type RefIndex, type SceneRefs, type UploadCard,
} from "./authoring/klingPack";
import type { ShotBrief } from "./authoring/shotBriefs";
import type { CueMap } from "./contracts/scene";
import { songPaths } from "./pipeline";

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

export const refsRoot = (c: Ctx) => join(c.library, "refs");
export const klingDir = (c: Ctx, trackId: string) => join(songPaths(c, trackId).dir, "kling");
/** Where Daniel saves a song's Kling downloads (one folder per song, so shot ids never mix). */
export const downloadsFor = (trackId: string) => `~/Downloads/${trackId}`;

const imageIn = (dir: string, stem: string): string | null => {
  for (const ext of IMAGE_EXTS) {
    const p = join(dir, `${stem}.${ext}`);
    if (existsSync(p)) return p;
  }
  // Any case: Face.PNG
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((n) => new RegExp(`^${stem}\\.(${IMAGE_EXTS.join("|")})$`, "i").test(n));
  return hit ? join(dir, hit) : null;
};

/** "brick-built-stuttr" -> "brick-built stuttr"; a voice's own folder keeps the voice's name. */
const displayName = (slug: string, voices: string[]) => voices.find((v) => voiceKey(v) === slug) ?? slug.replace(/-/g, " ");

function sceneStarter(id: string, trackId: string, placeholder: boolean): string {
  return [
    `# Scene "${id}"${placeholder ? ` for ${trackId}` : ` (shared by every song whose cue map uses "${id}")`}.`,
    ...(placeholder ? [
      `# "${id}" is a placeholder from plan. Better: rename the sceneId in ${trackId}.cuemap.json to a place`,
      "# (for example rooftop_canopy), run plan again, and describe that place once for every song.",
    ] : []),
    "# The Kling prompts use these words as written; one line each. Empty lines are ignored.",
    "# place: what the set is: its architecture, materials, scale and what fills it.",
    "# light: the time of day and the light.",
    "# hidden: what b-roll shows while someone sings, with no faces (hands, feet, a crowd from behind...).",
    "# dancer: the refs/cast folder of the character who dances here, for dance shots.",
    "# skater: the refs/cast folder of the skater, for trick shots (optional).",
    "# cast: who plays a voice here when it isn't the voice's own folder, like Stuttr=brick-built-stuttr.",
    "# Images in this folder: master.png (the set's first frame), dancer.png (optional: the dancer in the set).",
    "place:",
    "light:",
    "hidden:",
    "dancer:",
    "skater:",
    "cast:",
    "",
  ].join("\n");
}

function characterStarter(slug: string, name: string): string {
  return [
    `# Character "${slug}". Images in this folder:`,
    "#   face.png      the face, mouth fully visible, for lip sync",
    "#   fullbody.png  head to feet in the same costume, for dance and wide shots",
    "# name: how the prompts name the character. look: costume, hair, colours and props, one line.",
    `name: ${name}`,
    "look:",
    "",
  ].join("\n");
}

function loadScene(dir: string, id: string): SceneRefs {
  const text = join(dir, SCENE_TEXT);
  const { fields, issues } = existsSync(text) ? parseFields(readFileSync(text, "utf8")) : { fields: {}, issues: [] };
  return {
    id, dir, issues,
    place: fields.place ?? null, light: fields.light ?? null, hidden: fields.hidden ?? null,
    cast: parseCast(fields.cast), dancer: fields.dancer ?? null, skater: fields.skater ?? null,
    master: imageIn(dir, "master"), dancerImage: imageIn(dir, "dancer"),
  };
}

function loadCharacter(dir: string, slug: string, fallbackName: string): CharacterRefs {
  const text = join(dir, CHARACTER_TEXT);
  const { fields } = existsSync(text) ? parseFields(readFileSync(text, "utf8")) : { fields: {} as Record<string, string> };
  return { id: slug, dir, name: fields.name ?? fallbackName, look: fields.look ?? null, face: imageIn(dir, "face"), fullbody: imageIn(dir, "fullbody") };
}

/**
 * The folders a shot list needs, found or made. A scene lives in the song's
 * own refs/scenes/ when it has one there (and always for a placeholder id like
 * verse-1, which means something different in every song), otherwise in the
 * library's refs/scenes/, shared by every song. Characters are library-wide.
 */
export function indexRefs(c: Ctx, trackId: string, briefs: ShotBrief[]): { refs: RefIndex; made: string[] } {
  const made: string[] = [];
  const ensure = (dir: string, file: string, starter: string) => {
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); made.push(dir); }
    if (!existsSync(join(dir, file))) writeFileSync(join(dir, file), starter);
  };
  const scenes: Record<string, SceneRefs> = {};
  for (const id of [...new Set(briefs.map((b) => b.sceneId))]) {
    const own = join(c.library, trackId, "refs", "scenes", id);
    const shared = join(refsRoot(c), "scenes", id);
    const placeholder = isPlaceholderScene(id);
    const dir = placeholder || existsSync(own) ? own : shared;
    ensure(dir, SCENE_TEXT, sceneStarter(id, trackId, placeholder));
    scenes[id] = loadScene(dir, id);
  }
  const voices = [...new Set(briefs.flatMap((b) => (b.voice ? b.voice.split("+").map((v) => v.trim()) : [])))]
    .filter((v) => v && v !== "Lead" && v !== "Backing");
  const slugs = new Set<string>();
  for (const b of briefs) {
    const s = scenes[b.sceneId];
    if (b.kind === "lip_sync" && b.voice && voices.includes(b.voice)) slugs.add(s.cast[voiceKey(b.voice)] ?? voiceKey(b.voice));
    if (b.kind === "dance" && s.dancer) slugs.add(voiceKey(s.dancer));
    if (b.kind === "trick" && s.skater) slugs.add(voiceKey(s.skater));
  }
  const characters: Record<string, CharacterRefs> = {};
  for (const slug of [...slugs].sort()) {
    const dir = join(refsRoot(c), "cast", slug);
    const name = displayName(slug, voices);
    ensure(dir, CHARACTER_TEXT, characterStarter(slug, name));
    characters[slug] = loadCharacter(dir, slug, name);
  }
  return { refs: { characters, scenes }, made };
}

const hasFfmpeg = () => spawnSync("ffmpeg", ["-version"]).status === 0;

/** The approved take of `voice` that covers [a, b] of the song: a lead take first, then backing. */
export function takeFor(t: LibraryTrack, voice: string, a: number, b: number): VoiceTake | null {
  const covers = (v: VoiceTake) => {
    const s = v.startSec ?? 0;
    return v.durationSec != null && s <= a + 0.01 && s + v.durationSec >= b - 0.01;
  };
  const mine = t.voices.filter((v) => voiceKey(v.voice) === voiceKey(voice) && v.status === "approved" && covers(v));
  return mine.find((v) => v.sourceRole === "vocals") ?? mine[0] ?? null;
}

/** Cuts the shot's song time from the singer's approved take: only that voice, for Kling's lip sync. */
function cutAudio(c: Ctx, t: LibraryTrack, b: ShotBrief, outDir: string): { path: string | null; problem: string | null } {
  const voice = b.voice ?? "";
  if (!voice || voice === "Lead" || voice === "Backing" || voice.includes("+")) return { path: null, problem: null };
  const take = takeFor(t, voice, b.songStartSec, b.songEndSec);
  if (!take) {
    const any = t.voices.some((v) => voiceKey(v.voice) === voiceKey(voice));
    return { path: null, problem: any ? `no approved ${voice} take covers song ${b.songStartSec}-${b.songEndSec} s; approve it (npm run stuttr -- approve ${t.trackId} ${voice}), then run kling again` : `${voice} has no take on this song` };
  }
  if (!hasFfmpeg()) return { path: null, problem: "ffmpeg is not installed (brew install ffmpeg)" };
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${b.id}.wav`);
  const from = Math.max(0, b.songStartSec - (take.startSec ?? 0));
  const r = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-ss", from.toFixed(3), "-t", (b.songEndSec - b.songStartSec).toFixed(3), "-i", join(c.library, take.path),
    "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", out,
  ], { encoding: "utf8" });
  if (r.status !== 0) return { path: null, problem: `ffmpeg could not cut it: ${r.stderr.trim().split("\n").pop()}` };
  return { path: out, problem: null };
}

/**
 * kling: the upload pack for every shot still to generate. Run it again after
 * adding images or words; it never overwrites your scene.txt or character.txt,
 * and after clips it lists only the shots still missing.
 */
export function klingPack(c: Ctx, trackId: string): { cards: UploadCard[]; dir: string; made: string[] } {
  const log = logOf(c);
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.briefs)) throw new Error(`no shot list yet; run: npm run dance8 -- plan ${trackId}`);
  const briefs = readJson<ShotBrief[]>(p.briefs).map((b) => (b.motionRef ? {
    ...b, motionRef: { ...b.motionRef, refFile: b.motionRef.refFile && existsSync(join(p.dir, b.motionRef.refFile)) ? join(p.dir, b.motionRef.refFile) : null },
  } : b));
  const mapFile = existsSync(p.castCuemap) ? p.castCuemap : p.cuemap;
  const sceneOrder = existsSync(mapFile) ? [...new Set(readJson<CueMap>(mapFile).cues.map((q) => q.sceneId))] : [];
  const { refs, made } = indexRefs(c, trackId, briefs);
  const dir = klingDir(c, trackId);
  mkdirSync(dir, { recursive: true });
  const downloads = downloadsFor(trackId);
  const cards = sortCards(briefs.map((b) => compileCard(b, refs, {
    tool: GENERATORS[b.generator]?.label ?? b.generator,
    audio: b.kind === "lip_sync" ? cutAudio(c, t, b, join(dir, "audio")) : undefined,
    downloads,
  })), sceneOrder);
  const clipsCommand = `npm run dance8 -- clips ${trackId} ${downloads}`;
  writeFileSync(join(dir, "cards.json"), JSON.stringify(cards, null, 2) + "\n");
  writeFileSync(join(dir, "prompts.txt"), promptsText(t.title, cards));
  writeFileSync(join(dir, "index.html"), packHtml(cards, { title: t.title, trackId, downloads, clipsCommand, href: (abs) => relative(dir, abs) }));

  const ready = cards.filter((x) => x.ready).length;
  log(`kling pack: ${join(dir, "index.html")}`);
  log(`${cards.length} shots: ${ready} ready, ${cards.length - ready} waiting for files or words`);
  for (const d of made) log(`made ${d} (put its images there and fill in its .txt)`);
  const todo = [...new Set(cards.flatMap((x) => x.missing))];
  for (const m of todo.slice(0, 12)) log(`  to do: ${m}`);
  if (todo.length > 12) log(`  ...and ${todo.length - 12} more (the page lists them per shot)`);
  log(`open it: open "${join(dir, "index.html")}"`);
  log(`downloads: mkdir -p ${downloads}, save each clip there as its shot id, then: ${clipsCommand}`);
  return { cards, dir, made };
}
