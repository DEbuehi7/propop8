// lib/stuttr/commands.ts
//
// File-system side of the Stuttr song library. Rules:
//  - Originals are copied, never moved or changed.
//  - A file already in the library with the same SHA-256 is skipped; a
//    different file at the same path is refused, never overwritten.
//  - library.json is written whole to a temp file, then renamed into place.
//  - Nothing here uploads, and no secret is read.
// ffmpeg (prep-voice, mix) is optional; without it those two commands say so.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import {
  audioFormatOf, classifyFolder, emptyManifest, extOf, findTrack, isLossy, LIBRARY_SCHEMA, MANIFEST_NAME, parseWav,
  slugify, timingCheck, VOICE_CHANGER_MAX_SEC, voiceKey,
  type AudioInfo, type LibraryFile, type LibraryManifest, type LibraryTrack, type VoiceTake,
} from "./library";

export interface Ctx {
  library: string;
  now?: () => string;
  log?: (line: string) => void;
}

const nowOf = (c: Ctx) => (c.now ? c.now() : new Date().toISOString());
const logOf = (c: Ctx) => c.log ?? ((l: string) => console.log(l));

export function sha256File(path: string): { sha256: string; bytes: number; buf: Buffer } {
  const buf = readFileSync(path);
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length, buf };
}

export function audioInfo(path: string, buf?: Buffer): AudioInfo | undefined {
  const format = audioFormatOf(path);
  if (!format) return undefined;
  if (format === "wav") {
    const b = buf ?? readFileSync(path);
    return parseWav(b, b.length) ?? { format, lossy: false, sampleRate: null, channels: null, bitsPerSample: null, durationSec: null };
  }
  return { format, lossy: isLossy(format), ...probe(path) };
}

/** Sample rate, channels and length from ffprobe, when it is installed. */
function probe(path: string): Pick<AudioInfo, "sampleRate" | "channels" | "bitsPerSample" | "durationSec"> {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "json", path], { encoding: "utf8" });
  if (r.status !== 0) return { sampleRate: null, channels: null, bitsPerSample: null, durationSec: null };
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] ?? {};
    const d = Number(j.format?.duration);
    return {
      sampleRate: s.sample_rate ? Number(s.sample_rate) : null,
      channels: s.channels ?? null,
      bitsPerSample: null,
      durationSec: Number.isFinite(d) ? Math.round(d * 1e6) / 1e6 : null,
    };
  } catch {
    return { sampleRate: null, channels: null, bitsPerSample: null, durationSec: null };
  }
}

export function loadManifest(c: Ctx): LibraryManifest {
  const p = join(c.library, MANIFEST_NAME);
  if (!existsSync(p)) return emptyManifest();
  const m = JSON.parse(readFileSync(p, "utf8")) as LibraryManifest;
  if (m.schemaVersion !== LIBRARY_SCHEMA) throw new Error(`${p}: schemaVersion ${m.schemaVersion} is not ${LIBRARY_SCHEMA}`);
  return m;
}

export function saveManifest(c: Ctx, m: LibraryManifest): void {
  mkdirSync(c.library, { recursive: true });
  const p = join(c.library, MANIFEST_NAME);
  const tmp = `${p}.tmp`;
  m.tracks.sort((a, b) => a.trackId.localeCompare(b.trackId));
  writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n");
  renameSync(tmp, p);
}

/** Copies src to the library path; same content = skip, different content = refuse. */
function placeFile(c: Ctx, src: string, rel: string, sha: string): "copied" | "already there" {
  const dest = join(c.library, rel);
  if (existsSync(dest)) {
    if (sha256File(dest).sha256 === sha) return "already there";
    throw new Error(`${rel} already exists in the library with different content; nothing was changed. Rename the new file or remove the old one yourself.`);
  }
  mkdirSync(join(dest, ".."), { recursive: true });
  copyFileSync(src, dest);
  return "copied";
}

export interface AddOptions {
  folder: string;
  id?: string;
  title?: string;
  sunoPlan?: string;
  dry?: boolean;
}

