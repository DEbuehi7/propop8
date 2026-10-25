// lib/stuttr/albumCommands.ts
//
// File-system side of the album master list (./album) and the voice presets.
//   - albums.json lives in the private library next to library.json, written
//     whole to a temp file and renamed into place, like the manifest.
//   - The board reads the library and never writes it.
//   - voices runs one song's preset: the credit estimate first (free), the
//     conversion only with go, then the listening mix. album-voices does the
//     same for every song on an album that isn't done, and converts only with
//     go and a credit cap at least as high as the estimate. Listening and
//     approving stay the person's.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  albumBoard, ALBUMS_FILE, CREW_VOICES, DEFAULT_LEAD, emptyAlbums, placeSongs, reorderSongs, songRow, summaryOf, validateAlbums, VOICE_MODES,
  type Album, type AlbumsFile, type PartCount, type SongFacts, type SongRow, type VoiceMode,
} from "./album";
import { analysisRel, cuemapRel, SUNO_BACKING } from "./cast";
import {
  castDrift, castMixPlan, convertCast, convertVoices, loadCast, loadManifest, mixCast, mixVoice, type Ctx, type LoadedCast,
} from "./commands";
import type { Fetch } from "./elevenlabs";
import { findTrack, slugify, voiceKey, type LibraryManifest, type LibraryTrack } from "./library";

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const RUN = "npm run stuttr --";
const credits = (n: number) => n.toLocaleString("en-US");

export function loadAlbums(c: Ctx): AlbumsFile {
  const p = join(c.library, ALBUMS_FILE);
  if (!existsSync(p)) return emptyAlbums();
  let f: AlbumsFile;
  try {
    f = JSON.parse(readFileSync(p, "utf8")) as AlbumsFile;
  } catch (e) {
    throw new Error(`${p} is not valid JSON (${(e as Error).message})`);
  }
  const issues = validateAlbums(f);
  if (issues.length) throw new Error(`${p}: ${issues.join("; ")}`);
  return f;
}

export function saveAlbums(c: Ctx, f: AlbumsFile): void {
  const issues = validateAlbums(f);
  if (issues.length) throw new Error(`not saved: ${issues.join("; ")}`);
  mkdirSync(c.library, { recursive: true });
  const p = join(c.library, ALBUMS_FILE);
  writeFileSync(`${p}.tmp`, JSON.stringify(f, null, 2) + "\n");
  renameSync(`${p}.tmp`, p);
}

/** Album and song ids are library-style slugs; "SontheraVein" is album sontheravein. */
const idOf = (s: string) => {
  const id = slugify(s);
  if (!id) throw new Error(`"${s}" has no letters or digits to make an id from`);
  return id;
};

function albumOrThrow(f: AlbumsFile, name: string): Album {
  const a = f.albums.find((x) => x.id === idOf(name));
  if (!a) throw new Error(`no album "${idOf(name)}"${f.albums.length ? ` (albums: ${f.albums.map((x) => x.id).join(", ")})` : ""}; make it with ${RUN} album and its name`);
  return a;
}

function modeOf(s: string | undefined): VoiceMode | undefined {
  if (s === undefined) return undefined;
  if (!(VOICE_MODES as readonly string[]).includes(s)) throw new Error(`--mode and --preset take ${VOICE_MODES.join(", ")}`);
  return s as VoiceMode;
}

/** The cast's parts counted for the board: made (a take that isn't rejected, for this cast) and approved. */
function countCast(c: Ctx, t: LibraryTrack, loaded: LoadedCast): { lead: PartCount; backing: PartCount; sunoBacking: boolean } {
  const all = castMixPlan(c.library, t, loaded, false);
  const ok = castMixPlan(c.library, t, loaded, true);
  const count = (role: "vocals" | "backing_vocals"): PartCount => {
    const made = role === "vocals" ? all.parts : all.backing;
    const approved = role === "vocals" ? ok.parts : ok.backing;
    const drafts = made.filter((p) => !approved.some((q) => q.path === p.path && q.section === p.section));
    return {
      total: loaded.runs.filter((r) => r.role === role && r.voice !== SUNO_BACKING).length,
      made: made.length, approved: approved.length, draftVoices: [...new Set(drafts.map((p) => p.voice ?? "?"))],
    };
  };
  return { lead: count("vocals"), backing: count("backing_vocals"), sunoBacking: loaded.runs.some((r) => r.voice === SUNO_BACKING) };
}

