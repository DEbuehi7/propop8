// lib/stuttr/library.ts
//
// Stuttr song library: where Suno exports and ElevenLabs voice takes live
// before Dance8 uses them. Audio stays on your computer: this code never
// uploads anything and the library folder is outside the repo, so no audio
// ever lands in git. One manifest, library.json, records every file by
// SHA-256, so a Dance8 cue map or analysis profile can point at one exact
// recording (trackId + sourceHash).
//
// Pure helpers live here; file-system commands live in ./commands.

export const LIBRARY_SCHEMA = 1 as const;
export const MANIFEST_NAME = "library.json";
/** A converted voice must match its source stem's length to this tolerance, or lip sync drifts. */
export const VOICE_TIMING_TOLERANCE_MS = 50;
/** ElevenLabs voice changer limit per generation (5 minutes). */
export const VOICE_CHANGER_MAX_SEC = 300;

export type FileRole = "full_mix" | "vocals" | "backing_vocals" | "instrumental" | "stem" | "lyrics" | "unclassified";

export interface AudioInfo {
  format: "wav" | "mp3" | "flac" | "m4a" | "aiff" | "other";
  lossy: boolean;
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  durationSec: number | null;
}

export interface LibraryFile {
  role: FileRole;
  /** For role "stem": drums, bass, synth... */
  stemName?: string;
  /** Relative to the library root. */
  path: string;
  originalName: string;
  sha256: string;
  bytes: number;
  audio?: AudioInfo;
}

export interface VoiceTake {
  voice: string;
  lang: string;
  path: string;
  originalName: string;
  sha256: string;
  bytes: number;
  sourceRole: "vocals" | "backing_vocals";
  sourceSha256: string;
  method: "elevenlabs_voice_changer" | "other";
  durationSec: number | null;
  /** Converted length minus source length, in ms. Null when either length is unknown. */
  timingDeltaMs: number | null;
  timingOk: boolean;
  status: "draft" | "approved" | "rejected";
  addedAt: string;
}

export interface LibraryTrack {
  trackId: string;
  title: string;
  /** Suno plan the song was made under; commercial rights depend on it. */
  sunoPlan: string;
  addedAt: string;
  files: LibraryFile[];
  voices: VoiceTake[];
}

export interface LibraryManifest {
  schemaVersion: typeof LIBRARY_SCHEMA;
  tracks: LibraryTrack[];
}

export const emptyManifest = (): LibraryManifest => ({ schemaVersion: LIBRARY_SCHEMA, tracks: [] });

/** "C.L.O.Y.N.E." -> "cloyne", "Three Laps (9.3)" -> "three-laps-93". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Voice names become file-safe keys the same way. */
export const voiceKey = (voice: string): string => slugify(voice);

