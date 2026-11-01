// lib/stuttr/mediaVault.ts
//
// Media Vault v1: one read-only index of the music and media records that
// already exist in the private Stuttr library, so later readers (Late8, State8,
// a contact sheet) have one place to look. It is built from the files each
// tool already writes, using their own ids, and it never changes any of them:
//   library.json          tracks, Suno files, voice takes, voice masters (Stuttr)
//   albums.json           albums, running order, voice modes (Stuttr)
//   <song>/cast.json      who sings which section (Stuttr)
//   <song>/analysis/      tempo, bars, and the stems it was measured from
//   <song>/dance8/        cue map, shot list, clip library, renders and their manifests
//   <song>/dance8/kling/  the upload cards (reference files each shot uses)
//   refs/                 character and set references (folder names decide)
// Rebuild it any time with: npm run stuttr -- media-vault. Nothing is migrated
// and no database is involved. Media only: property, tenant and client data
// never enter it (GOV-15), and audiobooks have no records yet (Late8 is a
// proposal), so that part is reported as absent rather than invented.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { songRow, type SongRow, type Stage, type VoiceMode } from "./album";
import { loadAlbums, songFacts } from "./albumCommands";
import { analysisRel, castRel, cuemapRel } from "./cast";
import { castDrift, loadManifest, type Ctx } from "./commands";
import { findTrack, masterProblem, type LibraryTrack } from "./library";
import type { SongAnalysis } from "./analysis";
import { CHARACTER_TEXT, IMAGE_EXTS, isPlaceholderScene, SCENE_TEXT, type UploadCard } from "../dance8/authoring/klingPack";
import type { ShotBrief } from "../dance8/authoring/shotBriefs";
import type { CueMap, VisualClipLibrary } from "../dance8/contracts/scene";

export const MEDIA_VAULT_FILE = "media-vault.json";
export const MEDIA_VAULT_SCHEMA = 1 as const;

/** A file the index points at, pinned by the SHA-256 its own record holds (or the file's, for files with no record). */
export interface VaultFile {
  path: string;
  sha256: string;
}

export interface VaultTake {
  voice: string;
  lang: string;
  role: "lead" | "backing";
  section: string | null;
  status: "draft" | "approved" | "rejected";
  timingOk: boolean;
  method: string;
  path: string;
  sha256: string;
  /** The stem it was converted from. */
  sourceSha256: string;
  addedAt: string;
}

export interface VaultMaster {
  key: string;
  kind: "voices" | "suno";
  status: "draft" | "approved" | "rejected";
  /** Still matches every take, stem and cast it was built from. */
  current: boolean;
  problem: string | null;
  path: string;
  sha256: string;
  builtAt: string;
}

export interface VaultRender {
  file: string;
  final: boolean;
  /** The audio the render played, from its manifest; null without one. */
  audioSha256: string | null;
  /** That audio is an approved voice master of this song; null without a manifest. */
  approvedMaster: boolean | null;
}

export interface VaultTrack {
  trackId: string;
  title: string;
  /** Every album the song is on, with its track number there. */
  albums: { albumId: string; sequence: number }[];
  /** The album board's status per stage, and whether the voice master is approved and current. */
  status: Record<Stage, string>;
  done: boolean;
  /** The board's next step for the song, or null when the voice work is done. */
  next: string | null;
  original: {
    sunoPlan: string;
    addedAt: string;
    fullMix: (VaultFile & { durationSec: number | null }) | null;
    /** vocals, backing_vocals, instrumental and each instrument stem. */
    stems: (VaultFile & { role: string; name: string | null })[];
    lyrics: VaultFile | null;
  };
  voice: {
    mode: VoiceMode | null;
    cast: VaultFile | null;
    takes: VaultTake[];
    masters: VaultMaster[];
  };
  dance8: {
    analysis: { path: string; analyzer: string; bpm: number; bars: number; durationSec: number; matchesStems: boolean } | null;
    cueMap: { path: string; version: number; approvalStatus: string; sections: number; scenes: string[] } | null;
    /** Shots still to generate, by kind (the shot list). */
    shotsToMake: Record<ShotBrief["kind"], number> | null;
    clips: { total: number; approved: number; draft: number; retired: number; generators: string[] } | null;
    renders: VaultRender[];
  };
  visual: {
    /** Each scene the cue map uses and its reference folder, if made. */
    scenes: { id: string; dir: string | null; master: boolean; text: boolean }[];
    /** Characters the upload cards use. */
    characters: { id: string; dir: string; face: boolean; fullbody: boolean; text: boolean }[];
    kling: { cards: number; ready: number } | null;
  };
  /** No audiobook records exist yet (the Late8 audiobook is a proposal). */
  audiobook: null;
}

export interface MediaVault {
  schemaVersion: typeof MEDIA_VAULT_SCHEMA;
  builtAt: string;
  /** What this index was read from (library-relative). */
  sources: string[];
  albums: { id: string; title: string; songs: { sequence: number; trackId: string; mode: VoiceMode | null; inLibrary: boolean }[] }[];
  tracks: VaultTrack[];
  /** Kinds of record the index does not hold yet, so no reader mistakes their absence for an empty result. */
  absent: string[];
}

