// lib/stuttr/commands.ts
//
// File-system side of the Stuttr song library. Rules:
//  - Originals are copied, never moved or changed.
//  - A file already in the library with the same SHA-256 is skipped; a
//    different file at the same path is refused, never overwritten.
//  - library.json is written whole to a temp file, then renamed into place.
//  - Only convert uploads (a prepared vocal, to ElevenLabs). It reads
//    ELEVENLABS_API_KEY from the environment and never logs or saves it.
// ffmpeg (prep-voice, mix, master, mouth, convert) is optional; without it those commands say so.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  activeSpan, audioFormatOf, classifyFolder, emptyManifest, extOf, findTrack, isLossy, LIBRARY_SCHEMA, lengthWarnings, MANIFEST_NAME, parseWav,
  ACTIVE_WINDOW_SEC, MASTER_LENGTH_TOLERANCE_MS, masterProblem, slugify, timingCheck, VOICE_CHANGER_CREDITS_PER_MIN, VOICE_CHANGER_MAX_SEC, voiceKey,
  type AudioInfo, type LibraryFile, type LibraryManifest, type LibraryTrack, type MasterSource, type VoiceMaster, type VoiceTake,
} from "./library";
import { buildMouthTrack, frameLoudnessDb } from "../dance8/authoring/mouthTrack";
import type { MouthTrack } from "../dance8/contracts/mouth";
import { analyzeSong as analyzeSongAudio, ANALYSIS_SR, groupOfStem, type PartGroup, type SongAnalysis } from "./analysis";
import { convertSpeech, KEY_ENV, listVoices, matchVoice, OUTPUT_FORMATS, type Fetch, type OutputFormat } from "./elevenlabs";

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
  warnings.push(...lengthWarnings(t.files));
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

