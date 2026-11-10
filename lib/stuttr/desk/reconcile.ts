// lib/stuttr/desk/reconcile.ts
//
// From the files in a drop (a Suno ZIP or a folder) to one row per track:
// which files belong to which song, which manifest track each song is, and
// what stops it. Pure: the caller lists, hashes and probes the files.
//
// Rules:
//   - Nothing is matched by a guess. A manifest track matches a song only by
//     its pinned `source`, its Suno song id in a file name, or the same title
//     once both are slugs. A near title is a suggestion the owner confirms by
//     pinning `source`; until then the track waits and the song is unlisted.
//   - A WAV beats an MP3 of the same part (STU-01); if their lengths differ
//     they are different edits, and the owner chooses.
//   - Issues carry the stage they stop. A song held for its voices still
//     imports and still gets its cue map; only the stage named waits.

import { audioFormatOf, classifyFolder, extOf, isLossy, slugify, stemDownloadParts, studioParts } from "../library";
import { strategyOf, trackIdOf, type AlbumManifest, type ManifestTrack, type Severity } from "./manifest";

export const DESK_STAGES = ["import", "audio", "voices", "video", "final"] as const;
export type DeskStage = (typeof DESK_STAGES)[number];

export interface DeskIssue {
  code: string;
  severity: Severity;
  /** The stage it stops (severity block) or concerns. */
  stage: DeskStage;
  message: string;
  fix?: string;
}

export interface MediaProbe {
  codec: string | null;
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  durationSec: number | null;
  /** Loudest sample, dBFS (ffmpeg volumedetect). */
  peakDb: number | null;
  /** ffprobe could not read it. */
  error?: string;
}

export interface SourceFile {
  /** Path inside the drop, NFC, forward slashes. */
  path: string;
  sha256: string;
  bytes: number;
  probe?: MediaProbe | null;
}

export interface SongCandidate {
  key: string;
  title: string;
  /** What the owner pins in the manifest's `source`: the song's folder, or its main file. */
  source: string;
  files: SourceFile[];
}

/** Files a drop may hold that are never music: macOS and Windows litter. */
export const isJunk = (path: string) => path.split("/").some((p) => p === "__MACOSX" || p === ".DS_Store" || p.startsWith("._") || p === "Thumbs.db" || p === "desktop.ini");

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const stem = (name: string) => (extOf(name) ? name.slice(0, name.length - extOf(name).length - 1) : name);
const LYRIC_TAIL = /[\s_-]*(lyrics?|style|prompt)$/i;
const STEM_DOWNLOAD = /^([A-Za-z ]+)_(.+)$/;

