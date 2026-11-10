// lib/stuttr/desk/desk.ts
//
// The Stuttr Album Desk: album-level commands over the song library and
// Dance8, so a whole Suno album goes in with one command and the owner comes
// back to a screen of exceptions. It is a thin layer: every song still goes
// through the same code as `stuttr add`, `analyze`, `master`, `voices`,
// `dance8 plan`, `kling`, `clips` and `render`.
//
//   album-import       ZIP or folder + manifest -> checked, matched, copied in
//   album-status       one row per track: its state, what holds it, what next
//   album-process      --stage audio (free: analysis, Suno-vocals master)
//                      --stage voices (paid: a plan with credits; runs only
//                      with --approved-plan <hash> and --max-credits)
//   album-plan-videos  cue maps, shot lists and Kling packs (free)
//   album-clips        Kling downloads, one subfolder per track, checked
//   album-preview      local draft renders, checked after
//   album-resume       the free steps that are due, in order
//   album-resolve      the owner's call on an ambiguous paid job
//
// Rules held here:
//   - The dropped ZIP or folder is read, never changed, moved or renamed;
//     every file is hashed, and the library copy is checked against it.
//   - Nothing paid runs without a plan the owner has seen (its hash) and a
//     credit cap; an unclear provider outcome holds instead of resubmitting.
//   - A problem holds its own track and stage only.
//   - No voice id, key or secret is read into a record or a log; the voice
//     map holds names, and keys come from the environment by name.
//   - Storage is PROVISIONAL (canon STU-04 is open).

import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { addSong, analyzeTrack, buildMaster, castDrift, convertCast, convertVoices, decodeFloat, loadCast, loadManifest, type Ctx } from "../commands";
import { audioFormatOf, classifyFolder, findTrack, masterProblem, slugify, voiceKey, type LibraryTrack } from "../library";
import { CREW_VOICES, type Album } from "../album";
import { loadAlbums, saveAlbums, voicesCommand } from "../albumCommands";
import { analysisRel, SUNO_BACKING } from "../cast";
import { ELEVENLABS_API, KEY_ENV, type Fetch } from "../elevenlabs";
import { ingestClips, planTrack, renderArgs, songPaths, briefForFile, aspectOf } from "../../dance8/pipeline";
import { klingDir, klingPack } from "../../dance8/klingPipeline";
import { validateCueMap } from "../../dance8/authoring/validateCueMap";
import type { CueMap, VisualClipLibrary } from "../../dance8/contracts/scene";
import type { ShotBrief } from "../../dance8/authoring/shotBriefs";
import { STAND_IN_CLIP_ID } from "../../dance8/authoring/plan";
import { standardFps } from "../../dance8/render/fps";
import { ALIGN_RATE, measureOffset } from "./align";
import {
  ALBUM_MANIFEST_SCHEMA, STORAGE_LABEL, starterManifest, strategyOf, trackIdOf, validateManifest, validateVoiceMap,
  type AlbumManifest, type ManifestTrack, type VoiceMap,
} from "./manifest";
import { hasTool, probeAudio, probeVideo } from "./media";
import { chooseFiles, deskSummary, groupSources, isJunk, reconcile, type AlignmentResult, type DeskIssue, type ReconcileRow, type SongCandidate, type SourceFile } from "./reconcile";
import { listZip, readEntry, type ZipEntryInfo } from "./zip";
import {
  admit, classifyFailure, finishJob, idempotencyKey, loadLedger, resolveJob, saveLedger, sha256Text, startJob, type Ledger,
} from "./ledger";
import { summaryLine, trackStatus, type AlbumSummary, type PipelineState, type TrackFacts, type TrackStatus } from "./state";

export const INTAKE_SCHEMA = "stuttr-album-intake-1" as const;
export const VOICE_PLAN_SCHEMA = "stuttr-voice-plan-1" as const;
export const VOICE_MAP_FILE = "voice-map.private.json";
const RUN = "npm run stuttr --";

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const nowOf = (c: Ctx) => (c.now ? c.now() : new Date().toISOString());
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
function writeJsonAtomic(p: string, v: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 2) + "\n");
  renameSync(`${p}.tmp`, p);
}

export const deskDir = (c: Ctx, albumId: string) => join(c.library, "_albums", albumId);
export const intakePath = (c: Ctx, albumId: string) => join(deskDir(c, albumId), "intake.json");
export const ledgerPath = (c: Ctx, albumId: string) => join(deskDir(c, albumId), "ledger.json");
export const voicePlanPath = (c: Ctx, albumId: string) => join(deskDir(c, albumId), "voice-plan.json");
export const stagingRoot = (c: Ctx, albumId: string) => join(c.library, "_intake", albumId);
/** A path for a record: under the home folder it is written with "~", so records don't carry the user name. */
export const homeRel = (p: string) => (p === homedir() || p.startsWith(homedir() + sep) ? `~${p.slice(homedir().length)}` : p);

/** SHA-256 of a file read in 8 MB pieces, so a large ZIP is never loaded whole. */
export function hashFile(path: string): { sha256: string; bytes: number } {
  const h = createHash("sha256");
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let bytes = 0;
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      h.update(buf.subarray(0, n));
      bytes += n;
    }
  } finally { closeSync(fd); }
  return { sha256: h.digest("hex"), bytes };
}

// ---------------------------------------------------------------- records

export interface IntakeTrack {
  trackNumber: number | null;
  trackId: string | null;
  title: string;
  status: ReconcileRow["status"];
  match: ReconcileRow["match"];
  source: string | null;
  files: { path: string; sha256: string; bytes: number; probe: SourceFile["probe"] }[];
  dropped: { path: string; why: string }[];
  suggestion: ReconcileRow["suggestion"];
  issues: DeskIssue[];
  alignment: AlignmentResult[];
  /** VIDEO_QA findings from album-clips, by clip file. */
  videoQa?: { file: string; clipId: string | null; issues: DeskIssue[]; checkedAt: string }[];
  importedAt: string | null;
}

export interface Intake {
  schemaVersion: typeof INTAKE_SCHEMA;
  albumId: string;
  title: string;
  storage: string;
  manifest: AlbumManifest | null;
  manifestSha256: string | null;
  sources: { kind: "zip" | "folder"; path: string; sha256: string; bytes: number; files: number; checkedAt: string }[];
  tracks: IntakeTrack[];
  updatedAt: string;
}

export function loadIntake(c: Ctx, albumId: string): Intake | null {
  const p = intakePath(c, albumId);
  if (!existsSync(p)) return null;
  const i = readJson<Intake>(p);
  if (i.schemaVersion !== INTAKE_SCHEMA) throw new Error(`${p} is not a ${INTAKE_SCHEMA} record`);
  return i;
}

export function loadVoiceMap(c: Ctx): { map: VoiceMap | null; issues: DeskIssue[] } {
  const p = join(c.library, VOICE_MAP_FILE);
  if (!existsSync(p)) return { map: null, issues: [] };
  let map: VoiceMap;
  try { map = readJson<VoiceMap>(p); } catch (e) { return { map: null, issues: [{ code: "VOICE_MAP", severity: "block", stage: "voices", message: `${VOICE_MAP_FILE} is not valid JSON (${(e as Error).message})` }] }; }
  return { map, issues: validateVoiceMap(map).map((i) => ({ ...i, stage: "voices" as const })) };
}