/** Decodes any audio file ffmpeg reads to mono float samples (-1..1) at `rate`. */
export function decodeFloat(path: string, rate = ANALYSIS_SR): Float32Array {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-ac", "1", "-ar", String(rate), "-f", "f32le", "-"], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${basename(path)}: ${String(r.stderr).trim().split("\n").pop()}`);
  const pcm = r.stdout as Buffer;
  const out = new Float32Array(Math.floor(pcm.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = pcm.readFloatLE(i * 4);
  return out;
}

/**
 * Measures a song from files (see lib/stuttr/analysis.ts). Stems of the same
 * group are summed. Used by `analyze`; takes paths so it can be checked on
 * any folder of stems.
 */
export function analyzeFiles(
  trackId: string, files: { path: string; group: PartGroup | "grid_fallback" | "harmony_fallback"; sha256: string; libPath?: string }[], durationSec?: number,
): SongAnalysis {
  const sums: Partial<Record<PartGroup | "grid_fallback" | "harmony_fallback", Float32Array>> = {};
  for (const f of files) {
    const x = decodeFloat(f.path);
    const cur = sums[f.group];
    if (!cur) sums[f.group] = x;
    else {
      const out = cur.length >= x.length ? cur : (() => { const y = new Float32Array(x.length); y.set(cur); return y; })();
      for (let i = 0; i < x.length; i++) out[i] += x[i];
      sums[f.group] = out;
    }
  }
  const longest = Math.max(0, ...Object.values(sums).map((x) => x!.length));
  const { grid_fallback, harmony_fallback, ...parts } = sums;
  return analyzeSongAudio({
    trackId,
    durationSec: durationSec ?? longest / ANALYSIS_SR,
    sources: files.map((f) => ({ group: f.group, path: f.libPath ?? basename(f.path), sha256: f.sha256 })),
    parts,
    gridFallback: grid_fallback,
    harmonyFallback: harmony_fallback,
  });
}

/**
 * analyze: tempo, downbeats, part levels, sung eighths and chords from the
 * song's stems, saved to <id>/analysis/<id>.analysis.json for Dance8.
 */
export function analyzeTrack(c: Ctx, trackId: string): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const t = trackOrThrow(loadManifest(c), trackId);
  const pick: Parameters<typeof analyzeFiles>[1] = [];
  for (const f of t.files) {
    const group = f.role === "vocals" ? "lead" : f.role === "backing_vocals" ? "backing" : f.role === "stem" ? groupOfStem(f.stemName) : null;
    if (group) pick.push({ path: join(c.library, f.path), group, sha256: f.sha256, libPath: f.path });
  }
  const fallback = t.files.find((f) => f.role === "instrumental") ?? t.files.find((f) => f.role === "full_mix");
  if (!pick.some((p) => p.group === "drums") && fallback) pick.push({ path: join(c.library, fallback.path), group: "grid_fallback", sha256: fallback.sha256, libPath: fallback.path });
  if (!pick.some((p) => p.group === "harmony") && fallback) pick.push({ path: join(c.library, fallback.path), group: "harmony_fallback", sha256: fallback.sha256, libPath: fallback.path });
  const full = t.files.find((f) => f.role === "full_mix")?.audio?.durationSec ?? undefined;
  const a = analyzeFiles(trackId, pick, full);
  const rel = `${trackId}/analysis/${trackId}.analysis.json`;
  mkdirSync(join(c.library, trackId, "analysis"), { recursive: true });
  writeFileSync(join(c.library, rel), JSON.stringify(a, null, 1) + "\n");
  const unsure = a.chords.filter((x) => x.fit < 0.75).length;
  logOf(c)(`analysis: ${join(c.library, rel)}`);
  logOf(c)(`${a.bpm} BPM, first downbeat at ${a.firstDownbeatSec} s, ${a.bars} bars; grid within ${a.gridResidP95ms} ms; ${a.chords.length - unsure} of ${a.chords.length} half-bar chords read clearly`);
  for (const w of a.warnings) logOf(c)(`note: ${w}`);
  return rel;
}

/** Decodes any audio file ffmpeg reads to mono 16-bit samples at `rate`. */
function decodeMono(path: string, rate: number): Int16Array {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", path, "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${basename(path)}: ${String(r.stderr).trim().split("\n").pop()}`);
  const pcm = r.stdout as Buffer;
  const samples = new Int16Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2);
  return samples;
}

/** RMS loudness (dBFS) of each ACTIVE_WINDOW_SEC window of a file. */
function windowLoudness(path: string): number[] {
  const rate = 16000;
  return frameLoudnessDb(decodeMono(path, rate), rate, 1 / ACTIVE_WINDOW_SEC);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * prep-voice: one mono 16-bit 44.1 kHz WAV of a vocal stem, ready to upload to
 * the ElevenLabs voice changer. The lead vocal is kept full length. A backing
 * vocal is cut to the span where someone sings (unless full is set), which
 * saves credits; the start is recorded so the converted take is placed back
 * at the same point in the song.
 */
export function prepVoice(c: Ctx, trackId: string, part: "vocals" | "backing_vocals" = "vocals", opts: { full?: boolean } = {}): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const src = t.files.find((f) => f.role === part);
  if (!src) throw new Error(`"${trackId}" has no ${part} stem; export Multitrack from Suno Studio and run add again`);
  const srcPath = join(c.library, src.path);
  const total = src.audio?.durationSec ?? null;
  let startSec = 0;
  let durationSec = total;
  if (part === "backing_vocals" && !opts.full && total !== null) {
    const span = activeSpan(windowLoudness(srcPath), ACTIVE_WINDOW_SEC, total);
    if (!span) throw new Error(`the ${part} stem is silent; there is nothing to convert`);
    startSec = span.startSec;
    durationSec = Math.round((span.endSec - span.startSec) * 1000) / 1000;
  }
  if (durationSec !== null && durationSec > VOICE_CHANGER_MAX_SEC) {
    throw new Error(`the ${part} part to convert is ${Math.round(durationSec)} s; the voice changer takes 300 s per file. Split it in Suno Studio (Selected Time Range) and add the parts.`);
  }
  const rel = `${trackId}/for-elevenlabs/${trackId}.${part}.wav`;
  mkdirSync(join(c.library, trackId, "for-elevenlabs"), { recursive: true });
  const cut = startSec > 0 || (durationSec !== null && total !== null && durationSec < total)
    ? ["-ss", String(startSec), "-t", String(durationSec)] : [];
  runFfmpeg(["-i", srcPath, ...cut, "-ac", "1", "-ar", "44100", "-sample_fmt", "s16", join(c.library, rel)]);
  const out = join(c.library, rel);
  const outBuf = readFileSync(out);
  const measured = parseWav(outBuf, outBuf.length)?.durationSec ?? durationSec;
  if (measured !== null) {
    const prep = { role: part, path: rel, sourceSha256: src.sha256, startSec, durationSec: measured, preparedAt: nowOf(c) };
    t.preps = [...(t.preps ?? []).filter((p) => p.role !== part), prep];
    saveManifest(c, m);
  }
  const mb = outBuf.length / 1e6;
  const credits = measured !== null ? Math.ceil((measured / 60) * VOICE_CHANGER_CREDITS_PER_MIN) : null;
  const span = startSec > 0 || (measured !== null && total !== null && measured < total - 0.01)
    ? `; ${clock(startSec)}–${clock(startSec + (measured ?? 0))} of the song` : "";
  logOf(c)(`ready for ElevenLabs: ${out} (${mb.toFixed(1)} MB, mono, 44.1 kHz${span}${credits !== null ? `; about ${credits.toLocaleString("en-US")} credits per voice` : ""})`);
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
  // Compare against what was sent to ElevenLabs: the prepared span when prep-voice cut one,
  // or the whole stem (also when the full stem was converted after all).
  const srcSec = src.audio?.durationSec ?? null;
  const prep = (t.preps ?? []).find((p) => p.role === from && p.sourceSha256 === src.sha256);
  let expectSec = prep ? prep.durationSec : srcSec;
  let startSec = prep?.startSec ?? 0;
  const takeSec = info?.durationSec ?? null;
  if (prep && takeSec !== null && !timingCheck(prep.durationSec, takeSec).ok && timingCheck(srcSec, takeSec).ok) {
    expectSec = srcSec;
    startSec = 0;
  }
  const check = timingCheck(expectSec, takeSec);
  const take: VoiceTake = prior ?? {
    voice: o.voice, lang, path: rel, originalName: basename(o.file), sha256, bytes,
    sourceRole: from, sourceSha256: src.sha256, method: o.method ?? "elevenlabs_voice_changer",
    durationSec: info?.durationSec ?? null, timingDeltaMs: check.deltaMs, timingOk: check.ok,
    status: "draft", addedAt: nowOf(c), ...(startSec > 0 ? { startSec } : {}),
  };
  if (!prior) t.voices.push(take);
  else if (info?.durationSec != null) {
    // Same take added again, now measurable (e.g. an MP3 once ffmpeg is installed): record the check.
    prior.durationSec = info.durationSec;
    prior.timingDeltaMs = check.deltaMs;
    prior.timingOk = check.ok;
  }
  t.voices.sort((a, b) => a.path.localeCompare(b.path));
  saveManifest(c, m);
  log(`${action} ${o.voice} (${lang}) for "${o.trackId}"`);
  if (info && isLossy(info.format)) log(`warning: ${basename(o.file)} is ${info.format.toUpperCase()}; download WAV from ElevenLabs if your plan allows`);
  if (check.deltaMs === null) log("warning: could not measure its length; timing is unchecked");
  else if (!check.ok) log(`warning: timing is off by ${check.deltaMs} ms (limit ±50 ms); lip sync will drift. Re-run the conversion on the exact stem from prep-voice.`);
  else log(`timing ok (${check.deltaMs} ms)`);
  if ((take.startSec ?? 0) > 0) log(`placed at ${clock(take.startSec!)} in the song`);
  return take;
}

interface MixInput { path: string; delayMs: number; gain: number }

/**
 * The mix recipe shared by mix and master: every input at 48 kHz stereo,
 * delayed to its place and scaled, summed without normalising, then limited.
 * `fit` pads the end with silence so `-t` can cut it to an exact length.
 */
function mixFilter(inputs: MixInput[], fit = false): string {
  const chains = inputs.map((x, i) => {
    const delay = x.delayMs > 0 ? `,adelay=${x.delayMs}:all=1` : "";
    const gain = x.gain !== 1 ? `,volume=${x.gain}` : "";
    return `[${i}:a]aresample=48000,aformat=channel_layouts=stereo${delay}${gain}[a${i}]`;
  }).join(";");
  return `${chains};${inputs.map((_, i) => `[a${i}]`).join("")}amix=inputs=${inputs.length}:normalize=0:duration=longest,alimiter=limit=0.89${fit ? ",apad" : ""}[out]`;
}

/**
 * mix: instrumental stems + one lead voice take -> a draft listening mix
 * (48 kHz, 24-bit). Never replaces the Suno master. Backing: every converted
 * backing take for this language that isn't rejected (Stuttr, M, Ja, Bo...),
 * each placed at its start in the song and layered at 1/sqrt(n) gain; with no
 * converted backing takes (or sunoBacking), Suno's own backing vocal stem.
 */
export function mixVoice(c: Ctx, trackId: string, voice: string, lang = "en", keepBacking = true, opts: { sunoBacking?: boolean } = {}): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const log = logOf(c);
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const lc = lang.toLowerCase();
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(voice) && v.lang === lc && v.sourceRole === "vocals");
  if (!take) throw new Error(`no ${voice} (${lang}) take for "${trackId}"; run add-voice first`);
  const inst = t.files.find((f) => f.role === "instrumental");
  const beds = inst ? [inst] : t.files.filter((f) => f.role === "stem");
  if (beds.length === 0) throw new Error(`"${trackId}" has no instrumental or instrument stems to mix under the voice`);
  const backingTakes = keepBacking && !opts.sunoBacking
    ? t.voices.filter((v) => v.sourceRole === "backing_vocals" && v.lang === lc && v.status !== "rejected") : [];
  const backingStems = keepBacking && backingTakes.length === 0 ? t.files.filter((f) => f.role === "backing_vocals") : [];
  const layerGain = backingTakes.length > 1 ? Math.round((1 / Math.sqrt(backingTakes.length)) * 1000) / 1000 : 1;
  const inputs: { path: string; delayMs: number; gain: number }[] = [
    ...[...beds, ...backingStems].map((f) => ({ path: join(c.library, f.path), delayMs: 0, gain: 1 })),
    ...backingTakes.map((v) => ({ path: join(c.library, v.path), delayMs: Math.round((v.startSec ?? 0) * 1000), gain: layerGain })),
    { path: join(c.library, take.path), delayMs: 0, gain: 1 },
  ];
  const rel = `${trackId}/mixes/${trackId}.${voiceKey(voice)}.${lc}.draft.wav`;
  mkdirSync(join(c.library, trackId, "mixes"), { recursive: true });
  runFfmpeg([...inputs.flatMap((x) => ["-i", x.path]), "-filter_complex", mixFilter(inputs), "-map", "[out]", "-c:a", "pcm_s24le", join(c.library, rel)]);
  if (backingTakes.length) {
    log(`backing: ${backingTakes.map((v) => v.voice).join(", ")} layered${layerGain !== 1 ? ` at ${layerGain}x each` : ""}`);
    for (const v of backingTakes) if (!v.timingOk) log(`warning: ${v.voice}'s backing take has unchecked or off timing; it may not line up`);
  } else if (backingStems.length) log("backing: Suno's backing vocals");
  log(`draft mix: ${join(c.library, rel)} (listening copy; the Suno master is unchanged)`);
  return rel;
}