const readJson = <T>(p: string): T | null => {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};
const shaOf = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);
const hasImage = (dir: string, stem: string) => list(dir).some((n) => new RegExp(`^${stem}\\.(${IMAGE_EXTS.join("|")})$`, "i").test(n));

function trackRecord(c: Ctx, t: LibraryTrack, row: SongRow, albums: VaultTrack["albums"], mode: VoiceMode | null): VaultTrack {
  const file = (role: string) => t.files.find((f) => f.role === role);
  const full = file("full_mix");
  const lyrics = file("lyrics");
  const castPath = join(c.library, castRel(t.trackId));
  const d8 = join(c.library, t.trackId, "dance8");

  const analysis = readJson<SongAnalysis>(join(c.library, analysisRel(t.trackId)));
  const shas = new Set(t.files.map((f) => f.sha256));
  const map = readJson<CueMap>(join(c.library, cuemapRel(t.trackId)));
  const briefs = readJson<ShotBrief[]>(join(d8, `${t.trackId}.briefs.json`));
  const clips = readJson<VisualClipLibrary>(join(d8, `${t.trackId}.clips.json`));
  const cards = readJson<UploadCard[]>(join(d8, "kling", "cards.json"));
  const approvedShas = new Set((t.masters ?? []).filter((m) => m.status === "approved").map((m) => m.sha256));

  const renders = list(join(d8, "renders")).filter((n) => n.endsWith(".mp4")).sort().map((n): VaultRender => {
    const man = readJson<{ audio?: { sha256?: string } }>(join(d8, "renders", `${n}.manifest.json`));
    const audio = man?.audio?.sha256 ?? null;
    return { file: `${t.trackId}/dance8/renders/${n}`, final: n.endsWith("-final.mp4"), audioSha256: audio, approvedMaster: audio === null ? null : approvedShas.has(audio) };
  });

  const scenes = [...new Set((map?.cues ?? []).map((q) => q.sceneId))].map((id) => {
    const own = join(c.library, t.trackId, "refs", "scenes", id);
    const shared = join(c.library, "refs", "scenes", id);
    const dir = existsSync(own) ? own : !isPlaceholderScene(id) && existsSync(shared) ? shared : null;
    return { id, dir: dir ? dir.slice(c.library.length + 1) : null, master: !!dir && hasImage(dir, "master"), text: !!dir && existsSync(join(dir, SCENE_TEXT)) };
  });
  const castRoot = join(c.library, "refs", "cast");
  const slugs = [...new Set((cards ?? []).flatMap((k) => k.uploads.map((u) => u.path ?? "")
    .filter((p) => p.startsWith(`${castRoot}/`)).map((p) => p.slice(castRoot.length + 1).split("/")[0])))].sort();
  const characters = slugs.map((id) => {
    const dir = join(castRoot, id);
    return { id, dir: `refs/cast/${id}`, face: hasImage(dir, "face"), fullbody: hasImage(dir, "fullbody"), text: existsSync(join(dir, CHARACTER_TEXT)) };
  });

  const kinds: ShotBrief["kind"][] = ["lip_sync", "broll", "dance", "trick"];
  return {
    trackId: t.trackId, title: t.title, albums, status: row.cells, done: row.done, next: row.done ? null : row.next[0] ?? null,
    original: {
      sunoPlan: t.sunoPlan, addedAt: t.addedAt,
      fullMix: full ? { path: full.path, sha256: full.sha256, durationSec: full.audio?.durationSec ?? null } : null,
      stems: t.files.filter((f) => ["vocals", "backing_vocals", "instrumental", "stem"].includes(f.role))
        .map((f) => ({ role: f.role, name: f.stemName ?? null, path: f.path, sha256: f.sha256 })),
      lyrics: lyrics ? { path: lyrics.path, sha256: lyrics.sha256 } : null,
    },
    voice: {
      mode,
      cast: existsSync(castPath) ? { path: castRel(t.trackId), sha256: shaOf(castPath) } : null,
      takes: t.voices.map((v) => ({
        voice: v.voice, lang: v.lang, role: v.sourceRole === "vocals" ? "lead" : "backing", section: v.section ?? null, status: v.status,
        timingOk: v.timingOk, method: v.method, path: v.path, sha256: v.sha256, sourceSha256: v.sourceSha256, addedAt: v.addedAt,
      })),
      masters: (t.masters ?? []).map((m) => {
        const problem = m.status === "rejected" ? null : masterProblem(t, m) ?? castDrift(c, m);
        return { key: m.key, kind: m.kind, status: m.status, current: m.status !== "rejected" && !problem, problem, path: m.path, sha256: m.sha256, builtAt: m.builtAt };
      }),
    },
    dance8: {
      analysis: analysis ? {
        path: analysisRel(t.trackId), analyzer: analysis.analyzer, bpm: analysis.bpm, bars: analysis.bars, durationSec: analysis.durationSec,
        matchesStems: (analysis.sources ?? []).every((s) => shas.has(s.sha256)),
      } : null,
      cueMap: map ? { path: cuemapRel(t.trackId), version: map.version, approvalStatus: map.approvalStatus, sections: map.cues.length, scenes: scenes.map((s) => s.id) } : null,
      shotsToMake: briefs ? Object.fromEntries(kinds.map((k) => [k, briefs.filter((b) => b.kind === k).length])) as Record<ShotBrief["kind"], number> : null,
      clips: clips ? {
        total: clips.clips.length,
        approved: clips.clips.filter((x) => x.approvalStatus === "approved").length,
        draft: clips.clips.filter((x) => x.approvalStatus === "draft").length,
        retired: clips.clips.filter((x) => x.approvalStatus === "retired").length,
        generators: [...new Set(clips.clips.map((x) => x.source.generator ?? x.source.type))].sort(),
      } : null,
      renders,
    },
    visual: { scenes, characters, kling: cards ? { cards: cards.length, ready: cards.filter((k) => k.ready).length } : null },
    audiobook: null,
  };
}