/** What the board needs to know about one song, read from the library. */
export function songFacts(c: Ctx, m: LibraryManifest, trackId: string, lang = "en"): SongFacts {
  const t = findTrack(m, trackId) ?? null;
  if (!t) return { track: null, cast: null, mixes: [], masterDrift: null, analysed: false, planned: false, video: null };
  let cast: SongFacts["cast"] = null;
  try {
    const loaded = loadCast(c, t);
    if (loaded) cast = countCast(c, t, loaded);
  } catch (e) {
    cast = { error: (e as Error).message };
  }
  const list = (rel: string) => (existsSync(join(c.library, rel)) ? readdirSync(join(c.library, rel)) : []);
  const master = (t.masters ?? []).find((x) => x.key === lang && x.kind === "voices");
  const renders = list(`${trackId}/dance8/renders`).filter((n) => n.endsWith(".mp4"));
  return {
    track: t, cast,
    mixes: list(`${trackId}/mixes`).map((n) => `${trackId}/mixes/${n}`),
    masterDrift: master ? castDrift(c, master) : null,
    analysed: existsSync(join(c.library, analysisRel(trackId))),
    planned: existsSync(join(c.library, cuemapRel(trackId))),
    video: renders.some((n) => n.endsWith("-final.mp4")) ? "final" : renders.length ? "draft" : null,
  };
}

function rowsOf(c: Ctx, a: Album, lang = "en"): SongRow[] {
  const m = loadManifest(c);
  return a.songs.map((s, i) => songRow(a.id, i + 1, s, songFacts(c, m, s.trackId, lang), lang));
}

/** album: makes the album the first time (title as typed, or --title), then shows its board. */
export function albumCommand(c: Ctx, name: string, o: { title?: string } = {}): SongRow[] {
  const log = logOf(c);
  const f = loadAlbums(c);
  const id = idOf(name);
  let a = f.albums.find((x) => x.id === id);
  if (!a) {
    a = { id, title: o.title ?? name, songs: [] };
    f.albums.push(a);
    saveAlbums(c, f);
    log(`made album "${a.title}" (${id}) in ${join(c.library, ALBUMS_FILE)}`);
  } else if (o.title && o.title !== a.title) {
    a.title = o.title;
    saveAlbums(c, f);
    log(`renamed album ${id} to "${a.title}"`);
  }
  const rows = rowsOf(c, a);
  for (const l of albumBoard(a, rows)) log(l);
  return rows;
}

/** albums: one line per album. */
export function albumsCommand(c: Ctx): void {
  const log = logOf(c);
  const f = loadAlbums(c);
  if (!f.albums.length) log(`no albums yet; make one with ${RUN} album and the album's name`);
  for (const a of f.albums) {
    const rows = rowsOf(c, a);
    log(`${a.title} (${a.id}): ${rows.length} song${rows.length === 1 ? "" : "s"}; ${summaryOf(rows)}`);
  }
}

const orderLine = (a: Album) => `${a.id}: ${a.songs.map((s, i) => `${i + 1} ${s.trackId}${s.mode ? ` (${s.mode})` : ""}`).join(", ") || "no songs"}`;

/**
 * album-add: adds songs (library ids) to an album in running order, at the
 * end or at track `at`; songs already on it move to `at`. mode, lead and
 * title apply to every song named. A song can be listed before it is added
 * to the library.
 */