const AUDIO_EXT: Record<string, AudioInfo["format"]> = {
  wav: "wav", wave: "wav", mp3: "mp3", flac: "flac", m4a: "m4a", aac: "m4a", aif: "aiff", aiff: "aiff",
};
const LOSSY = new Set<AudioInfo["format"]>(["mp3", "m4a"]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function audioFormatOf(name: string): AudioInfo["format"] | null {
  return AUDIO_EXT[extOf(name)] ?? null;
}

export const isLossy = (f: AudioInfo["format"]) => LOSSY.has(f);

const STEM_WORDS = ["drums", "drum", "percussion", "perc", "bass", "guitar", "keys", "keyboard", "piano", "synth", "pad", "strings", "brass", "horns", "winds", "fx", "sfx", "other", "click", "metronome"];

/** Role from a file name, before the folder-level full-mix decision. */
export function roleFromName(fileName: string): { role: FileRole; stemName?: string } {
  const ext = extOf(fileName);
  // Suno's style prompt is saved next to the lyrics; it is kept but never read as lyrics.
  if (ext === "txt" || ext === "lrc") return /style|prompt/i.test(fileName) ? { role: "unclassified" } : { role: "lyrics" };
  if (!audioFormatOf(fileName)) return { role: "unclassified" };
  const base = fileName.slice(0, fileName.length - ext.length - 1).toLowerCase();
  const words = base.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (w: string) => words.includes(w);
  if (/backing|bgv|background\s*vocal|harmon|choir/.test(base)) return { role: "backing_vocals" };
  if (/instrumental|karaoke|no[\s_-]*vocals?/.test(base) || has("inst")) return { role: "instrumental" };
  if (/vocal|acapella|a[\s_-]*cappella/.test(base) || has("vox") || has("voice")) return { role: "vocals" };
  for (const w of STEM_WORDS) {
    if (has(w)) return { role: "stem", stemName: w === "drum" ? "drums" : w === "perc" ? "percussion" : w };
  }
  return { role: "full_mix" };
}

/**
 * Roles for every file in one song folder. Exactly one full mix is allowed:
 * with several candidates, the one named full/master/mix wins; if that is
 * still ambiguous, all candidates stay unclassified and a warning says why.
 */
export function classifyFolder(names: string[]): { roles: Map<string, { role: FileRole; stemName?: string }>; warnings: string[] } {
  const roles = new Map<string, { role: FileRole; stemName?: string }>();
  const warnings: string[] = [];
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  // Suno Studio names exports "<Song title> (<part>).wav"; strip the shared
  // title first, so a song called "Bass Drop" is not mistaken for a bass stem.
  // Suno's stem download names them "<part>_<Song title>.mp3" instead.
  const audio = sorted.filter((n) => audioFormatOf(n));
  const parts = stemDownloadParts(audio);
  const prefix = !parts && audio.length >= 2 ? sharedPrefix(audio.map(stripExt)) : "";
  for (const n of sorted) {
    const part = parts?.get(n);
    if (part !== undefined) roles.set(n, part === "" ? { role: "full_mix" } : roleFromName(`${part}.${extOf(n)}`));
    else roles.set(n, roleFromName(audioFormatOf(n) ? n.slice(prefix.length) || n : n));
  }
  const mixes = sorted.filter((n) => roles.get(n)!.role === "full_mix");
  if (mixes.length > 1) {
    const named = mixes.filter((n) => /full|master|(^|[^a-z])mix/.test(n.toLowerCase()));
    const keep = named.length === 1 ? named[0] : null;
    for (const n of mixes) if (n !== keep) roles.set(n, { role: "unclassified" });
    if (!keep) warnings.push(`more than one possible full mix (${mixes.join(", ")}); put "full" in the full mix's file name`);
  }
  if (!sorted.some((n) => roles.get(n)!.role === "full_mix")) warnings.push("no full mix found; export Full Song from Suno Studio");
  for (const n of sorted) {
    const r = roles.get(n)!;
    const f = audioFormatOf(n);
    if (f && isLossy(f)) warnings.push(`${n} is ${f.toUpperCase()} (lossy); export WAV for analysis and voice work`);
    if (r.role === "unclassified" && audioFormatOf(n)) warnings.push(`${n}: role unknown; it is copied but not used`);
    if (extOf(n) === "rtf" && !/style|prompt/i.test(n)) warnings.push(`${n} is rich text; save the lyrics as plain text (TextEdit: Format > Make Plain Text) named lyrics.txt`);
  }
  return { roles, warnings };
}

const stripExt = (n: string) => (extOf(n) ? n.slice(0, n.length - extOf(n).length - 1) : n);

/**
 * Suno's stem download: "<part>_<Song title>.mp3" for each part (vocals, drums,
 * bass, other, click), plus the full song named just "<Song title>". Returns
 * each audio name's part ("" for the bare title), or null when the folder is
 * not entirely in that form (then the shared-prefix rule applies).
 */
export function stemDownloadParts(audioNames: string[]): Map<string, string> | null {
  const parts = new Map<string, string>();
  let title: string | null = null;
  for (const n of audioNames) {
    const b = stripExt(n);
    const i = b.indexOf("_");
    if (i <= 0) continue;
    const part = b.slice(0, i);
    if (roleFromName(`${part}.wav`).role === "full_mix") continue;
    const t = b.slice(i + 1);
    if (!t || (title !== null && t !== title)) return null;
    title = t;
    parts.set(n, part);
  }
  if (title === null || parts.size < 2) return null;
  for (const n of audioNames) {
    if (parts.has(n)) continue;
    if (stripExt(n) === title) parts.set(n, "");
    else return null;
  }
  return parts;
}

/** Most stems are as long as the song; these differ from the full mix by more than this. */
export const STEM_LENGTH_TOLERANCE_SEC = 1;

/**
 * Parts whose length doesn't match the full mix: a preview clip (Suno's stem
 * previews are 15 s) or a stem from a different take. Unknown lengths are skipped.
 */
export function lengthWarnings(files: LibraryFile[]): string[] {
  const full = files.find((f) => f.role === "full_mix")?.audio?.durationSec;
  if (full == null) return [];
  const out: string[] = [];
  for (const f of files) {
    if (f.role === "full_mix" || f.role === "lyrics" || f.role === "unclassified") continue;
    const d = f.audio?.durationSec;
    if (d == null || Math.abs(d - full) <= STEM_LENGTH_TOLERANCE_SEC) continue;
    out.push(`${f.originalName} is ${d.toFixed(1)} s but the full mix is ${full.toFixed(1)} s; it looks like a preview or another take. Re-export Multitrack from Suno Studio.`);
  }
  return out;
}

/** Longest shared start of all names, cut back to a word boundary. */
export function sharedPrefix(names: string[]): string {
  if (names.length < 2) return "";
  let p = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  // Never end inside a word: cut back to the last non-letter/digit character.
  const m = /^(.*[^A-Za-z0-9])/.exec(p);
  const cut = m ? m[1] : "";
  // Keep something to classify: never swallow a whole name.
  return names.some((n) => n.length === cut.length) ? "" : cut;
}

/**
 * Reads a WAV header. Returns null for anything that is not a RIFF/WAVE file.
 * `head` must hold the bytes up to the start of the data chunk (the whole
 * file is fine); `fileBytes` is the file's full size.
 */
export function parseWav(head: Buffer, fileBytes: number): AudioInfo | null {
  if (head.length < 12 || head.toString("ascii", 0, 4) !== "RIFF" || head.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12;
  let channels: number | null = null;
  let sampleRate: number | null = null;
  let byteRate: number | null = null;
  let bits: number | null = null;
  let dataSize: number | null = null;
  while (off + 8 <= head.length) {
    const id = head.toString("ascii", off, off + 4);
    const size = head.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= head.length) {
      channels = head.readUInt16LE(body + 2);
      sampleRate = head.readUInt32LE(body + 4);
      byteRate = head.readUInt32LE(body + 8);
      bits = head.readUInt16LE(body + 14);
    } else if (id === "data") {
      // 0 or 0xFFFFFFFF means "until end of file" (streamed writers).
      dataSize = size === 0 || size === 0xffffffff ? fileBytes - body : Math.min(size, fileBytes - body);
      break;
    }
    off = body + size + (size % 2);
  }
  const durationSec = byteRate && dataSize !== null ? Math.round((dataSize / byteRate) * 1e6) / 1e6 : null;
  return { format: "wav", lossy: false, sampleRate, channels, bitsPerSample: bits, durationSec };
}

/** Timing check for a converted voice against its source stem. */
export function timingCheck(sourceSec: number | null, takeSec: number | null): { deltaMs: number | null; ok: boolean } {
  if (sourceSec === null || takeSec === null) return { deltaMs: null, ok: false };
  const deltaMs = Math.round((takeSec - sourceSec) * 1000);
  return { deltaMs, ok: Math.abs(deltaMs) <= VOICE_TIMING_TOLERANCE_MS };
}

export function findTrack(m: LibraryManifest, trackId: string): LibraryTrack | undefined {
  return m.tracks.find((t) => t.trackId === trackId);
}

/** One line per track, for `list`. */
export function describeTrack(t: LibraryTrack): string {
  const mix = t.files.find((f) => f.role === "full_mix");
  const dur = mix?.audio?.durationSec;
  const parts = t.files.map((f) => (f.role === "stem" ? f.stemName : f.role));
  const voices = t.voices.map((v) => `${v.voice}/${v.lang}${v.timingOk ? "" : " (timing!)"}`);
  const secs = dur ? Math.round(dur) : null;
  return [
    `${t.trackId}  "${t.title}"`,
    secs !== null ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "length ?",
    `plan ${t.sunoPlan}`,
    `files: ${parts.join(", ")}`,
    `voices: ${voices.length ? voices.join(", ") : "none yet"}`,
  ].join(" | ");
}