/** Marks a take approved or rejected after listening. */
export function setVoiceStatus(
  c: Ctx, trackId: string, voice: string, lang: string, status: VoiceTake["status"], from: VoiceTake["sourceRole"] = "vocals",
): VoiceTake {
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(voice) && v.lang === lang.toLowerCase() && v.sourceRole === from);
  if (!take) throw new Error(`no ${voice} (${lang}) ${from === "vocals" ? "lead" : "backing"} take for "${trackId}"`);
  if (status === "approved" && !take.timingOk) throw new Error("this take's timing is unchecked or off by more than 50 ms; it cannot be approved for lip sync");
  take.status = status;
  saveManifest(c, m);
  logOf(c)(`${voice} (${lang})${from === "backing_vocals" ? " backing" : ""} for "${trackId}" is now ${status}`);
  return take;
}

export interface MasterOptions {
  trackId: string;
  /** The approved lead take to use; needed only when more than one is approved for the language. */
  voice?: string;
  lang?: string;
  /** A master of Suno's own vocals: the full mix at 48 kHz, 24-bit, nothing else changed. */
  suno?: boolean;
  /** Backing: approved backing takes (else Suno's backing stem), Suno's stem only, or none. */
  backing?: "takes" | "suno" | "none";
  /** Rebuild an approved master (it goes back to draft). */
  replace?: boolean;
}