export function albumAdd(c: Ctx, name: string, trackIds: string[], o: { at?: number; mode?: string; lead?: string; title?: string } = {}): Album {
  const log = logOf(c);
  if (trackIds.length === 0) throw new Error("album-add needs at least one song id");
  if (o.title !== undefined && trackIds.length > 1) throw new Error("--title names one song; add songs one at a time to give titles");
  const mode = modeOf(o.mode);
  const f = loadAlbums(c);
  const a = albumOrThrow(f, name);
  const ids = trackIds.map(idOf);
  const placed = placeSongs(a, ids, o.at);
  for (const s of placed.songs.filter((x) => ids.includes(x.trackId))) {
    if (mode) s.mode = mode;
    if (o.lead !== undefined) s.lead = o.lead;
    if (o.title !== undefined) s.title = o.title;
  }
  f.albums = f.albums.map((x) => (x.id === a.id ? placed : x));
  saveAlbums(c, f);
  log(orderLine(placed));
  const m = loadManifest(c);
  const missing = ids.filter((id) => !findTrack(m, id));
  if (missing.length) {
    log(`not in the library yet (shown as "not added" until you add them): ${missing.join(", ")}${m.tracks.length ? `; library ids: ${m.tracks.map((t) => t.trackId).join(", ")}` : ""}`);
  }
  return placed;
}

/** album-order: the album's new running order, every song once. */
export function albumOrder(c: Ctx, name: string, trackIds: string[]): Album {
  const f = loadAlbums(c);
  const a = reorderSongs(albumOrThrow(f, name), trackIds.map(idOf));
  f.albums = f.albums.map((x) => (x.id === a.id ? a : x));
  saveAlbums(c, f);
  logOf(c)(orderLine(a));
  return a;
}

/** album-remove: takes songs off the album's list (the library keeps them). */
export function albumRemove(c: Ctx, name: string, trackIds: string[]): Album {
  const f = loadAlbums(c);
  const a = albumOrThrow(f, name);
  const ids = trackIds.map(idOf);
  const absent = ids.filter((id) => !a.songs.some((s) => s.trackId === id));
  if (absent.length) throw new Error(`not on ${a.id}: ${absent.join(", ")}`);
  const out = { ...a, songs: a.songs.filter((s) => !ids.includes(s.trackId)) };
  f.albums = f.albums.map((x) => (x.id === a.id ? out : x));
  saveAlbums(c, f);
  logOf(c)(`${orderLine(out)} (the library still has ${ids.join(", ")})`);
  return out;
}

// ---------------------------------------------------------------- voice presets

type Step = { voices: string[]; from: "vocals" | "backing_vocals" } | { cast: true };

/** What a preset converts for a song; refuses what can't work before any credits are spent. */
function presetSteps(c: Ctx, t: LibraryTrack, preset: VoiceMode, lead: string): Step[] {
  const has = (role: string) => t.files.some((f) => f.role === role);
  if (preset === "cast") {
    if (!loadCast(c, t)) throw new Error(`"${t.trackId}" has no cast yet: ${RUN} analyze ${t.trackId}, npm run dance8 -- plan ${t.trackId}, then ${RUN} cast ${t.trackId} and edit cast.json`);
    return [{ cast: true }];
  }
  if (!has("vocals")) throw new Error(`"${t.trackId}" has no lead vocal stem; export Multitrack stems from Suno and add the folder again`);
  if (preset === "solo") return [{ voices: [lead], from: "vocals" }];
  if (!has("backing_vocals")) throw new Error(`"${t.trackId}" has no backing vocal stem, so there is nothing for the crew to sing; use --preset solo`);
  return [{ voices: [lead], from: "vocals" }, { voices: [...CREW_VOICES], from: "backing_vocals" }];
}

interface RunOptions { lang: string; redo?: boolean; format?: string; key?: string; fetch?: Fetch }

/** Runs the steps: dry, it only adds up the credits; otherwise it converts. Returns credits and takes made. */
async function runSteps(c: Ctx, trackId: string, steps: Step[], dry: boolean, o: RunOptions): Promise<{ credits: number; takes: number }> {
  let total = 0, takes = 0;
  const onPlan = (p: { credits: number }) => { total += p.credits; };
  for (const s of steps) {
    const made = "cast" in s
      ? await convertCast(c, { trackId, format: o.format, dry, key: o.key, fetch: o.fetch, onPlan })
      : await convertVoices(c, { trackId, voices: s.voices, from: s.from, lang: o.lang, redo: o.redo, format: o.format, dry, key: o.key, fetch: o.fetch, onPlan });
    takes += made.length;
  }
  return { credits: total, takes };
}