/** add: copy one song folder (Suno exports + lyrics) into the library and register it. */
export function addSong(c: Ctx, o: AddOptions): LibraryTrack {
  const log = logOf(c);
  if (!existsSync(o.folder) || !statSync(o.folder).isDirectory()) throw new Error(`${o.folder} is not a folder`);
  const title = o.title ?? basename(o.folder);
  const trackId = o.id ?? slugify(title);
  if (!trackId) throw new Error("could not make a track id from the folder name; pass --id");
  const names = readdirSync(o.folder).filter((n) => !n.startsWith(".") && statSync(join(o.folder, n)).isFile());
  if (names.length === 0) throw new Error(`${o.folder} has no files`);
  const { roles, warnings } = classifyFolder(names);

  const m = loadManifest(c);
  let t = findTrack(m, trackId);
  if (!t) {
    t = { trackId, title, sunoPlan: o.sunoPlan ?? "unknown", addedAt: nowOf(c), files: [], voices: [] };
    m.tracks.push(t);
  } else if (o.sunoPlan) {
    t.sunoPlan = o.sunoPlan;
  }

  for (const n of [...roles.keys()]) {
    const src = join(o.folder, n);
    const { sha256, bytes, buf } = sha256File(src);
    const { role, stemName } = roles.get(n)!;
    const rel = `${trackId}/source/${n}`;
    const prior = t.files.find((f) => f.path === rel);
    if (prior && prior.sha256 !== sha256) {
      throw new Error(`${rel} is already registered with different content; nothing was changed. Give the new export a new file name.`);
    }
    const action = o.dry ? (prior ? "already there" : "would copy") : placeFile(c, src, rel, sha256);
    if (!prior) {
      const f: LibraryFile = { role, ...(stemName ? { stemName } : {}), path: rel, originalName: n, sha256, bytes };
      const info = audioInfo(src, buf);
      if (info) f.audio = info;
      t.files.push(f);
    }
    log(`${action.padEnd(13)} ${role === "stem" ? `stem:${stemName}` : role}  ${n}`);
  }
  t.files.sort((a, b) => a.path.localeCompare(b.path));
  for (const w of warnings) log(`warning: ${w}`);
  if (!o.dry) saveManifest(c, m);
  log(o.dry ? `dry run: nothing written. Track id would be "${trackId}".` : `saved "${trackId}" in ${join(c.library, MANIFEST_NAME)}`);
  return t;
}

function trackOrThrow(m: LibraryManifest, trackId: string): LibraryTrack {
  const t = findTrack(m, trackId);
  if (!t) throw new Error(`no track "${trackId}" in the library; run add first (list shows what is there)`);
  return t;
}

const hasFfmpeg = () => spawnSync("ffmpeg", ["-version"]).status === 0;
const NO_FFMPEG = "ffmpeg is not installed. On a Mac: brew install ffmpeg";