/** Reads the library and builds the index. Changes nothing. */
export function buildMediaVault(c: Ctx): MediaVault {
  const m = loadManifest(c);
  const f = loadAlbums(c);
  const lang = "en";
  const tracks = [...m.tracks].sort((a, b) => a.trackId.localeCompare(b.trackId)).map((t) => {
    const on = f.albums.flatMap((a) => a.songs.map((s, i) => ({ albumId: a.id, sequence: i + 1, song: s }))).filter((x) => x.song.trackId === t.trackId);
    const song = on[0]?.song ?? { trackId: t.trackId };
    const row = songRow(on[0]?.albumId ?? "", on[0]?.sequence ?? 0, song, songFacts(c, m, t.trackId, lang), lang);
    return trackRecord(c, t, row, on.map(({ albumId, sequence }) => ({ albumId, sequence })), song.mode ?? null);
  });
  return {
    schemaVersion: MEDIA_VAULT_SCHEMA,
    builtAt: c.now ? c.now() : new Date().toISOString(),
    sources: ["library.json", ...(existsSync(join(c.library, "albums.json")) ? ["albums.json"] : []), "<song>/cast.json", "<song>/analysis/", "<song>/dance8/", "refs/"],
    albums: f.albums.map((a) => ({
      id: a.id, title: a.title,
      songs: a.songs.map((s, i) => ({ sequence: i + 1, trackId: s.trackId, mode: s.mode ?? null, inLibrary: !!findTrack(m, s.trackId) })),
    })),
    tracks,
    absent: [
      "audiobook records (series, chapters, narration, transcripts): none exist yet; the Late8 audiobook is a proposal",
      "artwork records (album and song artwork, approval of images): none exist yet; reference images are folders only",
      "rights beyond the Suno plan per song: canon STU-04 is still open",
    ],
  };
}

/** A few lines for the Terminal. */
export function vaultSummary(v: MediaVault): string[] {
  const n = (p: (t: VaultTrack) => boolean) => v.tracks.filter(p).length;
  const lines = [
    `${v.tracks.length} track${v.tracks.length === 1 ? "" : "s"} on ${v.albums.length} album${v.albums.length === 1 ? "" : "s"}; ${n((t) => t.albums.length === 0)} on no album`,
    `voice masters approved and current: ${n((t) => t.done)}; stale: ${n((t) => t.voice.masters.some((m) => m.status !== "rejected" && !m.current))}`,
    `Dance8: ${n((t) => !!t.dance8.analysis)} analysed, ${n((t) => !!t.dance8.cueMap)} planned, ${n((t) => (t.dance8.clips?.approved ?? 0) > 0)} with approved clips, ${n((t) => t.dance8.renders.some((r) => r.final))} with a final video`,
  ];
  const off = v.tracks.filter((t) => t.dance8.renders.some((r) => r.approvedMaster === false));
  if (off.length) lines.push(`renders not playing an approved voice master: ${off.map((t) => t.trackId).join(", ")}`);
  const stems = v.tracks.filter((t) => t.dance8.analysis && !t.dance8.analysis.matchesStems);
  if (stems.length) lines.push(`analysis older than the song's files (run analyze again): ${stems.map((t) => t.trackId).join(", ")}`);
  return lines;
}

/** media-vault: builds the index and writes media-vault.json in the library (whole, via a temp file). */
export function mediaVaultCommand(c: Ctx): MediaVault {
  const v = buildMediaVault(c);
  const p = join(c.library, MEDIA_VAULT_FILE);
  writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 2) + "\n");
  renameSync(`${p}.tmp`, p);
  const log = c.log ?? ((l: string) => console.log(l));
  log(`media vault: ${p} (read-only index; rebuild it any time)`);
  for (const l of vaultSummary(v)) log(l);
  return v;
}