// ---------------------------------------------------------------- import

export interface ImportOptions {
  /** A Suno ZIP, or a folder (of song folders, or of loose files). */
  source: string;
  /** The album manifest (JSON). Without one, a starter is written and nothing is imported. */
  manifest?: string;
  /** Album id when there is no manifest; default: the drop's name as a slug. */
  album?: string;
  dryRun?: boolean;
  /** Skip the stem alignment measurement (it decodes every part). */
  noAlign?: boolean;
}

interface Drop {
  kind: "zip" | "folder";
  files: SourceFile[];
  /** Where each file can be read from (a temp or staging copy for a ZIP, the file itself for a folder). */
  local: Map<string, string>;
  refusals: DeskIssue[];
  hash: { sha256: string; bytes: number };
  cleanup: () => void;
}

function listFolder(root: string): { files: string[]; skipped: DeskIssue[] } {
  const files: string[] = [];
  const skipped: DeskIssue[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir).sort()) {
      const abs = join(dir, n);
      const rel = relative(root, abs).split(sep).join("/").normalize("NFC");
      if (isJunk(rel)) continue;
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) { skipped.push({ code: "SYMLINK", severity: "warn", stage: "import", message: `${rel} is a symbolic link; not followed` }); continue; }
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) files.push(rel);
    }
  };
  walk(root);
  return { files, skipped };
}

function openDrop(c: Ctx, src: string, albumId: string, dry: boolean): Drop {
  const st = lstatSync(src);
  if (st.isSymbolicLink()) throw new Error(`${src} is a symbolic link; give the real file or folder`);
  if (st.isDirectory()) {
    const { files, skipped } = listFolder(src);
    const local = new Map<string, string>();
    const out: SourceFile[] = [];
    for (const rel of files) {
      const abs = join(src, ...rel.split("/"));
      const h = hashFile(abs);
      local.set(rel, abs);
      out.push({ path: rel, sha256: h.sha256, bytes: h.bytes });
    }
    const hash = { sha256: sha256Text(out.map((f) => `${f.path}\t${f.sha256}`).join("\n")), bytes: out.reduce((t, f) => t + f.bytes, 0) };
    return { kind: "folder", files: out, local, refusals: skipped, hash, cleanup: () => undefined };
  }
  const hash = hashFile(src);
  const listing = listZip(src);
  if (listing.problems.length) {
    return { kind: "zip", files: [], local: new Map(), hash, cleanup: () => undefined,
      refusals: listing.problems.map((p) => ({ code: `ZIP_${p.code}`.replace("ZIP_ZIP_", "ZIP_"), severity: "block" as const, stage: "import" as const, message: `${p.entry ? `${p.entry}: ` : ""}${p.detail}`, fix: "nothing was unpacked; download the album ZIP from Suno again, or unzip it yourself and import the folder" })) };
  }
  // Unpack each entry once, to a temp folder (dry run) or the PROVISIONAL staging area, checked to stay inside it.
  const root = dry ? mkdtempSync(join(tmpdir(), "stuttr-drop-")) : join(stagingRoot(c, albumId), hash.sha256.slice(0, 12), "raw");
  mkdirSync(root, { recursive: true });
  const local = new Map<string, string>();
  const out: SourceFile[] = [];
  const refusals: DeskIssue[] = [];
  for (const e of listing.entries.filter((x: ZipEntryInfo) => !x.isDir && !isJunk(x.path))) {
    const dest = resolve(root, ...e.path.split("/"));
    if (!dest.startsWith(resolve(root) + sep)) { refusals.push({ code: "ZIP_UNSAFE_PATH", severity: "block", stage: "import", message: `${e.name} would land outside the staging folder` }); continue; }
    let data: Buffer;
    try { data = readEntry(src, e); } catch (err) {
      const p = (err as { problem?: { code: string } }).problem;
      refusals.push({ code: `ZIP_${p?.code ?? "UNREADABLE"}`.replace("ZIP_ZIP_", "ZIP_"), severity: "block", stage: "import", message: (err as Error).message, fix: "download the album ZIP from Suno again" });
      continue;
    }
    const sha = createHash("sha256").update(data).digest("hex");
    if (!existsSync(dest)) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, data, { flag: "wx" }); }
    else if (hashFile(dest).sha256 !== sha) throw new Error(`staging file ${dest} differs from the ZIP; remove ${root} and run the import again`);
    local.set(e.path, dest);
    out.push({ path: e.path, sha256: sha, bytes: data.length });
  }
  return { kind: "zip", files: out, local, refusals, hash, cleanup: () => { if (dry) rmSync(root, { recursive: true, force: true }); } };
}

/** Offsets of a song's parts against its full mix (decoded at 8 kHz). */
function alignSong(s: SongCandidate, local: Map<string, string>, keep: SourceFile[]): AlignmentResult[] {
  const names = keep.map((f) => basename(f.path));
  const { roles } = classifyFolder(names);
  const full = keep.find((f) => roles.get(basename(f.path))?.role === "full_mix");
  const parts = keep.filter((f) => f !== full && audioFormatOf(basename(f.path)) && !["unclassified", "lyrics"].includes(roles.get(basename(f.path))?.role ?? "unclassified"));
  if (!full || parts.length === 0 || full.probe?.error) return [];
  let mix: Float32Array;
  try { mix = decodeFloat(local.get(full.path)!, ALIGN_RATE); } catch { return []; }
  const out: AlignmentResult[] = [];
  for (const p of parts) {
    if (p.probe?.error) continue;
    try {
      const o = measureOffset(mix, decodeFloat(local.get(p.path)!, ALIGN_RATE), ALIGN_RATE);
      out.push({ part: basename(p.path), offsetMs: o.offsetMs, confidence: o.confidence, verdict: o.verdict });
    } catch {
      out.push({ part: basename(p.path), offsetMs: null, confidence: 0, verdict: "unknown" });
    }
  }
  return out;
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n));

function reportRows(c: Ctx, rows: ReconcileRow[]): void {
  const log = logOf(c);
  log(`${pad("#", 4)}${pad("track", 34)}${pad("match", 9)}${pad("status", 14)}issues`);
  for (const r of rows) {
    // Rights hold finals for the whole album; said once below, not on every row.
    const shown = r.issues.filter((i) => i.severity !== "info" && i.stage !== "final");
    log(`${pad(r.trackNumber === null ? "-" : String(r.trackNumber), 4)}${pad(r.title, 34)}${pad(r.match, 9)}${pad(r.status, 14)}${shown.length ? shown.map((i) => i.code).join(", ") : "-"}`);
    for (const i of shown) log(`      ${i.severity === "block" ? "HOLD" : "note"} ${i.code} (${i.stage}): ${i.message}${i.fix ? ` -> ${i.fix}` : ""}`);
  }
  const s = deskSummary(rows);
  log(`READY ${s.READY} · NEEDS REVIEW ${s.NEEDS_REVIEW} · FOUND ${s.FOUND} · WAITING ${s.WAITING}`);
  const rights = rows.flatMap((r) => r.issues).find((i) => i.code === "RIGHTS_NOT_CLEARED");
  if (rights) log(`rights: ${rights.message}; finals and publishing wait (${rights.fix})`);
}