/** The listening mix for a preset, and what to approve next; null when there is no lead take to mix yet. */
function listeningMix(c: Ctx, trackId: string, preset: VoiceMode, lead: string, lang: string): string | null {
  const log = logOf(c);
  if (preset === "cast") {
    const rel = mixCast(c, trackId);
    nextSteps(c, trackId, preset, lead, lang);
    return rel;
  }
  const t = findTrack(loadManifest(c), trackId)!;
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(lead) && v.lang === lang && v.sourceRole === "vocals" && !v.section);
  if (!take) { log(`no ${lead} lead take yet, so no listening mix`); return null; }
  if (take.status === "rejected") { log(`${take.voice}'s lead take is rejected, so no listening mix; convert it again with --redo`); return null; }
  const rel = mixVoice(c, trackId, lead, lang, true);
  nextSteps(c, trackId, preset, lead, lang);
  return rel;
}

function nextSteps(c: Ctx, trackId: string, preset: VoiceMode, lead: string, lang: string): void {
  const row = songRow("", 0, { trackId, mode: preset, lead }, songFacts(c, loadManifest(c), trackId, lang), lang);
  const steps = row.next.filter((s) => !s.startsWith("build the listening mix"));
  if (steps.length) logOf(c)(["next:", ...steps.map((s) => `  ${s}`)].join("\n"));
}

export interface VoicesOptions {
  trackId: string;
  /** solo, crew or cast; without it, the song's mode on its album. */
  preset?: string;
  /** solo and crew: the lead voice (default Stuttr). */
  lead?: string;
  lang?: string;
  /** Convert. Without it, only the credit estimate (free). */
  go?: boolean;
  /** Stop before converting when the estimate is higher than this. */
  maxCredits?: number;
  /** Convert again the voices whose takes you rejected. */
  redo?: boolean;
  format?: string;
  /** For tests; defaults to the ELEVENLABS_API_KEY environment variable. */
  key?: string;
  fetch?: Fetch;
}

/**
 * voices: one song's preset. solo converts the lead; crew the lead and Suno's
 * backing vocals as Stuttr, M, Ja and Bo; cast what cast.json gives each
 * voice. First the estimate (free); then, with go, the conversion and the
 * listening mix. When there is nothing left to convert it just makes the mix.
 * Takes a song already has are skipped at no cost.
 */
export async function voicesCommand(c: Ctx, o: VoicesOptions): Promise<{ credits: number; takes: number; mix: string | null }> {
  const log = logOf(c);
  // No --preset: the song's mode (and lead) from the album list.
  const listed = o.preset ? undefined : loadAlbums(c).albums.flatMap((a) => a.songs).find((s) => s.trackId === o.trackId && s.mode);
  const preset = modeOf(o.preset || listed?.mode);
  if (!preset) throw new Error(`voices needs --preset ${VOICE_MODES.join(", ")} (or give the song a mode on its album with album-add --mode)`);
  if (listed) log(`${o.trackId}: ${preset}, from the album list`);
  const lang = (o.lang ?? "en").toLowerCase();
  const lead = o.lead ?? listed?.lead ?? DEFAULT_LEAD;
  const t = findTrack(loadManifest(c), o.trackId);
  if (!t) throw new Error(`no track "${o.trackId}" in the library; run add first (list shows what is there)`);
  const steps = presetSteps(c, t, preset, lead);
  const run: RunOptions = { lang, redo: o.redo, format: o.format, key: o.key, fetch: o.fetch };
  const est = await runSteps(c, o.trackId, steps, true, run);
  if (est.credits > 0 && !o.go) {
    const again = `${RUN} voices ${o.trackId} --preset ${preset}${o.lead ? ` --lead ${o.lead}` : ""}${lang === "en" ? "" : ` --lang ${lang}`}${o.redo ? " --redo" : ""} --go`;
    log(`${o.trackId} (${preset}): about ${credits(est.credits)} credits in all. Nothing was converted. To convert: ${again}`);
    return { credits: est.credits, takes: 0, mix: null };
  }
  if (o.maxCredits !== undefined && est.credits > o.maxCredits) {
    throw new Error(`the estimate (${credits(est.credits)} credits) is over --max-credits ${credits(o.maxCredits)}; nothing was converted`);
  }
  const done = est.credits > 0 ? await runSteps(c, o.trackId, steps, false, run) : { credits: 0, takes: 0 };
  if (est.credits === 0) log(`${o.trackId}: nothing to convert (no credits); making the listening mix`);
  return { credits: est.credits, takes: done.takes, mix: listeningMix(c, o.trackId, preset, lead, lang) };
}

