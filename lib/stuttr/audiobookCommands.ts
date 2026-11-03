// lib/stuttr/audiobookCommands.ts
//
// Stuttr Lab side of the Late8 audiobook (canon PL8-09): a book folder in the
// private library becomes a publish folder for Cloudflare R2, and can upload
// it with Wrangler.
//
//   npm run stuttr -- audiobook <book>                         build ~/StuttrLibrary/audiobook/<book>/publish/
//   npm run stuttr -- audiobook <book> --upload <bucket>       ...then put it in R2 (npx wrangler login first)
//
// The book folder (yours; never overwritten):
//   book.txt          series: / title: / author:
//   cover.jpg         optional
//   01-the-pause/     one folder per chapter, in name order
//     chapter.txt     title: / mission: / narrator: / characters: a, b / scene: / location: / status: approved / rights: cleared
//     audio.wav       the final mix (wav, mp3, m4a, flac or aiff)
//     transcript.txt  optional: "[mm:ss.xx] Speaker: line" (times from the narration, never a model)
//     cover.jpg       optional
// Only chapters with status: approved and rights: cleared are published
// (canon STU-02); the rest are listed with the reason. Audio and the
// manifest never go into git.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseFields } from "../dance8/authoring/klingPack";
import { AUDIOBOOK_SCHEMA, MANIFEST_FILE, parseTranscript, publishable, validateManifest, type AudiobookChapter, type AudiobookManifest } from "../late8/audiobook";
import type { Ctx } from "./commands";

const AUDIO_EXT = [".wav", ".mp3", ".m4a", ".flac", ".aiff", ".aif"];
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"];
const CONTENT_TYPE: Record<string, string> = { ".mp3": "audio/mpeg", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
/** Streaming copy: MP3 at 128 kbps stereo, 44.1 kHz, which every browser plays. */
export const STREAM_ARGS = ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2"];

const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));
const nowOf = (c: Ctx) => (c.now ? c.now() : new Date().toISOString());
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const firstWith = (dir: string, stem: string | null, exts: string[]) =>
  readdirSync(dir).filter((n) => exts.includes(extname(n).toLowerCase()) && (stem === null || n.slice(0, -extname(n).length).toLowerCase() === stem)).sort()[0] ?? null;
const listOf = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const idOf = (folder: string) => folder.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const audiobookDir = (c: Ctx, bookId: string) => join(c.library, "audiobook", bookId);

function bookStarter(bookId: string): string {
  return [
    `# Audiobook "${bookId}" for Late8. One folder per chapter here (01-..., 02-...), each with chapter.txt,`,
    "# the final mix (audio.wav, .mp3, .m4a, .flac or .aiff), and optionally transcript.txt and cover.jpg.",
    "# A cover.jpg next to this file is the book's cover.",
    "series: Stuttr Spies",
    "title:",
    "author:",
    "",
  ].join("\n");
}

export const CHAPTER_STARTER = [
  "# title: the chapter's name. mission, narrator, scene and location are optional; characters is a comma list.",
  "# Published only with status: approved and rights: cleared (music, voice and likeness rights checked, canon STU-02).",
  "title:",
  "mission:",
  "narrator:",
  "characters:",
  "scene:",
  "location:",
  "status: draft",
  "rights: unchecked",
  "",
].join("\n");

export interface HeldChapter { folder: string; reasons: string[] }

export interface AudiobookResult {
  publishDir: string;
  manifest: AudiobookManifest | null;
  held: HeldChapter[];
  files: string[];
}

/** Runs one command; the default runs it for real. Tests pass their own. */
export type Runner = (cmd: string, args: string[]) => { status: number | null; stdout: string; stderr: string };
const realRun: Runner = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

function durationOf(run: Runner, file: string): number | null {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const d = Number(r.stdout.trim());
  return r.status === 0 && Number.isFinite(d) && d > 0 ? Math.round(d * 1000) / 1000 : null;
}