/**
 * album-import: reads a drop, checks and matches every file, and (without
 * dryRun) copies the READY songs into the library and the album list. Run it
 * again with the same drop and nothing is copied twice; run it with a later
 * drop and only the new or changed songs go in.
 */
export function albumImport(c: Ctx, o: ImportOptions): { albumId: string; rows: ReconcileRow[]; imported: string[]; refused: DeskIssue[]; starter: string | null } {
  const log = logOf(c);
  const src = resolve(o.source);
  if (!existsSync(src)) throw new Error(`${o.source} does not exist`);
  let manifest: AlbumManifest | null = null;
  let manifestSha: string | null = null;
  if (o.manifest) {
    const text = readFileSync(o.manifest, "utf8");
    if (/\.ya?ml$/i.test(o.manifest)) throw new Error("the manifest is read as JSON; YAML isn't supported (no extra parser). Save it as album.json; the starter manifest shows the shape");
    try { manifest = JSON.parse(text) as AlbumManifest; } catch (e) { throw new Error(`${o.manifest} is not valid JSON (${(e as Error).message})`); }
    const bad = validateManifest(manifest).filter((i) => i.severity === "block");
    if (bad.length) throw new Error(`the manifest has ${bad.length} problem(s); nothing was read from the drop:\n${bad.map((i) => `  ${i.code}: ${i.message}${i.fix ? ` (${i.fix})` : ""}`).join("\n")}`);
    manifestSha = sha256Text(text);
  }
  const albumId = manifest?.albumId ?? slugify(o.album ?? basename(src).replace(/\.zip$/i, ""));
  if (!albumId) throw new Error("could not make an album id; pass --album");
  const dry = !!o.dryRun || !manifest;
  log(`${dry ? "dry run" : "import"}: ${homeRel(src)} -> album ${albumId}${manifest ? "" : " (no manifest: nothing is imported; a starter manifest is written)"}`);
  log(`storage: ${STORAGE_LABEL}`);
  const ffprobe = hasTool("ffprobe") && hasTool("ffmpeg");
  if (!ffprobe) log("warning: ffmpeg/ffprobe not found, so nothing is measured; install them (on a Mac: brew install ffmpeg)");

  const drop = openDrop(c, src, albumId, dry);
  try {
    if (drop.refusals.some((r) => r.severity === "block")) {
      for (const r of drop.refusals) log(`HOLD ${r.code}: ${r.message}${r.fix ? ` -> ${r.fix}` : ""}`);
      log("the drop was refused; nothing was imported");
      return { albumId, rows: [], imported: [], refused: drop.refusals, starter: null };
    }
    for (const r of drop.refusals) log(`note ${r.code}: ${r.message}`);
    if (ffprobe) for (const f of drop.files) if (audioFormatOf(basename(f.path))) f.probe = probeAudio(drop.local.get(f.path)!);
    const songs = groupSources(drop.files);
    const aligned = new Map<string, AlignmentResult[]>();
    const rows = reconcile(manifest, songs, (s) => {
      if (o.noAlign || !ffprobe) return [];
      const a = alignSong(s, drop.local, chooseFiles(s).keep);
      aligned.set(s.key, a);
      return a;
    });
    reportRows(c, rows);

    let starter: string | null = null;
    if (!manifest) {
      starter = join(deskDir(c, albumId), "album.starter.json");
      writeJsonAtomic(starter, starterManifest(albumId, basename(src).replace(/\.zip$/i, ""), songs.map((s) => ({ title: s.title, source: s.source }))));
      log(`starter manifest: ${homeRel(starter)}. Check the titles, order, performers and voice strategy, set rights.state, save it as your album.json, then run album-import again with --manifest`);
    }
    const imported: string[] = [];
    if (!dry && manifest) {
      const ledger = loadLedger(ledgerPath(c, albumId));
      for (const r of rows.filter((x) => x.status === "READY" && x.trackId && x.chosen)) {
        const t = manifest.tracks.find((x) => x.trackNumber === r.trackNumber)!;
        const inputs = r.chosen!.keep.map((f) => f.sha256);
        const { key, configHash } = idempotencyKey("import", r.trackId, inputs, { title: t.title, sunoPlan: manifest.sunoPlan ?? null });
        const ok = admit(ledger, key, false);
        const inLib = !!findTrack(loadManifest(c), r.trackId!);
        if (!ok.go && ok.why === "done" && inLib) { log(`${r.trackId}: already imported from these exact files; skipped`); continue; }
        startJob(ledger, { key, configHash, stage: "import", provider: "local", trackId: r.trackId, inputHashes: inputs, now: nowOf(c) });
        saveLedger(ledgerPath(c, albumId), ledger);
        try {
          const stage = join(stagingRoot(c, albumId), "tracks", r.trackId!);
          rmSync(stage, { recursive: true, force: true });
          mkdirSync(stage, { recursive: true });
          const used = new Set<string>();
          for (const f of r.chosen!.keep) {
            const name = basename(f.path);
            if (used.has(name.toLowerCase())) throw new Error(`two files named ${name} in one song`);
            used.add(name.toLowerCase());
            const from = drop.local.get(f.path)!;
            try { linkSync(from, join(stage, name)); } catch { copyFileSync(from, join(stage, name)); }
          }
          addSong({ ...c, log: (l) => log(`  ${l}`) }, { folder: stage, id: r.trackId!, title: t.title, sunoPlan: manifest.sunoPlan });
          // The library copy must be the dropped file, byte for byte.
          const lib = findTrack(loadManifest(c), r.trackId!)!;
          for (const f of r.chosen!.keep) {
            const rec = lib.files.find((x) => x.originalName === basename(f.path));
            if (!rec || rec.sha256 !== f.sha256) throw new Error(`${basename(f.path)} in the library does not match the drop`);
          }
          rmSync(stage, { recursive: true, force: true });
          finishJob(ledger, key, nowOf(c), { status: "SUCCEEDED" });
          imported.push(r.trackId!);
        } catch (e) {
          finishJob(ledger, key, nowOf(c), { status: "FAILED", code: "LOCAL_ERROR", error: (e as Error).message });
          log(`${r.trackId}: not imported: ${(e as Error).message}`);
        }
        saveLedger(ledgerPath(c, albumId), ledger);
      }
      if (drop.kind === "zip") rmSync(join(stagingRoot(c, albumId), drop.hash.sha256.slice(0, 12)), { recursive: true, force: true });
      rmSync(join(stagingRoot(c, albumId), "tracks"), { recursive: true, force: true });
      if (existsSync(stagingRoot(c, albumId)) && readdirSync(stagingRoot(c, albumId)).length === 0) rmSync(stagingRoot(c, albumId), { recursive: true });
      if (existsSync(join(c.library, "_intake")) && readdirSync(join(c.library, "_intake")).length === 0) rmSync(join(c.library, "_intake"), { recursive: true });
      writeIntake(c, albumId, manifest, manifestSha, drop, src, rows, aligned);
      placeOnAlbum(c, manifest);
      log(`${imported.length} song(s) copied into the library; ${RUN} album-status ${albumId} shows each track's next step`);
    } else if (manifest) {
      log(`dry run: nothing was copied or written. Without --dry-run, the ${rows.filter((r) => r.status === "READY").length} READY song(s) go in.`);
    }
    return { albumId, rows, imported, refused: drop.refusals, starter };
  } finally {
    drop.cleanup();
  }
}