/**
 * master: the audio a Dance8 render plays (D8-14). Built only from approved
 * takes over the instrument stems, with the same recipe as mix, cut or padded
 * to the full mix's exact length, and recorded with what it was built from.
 * It starts as a draft; approve-master after listening. The Suno master is
 * never changed.
 */
export function buildMaster(c: Ctx, o: MasterOptions): VoiceMaster {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const log = logOf(c);
  const m = loadManifest(c);
  const t = trackOrThrow(m, o.trackId);
  const full = t.files.find((f) => f.role === "full_mix");
  if (!full) throw new Error(`"${o.trackId}" has no full mix to match the master's length to; export Full Song from Suno and add it`);
  const lc = (o.lang ?? "en").toLowerCase();
  const key = o.suno ? "suno" : lc;
  const prior = (t.masters ?? []).find((x) => x.key === key);
  if (prior?.status === "approved" && !o.replace) {
    throw new Error(`the ${key === "suno" ? "Suno vocals" : key} master for "${o.trackId}" is approved; rebuild it with --replace (it goes back to draft)`);
  }
  const src = (f: { path: string; sha256: string }, voice?: string): MasterSource => ({ path: f.path, sha256: f.sha256, ...(voice ? { voice } : {}) });

  let inputs: MixInput[];
  let lead: MasterSource | null = null;
  let backing: MasterSource[] = [];
  let beds: MasterSource[];
  let sunoBacking: MasterSource[] = [];
  if (o.suno) {
    beds = [src(full)];
    inputs = [{ path: join(c.library, full.path), delayMs: 0, gain: 1 }];
  } else {
    const leads = t.voices.filter((v) => v.sourceRole === "vocals" && v.lang === lc && v.status === "approved");
    const take = o.voice ? leads.find((v) => voiceKey(v.voice) === voiceKey(o.voice!)) : leads.length === 1 ? leads[0] : undefined;
    if (!take) {
      const drafts = t.voices.filter((v) => v.sourceRole === "vocals" && v.lang === lc && v.status === "draft").map((v) => v.voice);
      if (o.voice) throw new Error(`no approved ${o.voice} (${lc}) lead take for "${o.trackId}"${drafts.length ? `; draft: ${drafts.join(", ")}` : ""}`);
      if (leads.length > 1) throw new Error(`"${o.trackId}" has ${leads.length} approved lead takes (${leads.map((v) => v.voice).join(", ")}); name one: npm run stuttr -- master ${o.trackId} ${leads[0].voice}`);
      throw new Error(`"${o.trackId}" has no approved lead take (${lc})${drafts.length ? `; listen to ${drafts.join(", ")} with mix, then approve one` : "; run convert first"}`);
    }
    if (!take.timingOk) throw new Error(`${take.voice}'s lead take has unchecked or off timing; it can't go in the master`);
    lead = src(take, take.voice);
    const inst = t.files.find((f) => f.role === "instrumental");
    const bedFiles = inst ? [inst] : t.files.filter((f) => f.role === "stem");
    if (bedFiles.length === 0) throw new Error(`"${o.trackId}" has no instrumental or instrument stems to put under the voices`);
    beds = bedFiles.map((f) => src(f));
    const mode = o.backing ?? "takes";
    const backingTakes = mode === "takes" ? t.voices.filter((v) => v.sourceRole === "backing_vocals" && v.lang === lc && v.status === "approved") : [];
    const skipped = t.voices.filter((v) => v.sourceRole === "backing_vocals" && v.lang === lc && v.status === "draft");
    if (mode === "takes" && skipped.length) log(`not in the master (not approved): ${skipped.map((v) => `${v.voice} backing`).join(", ")}`);
    const stems = mode !== "none" && backingTakes.length === 0 ? t.files.filter((f) => f.role === "backing_vocals") : [];
    sunoBacking = stems.map((f) => src(f));
    backing = backingTakes.map((v) => src(v, v.voice));
    const layerGain = backingTakes.length > 1 ? Math.round((1 / Math.sqrt(backingTakes.length)) * 1000) / 1000 : 1;
    inputs = [
      ...[...bedFiles, ...stems].map((f) => ({ path: join(c.library, f.path), delayMs: 0, gain: 1 })),
      ...backingTakes.map((v) => ({ path: join(c.library, v.path), delayMs: Math.round((v.startSec ?? 0) * 1000), gain: layerGain })),
      { path: join(c.library, take.path), delayMs: 0, gain: 1 },
    ];
  }

  const rel = `${o.trackId}/masters/${o.trackId}.${key}.master.wav`;
  mkdirSync(join(c.library, o.trackId, "masters"), { recursive: true });
  const songSec = full.audio?.durationSec ?? null;
  const filter = o.suno
    ? `[0:a]aresample=48000,aformat=channel_layouts=stereo${songSec !== null ? ",apad" : ""}[out]`
    : mixFilter(inputs, songSec !== null);
  runFfmpeg([
    ...inputs.flatMap((x) => ["-i", x.path]), "-filter_complex", filter, "-map", "[out]",
    ...(songSec !== null ? ["-t", songSec.toFixed(6)] : []), "-c:a", "pcm_s24le", join(c.library, rel),
  ]);
  const { sha256, bytes, buf } = sha256File(join(c.library, rel));
  const durationSec = parseWav(buf, buf.length)?.durationSec ?? null;
  const lengthDeltaMs = durationSec !== null && songSec !== null ? Math.round((durationSec - songSec) * 1000) : null;
  const master: VoiceMaster = {
    key, kind: o.suno ? "suno" : "voices", path: rel, sha256, bytes, durationSec, lengthDeltaMs,
    lead, backing, beds, sunoBacking, status: "draft", builtAt: nowOf(c),
  };
  t.masters = [...(t.masters ?? []).filter((x) => x.key !== key), master].sort((a, b) => a.key.localeCompare(b.key));
  saveManifest(c, m);
  if (lead) log(`lead: ${lead.voice}`);
  if (backing.length) log(`backing: ${backing.map((b) => b.voice).join(", ")}`);
  else if (sunoBacking.length) log("backing: Suno's backing vocals");
  if (lengthDeltaMs === null) log("warning: could not compare its length with the full mix; it can't be approved until it can");
  else if (Math.abs(lengthDeltaMs) > MASTER_LENGTH_TOLERANCE_MS) log(`warning: it is ${lengthDeltaMs} ms off the full mix's length (limit ±${MASTER_LENGTH_TOLERANCE_MS} ms)`);
  else log(`length matches the full mix (${lengthDeltaMs} ms)`);
  const which = key === "suno" ? " --suno" : key === "en" ? "" : ` --lang ${key}`;
  log(`voice master (draft): ${join(c.library, rel)}. Listen, then: npm run stuttr -- approve-master ${o.trackId}${which}`);
  return master;
}

