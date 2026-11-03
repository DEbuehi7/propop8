// lib/late8/audiobook.ts
//
// The Late8 audiobook: one published book as a manifest (audiobook.json) next
// to its audio in Cloudflare R2, never in git (canon PL8-09). The Stuttr
// library side builds it (lib/stuttr/audiobookCommands.ts); the Late8 page
// reads it through /api/late8/audiobook and plays it. The narration's own
// timing is the only clock: transcript times come from the transcript file,
// never from a model. Pure: shared by the CLI, the API route and the player.

export const AUDIOBOOK_SCHEMA = 1 as const;
export const MANIFEST_FILE = "audiobook.json";

export interface TranscriptLine {
  /** Seconds into the chapter, when the transcript gives it. */
  t: number | null;
  speaker: string | null;
  text: string;
}

export interface AudiobookChapter {
  id: string;
  number: number;
  title: string;
  mission: string | null;
  narrator: string | null;
  characters: string[];
  scene: string | null;
  location: string | null;
  /** The audio file, relative to the manifest. */
  audio: string;
  durationSec: number;
  sha256: string;
  cover: string | null;
  transcript: TranscriptLine[];
}

export interface AudiobookManifest {
  schema: typeof AUDIOBOOK_SCHEMA;
  bookId: string;
  series: string;
  title: string;
  author: string | null;
  cover: string | null;
  publishedAt: string;
  chapters: AudiobookChapter[];
}

const TIME = /^\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]\s*/;
const SPEAKER = /^([A-Z][\w .'-]{0,30}):\s+(.+)$/;

/**
 * Transcript lines: "[mm:ss.xx] Speaker: text", "Speaker: text" or plain
 * text; blank lines and # comments are skipped. Times must not go backwards.
 */
export function parseTranscript(text: string): { lines: TranscriptLine[]; issues: string[] } {
  const lines: TranscriptLine[] = [];
  const issues: string[] = [];
  let last = -1;
  text.split(/\r?\n/).forEach((raw, i) => {
    let s = raw.trim();
    if (!s || s.startsWith("#")) return;
    let t: number | null = null;
    const m = TIME.exec(s);
    if (m) {
      t = Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000) / 1000;
      s = s.slice(m[0].length);
      if (t < last) issues.push(`line ${i + 1}: ${raw.trim().slice(0, 12)} is earlier than the line before`);
      last = Math.max(last, t);
    }
    const sp = SPEAKER.exec(s);
    lines.push(sp ? { t, speaker: sp[1].trim(), text: sp[2].trim() } : { t, speaker: null, text: s });
  });
  return { lines, issues };
}

/** The line being read at `sec`: the last timed line at or before it, or -1. */
export function lineAt(lines: TranscriptLine[], sec: number): number {
  let hit = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    if (t !== null && t <= sec + 1e-6) hit = i;
  }
  return hit;
}

/** A chapter goes out only when its text says status: approved and rights: cleared (canon STU-02). */
export function publishable(fields: Record<string, string>): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!fields.title) reasons.push('no "title:"');
  if ((fields.status ?? "").toLowerCase() !== "approved") reasons.push('"status:" is not approved');
  if ((fields.rights ?? "").toLowerCase() !== "cleared") reasons.push('"rights:" is not cleared (music, voice and likeness rights first, canon STU-02)');
  return { ok: reasons.length === 0, reasons };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** A file path inside the book's folder: no scheme, no leading slash, no "..". */
const safeRel = (v: unknown): string | null =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v) && !v.split("/").includes("..") ? v : null;

/**
 * Checks a manifest read from R2 (it is data from outside the app): the right
 * schema, at least one chapter, every chapter with audio and a duration, and
 * every file path relative to the manifest. Returns null with the reasons
 * when it can't be played.
 */
export function validateManifest(raw: unknown): { manifest: AudiobookManifest | null; issues: string[] } {
  const issues: string[] = [];
  if (!isObj(raw)) return { manifest: null, issues: ["not a JSON object"] };
  if (raw.schema !== AUDIOBOOK_SCHEMA) issues.push(`schema is ${String(raw.schema)}, expected ${AUDIOBOOK_SCHEMA}`);
  const bookId = strOrNull(raw.bookId);
  const title = strOrNull(raw.title);
  if (!bookId || !title) issues.push("no bookId or title");
  const chapters: AudiobookChapter[] = [];
  for (const [i, c] of (Array.isArray(raw.chapters) ? raw.chapters : []).entries()) {
    if (!isObj(c)) { issues.push(`chapter ${i + 1} is not an object`); continue; }
    const audio = safeRel(c.audio);
    const id = strOrNull(c.id);
    const ct = strOrNull(c.title);
    const dur = typeof c.durationSec === "number" && Number.isFinite(c.durationSec) && c.durationSec > 0 ? c.durationSec : null;
    if (!audio || !id || !ct || dur === null) { issues.push(`chapter ${i + 1} has no id, title, audio path or duration`); continue; }
    const transcript = (Array.isArray(c.transcript) ? c.transcript : []).filter(isObj).map((l) => ({
      t: typeof l.t === "number" && Number.isFinite(l.t) && l.t >= 0 ? l.t : null,
      speaker: strOrNull(l.speaker),
      text: typeof l.text === "string" ? l.text : "",
    })).filter((l) => l.text);
    chapters.push({
      id, number: Number.isInteger(c.number) ? (c.number as number) : i + 1, title: ct,
      mission: strOrNull(c.mission), narrator: strOrNull(c.narrator),
      characters: Array.isArray(c.characters) ? c.characters.filter((x): x is string => typeof x === "string" && !!x.trim()) : [],
      scene: strOrNull(c.scene), location: strOrNull(c.location),
      audio, durationSec: dur, sha256: typeof c.sha256 === "string" ? c.sha256 : "", cover: safeRel(c.cover), transcript,
    });
  }
  if (!chapters.length) issues.push("no playable chapter");
  if (issues.length && (!bookId || !title || !chapters.length || raw.schema !== AUDIOBOOK_SCHEMA)) return { manifest: null, issues };
  return {
    manifest: {
      schema: AUDIOBOOK_SCHEMA, bookId: bookId!, title: title!, series: strOrNull(raw.series) ?? title!, author: strOrNull(raw.author),
      cover: safeRel(raw.cover), publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : "", chapters,
    },
    issues,
  };
}

/** The manifest with every file path made absolute against the manifest's own URL (https only). */
export function withAbsoluteUrls(m: AudiobookManifest, manifestUrl: string): AudiobookManifest {
  const base = new URL(manifestUrl);
  if (base.protocol !== "https:") throw new Error("the audiobook URL must be https");
  const abs = (p: string | null) => (p ? new URL(p, base).toString() : null);
  return { ...m, cover: abs(m.cover), chapters: m.chapters.map((c) => ({ ...c, audio: abs(c.audio)!, cover: abs(c.cover) })) };
}

/** "1:05:09" or "4:07". */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