/** Groups a drop's files into songs: one per folder, or loose files by title. */
export function groupSources(files: SourceFile[]): SongCandidate[] {
  const real = files.filter((f) => !isJunk(f.path));
  // One folder around everything is the album folder, unless it is itself one song's folder.
  const tops = new Set(real.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  let rel = real.map((f) => ({ f, p: f.path }));
  if (tops.size === 1 && !tops.has("")) {
    const root = [...tops][0];
    const inner = rel.map((x) => ({ ...x, p: x.p.slice(root.length + 1) }));
    const looseNames = inner.filter((x) => !x.p.includes("/")).map((x) => x.p).filter((n) => audioFormatOf(n));
    const oneSong = !inner.some((x) => x.p.includes("/")) && (studioParts(looseNames).size >= 2 || stemDownloadParts(looseNames) !== null);
    if (!oneSong) rel = inner;
  }
  const songs = new Map<string, SongCandidate>();
  const add = (key: string, title: string, source: string, f: SourceFile) => {
    const k = key || "untitled";
    const s = songs.get(k) ?? { key: k, title, source, files: [] };
    s.files.push(f);
    songs.set(k, s);
  };
  const prefix = rel.length && rel[0].p !== rel[0].f.path ? rel[0].f.path.slice(0, rel[0].f.path.length - rel[0].p.length) : "";
  for (const { f, p } of rel) {
    if (p.includes("/")) {
      const folder = p.split("/")[0];
      add(slugify(folder), folder, prefix + folder, f);
      continue;
    }
    const name = base(p);
    if (!audioFormatOf(name)) {
      const t = stem(name).replace(LYRIC_TAIL, "");
      add(slugify(t), t, prefix + name, f);
      continue;
    }
    const m = STEM_DOWNLOAD.exec(stem(name));
    const title = m && slugify(m[1]) && !/\s/.test(m[1].trim()) ? m[2] : stem(name);
    add(slugify(title), title, prefix + (m ? title : name), f);
  }
  // A song's title and source come from its main audio file when it is loose.
  for (const s of songs.values()) {
    const main = s.files.find((f) => audioFormatOf(base(f.path)) && slugify(stem(base(f.path))) === s.key);
    if (main && !s.source.endsWith("/") && !s.files.some((f) => f.path.slice(prefix.length).includes("/"))) { s.title = stem(base(main.path)); s.source = main.path; }
  }
  return [...songs.values()].sort((a, b) => a.source.localeCompare(b.source));
}

/** 0..1: how alike two titles are once both are slugs (edit distance and shared words). */
export function titleSimilarity(a: string, b: string): number {
  const x = slugify(a), y = slugify(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  const edit = 1 - d[y.length] / Math.max(x.length, y.length);
  const wx = new Set(x.split("-")), wy = new Set(y.split("-"));
  const shared = [...wx].filter((w) => wy.has(w)).length;
  const jaccard = shared / new Set([...wx, ...wy]).size;
  return Math.round(Math.max(edit, jaccard) * 1000) / 1000;
}

export const SUGGEST_AT = 0.6;

export interface ChosenFiles {
  /** What goes into the library for this song. */
  keep: SourceFile[];
  /** Left out, with why. */
  dropped: { file: SourceFile; why: string }[];
}

/** Picks one file per part: lossless over lossy; the rest are dropped with a reason. */
export function chooseFiles(s: SongCandidate): ChosenFiles {
  const byPart = new Map<string, SourceFile[]>();
  for (const f of s.files) {
    const n = base(f.path);
    const k = audioFormatOf(n) ? `a:${slugify(stem(n))}` : `t:${n}`;
    byPart.set(k, [...(byPart.get(k) ?? []), f]);
  }
  const keep: SourceFile[] = [];
  const dropped: ChosenFiles["dropped"] = [];
  for (const group of byPart.values()) {
    if (group.length === 1) { keep.push(group[0]); continue; }
    const rank = (f: SourceFile) => { const fmt = audioFormatOf(base(f.path)); return fmt && !isLossy(fmt) ? 0 : 1; };
    const sorted = [...group].sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    keep.push(sorted[0]);
    for (const f of sorted.slice(1)) dropped.push({ file: f, why: rank(f) > rank(sorted[0]) ? `a lossy copy of ${base(sorted[0].path)}; the lossless file is kept (STU-01)` : `a second file for the same part as ${base(sorted[0].path)}` });
  }
  return { keep: keep.sort((a, b) => a.path.localeCompare(b.path)), dropped };
}

export interface AlignmentResult {
  part: string;
  /** The part's start relative to the full mix, ms (positive: the part is late). Null when it can't be told. */
  offsetMs: number | null;
  /** Peak normalised correlation, 0..1. */
  confidence: number;
  verdict: "aligned" | "offset" | "unknown";
}

/** Issues for one song from its files, probes, alignment and its manifest track. */
export function songIssues(s: SongCandidate, chosen: ChosenFiles, t: ManifestTrack | null, alignment: AlignmentResult[]): DeskIssue[] {
  const out: DeskIssue[] = [];
  const push = (code: string, severity: Severity, stage: DeskStage, message: string, fix?: string) => out.push({ code, severity, stage, message, ...(fix ? { fix } : {}) });
  const audio = chosen.keep.filter((f) => audioFormatOf(base(f.path)));
  if (audio.length === 0) push("NO_AUDIO", "block", "import", "no audio file", "export the song from Suno again");
  for (const f of audio) {
    const p = f.probe;
    if (p === undefined || p === null) { push("NOT_PROBED", "warn", "audio", `${base(f.path)} was not measured (ffprobe missing)`, "install ffmpeg, then run the import again"); continue; }
    if (p.error) { push("CORRUPT_MEDIA", "block", "import", `${base(f.path)} can't be read as audio (${p.error})`, "download it from Suno again"); continue; }
    const ext = extOf(f.path);
    if (ext === "wav" && p.codec && !p.codec.startsWith("pcm_")) push("EXTENSION_MISMATCH", "warn", "audio", `${base(f.path)} is named .wav but holds ${p.codec}`, "keep it, but don't treat it as lossless");
    if (ext === "mp3" && p.codec && p.codec !== "mp3") push("EXTENSION_MISMATCH", "warn", "audio", `${base(f.path)} is named .mp3 but holds ${p.codec}`);
    if (p.peakDb !== null && p.peakDb >= -0.1) push("CLIPPING_RISK", "warn", "audio", `${base(f.path)} peaks at ${p.peakDb.toFixed(1)} dBFS`, "listen for clipping; keep headroom in the master");
  }
  for (const d of chosen.dropped) {
    const kept = chosen.keep.find((k) => slugify(stem(base(k.path))) === slugify(stem(base(d.file.path))));
    const a = kept?.probe?.durationSec, b = d.file.probe?.durationSec;
    if (a != null && b != null && Math.abs(a - b) > 1) {
      push("DIFFERENT_EDITS", "block", "import", `${base(d.file.path)} is ${b.toFixed(1)} s but ${base(kept!.path)} is ${a.toFixed(1)} s: two different edits, not two copies`, `pin the take you want by moving the other one out of the drop`);
    } else push("LOSSY_DUPLICATE", "info", "import", `${base(d.file.path)}: ${d.why}`);
  }
  if (audio.length && audio.every((f) => { const fmt = audioFormatOf(base(f.path)); return fmt !== null && isLossy(fmt); })) {
    push("LOSSY_SOURCE", "warn", "audio", "only lossy audio (MP3/M4A); converting it to WAV won't recover detail (STU-01)", "download WAV from Suno if your plan offers it");
  }
  // Roles as the library will read them (the same rules as `stuttr add`).
  const names = chosen.keep.map((f) => base(f.path));
  const { roles, warnings } = classifyFolder(names);
  const roleOf = (f: SourceFile) => roles.get(base(f.path))?.role;
  const full = audio.find((f) => roleOf(f) === "full_mix");
  const vocalStem = audio.some((f) => roleOf(f) === "vocals");
  const hasStems = audio.some((f) => roleOf(f) !== "full_mix" && roleOf(f) !== "unclassified");
  if (!full) push("MISSING_FULL_MIX", "block", "audio", "no full mix: the song can't be measured or mastered from Suno's vocals", "export the Full Song from Suno (or name the full mix with \"full\")");
  for (const w of warnings.filter((x) => /more than one/.test(x))) push("AMBIGUOUS_PARTS", "warn", "audio", w);
  for (const a of alignment) {
    if (a.verdict === "offset") push("STEM_OFFSET", "block", "audio", `${a.part} starts ${Math.abs(a.offsetMs!)} ms ${a.offsetMs! > 0 ? "after" : "before"} the full mix`, "export the stems again from the same take, or fix the offset in an editor and drop the file again");
    if (a.verdict === "unknown") push("ALIGNMENT_UNKNOWN", "warn", "audio", `${a.part}: its offset against the full mix could not be measured (confidence ${a.confidence.toFixed(2)}); it is not assumed to be zero`, "listen to it against the full mix");
  }
  const fullSec = full?.probe?.durationSec;
  if (fullSec != null) {
    for (const f of audio) {
      const d = f.probe?.durationSec;
      if (f !== full && d != null && Math.abs(d - fullSec) > 1) push("STEM_LENGTH", "block", "audio", `${base(f.path)} is ${d.toFixed(1)} s but the full mix is ${fullSec.toFixed(1)} s`, "a preview or another take: export Multitrack from Suno Studio again");
    }
  }
  if (!t) return out;
  const strategy = strategyOf(t);
  const performers = t.performers ?? [];
  if (strategy === "MANUAL_SPLIT_REQUIRED") push("MANUAL_SPLIT_REQUIRED", "block", "voices", "the manifest says this song's voices must be split by hand", "split the parts in an editor, or set voiceStrategy to KEEP_ORIGINAL");
  if (strategy === "CONVERT_APPROVED_SEGMENTS") {
    if (!vocalStem) push("MISSING_STEMS", "block", "voices", "no lead vocal stem, so there is nothing to convert", "export Multitrack stems from Suno Studio, or keep the original vocals");
    if (performers.length > 1 && t.mode !== "cast") push("OVERLAP_REQUIRES_SPLIT", "block", "voices", `${performers.length} performers share one lead stem; one voice can't be split into ${performers.join(", ")}`, "use mode cast with a cast.json (one voice per section), a multitrack export, or KEEP_ORIGINAL");
    if (performers.length === 0) push("NO_PERFORMER", "block", "voices", "no performer named for the converted voice", "name the performer role in the manifest");
  }
  if (!hasStems) push("NO_STEMS", "info", "audio", "full mix only: Dance8 can plan from it, but voice conversion and per-part analysis need stems");
  return out;
}

export type RowStatus = "READY" | "NEEDS_REVIEW" | "FOUND" | "WAITING";

export interface ReconcileRow {
  trackNumber: number | null;
  trackId: string | null;
  title: string;
  /** How the song was tied to its manifest track. */
  match: "source" | "suno-id" | "title" | "none";
  candidate: SongCandidate | null;
  chosen: ChosenFiles | null;
  /** A near title the owner can confirm by pinning `source`. */
  suggestion: { source: string; title: string; score: number } | null;
  status: RowStatus;
  issues: DeskIssue[];
}

/**
 * One row per manifest track (in track order), then one per song the manifest
 * doesn't list. Without a manifest every song is FOUND.
 */
export function reconcile(manifest: AlbumManifest | null, songs: SongCandidate[], alignmentOf: (s: SongCandidate) => AlignmentResult[] = () => []): ReconcileRow[] {
  const rows: ReconcileRow[] = [];
  const used = new Set<string>();
  const tracks = [...(manifest?.tracks ?? [])].sort((a, b) => a.trackNumber - b.trackNumber);
  const pinned = (t: ManifestTrack) => t.source === undefined ? undefined : songs.find((s) => s.source === t.source || s.source.replace(/\/$/, "") === t.source!.replace(/\/$/, ""));
  for (const t of tracks) {
    let cand: SongCandidate | undefined;
    let match: ReconcileRow["match"] = "none";
    const p = pinned(t);
    if (p) { cand = p; match = "source"; }
    else if (t.source === undefined && t.sunoSongId) { cand = songs.find((s) => !used.has(s.key) && s.files.some((f) => f.path.includes(t.sunoSongId!))); if (cand) match = "suno-id"; }
    if (!cand && t.source === undefined) { cand = songs.find((s) => !used.has(s.key) && s.key === slugify(t.title)); if (cand) match = "title"; }
    if (cand && used.has(cand.key)) {
      rows.push({ trackNumber: t.trackNumber, trackId: trackIdOf(t), title: t.title, match, candidate: null, chosen: null, suggestion: null, status: "NEEDS_REVIEW",
        issues: [{ code: "SOURCE_TAKEN", severity: "block", stage: "import", message: `${cand.source} is already matched to another track`, fix: "pin a different source" }] });
      continue;
    }
    if (!cand) {
      const best = songs.filter((s) => !used.has(s.key)).map((s) => ({ s, score: titleSimilarity(s.title, t.title) })).sort((a, b) => b.score - a.score || a.s.source.localeCompare(b.s.source))[0];
      const suggestion = best && best.score >= SUGGEST_AT ? { source: best.s.source, title: best.s.title, score: best.score } : null;
      const issues: DeskIssue[] = [suggestion
        ? { code: "MATCH_REVIEW", severity: "block", stage: "import", message: `no exact match; "${suggestion.title}" is close (${suggestion.score})`, fix: `if it is this track, add "source": "${suggestion.source}" to track ${t.trackNumber} in the manifest` }
        : { code: "MISSING_SOURCE", severity: "block", stage: "import", message: t.source ? `nothing at ${t.source} in this drop` : "no song in this drop matches the title", fix: "export it from Suno and drop it in, or pin its source" }];
      rows.push({ trackNumber: t.trackNumber, trackId: trackIdOf(t), title: t.title, match: "none", candidate: null, chosen: null, suggestion, status: suggestion ? "NEEDS_REVIEW" : "WAITING", issues });
      continue;
    }
    used.add(cand.key);
    const chosen = chooseFiles(cand);
    const issues = songIssues(cand, chosen, t, alignmentOf(cand));
    if (manifest && manifest.rights.state !== "CLEARED") issues.push({ code: "RIGHTS_NOT_CLEARED", severity: "block", stage: "final", message: `album rights are ${manifest.rights.state}: local drafts only`, fix: "check the music licence, likeness rights and platform terms (STU-02), then set rights.state" });
    const blocked = issues.some((i) => i.severity === "block" && i.stage === "import");
    rows.push({ trackNumber: t.trackNumber, trackId: trackIdOf(t), title: t.title, match, candidate: cand, chosen, suggestion: null, status: blocked ? "NEEDS_REVIEW" : "READY", issues });
  }
  for (const s of songs) {
    if (used.has(s.key)) continue;
    const chosen = chooseFiles(s);
    const issues = songIssues(s, chosen, null, alignmentOf(s));
    if (manifest) issues.unshift({ code: "UNLISTED_SOURCE", severity: "block", stage: "import", message: "in the drop but not in the manifest", fix: `add it to the manifest (title "${s.title}", source "${s.source}") or leave it out of the drop` });
    rows.push({ trackNumber: null, trackId: null, title: s.title, match: "none", candidate: s, chosen, suggestion: null, status: manifest ? "NEEDS_REVIEW" : "FOUND", issues });
  }
  // Two takes of one title ("Song" and "Song (1)") are flagged, never merged.
  const takeKey = (title: string) => slugify(title.replace(/\s*[([]?\d{1,2}[)\]]?\s*$/, ""));
  const byTake = new Map<string, ReconcileRow[]>();
  for (const r of rows.filter((x) => x.candidate)) byTake.set(takeKey(r.candidate!.title), [...(byTake.get(takeKey(r.candidate!.title)) ?? []), r]);
  for (const group of byTake.values()) {
    if (group.length < 2) continue;
    for (const r of group) r.issues.push({ code: "VARIANT_TAKES", severity: "warn", stage: "import", message: `the drop has ${group.length} takes of this title (${group.map((g) => g.candidate!.source).join(", ")})`, fix: "check the manifest pins the take you want" });
  }
  return rows;
}

export function deskSummary(rows: ReconcileRow[]): Record<RowStatus, number> {
  const out: Record<RowStatus, number> = { READY: 0, NEEDS_REVIEW: 0, FOUND: 0, WAITING: 0 };
  for (const r of rows) out[r.status]++;
  return out;
}