/** approve-master / reject-master. Approval checks the master still matches what it was built from. */
export function setMasterStatus(c: Ctx, trackId: string, key: string, status: VoiceMaster["status"]): VoiceMaster {
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const master = (t.masters ?? []).find((x) => x.key === key);
  if (!master) throw new Error(`"${trackId}" has no ${key === "suno" ? "Suno vocals" : `"${key}"`} master; run master first`);
  if (status === "approved") {
    const problem = masterProblem(t, master);
    if (problem) throw new Error(`this master can't be approved: ${problem}. Rebuild it with npm run stuttr -- master ${trackId}${key === "suno" ? " --suno" : key === "en" ? "" : ` --lang ${key}`}`);
  }
  master.status = status;
  saveManifest(c, m);
  logOf(c)(`the ${key === "suno" ? "Suno vocals" : key} master for "${trackId}" is now ${status}`);
  return master;
}

export const MOUTH_DECODE_RATE = 16000;

/**
 * Dance8 mouth track from an approved take (D8-14): decoded to mono 16 kHz by
 * ffmpeg, measured per 24 fps frame, written to <id>/dance8/ in the library.
 */
export function mouthTrack(c: Ctx, trackId: string, voice: string, lang = "en", from: VoiceTake["sourceRole"] = "vocals"): string {
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const m = loadManifest(c);
  const t = trackOrThrow(m, trackId);
  const take = t.voices.find((v) => voiceKey(v.voice) === voiceKey(voice) && v.lang === lang.toLowerCase() && v.sourceRole === from);
  if (!take) throw new Error(`no ${voice} (${lang}) ${from === "vocals" ? "lead" : "backing"} take for "${trackId}"`);
  if (take.status !== "approved") throw new Error(`${voice}'s take is ${take.status}; Dance8 reads approved takes only, so approve it first`);
  const src = join(c.library, take.path);
  if (sha256File(src).sha256 !== take.sha256) throw new Error(`${take.path} changed since it was approved; add and approve it again`);

  const samples = decodeMono(src, MOUTH_DECODE_RATE);

  const track: MouthTrack = buildMouthTrack(samples, MOUTH_DECODE_RATE, {
    trackId, voice: take.voice, lang: take.lang, role: from, source: { path: take.path, sha256: take.sha256 }, startSec: take.startSec ?? 0,
  });
  const rel = join(trackId, "dance8", `${track.id}.json`);
  mkdirSync(join(c.library, trackId, "dance8"), { recursive: true });
  writeFileSync(join(c.library, rel), JSON.stringify(track) + "\n");
  const openish = track.open.filter((v) => v >= 0.2).length;
  logOf(c)(
    `mouth track: ${join(c.library, rel)} (${track.open.length} frames at ${track.fps} fps from ${clock(track.startSec)}; ` +
      `open on ${Math.round((100 * openish) / Math.max(1, track.open.length))}% of frames)`,
  );
  return rel;
}

