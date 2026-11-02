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
// Every card carries a credit estimate and a batch (./authoring/klingCredits):
// rates come from kling-rates.json in the library when Daniel adds one, else
// only from published figures. Nothing here uploads anything or calls Kling;
// generating stays Daniel's.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { loadManifest, type Ctx } from "../stuttr/commands";
import { voiceKey, type LibraryTrack, type VoiceTake } from "../stuttr/library";
import { GENERATORS } from "./authoring/generators";
import { mergeRates, parseRates, planCredits, RATES_FILE, summarize, type Rates } from "./authoring/klingCredits";
import {
  CHARACTER_TEXT, compileCard, IMAGE_EXTS, isPlaceholderScene, packHtml, parseCast, parseFields, parseProps, promptsText, PROP_TEXT, SCENE_TEXT, sortCards,
  type CharacterRefs, type PropRefs, type RefIndex, type SceneRefs, type UploadCard,
} from "./authoring/klingPack";
import type { ShotBrief } from "./authoring/shotBriefs";
import { zipStore, type ZipEntry } from "./authoring/zipStore";
import type { CueMap, VisualClipLibrary } from "./contracts/scene";
import { STAND_IN_CLIP_ID } from "./authoring/plan";
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
    "# props: refs/props folders that appear in b-roll and trick shots here, like equus-x (comma-separated).",
    "# Images in this folder: master.png (the set's first frame), dancer.png (optional: the dancer in the set).",
    "place:",
    "light:",
    "hidden:",
    "dancer:",
    "skater:",
    "cast:",
    "props:",
    "",
  ].join("\n");
}

function propStarter(slug: string): string {
  return [
    `# Prop "${slug}": a vehicle or object that appears in b-roll and trick shots. Image in this folder:`,
    "#   prop.png  the prop on its own, plain background, whole object in frame",
    "# name: how the prompts name it. look: shape, materials, colours and lights, one line.",
    `name: the ${slug.replace(/-/g, " ")}`,
    "look:",
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
    cast: parseCast(fields.cast), dancer: fields.dancer ?? null, skater: fields.skater ?? null, props: parseProps(fields.props),
    master: imageIn(dir, "master"), dancerImage: imageIn(dir, "dancer"),
  };
}

function loadCharacter(dir: string, slug: string, fallbackName: string): CharacterRefs {
  const text = join(dir, CHARACTER_TEXT);
  const { fields } = existsSync(text) ? parseFields(readFileSync(text, "utf8")) : { fields: {} as Record<string, string> };
  return { id: slug, dir, name: fields.name ?? fallbackName, look: fields.look ?? null, face: imageIn(dir, "face"), fullbody: imageIn(dir, "fullbody") };
}

function loadProp(dir: string, slug: string): PropRefs {
  const text = join(dir, PROP_TEXT);
  const { fields } = existsSync(text) ? parseFields(readFileSync(text, "utf8")) : { fields: {} as Record<string, string> };
  return { id: slug, dir, name: fields.name ?? `the ${slug.replace(/-/g, " ")}`, look: fields.look ?? null, image: imageIn(dir, "prop") };
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
  const props: Record<string, PropRefs> = {};
  const propSlugs = new Set(briefs.filter((b) => b.kind === "broll" || b.kind === "trick").flatMap((b) => scenes[b.sceneId].props ?? []));
  for (const slug of [...propSlugs].sort()) {
    const dir = join(refsRoot(c), "props", slug);
    ensure(dir, PROP_TEXT, propStarter(slug));
    props[slug] = loadProp(dir, slug);
  }
  return { refs: { characters, scenes, props }, made };
}

/** Daniel's per-second rates from the library, over the published ones. */
export function loadRates(c: Ctx): { rates: Rates; issues: string[]; file: string } {
  const file = join(c.library, RATES_FILE);
  if (!existsSync(file)) return { rates: mergeRates(), issues: [], file };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { rates: mergeRates(), issues: [`${RATES_FILE} is not valid JSON; using published rates only`], file };
  }
  const { rates, issues } = parseRates(raw);
  return { rates: mergeRates(rates), issues, file };
}

/** Sets that already have a clip in the song's library (approved or still to check), so need no test card. */
function testedScenes(clipsFile: string): Set<string> {
  if (!existsSync(clipsFile)) return new Set();
  const lib = readJson<VisualClipLibrary>(clipsFile);
  return new Set(lib.clips.filter((x) => x.id !== STAND_IN_CLIP_ID && x.approvalStatus !== "retired").map((x) => x.sceneId));
}

export interface KlingOptions {
  /** Credits for this batch: cards go in priority order until it runs out. */
  budget?: number;
  /** Generate b-roll, lip-sync and trick shots with this generator instead of the planned one (dance keeps Motion Control). */
  model?: string;
  /** Also write <song>-kling.zip: this batch's cards with every file they upload, to carry to a phone or another computer. */
  zip?: boolean;
}