function writeIntake(c: Ctx, albumId: string, manifest: AlbumManifest, manifestSha: string | null, drop: Drop, src: string, rows: ReconcileRow[], aligned: Map<string, AlignmentResult[]>): void {
  const prior = loadIntake(c, albumId);
  const now = nowOf(c);
  const byKey = new Map((prior?.tracks ?? []).map((t) => [t.trackId ?? `unlisted:${t.title}`, t]));
  for (const r of rows) {
    const k = r.trackId ?? `unlisted:${r.title}`;
    const old = byKey.get(k);
    // A later drop without this song doesn't erase what an earlier one brought.
    if (old && old.status === "READY" && r.status !== "READY" && !r.candidate) continue;
    const inLib = r.trackId ? !!findTrack(loadManifest(c), r.trackId) : false;
    byKey.set(k, {
      trackNumber: r.trackNumber, trackId: r.trackId, title: r.title, status: r.status, match: r.match, source: r.candidate?.source ?? null,
      files: (r.chosen?.keep ?? []).map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes, probe: f.probe ?? null })),
      dropped: (r.chosen?.dropped ?? []).map((d) => ({ path: d.file.path, why: d.why })),
      suggestion: r.suggestion, issues: r.issues, alignment: r.candidate ? aligned.get(r.candidate.key) ?? [] : [], videoQa: old?.videoQa,
      importedAt: inLib && r.status === "READY" ? old?.importedAt ?? now : old?.importedAt ?? null,
    });
  }
  const intake: Intake = {
    schemaVersion: INTAKE_SCHEMA, albumId, title: manifest.title, storage: STORAGE_LABEL, manifest, manifestSha256: manifestSha,
    sources: [...(prior?.sources ?? []).filter((s) => s.sha256 !== drop.hash.sha256), { kind: drop.kind, path: homeRel(src), sha256: drop.hash.sha256, bytes: drop.hash.bytes, files: drop.files.length, checkedAt: now }],
    tracks: [...byKey.values()].sort((a, b) => (a.trackNumber ?? 1e9) - (b.trackNumber ?? 1e9) || a.title.localeCompare(b.title)),
    updatedAt: now,
  };
  writeJsonAtomic(intakePath(c, albumId), intake);
}

/** The album list (albums.json) follows the manifest: its tracks in order, converted songs with their mode. */
function placeOnAlbum(c: Ctx, m: AlbumManifest): void {
  const f = loadAlbums(c);
  const songs = [...m.tracks].sort((a, b) => a.trackNumber - b.trackNumber).map((t) => ({
    trackId: trackIdOf(t), title: t.title,
    ...(strategyOf(t) === "CONVERT_APPROVED_SEGMENTS" && t.mode ? { mode: t.mode } : {}),
  }));
  const a: Album = { id: m.albumId, title: m.title, songs };
  f.albums = [...f.albums.filter((x) => x.id !== m.albumId), a];
  saveAlbums(c, f);
}

// ---------------------------------------------------------------- status

function intakeOrThrow(c: Ctx, albumId: string): Intake {
  const i = loadIntake(c, slugify(albumId));
  if (!i) throw new Error(`no intake for "${slugify(albumId)}" yet: ${RUN} album-import <zip or folder> --manifest <album.json>`);
  if (!i.manifest) throw new Error(`the intake for ${albumId} has no manifest`);
  return i;
}

const masterFor = (c: Ctx, t: LibraryTrack, keep: boolean): TrackFacts["master"] => {
  const ms = (t.masters ?? []).filter((m) => m.status !== "rejected" && (keep ? m.kind === "suno" : m.kind === "voices"));
  const m = ms.find((x) => x.status === "approved") ?? [...ms].sort((a, b) => b.builtAt.localeCompare(a.builtAt))[0];
  if (!m) return null;
  const current = !masterProblem(t, m) && !castDrift(c, m);
  return { key: m.key, kind: m.kind, status: m.status as "draft" | "approved", current };
};

/** The voices a converted song would use, by name. */
function voicesNeeded(c: Ctx, t: ManifestTrack, lib: LibraryTrack | null, map: VoiceMap | null): { lead: string | null; voices: string[]; problem: string | null } {
  const lead = map?.voices.find((v) => v.performer === (t.performers ?? [])[0])?.voice ?? null;
  if (t.mode === "cast") {
    if (!lib) return { lead, voices: [], problem: null };
    try {
      const cast = loadCast(c, lib);
      if (!cast) return { lead, voices: [], problem: `no cast.json yet: ${RUN} cast ${lib.trackId}` };
      return { lead, voices: [...new Set(cast.runs.map((r) => r.voice).filter((v) => v !== SUNO_BACKING))], problem: null };
    } catch (e) { return { lead, voices: [], problem: (e as Error).message }; }
  }
  if (!lead) return { lead, voices: [], problem: null };
  return { lead, voices: t.mode === "crew" ? [lead, ...CREW_VOICES] : [lead], problem: null };
}

function voiceHolds(c: Ctx, t: ManifestTrack, lib: LibraryTrack | null, vm: ReturnType<typeof loadVoiceMap>, keySet: boolean): DeskIssue[] {
  if (strategyOf(t) !== "CONVERT_APPROVED_SEGMENTS") return [];
  const out: DeskIssue[] = [...vm.issues];
  if (!vm.map) {
    out.push({ code: "NO_VOICE_MAP", severity: "block", stage: "voices", message: `no private voice map (${VOICE_MAP_FILE} in the library)`, fix: `write ${VOICE_MAP_FILE}: one entry per performer with the voice's name, how consent was given, approved: true` });
    return out;
  }
  const need = voicesNeeded(c, t, lib, vm.map);
  if (need.problem) out.push({ code: "CAST_MISSING", severity: "block", stage: "voices", message: need.problem });
  for (const p of t.performers ?? []) {
    const e = vm.map.voices.find((v) => v.performer === p);
    if (!e) out.push({ code: "VOICE_NOT_MAPPED", severity: "block", stage: "voices", message: `${p} has no voice in the voice map`, fix: `add ${p} to ${VOICE_MAP_FILE}` });
    else if (!e.approved) out.push({ code: "VOICE_NOT_APPROVED", severity: "block", stage: "voices", message: `${p}'s voice (${e.voice}) is not approved for use`, fix: `approve it in ${VOICE_MAP_FILE} once consent is confirmed` });
  }
  for (const v of need.voices) {
    const e = vm.map.voices.find((x) => voiceKey(x.voice) === voiceKey(v));
    if (!e) out.push({ code: "VOICE_NOT_MAPPED", severity: "block", stage: "voices", message: `${v} is used by this song but isn't in the voice map`, fix: `add ${v} to ${VOICE_MAP_FILE}, or change the song's mode` });
    else if (!e.approved && !out.some((x) => x.message.includes(`(${e.voice})`))) out.push({ code: "VOICE_NOT_APPROVED", severity: "block", stage: "voices", message: `${v} is not approved for use` });
  }
  if (!keySet) out.push({ code: "PROVIDER_UNAVAILABLE", severity: "block", stage: "voices", message: `${KEY_ENV} is not set, so ElevenLabs can't be reached (local work goes on)`, fix: `set ${KEY_ENV} in your shell profile (it is never printed)` });
  return out;
}