export interface ConvertOptions {
  trackId: string;
  voices: string[];
  from?: VoiceTake["sourceRole"];
  lang?: string;
  /** Backing vocals: send the whole stem instead of the sung span. */
  full?: boolean;
  format?: string;
  /** Prepare and match voices, but convert nothing (no credits). */
  dry?: boolean;
  /** For tests; defaults to the ELEVENLABS_API_KEY environment variable. */
  key?: string;
  fetch?: Fetch;
}

/**
 * convert: prep-voice, then the ElevenLabs voice changer once per voice, then
 * add-voice for each result, in one step. Every voice is matched by name
 * before any credits are spent; a voice that already has a take for this part
 * and language is skipped.
 */
export async function convertVoices(c: Ctx, o: ConvertOptions): Promise<VoiceTake[]> {
  const log = logOf(c);
  const key = o.key ?? process.env[KEY_ENV];
  if (!key) throw new Error(`${KEY_ENV} is not set; add your ElevenLabs API key to your shell profile (it is never printed)`);
  const format = (o.format ?? OUTPUT_FORMATS[0]) as OutputFormat;
  if (!OUTPUT_FORMATS.includes(format)) throw new Error(`--format must be one of ${OUTPUT_FORMATS.join(", ")}`);
  if (!hasFfmpeg()) throw new Error(NO_FFMPEG);
  const from = o.from ?? "vocals";
  const lang = (o.lang ?? "en").toLowerCase();
  const f: Fetch = o.fetch ?? ((url, init) => fetch(url, init));

  const wanted = [...new Map(o.voices.map((v) => [voiceKey(v), v] as const)).values()];
  if (wanted.length === 0) throw new Error("convert needs at least one voice name");
  const part = from === "vocals" ? "lead" : "backing";
  const before = trackOrThrow(loadManifest(c), o.trackId);
  const taken = (v: string) => before.voices.some((t) => voiceKey(t.voice) === voiceKey(v) && t.lang === lang && t.sourceRole === from);
  for (const v of wanted.filter(taken)) log(`${v} already has a ${part} take (${lang}); skipped, no credits spent`);
  const todo = wanted.filter((v) => !taken(v));
  if (todo.length === 0) return [];

  // Match every voice first, so a typo costs nothing.
  const eleven = await listVoices(key, f);
  const matched = todo.map((v) => ({ voice: v, el: matchVoice(eleven, v) }));

  const rel = prepVoice(c, o.trackId, from, { full: o.full });
  const audio = readFileSync(join(c.library, rel));
  const prep = trackOrThrow(loadManifest(c), o.trackId).preps?.find((p) => p.role === from);
  const perVoice = prep ? Math.ceil((prep.durationSec / 60) * VOICE_CHANGER_CREDITS_PER_MIN) : null;
  const names = matched.map((m) => (m.el.name === m.voice ? m.voice : `${m.voice} ("${m.el.name}")`)).join(", ");
  log(`${o.dry ? "would convert" : "converting"} the ${part} part as ${names}${perVoice !== null ? `: about ${(perVoice * matched.length).toLocaleString("en-US")} credits` : ""}`);
  if (o.dry) return [];

  const tmp = mkdtempSync(join(tmpdir(), "stuttr-convert-"));
  const takes: VoiceTake[] = [];
  for (const m of matched) {
    log(`${m.voice}: converting in ElevenLabs...`);
    const out = await convertSpeech(key, f, m.el.voiceId, audio, basename(rel), format);
    const file = join(tmp, `${o.trackId}.${voiceKey(m.voice)}.${lang}${from === "vocals" ? "" : ".backing"}.mp3`);
    writeFileSync(file, out);
    takes.push(addVoice(c, { trackId: o.trackId, voice: m.voice, file, lang, from }));
  }
  const leads = trackOrThrow(loadManifest(c), o.trackId).voices.filter((v) => v.sourceRole === "vocals" && v.lang === lang && v.status !== "rejected");
  if (leads.length === 1) log(`next: listen with  npm run stuttr -- mix ${o.trackId} ${leads[0].voice}${lang === "en" ? "" : ` --lang ${lang}`}`);
  return takes;
}