export function buildAudiobook(c: Ctx, bookId: string, run: Runner = realRun): AudiobookResult {
  const log = logOf(c);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bookId)) throw new Error(`book id "${bookId}": lower-case letters, digits and dashes only`);
  const dir = audiobookDir(c, bookId);
  const publishDir = join(dir, "publish");
  if (!existsSync(join(dir, "book.txt"))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "book.txt"), bookStarter(bookId));
    log(`made ${dir}: fill in book.txt, add a folder per chapter (01-..., with chapter.txt and the final mix), then run this again`);
    return { publishDir, manifest: null, held: [], files: [] };
  }
  const book = parseFields(readFileSync(join(dir, "book.txt"), "utf8")).fields;
  if (!book.title) throw new Error(`fill in "title:" in ${join(dir, "book.txt")}`);
  if (run("ffmpeg", ["-version"]).status !== 0) throw new Error("ffmpeg is not installed (brew install ffmpeg)");
  mkdirSync(publishDir, { recursive: true });

  const files = new Set<string>();
  const held: HeldChapter[] = [];
  const chapters: AudiobookChapter[] = [];
  const folders = readdirSync(dir).filter((n) => n !== "publish" && !n.startsWith(".") && statSync(join(dir, n)).isDirectory()).sort();
  for (const folder of folders) {
    const cdir = join(dir, folder);
    if (!existsSync(join(cdir, "chapter.txt"))) {
      writeFileSync(join(cdir, "chapter.txt"), CHAPTER_STARTER);
      held.push({ folder, reasons: ["chapter.txt was just made: fill it in"] });
      continue;
    }
    const f = parseFields(readFileSync(join(cdir, "chapter.txt"), "utf8")).fields;
    const gate = publishable(f);
    const audioName = firstWith(cdir, null, AUDIO_EXT);
    if (!audioName) gate.reasons.push("no audio file (the final mix)");
    if (gate.reasons.length) { held.push({ folder, reasons: gate.reasons }); continue; }
    const src = join(cdir, audioName!);
    const hash = sha(src);
    const id = idOf(folder);
    const audio = `${id}-${hash.slice(0, 8)}.mp3`;
    const out = join(publishDir, audio);
    if (!existsSync(out)) {
      const r = run("ffmpeg", ["-v", "error", "-y", "-i", src, ...STREAM_ARGS, out]);
      if (r.status !== 0) { held.push({ folder, reasons: [`ffmpeg could not encode it: ${r.stderr.trim().split("\n").pop()}`] }); continue; }
    }
    const durationSec = durationOf(run, out);
    if (durationSec === null) { held.push({ folder, reasons: ["could not read the encoded audio's length"] }); continue; }
    files.add(audio);
    let transcript: AudiobookChapter["transcript"] = [];
    if (existsSync(join(cdir, "transcript.txt"))) {
      const t = parseTranscript(readFileSync(join(cdir, "transcript.txt"), "utf8"));
      transcript = t.lines.map((l) => (l.t !== null && l.t > durationSec ? { ...l, t: null } : l));
      for (const i of t.issues) log(`  ${folder}/transcript.txt ${i}`);
    }
    const coverName = firstWith(cdir, "cover", IMAGE_EXT);
    let cover: string | null = null;
    if (coverName) {
      cover = `${id}-cover-${sha(join(cdir, coverName)).slice(0, 8)}${extname(coverName).toLowerCase()}`;
      copyFileSync(join(cdir, coverName), join(publishDir, cover));
      files.add(cover);
    }
    chapters.push({
      id, number: chapters.length + 1, title: f.title, mission: f.mission ?? null, narrator: f.narrator ?? null, characters: listOf(f.characters),
      scene: f.scene ?? null, location: f.location ?? null, audio, durationSec, sha256: hash, cover, transcript,
    });
  }

  const bookCoverName = firstWith(dir, "cover", IMAGE_EXT);
  let cover: string | null = null;
  if (bookCoverName) {
    cover = `cover-${sha(join(dir, bookCoverName)).slice(0, 8)}${extname(bookCoverName).toLowerCase()}`;
    copyFileSync(join(dir, bookCoverName), join(publishDir, cover));
    files.add(cover);
  }
  // Files from earlier builds that this manifest no longer uses.
  for (const n of readdirSync(publishDir)) if (n !== MANIFEST_FILE && !files.has(n)) rmSync(join(publishDir, n));

  for (const h of held) log(`held: ${h.folder}: ${h.reasons.join("; ")}`);
  if (!chapters.length) {
    rmSync(join(publishDir, MANIFEST_FILE), { force: true });
    log("nothing to publish yet: no chapter is approved with cleared rights");
    return { publishDir, manifest: null, held, files: [] };
  }
  const manifest: AudiobookManifest = {
    schema: AUDIOBOOK_SCHEMA, bookId, series: book.series ?? book.title, title: book.title, author: book.author ?? null, cover, publishedAt: nowOf(c), chapters,
  };
  const check = validateManifest(JSON.parse(JSON.stringify(manifest)));
  if (!check.manifest) throw new Error(`the manifest failed its own check: ${check.issues.join("; ")}`);
  writeFileSync(join(publishDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
  log(`publish folder: ${publishDir} (${chapters.length} chapter(s), ${files.size + 1} file(s))`);
  return { publishDir, manifest, held, files: [...files].sort() };
}

/**
 * Puts the publish folder in R2 with Wrangler: the audio and images first,
 * the manifest last, so the page never points at a file that isn't there yet.
 */
export function uploadAudiobook(c: Ctx, bookId: string, bucket: string, r: AudiobookResult, run: Runner = realRun): string[] {
  const log = logOf(c);
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error(`"${bucket}" is not an R2 bucket name`);
  if (!r.manifest) throw new Error("nothing to upload");
  const keys: string[] = [];
  for (const name of [...r.files, MANIFEST_FILE]) {
    const key = `${bucket}/${bookId}/${name}`;
    const res = run("npx", ["--yes", "wrangler", "r2", "object", "put", key, "--file", join(r.publishDir, name), "--content-type", CONTENT_TYPE[extname(name).toLowerCase()] ?? "application/octet-stream", "--remote"]);
    if (res.status !== 0) throw new Error(`upload stopped at ${name}: ${res.stderr.trim().split("\n").slice(-2).join(" ") || "wrangler failed"} (signed in? run: npx wrangler login)`);
    keys.push(key);
    log(`uploaded ${key}`);
  }
  // The bucket's public r2.dev address, if it has one, gives the exact URL Late8 needs.
  const dev = run("npx", ["--yes", "wrangler", "r2", "bucket", "dev-url", "get", bucket]);
  const base = /https:\/\/[a-z0-9.-]+\.r2\.dev/i.exec(`${dev.stdout}\n${dev.stderr}`)?.[0];
  if (base) log(`Late8 reads ${base}/${bookId}/${MANIFEST_FILE}: set that as LATE8_AUDIOBOOK_URL in Netlify (once)`);
  else log(`the bucket has no public address yet: run npx wrangler r2 bucket dev-url enable ${bucket} (or connect a custom domain), then set LATE8_AUDIOBOOK_URL in Netlify to its URL + /${bookId}/${MANIFEST_FILE}`);
  return keys;
}

export function audiobookCommand(c: Ctx, bookId: string, o: { upload?: string } = {}): AudiobookResult {
  const r = buildAudiobook(c, bookId);
  if (o.upload) uploadAudiobook(c, bookId, o.upload, r);
  else if (r.manifest) logOf(c)("to put it in R2, run the same command with --upload and your bucket's name");
  return r;
}