/**
 * VIDEO_QA findings that still count: a retired or removed clip's are gone;
 * a clip the owner approved anyway keeps its findings as notes, not holds.
 */
function videoIssuesNow(p: ReturnType<typeof songPaths> | null, it: IntakeTrack): DeskIssue[] {
  if (!p || !existsSync(p.clips)) return [];
  const lib = readJson<VisualClipLibrary>(p.clips);
  return (it.videoQa ?? []).flatMap((q) => {
    const clip = q.clipId ? lib.clips.find((x) => x.id === q.clipId) : null;
    if (q.clipId && (!clip || clip.approvalStatus === "retired")) return [];
    if (clip?.approvalStatus === "approved") return q.issues.map((i) => (i.severity === "block" ? { ...i, severity: "warn" as const, message: `${i.message} (approved by you anyway)` } : i));
    return q.issues;
  });
}

export interface StatusRow extends TrackStatus { trackNumber: number | null; trackId: string | null; title: string; strategy: string }

export function albumFacts(c: Ctx, albumId: string, o: { key?: string } = {}): { intake: Intake; rows: StatusRow[]; summary: AlbumSummary; ledger: Ledger } {
  const intake = intakeOrThrow(c, albumId);
  const m = intake.manifest!;
  const lib = loadManifest(c);
  const ledger = loadLedger(ledgerPath(c, intake.albumId));
  const vm = loadVoiceMap(c);
  const keySet = !!(o.key ?? process.env[KEY_ENV]);
  const rows: StatusRow[] = [];
  let lipSync = 0;
  for (const it of intake.tracks) {
    const mt = m.tracks.find((t) => it.trackNumber !== null && t.trackNumber === it.trackNumber) ?? null;
    const id = it.trackId;
    const t = id ? findTrack(lib, id) ?? null : null;
    const p = id ? songPaths(c, id) : null;
    let cuemap: TrackFacts["cuemap"] = null;
    let clips = { draft: 0, approved: 0 };
    let shotsLeft = 0;
    if (p && existsSync(p.cuemap) && existsSync(p.clips)) {
      const lib2 = readJson<VisualClipLibrary>(p.clips);
      const issues = validateCueMap(readJson<CueMap>(p.cuemap), lib2).issues;
      cuemap = { valid: issues.length === 0, issues: issues.map((x) => `${x.code}: ${x.message}`) };
      const real = lib2.clips.filter((x) => x.id !== STAND_IN_CLIP_ID);
      clips = { draft: real.filter((x) => x.approvalStatus === "draft").length, approved: real.filter((x) => x.approvalStatus === "approved").length };
      // Shots still to make: the saved shot list, less those a live clip (draft or approved) was made for.
      const briefs = (existsSync(p.briefs) ? readJson<ShotBrief[]>(p.briefs) : []).filter((b) => !real.some((x) => x.approvalStatus !== "retired" && briefForFile(x.file, [b])));
      shotsLeft = briefs.length;
      lipSync += briefs.filter((b) => b.kind === "lip_sync").length;
    }
    const cards = id && existsSync(join(klingDir(c, id), "cards.json")) ? readJson<unknown[]>(join(klingDir(c, id), "cards.json")).length : null;
    const renders = p && existsSync(join(p.dir, "renders")) ? readdirSync(join(p.dir, "renders")).filter((n) => n.endsWith(".mp4")) : [];
    const strategy = mt ? strategyOf(mt) : "KEEP_ORIGINAL";
    const facts: TrackFacts = {
      albumId: intake.albumId, trackNumber: it.trackNumber, trackId: id, title: it.title,
      row: { status: it.status, issues: [...it.issues] }, strategy, rights: m.rights.state,
      inLibrary: !!t, analysed: !!id && existsSync(join(c.library, analysisRel(id))),
      master: t ? masterFor(c, t, strategy === "KEEP_ORIGINAL") : null,
      cuemap, pack: cards === null ? null : { cards }, shotsLeft, clips,
      videoIssues: videoIssuesNow(p, it),
      voiceHolds: mt ? voiceHolds(c, mt, t, vm, keySet) : [],
      ambiguousJobs: ledger.jobs.filter((j) => j.trackId === id && (j.status === "AMBIGUOUS" && j.resolution?.action !== "retry" || (j.status === "RUNNING" && j.provider !== "local"))).map((j) => ({ jobId: j.jobId, stage: j.stage })),
      renders: { draft: renders.some((n) => n.endsWith("-draft.mp4")), final: renders.some((n) => n.endsWith("-final.mp4")) },
    };
    rows.push({ ...trackStatus(facts), trackNumber: it.trackNumber, trackId: id, title: it.title, strategy });
  }
  const plan = existsSync(voicePlanPath(c, intake.albumId)) ? readJson<VoicePlan>(voicePlanPath(c, intake.albumId)) : null;
  const byState: Partial<Record<PipelineState, number>> = {};
  for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1;
  const summary: AlbumSummary = {
    tracks: m.tracks.length,
    matched: intake.tracks.filter((t) => t.trackNumber !== null && t.match !== "none").length,
    waitingOnSource: rows.filter((r) => r.state === "WAITING_SOURCE").length,
    needsReview: intake.tracks.filter((t) => t.status === "NEEDS_REVIEW").length,
    inLibrary: intake.tracks.filter((t) => t.trackId && findTrack(lib, t.trackId)).length,
    held: rows.filter((r) => r.holds.length > 0).length,
    lipSyncShots: lipSync,
    paidJobsApproved: ledger.jobs.filter((j) => j.provider !== "local" && j.status === "SUCCEEDED").length,
    estimatedUnits: plan ? { units: "ElevenLabs credits", amount: plan.totalCredits } : null,
    byState,
  };
  return { intake, rows, summary, ledger };
}

export function albumStatus(c: Ctx, albumId: string, o: { html?: boolean; key?: string } = {}): ReturnType<typeof albumFacts> {
  const log = logOf(c);
  const f = albumFacts(c, albumId, o);
  const { intake, rows, summary } = f;
  log(`${intake.title} (${intake.albumId}) · rights ${intake.manifest!.rights.state} · storage PROVISIONAL (STU-04 open)`);
  log(`${pad("#", 4)}${pad("track", 30)}${pad("voice", 10)}${pad("state", 22)}hold`);
  for (const r of rows) {
    const voice = r.strategy === "KEEP_ORIGINAL" ? "suno" : r.strategy === "CONVERT_APPROVED_SEGMENTS" ? "convert" : "split";
    log(`${pad(r.trackNumber === null ? "-" : String(r.trackNumber), 4)}${pad(r.title, 30)}${pad(voice, 10)}${pad(r.state, 22)}${r.holds.map((h) => h.code).join(", ") || "-"}`);
  }
  log("");
  for (const r of rows) {
    if (!r.next.length && !r.holds.length) continue;
    log(`${r.trackNumber ?? "-"} ${r.title}:`);
    for (const h of r.holds) log(`   HOLD ${h.code} (${h.stage}): ${h.message}`);
    for (const n of r.next) log(`   next: ${n}`);
  }
  log(summaryLine(summary));
  if (o.html) {
    const out = join(deskDir(c, intake.albumId), "status.html");
    writeFileSync(out, statusHtml(intake, rows, summary, nowOf(c)));
    log(`page: ${homeRel(out)}`);
  }
  return f;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[ch]!);