/** Where a file goes inside the zip: the pack's own files as they are, library files by their library path. */
function zipPathOf(c: Ctx, dir: string, abs: string): string {
  const inPack = relative(dir, abs);
  if (!inPack.startsWith("..") && !isAbsolute(inPack)) return inPack.split("\\").join("/");
  const inLib = relative(c.library, abs);
  if (!inLib.startsWith("..") && !isAbsolute(inLib)) return inLib.split("\\").join("/");
  return `other/${basename(abs)}`;
}

/**
 * The batch as one zip: index.html, prompts.txt and cards.json for the cards
 * to generate now, with every image, audio cut and motion video they upload,
 * linked inside the zip. Cards that wait (a test, the budget, a cover) stay
 * out, so the zip holds only what is worth paying for now.
 */
export function writeKlingZip(
  c: Ctx, o: { trackId: string; title: string; dir: string; cards: UploadCard[]; rates: Rates; budget?: number; ratesFile: string; downloads: string; clipsCommand: string },
): { path: string; shots: number; files: number; bytes: number } | null {
  const batch = o.cards.filter((x) => x.ready && (x.credit?.batch ?? "now") === "now");
  if (!batch.length) return null;
  const files = new Map<string, string>(); // zip path -> absolute path
  const missing: string[] = [];
  const inZip = (abs: string) => {
    const z = zipPathOf(c, o.dir, abs);
    if (!existsSync(abs)) missing.push(abs);
    else files.set(z, abs);
    return z;
  };
  const cards = batch.map((x) => ({ ...x, uploads: x.uploads.map((u) => (u.path ? { ...u, path: inZip(u.path) } : u)) }));
  if (missing.length) throw new Error(`can't zip: ${missing.length} file(s) the cards upload are missing, first ${missing[0]}`);
  const summary = summarize(cards, o.rates);
  const html = packHtml(cards, { title: o.title, trackId: o.trackId, downloads: o.downloads, clipsCommand: o.clipsCommand, href: (z) => z, credits: { summary, budget: o.budget, ratesFile: o.ratesFile } });
  const readme = [
    `${o.title}: Kling batch (${cards.length} shot${cards.length === 1 ? "" : "s"}${summary.nowKnown ? `, about ${summary.nowCredits} credits` : ""})`,
    "",
    "1. Unzip it and open index.html (on a phone: in the Files app, then Share > Open in Safari, or on a computer).",
    "2. Each card lists the files to upload (they are in this zip), the prompt to paste and the settings. Native audio stays off.",
    `3. Save every download named exactly as its card says (the shot id, .mp4) and bring them back to your Mac in ${o.downloads}.`,
    `4. Then run: ${o.clipsCommand}`,
    "5. Approve the clips, run kling again, and the next batch is what's left.",
    "",
  ].join("\n");
  const entries: ZipEntry[] = [
    { name: "README.txt", data: Buffer.from(readme) },
    { name: "index.html", data: Buffer.from(html) },
    { name: "prompts.txt", data: Buffer.from(promptsText(o.title, cards)) },
    { name: "cards.json", data: Buffer.from(JSON.stringify(cards, null, 2) + "\n") },
    ...[...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, abs]) => ({ name, data: readFileSync(abs) })),
  ];
  const now = c.now ? new Date(c.now()) : new Date();
  const buf = zipStore(entries, now);
  const path = join(o.dir, `${o.trackId}-kling.zip`);
  writeFileSync(path, buf);
  return { path, shots: cards.length, files: files.size, bytes: buf.length };
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
export function klingPack(c: Ctx, trackId: string, o: KlingOptions = {}): { cards: UploadCard[]; dir: string; made: string[] } {
  const log = logOf(c);
  if (o.budget !== undefined && !(Number.isFinite(o.budget) && o.budget > 0)) throw new Error("--budget takes a number of credits, more than 0");
  const model = o.model ? GENERATORS[o.model] : null;
  if (o.model && !model) throw new Error(`no generator "${o.model}"; one of: ${Object.keys(GENERATORS).join(", ")}`);
  if (model && !model.wholeSeconds) throw new Error(`${model.id} follows a motion video; --model is for b-roll, lip-sync and trick shots`);
  const t = loadManifest(c).tracks.find((x) => x.trackId === trackId);
  if (!t) throw new Error(`no song "${trackId}" in ${c.library}`);
  const p = songPaths(c, trackId);
  if (!existsSync(p.briefs)) throw new Error(`no shot list yet; run: npm run dance8 -- plan ${trackId}`);
  const kept: string[] = [];
  const briefs = readJson<ShotBrief[]>(p.briefs).map((b) => (b.motionRef ? {
    ...b, motionRef: { ...b.motionRef, refFile: b.motionRef.refFile && existsSync(join(p.dir, b.motionRef.refFile)) ? join(p.dir, b.motionRef.refFile) : null },
  } : b)).map((b) => {
    if (!model || b.kind === "dance" || b.generator === model.id) return b;
    if (b.generateSec > model.maxSec || !model.aspects.includes(b.aspect)) { kept.push(b.id); return b; }
    return { ...b, generator: model.id, resolution: model.resolution };
  });
  const mapFile = existsSync(p.castCuemap) ? p.castCuemap : p.cuemap;
  const sceneOrder = existsSync(mapFile) ? [...new Set(readJson<CueMap>(mapFile).cues.map((q) => q.sceneId))] : [];
  const { refs, made } = indexRefs(c, trackId, briefs);
  const dir = klingDir(c, trackId);
  mkdirSync(dir, { recursive: true });
  const downloads = downloadsFor(trackId);
  const { rates, issues, file: ratesFile } = loadRates(c);
  const compiled = sortCards(briefs.map((b) => compileCard(b, refs, {
    tool: GENERATORS[b.generator]?.label ?? b.generator,
    audio: b.kind === "lip_sync" ? cutAudio(c, t, b, join(dir, "audio")) : undefined,
    downloads,
  })), sceneOrder);
  const cards = planCredits(compiled, rates, { budget: o.budget, testedScenes: testedScenes(p.clips) });
  const summary = summarize(cards, rates);
  const clipsCommand = `npm run dance8 -- clips ${trackId} ${downloads}`;
  writeFileSync(join(dir, "cards.json"), JSON.stringify(cards, null, 2) + "\n");
  writeFileSync(join(dir, "prompts.txt"), promptsText(t.title, cards));
  writeFileSync(join(dir, "index.html"), packHtml(cards, {
    title: t.title, trackId, downloads, clipsCommand, href: (abs) => relative(dir, abs), credits: { summary, budget: o.budget, ratesFile },
  }));

  const ready = cards.filter((x) => x.ready).length;
  log(`kling pack: ${join(dir, "index.html")}`);
  log(`${cards.length} shots: ${ready} ready, ${cards.length - ready} waiting for files or words`);
  for (const i of issues) log(`note: ${i}`);
  if (kept.length) log(`kept the planned generator for ${kept.length} shot(s) too long or the wrong shape for ${model!.label}: ${kept.join(", ")}`);
  log(`generate now: ${summary.now} shot(s)${summary.nowKnown ? `, about ${summary.nowCredits} credits${summary.nowKnown < summary.now ? ` for the ${summary.nowKnown} with a known rate` : ""}` : ""}${o.budget !== undefined ? ` (budget ${o.budget})` : ""}`);
  if (summary.afterTest) log(`  ${summary.afterTest} wait for their set's test clip (the cards marked TEST FIRST go first)`);
  if (summary.covered) log(`  ${summary.covered} b-roll shot(s) covered by another card's clip: skip them${summary.savedByCover ? ` (saves about ${summary.savedByCover} credits)` : ""}`);
  if (summary.later) log(`  ${summary.later} past the budget: next batch`);
  if (summary.noRate) log(`  ${summary.noRate} left out of the budget: cost unknown`);
  if (summary.unknownTools.length || summary.lipSyncUnknown) {
    log(`  cost unknown for ${[...summary.unknownTools, ...(summary.lipSyncUnknown ? ["lip sync"] : [])].join(", ")}: add credits per second to ${ratesFile}`);
  }
  if (o.zip) {
    const z = writeKlingZip(c, { trackId, title: t.title, dir, cards, rates, budget: o.budget, ratesFile, downloads, clipsCommand });
    if (!z) log("zip: nothing to generate now (every ready card waits for a test clip, the budget or a cover), so no zip");
    else {
      log(`zip: ${z.path} (${z.shots} shot(s), ${z.files} file(s) to upload, ${(z.bytes / 1e6).toFixed(1)} MB)`);
      log(`  show it in Finder (then AirDrop it to your phone): open -R "${z.path}"`);
    }
  }
  for (const d of made) log(`made ${d} (put its images there and fill in its .txt)`);
  const todo = [...new Set(cards.flatMap((x) => x.missing))];
  for (const m of todo.slice(0, 12)) log(`  to do: ${m}`);
  if (todo.length > 12) log(`  ...and ${todo.length - 12} more (the page lists them per shot)`);
  log(`open it: open "${join(dir, "index.html")}"`);
  log(`downloads: mkdir -p ${downloads}, save each clip there as its shot id, then: ${clipsCommand}`);
  return { cards, dir, made };
}
