// lib/stuttr/album.ts
//
// The album master list: each album's songs in running order, and where each
// song stands on the way from its Suno export to a Dance8 video. The list
// (albums.json in the private library, next to library.json) holds only what a
// person decides: the order, the album title, and each song's voice mode. Every
// status on the board is worked out from the library each time it is shown and
// never stored, so the board can't drift from the files (a view renders state,
// it never creates it: GOV-17).
//
// Voice modes (one decision per song, from the reviewed voice workflow):
//   solo  Stuttr (or the song's lead) replaces Suno's lead; Suno's backing stays.
//   crew  the lead, plus Suno's backing vocals converted into the crew voices.
//   cast  different voices sing different sections (cast.json).
// Pure: no files.

import { masterProblem, slugify, voiceKey, type LibraryTrack, type VoiceTake } from "./library";

export const ALBUMS_FILE = "albums.json";
export const ALBUMS_SCHEMA = 1 as const;
export const VOICE_MODES = ["solo", "crew", "cast"] as const;
export type VoiceMode = (typeof VOICE_MODES)[number];
/** The lead a solo or crew song is converted to unless the list names another. */
export const DEFAULT_LEAD = "Stuttr";
/** Crew: Suno's backing vocals as shouts and harmonies in these voices. */
export const CREW_VOICES = ["Stuttr", "M", "Ja", "Bo"] as const;

export interface AlbumSong {
  /** The song's id in the Stuttr library (it may be listed before it is added). */
  trackId: string;
  /** For a song not added yet: its title, so the list reads well. */
  title?: string;
  mode?: VoiceMode;
  /** solo and crew: the lead voice (default Stuttr). */
  lead?: string;
}

export interface Album {
  id: string;
  title: string;
  /** In running order: track 1 first. */
  songs: AlbumSong[];
}

export interface AlbumsFile {
  schemaVersion: typeof ALBUMS_SCHEMA;
  albums: Album[];
}

export const emptyAlbums = (): AlbumsFile => ({ schemaVersion: ALBUMS_SCHEMA, albums: [] });
const isId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && slugify(s) === s;
const isVoice = (s: unknown): s is string => typeof s === "string" && voiceKey(s).length > 0 && !/[\\/]/.test(s);

/** Everything wrong with an albums file, or [] when it is fine. */
export function validateAlbums(f: AlbumsFile): string[] {
  const issues: string[] = [];
  if (f?.schemaVersion !== ALBUMS_SCHEMA) issues.push(`schemaVersion must be ${ALBUMS_SCHEMA}`);
  if (!Array.isArray(f?.albums)) return [...issues, "albums must be a list"];
  const ids = new Set<string>();
  for (const a of f.albums) {
    if (!isId(a?.id)) { issues.push(`album id ${JSON.stringify(a?.id)} must be lowercase letters, digits and dashes`); continue; }
    if (ids.has(a.id)) issues.push(`album "${a.id}" is listed twice`);
    ids.add(a.id);
    if (typeof a.title !== "string" || !a.title.trim()) issues.push(`album "${a.id}" needs a title`);
    if (!Array.isArray(a.songs)) { issues.push(`album "${a.id}": songs must be a list`); continue; }
    const seen = new Set<string>();
    for (const s of a.songs) {
      if (!isId(s?.trackId)) { issues.push(`album "${a.id}": song id ${JSON.stringify(s?.trackId)} must be a library id, like "vein"`); continue; }
      if (seen.has(s.trackId)) issues.push(`album "${a.id}": "${s.trackId}" is listed twice`);
      seen.add(s.trackId);
      if (s.mode !== undefined && !VOICE_MODES.includes(s.mode)) issues.push(`album "${a.id}", ${s.trackId}: mode must be ${VOICE_MODES.join(", ")}`);
      if (s.lead !== undefined && !isVoice(s.lead)) issues.push(`album "${a.id}", ${s.trackId}: lead ${JSON.stringify(s.lead)} is not a voice name`);
      if (s.title !== undefined && typeof s.title !== "string") issues.push(`album "${a.id}", ${s.trackId}: title must be text`);
    }
  }
  return issues;
}

/** One kind of part of a cast (lead or backing): how many it has, how many have a take, how many are approved. */
export interface PartCount {
  total: number;
  /** Parts with a take that isn't rejected, made for this cast. */
  made: number;
  approved: number;
  /** Voices with a draft take among these parts. */
  draftVoices: string[];
}