/** A plain local page of the same rows: computed values only, no progress bars. */
export function statusHtml(intake: Intake, rows: StatusRow[], s: AlbumSummary, at: string): string {
  const body = rows.map((r) => `<tr><td>${r.trackNumber ?? "-"}</td><td>${esc(r.title)}</td><td>${esc(r.state.replace(/_/g, " ").toLowerCase())}</td><td>${r.holds.map((h) => `<b>${esc(h.code)}</b> ${esc(h.message)}`).join("<br>") || "none"}</td><td>${r.next.map(esc).join("<br>")}</td></tr>`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(intake.title)} album desk</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:16px;color:#1b1b1b;background:#fff}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{font-weight:600}caption{text-align:left;margin-bottom:8px}@media(prefers-color-scheme:dark){body{background:#151515;color:#eee}td,th{border-color:#333}}@media(max-width:640px){td:nth-child(5),th:nth-child(5){display:none}}</style></head>
<body><h1>${esc(intake.title)}</h1><p>Rights: ${esc(intake.manifest!.rights.state)}. Storage: provisional (canon STU-04 is open). Checked ${esc(at)}.</p><p>${esc(summaryLine(s))}</p>
<table><caption>One row per track, worked out from the files when this page was written.</caption><thead><tr><th>#</th><th>Track</th><th>State</th><th>Holds</th><th>Next</th></tr></thead><tbody>
${body || "<tr><td colspan=5>Awaiting activity</td></tr>"}
</tbody></table></body></html>
`;
}

// ---------------------------------------------------------------- process

export interface VoicePlan {
  schemaVersion: typeof VOICE_PLAN_SCHEMA;
  albumId: string;
  entries: { trackId: string; mode: string; lead: string; voices: string[]; credits: number; inputs: string[] }[];
  totalCredits: number;
  units: "ElevenLabs credits";
  /** Where the estimate came from: the library's own rate, not a price. */
  estimateSource: string;
  planHash: string;
  madeAt: string;
}

export interface ProcessOptions {
  stage: "audio" | "voices";
  /** voices: the plan hash the owner reviewed. */
  approvedPlan?: string;
  /** voices: the most credits this batch may spend. */
  maxCredits?: number;
  key?: string;
  fetch?: Fetch;
}

const ok = (c: Ctx, trackId: string, what: string) => logOf(c)(`${trackId}: ${what}`);

export async function albumProcess(c: Ctx, albumId: string, o: ProcessOptions): Promise<{ done: string[]; held: string[]; plan?: VoicePlan }> {
  const log = logOf(c);
  const { intake, rows } = albumFacts(c, albumId, { key: o.key });
  const m = intake.manifest!;
  const ledger = loadLedger(ledgerPath(c, intake.albumId));
  const done: string[] = [];
  const held: string[] = [];
  const lib = () => loadManifest(c);
  if (o.stage === "audio") {
    for (const r of rows) {
      if (!r.trackId || !findTrack(lib(), r.trackId)) continue;
      const audioHold = r.holds.find((h) => h.stage === "audio" || h.stage === "import");
      if (audioHold) { log(`${r.trackId}: held (${audioHold.code}); skipped`); held.push(r.trackId); continue; }
      const t = findTrack(lib(), r.trackId)!;
      const inputs = t.files.map((f) => f.sha256);
      const step = (stage: string, config: unknown, run: () => void) => {
        const { key, configHash } = idempotencyKey(stage, r.trackId, inputs, config);
        const a = admit(ledger, key, false);
        if (!a.go && a.why === "done") return false;
        startJob(ledger, { key, configHash, stage, provider: "local", trackId: r.trackId, inputHashes: inputs, now: nowOf(c) });
        saveLedger(ledgerPath(c, intake.albumId), ledger);
        try { run(); finishJob(ledger, key, nowOf(c), { status: "SUCCEEDED" }); return true; }
        catch (e) { finishJob(ledger, key, nowOf(c), { status: "FAILED", code: "LOCAL_ERROR", error: (e as Error).message }); log(`${r.trackId}: ${stage} failed: ${(e as Error).message}`); held.push(r.trackId!); return false; }
        finally { saveLedger(ledgerPath(c, intake.albumId), ledger); }
      };
      const quiet: Ctx = { ...c, log: (l) => log(`  ${l}`) };
      if (!existsSync(join(c.library, analysisRel(r.trackId)))) { if (step("analyze", { analyzer: 1 }, () => analyzeTrack(quiet, r.trackId!))) ok(c, r.trackId, "analysed"); }
      if (r.strategy === "KEEP_ORIGINAL" && !(t.masters ?? []).some((x) => x.kind === "suno" && x.status !== "rejected")) {
        if (step("master-suno", { suno: true }, () => buildMaster(quiet, { trackId: r.trackId!, suno: true }))) ok(c, r.trackId, "draft master from Suno's own vocals built; listen, then approve-master --suno");
      }
      done.push(r.trackId);
    }
    log(`audio stage: ${done.length} track(s) up to date, ${held.length} held. ${RUN} album-status ${intake.albumId}`);
    return { done, held };
  }

  // voices: the plan first; spending only with the reviewed plan's hash and a cap.
  const vm = loadVoiceMap(c);
  const entries: VoicePlan["entries"] = [];
  for (const r of rows.filter((x) => x.strategy === "CONVERT_APPROVED_SEGMENTS")) {
    const mt = m.tracks.find((t) => t.trackNumber === r.trackNumber)!;
    const t = r.trackId ? findTrack(lib(), r.trackId) ?? null : null;
    // An ambiguous job stays in the plan; the ledger keeps it from being sent again.
    const holds = r.holds.filter((h) => (h.stage === "voices" || h.stage === "import" || h.stage === "audio") && h.code !== "AMBIGUOUS_SUBMISSION");
    if (!t || holds.length) { log(`${r.trackId ?? r.title}: held${holds.length ? ` (${holds.map((h) => h.code).join(", ")})` : " (not in the library)"}; not in the plan`); held.push(r.trackId ?? r.title); continue; }
    const need = voicesNeeded(c, mt, t, vm.map);
    let credits = 0;
    const onPlan = (p: { credits: number }) => { credits += p.credits; };
    const silent: Ctx = { ...c, log: () => undefined };
    try {
      if (mt.mode === "cast") await convertCast(silent, { trackId: t.trackId, dry: true, onPlan, key: o.key, fetch: o.fetch });
      else {
        await convertVoices(silent, { trackId: t.trackId, voices: [need.lead!], from: "vocals", dry: true, onPlan, key: o.key, fetch: o.fetch });
        if (mt.mode === "crew") await convertVoices(silent, { trackId: t.trackId, voices: [...CREW_VOICES], from: "backing_vocals", dry: true, onPlan, key: o.key, fetch: o.fetch });
      }
    } catch (e) {
      log(`${t.trackId}: no estimate (${(e as Error).message}); not in the plan`);
      held.push(t.trackId);
      continue;
    }
    entries.push({ trackId: t.trackId, mode: mt.mode!, lead: need.lead ?? "", voices: need.voices, credits, inputs: t.files.map((f) => f.sha256).sort() });
  }
  const total = entries.reduce((s, e) => s + e.credits, 0);
  const body = { albumId: intake.albumId, entries: entries.map(({ trackId, mode, lead, voices, credits, inputs }) => ({ trackId, mode, lead, voices, credits, inputs })), totalCredits: total };
  const planHash = sha256Text(JSON.stringify(body)).slice(0, 16);
  const plan: VoicePlan = { schemaVersion: VOICE_PLAN_SCHEMA, ...body, units: "ElevenLabs credits", estimateSource: `the library's voice-changer rate (credits per minute, VOICE_CHANGER_CREDITS_PER_MIN); not a price, and not a quote from ${ELEVENLABS_API}`, planHash, madeAt: nowOf(c) };
  writeJsonAtomic(voicePlanPath(c, intake.albumId), plan);
  for (const e of entries) log(`${e.trackId}: ${e.mode}, ${e.voices.join(", ")}: about ${e.credits.toLocaleString("en-US")} credits`);
  log(`voice plan ${planHash}: about ${total.toLocaleString("en-US")} ElevenLabs credits for ${entries.filter((e) => e.credits > 0).length} track(s) (an estimate in credits, not a price)`);
  if (!o.approvedPlan) {
    if (total > 0) log(`nothing was sent. To run exactly this plan: ${RUN} album-process ${intake.albumId} --stage voices --approved-plan ${planHash} --max-credits ${total}`);
    return { done, held, plan };
  }
  if (o.approvedPlan !== planHash) throw new Error(`the plan changed since you reviewed it (you approved ${o.approvedPlan}, it is now ${planHash}); nothing was sent. Review the plan above and approve its new hash`);
  if (o.maxCredits === undefined) throw new Error(`--approved-plan needs --max-credits (the plan is about ${total} credits); nothing was sent`);
  if (total > o.maxCredits) throw new Error(`the plan (${total} credits) is over --max-credits ${o.maxCredits}; nothing was sent`);
  for (const e of entries.filter((x) => x.credits > 0)) {
    const { key, configHash } = idempotencyKey("voices", e.trackId, e.inputs, { mode: e.mode, lead: e.lead, voices: e.voices });
    const a = admit(ledger, key, true);
    if (!a.go) {
      if (a.why === "done") { log(`${e.trackId}: already converted under this plan; skipped (no credits)`); continue; }
      log(`${e.trackId}: HOLD ${a.why === "ambiguous" ? "AMBIGUOUS_SUBMISSION" : "ABANDONED"} (job ${a.job.jobId}): not sent again. Check the ElevenLabs history, then ${RUN} album-resolve ${intake.albumId} ${a.job.jobId} --retry|--abandon --note "..."`);
      held.push(e.trackId);
      continue;
    }
    startJob(ledger, { key, configHash, stage: "voices", provider: "elevenlabs", trackId: e.trackId, inputHashes: e.inputs, now: nowOf(c), costQuote: { units: "ElevenLabs credits", amount: e.credits, source: "estimate", at: nowOf(c) } });
    saveLedger(ledgerPath(c, intake.albumId), ledger);
    try {
      await voicesCommand({ ...c, log: (l) => log(`  ${l}`) }, { trackId: e.trackId, preset: e.mode, lead: e.lead || undefined, go: true, maxCredits: e.credits, key: o.key, fetch: o.fetch });
      finishJob(ledger, key, nowOf(c), { status: "SUCCEEDED" }, null);
      done.push(e.trackId);
    } catch (err) {
      const k = classifyFailure(err);
      finishJob(ledger, key, nowOf(c), { status: k.status, code: k.code, error: (err as Error).message });
      log(`${e.trackId}: ${k.status === "AMBIGUOUS" ? `HOLD AMBIGUOUS_SUBMISSION (${k.code}): ElevenLabs may have done this work without answering; it will not be sent again until you check and resolve job ${key.slice(0, 12)}` : `failed (${k.code}), nothing charged; fix it and run again`}`);
      held.push(e.trackId);
    }
    saveLedger(ledgerPath(c, intake.albumId), ledger);
  }
  log(`voices: ${done.length} track(s) converted, ${held.length} held. Listening and approving stay yours: ${RUN} album-status ${intake.albumId}`);
  return { done, held, plan };
}