export interface AlbumVoicesOptions {
  album: string;
  /** For songs the list gives no mode. */
  preset?: string;
  go?: boolean;
  /** Required with go: the most to spend. Nothing is converted if the estimate is higher. */
  maxCredits?: number;
  redo?: boolean;
  format?: string;
  key?: string;
  fetch?: Fetch;
}

/**
 * album-voices: voices for every song on the album that isn't done, in
 * running order. First the estimate for each song and the album's total
 * (free). Converting needs go and --max-credits at least the total, so the
 * spend is always seen before it happens. It stops at the first song that
 * fails; run it again to carry on (finished parts are skipped at no cost).
 */
export async function albumVoices(c: Ctx, o: AlbumVoicesOptions): Promise<{ credits: number; songs: string[] }> {
  const log = logOf(c);
  const fallback = modeOf(o.preset);
  if (fallback === "cast") throw new Error("--preset cast isn't for a whole album: give each cast song its own cast.json and --mode cast with album-add");
  const a = albumOrThrow(loadAlbums(c), o.album);
  const rows = rowsOf(c, a);
  const run: RunOptions = { lang: "en", redo: o.redo, format: o.format, key: o.key, fetch: o.fetch };
  const todo: { n: number; trackId: string; preset: VoiceMode; lead: string; steps: Step[]; credits: number }[] = [];
  for (const [i, s] of a.songs.entries()) {
    const r = rows[i];
    const tag = `${r.n} ${s.trackId}`;
    if (!r.added) { log(`${tag}: not in the library yet; skipped`); continue; }
    if (r.done) { log(`${tag}: voice master approved; skipped`); continue; }
    const preset = s.mode ?? fallback;
    if (!preset) { log(`${tag}: no voice mode; skipped (set it with ${RUN} album-add ${a.id} ${s.trackId} --mode, or pass --preset)`); continue; }
    const lead = s.lead ?? DEFAULT_LEAD;
    try {
      const t = findTrack(loadManifest(c), s.trackId)!;
      const steps = presetSteps(c, t, preset, lead);
      const est = await runSteps(c, s.trackId, steps, true, run);
      todo.push({ n: r.n, trackId: s.trackId, preset, lead, steps, credits: est.credits });
      log(`${tag} (${preset}): ${est.credits ? `about ${credits(est.credits)} credits` : "nothing to convert"}`);
    } catch (e) {
      log(`${tag}: ${(e as Error).message}; skipped`);
    }
  }
  const total = todo.reduce((x, y) => x + y.credits, 0);
  log(`${a.title}: about ${credits(total)} credits for ${todo.filter((x) => x.credits > 0).length} song(s)`);
  if (!o.go) {
    if (total > 0) log(`Nothing was converted. To convert them all (it stops if the estimate comes out higher): ${RUN} album-voices ${a.id}${o.preset ? ` --preset ${o.preset}` : ""}${o.redo ? " --redo" : ""} --go --max-credits ${total}`);
    return { credits: total, songs: [] };
  }
  if (total > 0) {
    if (o.maxCredits === undefined) throw new Error(`--go needs --max-credits, the most you'll spend on this album (the estimate above is ${total}); nothing was converted`);
    if (total > o.maxCredits) throw new Error(`the estimate (${credits(total)} credits) is over --max-credits ${credits(o.maxCredits)}; nothing was converted`);
  }
  const songs: string[] = [];
  for (const x of todo) {
    try {
      if (x.credits > 0) await runSteps(c, x.trackId, x.steps, false, run);
      listeningMix(c, x.trackId, x.preset, x.lead, "en");
      songs.push(x.trackId);
    } catch (e) {
      throw new Error(`stopped at ${x.n} ${x.trackId}: ${(e as Error).message}. The songs before it are done; run album-voices again to carry on (finished parts are skipped)`);
    }
  }
  log(`listen to each song's mix and approve what you keep; ${RUN} album ${a.id} shows every song's next step`);
  return { credits: total, songs };
}