/** What the board needs from the library about one song (gathered by the caller). */
export interface SongFacts {
  track: LibraryTrack | null;
  /** The song's cast, counted; { error } when cast.json can't be read; null when it has none. */
  cast: { lead: PartCount; backing: PartCount; sunoBacking: boolean } | { error: string } | null;
  /** Listening mixes that exist (library-relative paths). */
  mixes: string[];
  /** Why the master no longer matches its cast or cue map (castDrift), or null. */
  masterDrift: string | null;
  analysed: boolean;
  planned: boolean;
  video: "final" | "draft" | null;
}

export const STAGES = ["source", "stems", "lead", "backing", "mix", "master", "dance8", "video"] as const;
export type Stage = (typeof STAGES)[number];

export interface SongRow {
  n: number;
  trackId: string;
  title: string;
  mode: VoiceMode | null;
  cells: Record<Stage, string>;
  /** The voice master is approved and still matches what it was built from. */
  done: boolean;
  added: boolean;
  /** What to do next, in order: commands to run or a thing to check. */
  next: string[];
  notes: string[];
}

/** Where a song's listening mix is written (mix, mix --cast). */
export const mixRel = (trackId: string, lead: string, lang = "en") => `${trackId}/mixes/${trackId}.${voiceKey(lead)}.${lang}.draft.wav`;
export const castMixRel = (trackId: string, lang = "en") => `${trackId}/mixes/${trackId}.cast.${lang}.draft.wav`;

const RUN = "npm run stuttr --";
const langFlag = (lang: string) => (lang === "en" ? "" : ` --lang ${lang}`);
const wholeSong = (t: LibraryTrack, lang: string, role: VoiceTake["sourceRole"]) =>
  t.voices.filter((v) => v.lang === lang && v.sourceRole === role && !v.section);
const takeCell = (v: VoiceTake | undefined) => (!v ? "-" : v.timingOk || v.status === "rejected" ? v.status : `${v.status}, timing!`);
const countCell = (approved: number, total: number) => `${approved}/${total}`;

/**
 * One song's row on the board: a short status per stage and the next steps.
 * The voice steps stop at the approved master; listening and approving stay
 * the person's (the listening gate is never automated).
 */