export function albumResolve(c: Ctx, albumId: string, jobId: string, action: "retry" | "abandon", note: string): void {
  const p = ledgerPath(c, slugify(albumId));
  const l = loadLedger(p);
  const j = resolveJob(l, jobId, action, note, nowOf(c));
  saveLedger(p, l);
  logOf(c)(`job ${j.jobId} (${j.stage}, ${j.trackId}): ${action === "retry" ? "may be sent once more" : "abandoned; it will not be sent again"}. Note recorded.`);
}

// ---------------------------------------------------------------- video

export function albumPlanVideos(c: Ctx, albumId: string, o: { key?: string; aspect?: string } = {}): { planned: string[]; held: string[] } {
  const log = logOf(c);
  const { intake, rows } = albumFacts(c, albumId);
  const planned: string[] = [];
  const held: string[] = [];
  for (const r of rows) {
    if (!r.trackId || !existsSync(join(c.library, analysisRel(r.trackId)))) continue;
    const audioHold = r.holds.find((h) => h.stage === "import" || h.stage === "audio");
    if (audioHold) { log(`${r.trackId}: held (${audioHold.code}); no cue map until the audio is fixed`); held.push(r.trackId); continue; }
    try {
      const quiet: Ctx = { ...c, log: (l) => log(`  ${l}`) };
      planTrack(quiet, r.trackId, { ...(o.key ? { key: o.key } : {}), ...(o.aspect ? { aspect: o.aspect as never } : {}) });
      klingPack(quiet, r.trackId, {});
      planned.push(r.trackId);
      ok(c, r.trackId, `cue map, shot list and Kling pack ready (${homeRel(join(klingDir(c, r.trackId), "index.html"))})`);
    } catch (e) {
      log(`${r.trackId}: ${(e as Error).message}`);
      held.push(r.trackId);
    }
  }
  log(`${planned.length} track(s) planned; ${held.length} held. Generate each pack's shots in Kling, save them in one folder per track id, then ${RUN} album-clips ${intake.albumId} <folder>`);
  return { planned, held };
}

/** VIDEO_QA for one returned clip against the shot it was made for. Pure. */
export function clipQa(b: ShotBrief | null, v: ReturnType<typeof probeVideo>, aspect: string, file: string): DeskIssue[] {
  const out: DeskIssue[] = [];
  const add = (code: string, severity: DeskIssue["severity"], message: string, fix?: string) => out.push({ code, severity, stage: "video", message: `${file}: ${message}`, ...(fix ? { fix } : {}) });
  if (!b) { add("UNMATCHED_CLIP", "info", "matches no shot id; left alone", "name it after its shot id (from the Kling pack) and run album-clips again"); return out; }
  if (!v) { add("CLIP_UNREADABLE", "block", "can't be read as video", "download it from Kling again"); return out; }
  const short = v.durationSec + 0.25 < b.generateSec;
  if (short) add("CLIP_TOO_SHORT", b.kind === "lip_sync" ? "block" : "warn", `${v.durationSec} s, but the shot asks for ${b.generateSec} s${b.kind === "lip_sync" ? ": the sung line would not be covered" : ""}`, "generate it again at the length on its card, bring it in, and retire this one (npm run dance8 -- retire-clip)");
  const shape = aspectOf(v.width, v.height);
  const wanted = b.cropTo ?? aspect;
  if (shape !== aspect && shape !== b.cropTo) add("ASPECT_MISMATCH", "block", `${v.width}x${v.height} (${shape ?? "no standard shape"}), the video is ${wanted}`, "regenerate it in the video's shape and retire this one (npm run dance8 -- retire-clip); it is never stretched, and cropping is a choice you make on the card");
  if (v.variableRate) add("VARIABLE_FRAME_RATE", "warn", `its frame rate varies (${v.fpsText})`, "re-export at a constant rate");
  else if (standardFps(v.fps) === null) add("FPS_NONSTANDARD", "warn", `${v.fps.toFixed(3)} fps is not a standard rate`, "regenerate at 24 fps (D8-03)");
  if (v.hasAudio) add("CLIP_HAS_AUDIO", "info", "has its own sound; it is never used (the song's master plays once)");
  return out;
}