function runFfmpeg(args: string[]): void {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.trim().split("\n").slice(-3).join(" ")}`);
}

/** prep-voice: one mono 16-bit 44.1 kHz WAV of a vocal stem, ready to upload to the ElevenLabs voice changer. */
export function prepVoice(c: Ctx, trackId: string, part: "vocals" | "backing_vocals" = "vocals"): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const src = t.files.find((f) => f.role === part);
  if (!src) throw new Error(`"${trackId}" has no ${part} stem; export Multitrack from Suno Studio and run add again`);
  const sec = src.audio?.durationSec ?? null;
  if (sec !== null && sec > VOICE_CHANGER_MAX_SEC) {
    throw new Error(`the ${part} stem is ${Math.round(sec)} s; the voice changer takes 300 s per file. Split it in Suno Studio (Selected Time Range) and add the parts.`);
  }
  const rel = `${trackId}/for-elevenlabs/${trackId}.${part}.wav`;
  mkdirSync(join(c.library, trackId, "for-elevenlabs"), { recursive: true });
  runFfmpeg(["-i", join(c.library, src.path), "-ac", "1", "-ar", "44100", "-sample_fmt", "s16", join(c.library, rel)]);
  const mb = statSync(join(c.library, rel)).size / 1e6;
  logOf(c)(`ready for ElevenLabs: ${join(c.library, rel)} (${mb.toFixed(1)} MB, mono, 44.1 kHz)`);
  return rel;
}

export interface AddVoiceOptions {
  trackId: string;
  voice: string;
  file: string;
  lang?: string;
  from?: "vocals" | "backing_vocals";
  method?: VoiceTake["method"];
}

/** add-voice: copy a converted voice take into the library and check its timing against the source stem. */
export function addVoice(c: Ctx, o: AddVoiceOptions): VoiceTake {
  const log = logOf(c);
  if (!existsSync(o.file)) throw new Error(`${o.file} does not exist`);
  const m = loadManifest(c);
  const t = trackOrThrow(m, o.trackId);
  const from = o.from ?? "vocals";
  const src = t.files.find((f) => f.role === from);
  if (!src) throw new Error(`"${o.trackId}" has no ${from} stem to compare against; add the Suno multitrack export first`);
  const lang = (o.lang ?? "en").toLowerCase();
  const ext = extOf(o.file) || "wav";
  const rel = `${o.trackId}/voices/${voiceKey(o.voice)}.${lang}${from === "vocals" ? "" : ".backing"}.${ext}`;
  const { sha256, bytes, buf } = sha256File(o.file);
  const prior = t.voices.find((v) => v.path === rel);
  if (prior && prior.sha256 !== sha256) {
    throw new Error(`${rel} is already registered with a different take; nothing was changed. Mark it rejected first or use another --lang.`);
  }
  const action = placeFile(c, o.file, rel, sha256);
  const info = audioInfo(o.file, buf);
  const check = timingCheck(src.audio?.durationSec ?? null, info?.durationSec ?? null);
  const take: VoiceTake = prior ?? {
    voice: o.voice, lang, path: rel, originalName: basename(o.file), sha256, bytes,
    sourceRole: from, sourceSha256: src.sha256, method: o.method ?? "elevenlabs_voice_changer",
    durationSec: info?.durationSec ?? null, timingDeltaMs: check.deltaMs, timingOk: check.ok,
    status: "draft", addedAt: nowOf(c),
  };
  if (!prior) t.voices.push(take);
  t.voices.sort((a, b) => a.path.localeCompare(b.path));
  saveManifest(c, m);
  log(`${action} ${o.voice} (${lang}) for "${o.trackId}"`);
  if (info && isLossy(info.format)) log(`warning: ${basename(o.file)} is ${info.format.toUpperCase()}; download WAV from ElevenLabs if your plan allows`);
  if (check.deltaMs === null) log("warning: could not measure its length; timing is unchecked");
  else if (!check.ok) log(`warning: timing is off by ${check.deltaMs} ms (limit ±50 ms); lip sync will drift. Re-run the conversion on the exact stem from prep-voice.`);
  else log(`timing ok (${check.deltaMs} ms)`);
  return take;
}

/** mix: instrumental stems + one voice take -> a draft listening mix (48 kHz, 24-bit). Never replaces the Suno master. */
export function mixVoice(c: Ctx, trackId: string, voice: string, lang = "en", keepBacking = true): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(voice) && v.lang === lang.toLowerCase() && v.sourceRole === "vocals");
  if (!take) throw new Error(`no ${voice} (${lang}) take for "${trackId}"; run add-voice first`);
  const inst = t.files.find((f) => f.role === "instrumental");
  const beds = inst ? [inst] : t.files.filter((f) => f.role === "stem");
  if (beds.length === 0) throw new Error(`"${trackId}" has no instrumental or instrument stems to mix under the voice`);
  const backing = keepBacking ? t.files.filter((f) => f.role === "backing_vocals") : [];
  const inputs = [...beds, ...backing].map((f) => join(c.library, f.path));
  inputs.push(join(c.library, take.path));
  const rel = `${trackId}/mixes/${trackId}.${voiceKey(voice)}.${lang.toLowerCase()}.draft.wav`;
  mkdirSync(join(c.library, trackId, "mixes"), { recursive: true });
  const n = inputs.length;
  const chains = inputs.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(";");
  const filter = `${chains};${inputs.map((_, i) => `[a${i}]`).join("")}amix=inputs=${n}:normalize=0:duration=longest,alimiter=limit=0.89[out]`;
  runFfmpeg([...inputs.flatMap((p) => ["-i", p]), "-filter_complex", filter, "-map", "[out]", "-c:a", "pcm_s24le", join(c.library, rel)]);
  logOf(c)(`draft mix: ${join(c.library, rel)} (listening copy; the Suno master is unchanged)`);
  return rel;
}

/** Marks a take approved or rejected after listening. */
export function setVoiceStatus(c: Ctx, trackId: string, voice: string, lang: string, status: VoiceTake["status"]): VoiceTake {
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(voice) && v.lang === lang.toLowerCase());
  if (!take) throw new Error(`no ${voice} (${lang}) take for "${trackId}"`);
  if (status === "approved" && !take.timingOk) throw new Error("this take's timing is unchecked or off by more than 50 ms; it cannot be approved for lip sync");
  take.status = status;
  saveManifest(c, m);
  logOf(c)(`${voice} (${lang}) for "${trackId}" is now ${status}`);
  return take;
}