export function songRow(albumId: string, n: number, song: AlbumSong, f: SongFacts, lang = "en"): SongRow {
  const id = song.trackId;
  const t = f.track;
  const mode = song.mode ?? null;
  const lead = song.lead ?? DEFAULT_LEAD;
  const cells: Record<Stage, string> = {
    source: "-", stems: "-", lead: "-", backing: "-", mix: "-", master: "-",
    dance8: f.planned ? "planned" : f.analysed ? "analysed" : "-", video: f.video ?? "-",
  };
  const row: SongRow = { n, trackId: id, title: t?.title ?? song.title ?? id, mode, cells, done: false, added: !!t, next: [], notes: [] };
  if (!t) {
    cells.source = "not added";
    row.next.push(`add its Suno song folder to the library with ${RUN} add, using --id ${id} so it matches this list`);
    return row;
  }

  const has = (role: string) => t.files.some((x) => x.role === role);
  cells.source = has("full_mix") ? "ok" : "no full mix";
  const beds = has("instrumental") || has("stem");
  const missing = [!has("vocals") && "lead vocal", !beds && "instruments", mode === "crew" && !has("backing_vocals") && "backing vocals"].filter(Boolean);
  cells.stems = missing.length ? `no ${missing.join(", ")}` : "ok";

  // The voice master and whether it still matches what it was built from.
  const master = (t.masters ?? []).find((x) => x.key === lang && x.kind === "voices");
  const problem = master && master.status !== "rejected" ? masterProblem(t, master) ?? f.masterDrift : null;
  cells.master = !master ? "-" : master.status === "rejected" ? "rejected" : problem ? "stale" : master.status;
  row.done = master?.status === "approved" && !problem;

  // Voices: whole-song takes (solo, crew) or the cast's parts.
  const casting = mode === "cast";
  const leadTake = wholeSong(t, lang, "vocals").find((v) => voiceKey(v.voice) === voiceKey(lead));
  const backingTakes = wholeSong(t, lang, "backing_vocals");
  if (casting) {
    const c = f.cast;
    if (c && "lead" in c) {
      cells.lead = countCell(c.lead.approved, c.lead.total);
      cells.backing = c.backing.total ? countCell(c.backing.approved, c.backing.total) : c.sunoBacking ? "suno" : "none";
    } else if (c) {
      cells.lead = "cast error";
    } else {
      cells.lead = "no cast";
    }
    cells.mix = f.mixes.includes(castMixRel(id, lang)) ? "made" : "-";
  } else {
    cells.lead = takeCell(leadTake);
    if (mode === "crew") {
      const approved = CREW_VOICES.filter((v) => backingTakes.some((b) => voiceKey(b.voice) === voiceKey(v) && b.status === "approved")).length;
      cells.backing = countCell(approved, CREW_VOICES.length);
    } else {
      const live = backingTakes.filter((b) => b.status !== "rejected");
      cells.backing = live.length ? countCell(live.filter((b) => b.status === "approved").length, live.length) : has("backing_vocals") ? "suno" : "none";
    }
    cells.mix = f.mixes.includes(mixRel(id, lead, lang)) ? "made" : "-";
    if (f.cast) row.notes.push(`it has a cast.json, so master builds from the cast: set its mode to cast (${RUN} album-add ${albumId} ${id} --mode cast), or master it with --no-cast`);
  }

  if (row.done) return row;
  if (cells.source !== "ok" || cells.stems !== "ok") {
    row.next.push(`export it from Suno again with Multitrack stems and the Full Song, then add the folder again (${[cells.source !== "ok" && cells.source, cells.stems !== "ok" && cells.stems].filter(Boolean).join("; ")})`);
    return row;
  }
  if (!mode) {
    row.next.push(`choose its voice mode: ${RUN} album-add ${albumId} ${id} --mode solo   (or crew, or cast)`);
    return row;
  }

  const masterSteps = () => {
    if (!master || master.status === "rejected") row.next.push(`build the master: ${RUN} master ${id}${langFlag(lang)}`);
    else if (problem) row.next.push(`the master is out of date (${problem}); rebuild it: ${RUN} master ${id}${langFlag(lang)} --replace`);
    else row.next.push(`listen to the master (${master.path}), then: ${RUN} approve-master ${id}${langFlag(lang)}`);
  };
  const preset = `${RUN} voices ${id} --preset ${mode}${langFlag(lang)}   (shows the credits; add --go to convert)`;

  if (casting) {
    const c = f.cast;
    if (!c) {
      if (!f.analysed) row.next.push(`${RUN} analyze ${id}`);
      if (!f.planned) row.next.push(`npm run dance8 -- plan ${id}`);
      row.next.push(`write its cast: ${RUN} cast ${id}, edit cast.json, then run cast again to check it`);
      return row;
    }
    if (!("lead" in c)) {
      row.next.push(`fix cast.json (${RUN} cast ${id} shows what is wrong): ${c.error}`);
      return row;
    }
    if (c.lead.made < c.lead.total || c.backing.made < c.backing.total) {
      row.next.push(preset);
      return row;
    }
    const drafts = [...c.lead.draftVoices.map((v) => ({ v, backing: false })), ...c.backing.draftVoices.map((v) => ({ v, backing: true }))];
    if (drafts.length) {
      if (cells.mix !== "made") row.next.push(`build the listening mix: ${RUN} mix ${id} --cast`);
      row.next.push(`listen to ${castMixRel(id, lang)}, then approve what you keep (or reject it):`);
      for (const d of drafts) row.next.push(`  ${RUN} approve ${id} ${d.v}${d.backing ? " --from backing_vocals" : ""}`);
      return row;
    }
    masterSteps();
    return row;
  }

  // solo and crew
  const crewMissing = mode === "crew" ? CREW_VOICES.filter((v) => !backingTakes.some((b) => voiceKey(b.voice) === voiceKey(v))) : [];
  if (!leadTake || crewMissing.length) {
    row.next.push(preset);
    return row;
  }
  if (leadTake.status === "rejected") {
    row.next.push(`${leadTake.voice}'s lead take is rejected; convert it again: ${RUN} convert ${id} ${leadTake.voice}${langFlag(lang)} --redo`);
    return row;
  }
  if (!leadTake.timingOk) {
    row.next.push(`${leadTake.voice}'s lead take is off the stem's timing (more than 50 ms), so it can't be approved: ${RUN} reject ${id} ${leadTake.voice}${langFlag(lang)}, then convert it again with --redo`);
    return row;
  }
  const drafts = [leadTake, ...backingTakes].filter((v) => v.status === "draft");
  if (drafts.length) {
    if (cells.mix !== "made") row.next.push(`build the listening mix: ${RUN} mix ${id} ${lead}${langFlag(lang)}`);
    row.next.push(`listen to ${mixRel(id, lead, lang)}, then approve what you keep (or reject it):`);
    for (const d of drafts) row.next.push(`  ${RUN} approve ${id} ${d.voice}${langFlag(lang)}${d.sourceRole === "backing_vocals" ? " --from backing_vocals" : ""}`);
    return row;
  }
  masterSteps();
  return row;
}