export function albumClips(c: Ctx, albumId: string, folder: string): { added: Record<string, number>; issues: number } {
  const log = logOf(c);
  const intake = intakeOrThrow(c, albumId);
  const root = resolve(folder);
  if (!existsSync(root)) throw new Error(`${folder} does not exist`);
  const added: Record<string, number> = {};
  let issues = 0;
  for (const it of intake.tracks) {
    const id = it.trackId;
    if (!id) continue;
    const sub = join(root, id);
    if (!existsSync(sub)) continue;
    const p = songPaths(c, id);
    if (!existsSync(p.cuemap)) { log(`${id}: no cue map yet; run album-plan-videos first`); continue; }
    const map = readJson<CueMap>(p.cuemap);
    const briefs = existsSync(p.briefs) ? readJson<ShotBrief[]>(p.briefs) : [];
    const qa: NonNullable<IntakeTrack["videoQa"]> = [];
    for (const n of readdirSync(sub).filter((x) => /\.(mp4|mov|m4v|webm)$/i.test(x)).sort()) {
      const b = briefForFile(n, briefs);
      const q = clipQa(b, b ? probeVideo(join(sub, n)) : null, map.aspect, n);
      qa.push({ file: n, clipId: b ? basename(n).replace(/\.[^.]+$/, "").trim().replace(/[^A-Za-z0-9_-]+/g, "-") : null, issues: q, checkedAt: nowOf(c) });
      issues += q.filter((x) => x.severity !== "info").length;
      for (const x of q) log(`${id}: ${x.severity === "block" ? "HOLD" : "note"} ${x.code}: ${x.message}`);
    }
    const got = ingestClips({ ...c, log: (l) => log(`  ${l}`) }, id, sub);
    added[id] = got.length;
    it.videoQa = [...(it.videoQa ?? []).filter((x) => !qa.some((y) => y.file === x.file)), ...qa];
  }
  writeJsonAtomic(intakePath(c, intake.albumId), { ...intake, updatedAt: nowOf(c) });
  log(`${Object.values(added).reduce((a, b) => a + b, 0)} clip(s) added across ${Object.keys(added).length} track(s); ${issues} finding(s). Approving each clip stays yours (npm run dance8 -- approve-clip).`);
  return { added, issues };
}

export interface PreviewResult { trackId: string; out: string; checks: { ok: boolean; findings: string[] } }

/**
 * Checks a rendered draft against its own manifest: exactly one audio stream,
 * and it is the master the manifest names (the approved mix, once); the
 * video's shape; and its length against the cut's planned total.
 */
export function checkRender(out: string, expect: { aspect: string; masterSha256: string }): { ok: boolean; findings: string[] } {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", out], { encoding: "utf8" });
  if (r.status !== 0) return { ok: false, findings: ["the render can't be read"] };
  const j = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; r_frame_rate?: string }[]; format: { duration: string } };
  const findings: string[] = [];
  const audio = j.streams.filter((s) => s.codec_type === "audio").length;
  if (audio !== 1) findings.push(`${audio} audio streams; a render plays the master exactly once`);
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) findings.push("no video stream");
  else if (aspectOf(v.width, v.height) !== expect.aspect) findings.push(`${v.width}x${v.height} is not ${expect.aspect}`);
  const manPath = `${out}.manifest.json`;
  if (!existsSync(manPath)) findings.push("no render manifest");
  else {
    const man = readJson<{ audio?: { sha256?: string }; totalSec?: number }>(manPath);
    if (man.audio?.sha256 !== expect.masterSha256) findings.push("the render's audio is not the master it was asked for");
    const d = Number(j.format.duration);
    if (typeof man.totalSec === "number" && Math.abs(d - man.totalSec) > 0.1) findings.push(`${d.toFixed(2)} s against the cut's ${man.totalSec.toFixed(2)} s`);
  }
  return { ok: findings.length === 0, findings };
}

export function albumPreview(c: Ctx, albumId: string, o: { short?: string; only?: string[]; cutScript?: string } = {}): PreviewResult[] {
  const log = logOf(c);
  const { intake, rows } = albumFacts(c, albumId);
  const out: PreviewResult[] = [];
  const cut = o.cutScript ?? join(__dirname, "..", "..", "..", "scripts", "dance8", "cut.ts");
  for (const r of rows) {
    if (!r.trackId || (o.only && !o.only.includes(r.trackId))) continue;
    if (!["CLIPS_IMPORT_PENDING", "CLIPS_QA", "RENDER_ELIGIBLE", "DRAFT_RENDERED", "SHOTS_PREPARED", "CUES_VALIDATED", "AUDIO_APPROVED", "AUDIO_QA"].includes(r.state)) continue;
    const p = songPaths(c, r.trackId);
    if (!existsSync(p.cuemap)) continue;
    let args;
    try { args = renderArgs({ ...c, log: (l) => log(`  ${l}`) }, r.trackId, { short: o.short }); }
    catch (e) { log(`${r.trackId}: ${(e as Error).message}`); continue; }
    mkdirSync(dirname(args.out), { recursive: true });
    const run = spawnSync("npx", ["--yes", "tsx", cut, ...args.args], { encoding: "utf8" });
    if (run.status !== 0) { log(`${r.trackId}: render failed: ${(run.stderr || run.stdout).trim().split("\n").slice(-2).join(" ")}`); continue; }
    const checks = checkRender(args.out, { aspect: readJson<CueMap>(p.cuemap).aspect, masterSha256: args.audio.sha256 });
    log(`${r.trackId}: draft ${homeRel(args.out)} (audio: ${args.audio.key} master, ${args.audio.status})${checks.ok ? "; checks pass" : `; ${checks.findings.join("; ")}`}`);
    out.push({ trackId: r.trackId, out: args.out, checks });
  }
  if (!out.length) log(`no track is ready for a draft yet: ${RUN} album-status ${intake.albumId}`);
  return out;
}

/** album-resume: the free steps that are due, in order; never a paid one. */
export async function albumResume(c: Ctx, albumId: string): Promise<void> {
  const log = logOf(c);
  log("resume: the free steps only (analysis, Suno-vocals masters, cue maps and Kling packs); paid voices wait for --stage voices");
  await albumProcess(c, albumId, { stage: "audio" });
  albumPlanVideos(c, albumId);
  albumStatus(c, albumId);
}

export { ALBUM_MANIFEST_SCHEMA };