/** The album as a table, then the next steps for every song that isn't done. */
export function albumBoard(album: Album, rows: SongRow[]): string[] {
  const done = rows.filter((r) => r.done).length;
  const notAdded = rows.filter((r) => !r.added).length;
  const lines = [`${album.title} (${album.id}): ${rows.length} song${rows.length === 1 ? "" : "s"}; ${summaryOf(rows)}`];
  if (!rows.length) return [...lines, `add its songs in running order with ${RUN} album-add ${album.id}, followed by their library ids (list shows them)`];
  const head = ["#", "song", "mode", ...STAGES];
  const body = rows.map((r) => [String(r.n), r.trackId, r.mode ?? "-", ...STAGES.map((s) => r.cells[s])]);
  const width = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const fmt = (cols: string[]) => cols.map((x, i) => (i === 0 ? x.padStart(width[i]) : x.padEnd(width[i]))).join("  ").trimEnd();
  lines.push(fmt(head), ...body.map(fmt));
  const open = rows.filter((r) => !r.done || r.notes.length);
  if (open.length) lines.push("", "next:");
  for (const r of open) {
    lines.push(`${String(r.n).padStart(2)}  ${r.title}${r.done ? ": voice master approved" : ""}`);
    for (const s of r.next) lines.push(`      ${s}`);
    for (const s of r.notes) lines.push(`      note: ${s}`);
  }
  if (done === rows.length && notAdded === 0) lines.push("", "every song has an approved voice master.");
  return lines;
}

/** "3 voice masters approved, 4 in progress, 2 not added". */
export function summaryOf(rows: SongRow[]): string {
  const done = rows.filter((r) => r.done).length;
  const notAdded = rows.filter((r) => !r.added).length;
  const parts = [`${done} voice master${done === 1 ? "" : "s"} approved`];
  if (rows.length - done - notAdded) parts.push(`${rows.length - done - notAdded} in progress`);
  if (notAdded) parts.push(`${notAdded} not added`);
  return parts.join(", ");
}

/**
 * Places songs in an album. Without `at`, new songs go at the end and listed
 * ones stay where they are; with `at` (1-based), the songs, new or listed,
 * become tracks at, at+1... in the order given.
 */
export function placeSongs(album: Album, ids: string[], at?: number): Album {
  const want = [...new Set(ids)];
  const moving = at !== undefined ? want : want.filter((id) => !album.songs.some((s) => s.trackId === id));
  const kept = album.songs.filter((s) => !moving.includes(s.trackId));
  const max = kept.length + 1;
  if (at !== undefined && (!Number.isInteger(at) || at < 1 || at > max)) throw new Error(`--at must be a track number from 1 to ${max}`);
  const placed = moving.map((id) => album.songs.find((s) => s.trackId === id) ?? { trackId: id });
  const i = at === undefined ? kept.length : at - 1;
  return { ...album, songs: [...kept.slice(0, i), ...placed, ...kept.slice(i)] };
}

/** A new running order: every song in the album, each exactly once. */
export function reorderSongs(album: Album, ids: string[]): Album {
  const have = album.songs.map((s) => s.trackId);
  const extra = ids.filter((id) => !have.includes(id));
  const missing = have.filter((id) => !ids.includes(id));
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  const issues = [
    extra.length && `not on the album: ${extra.join(", ")} (add them with album-add)`,
    missing.length && `missing: ${missing.join(", ")}`,
    twice.length && `listed twice: ${[...new Set(twice)].join(", ")}`,
  ].filter(Boolean);
  if (issues.length) throw new Error(`the new order must list every song on ${album.id} once; ${issues.join("; ")}`);
  return { ...album, songs: ids.map((id) => album.songs.find((s) => s.trackId === id)!) };
}
