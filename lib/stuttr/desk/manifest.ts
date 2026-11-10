// lib/stuttr/desk/manifest.ts
//
// The Album Desk's contracts, versioned. Pure: types, validation and the
// starter manifest; no files.
//
// AlbumManifest   what the owner decides about an album: its tracks in order,
//                 each track's voice strategy and fictional performer roles,
//                 the album's rights state. Human-edited JSON.
// VoiceMap        private, local: which approved voice (by its name in the
//                 owner's ElevenLabs account) sings for each performer role.
//                 No voice ids, no keys; never in git.
// ValidationIssue one problem, with a code a person can search for, how bad
//                 it is, and the fix.
//
// Storage is PROVISIONAL: canon STU-04 (where Stuttr assets live and their
// rights chain) is open, so the desk keeps its records in the private Stuttr
// library beside library.json and labels them so.

import { slugify } from "../library";
import { VOICE_MODES, type VoiceMode } from "../album";

export const ALBUM_MANIFEST_SCHEMA = "stuttr-album-manifest-1" as const;
export const VOICE_MAP_SCHEMA = "stuttr-voice-map-1" as const;
export const STORAGE_LABEL = "PROVISIONAL (canon STU-04 is open: storage and the rights chain are not decided)";

export const RIGHTS_STATES = ["UNKNOWN", "PERSONAL_USE_ONLY", "CLEARED"] as const;
export type RightsState = (typeof RIGHTS_STATES)[number];
export const VOICE_STRATEGIES = ["KEEP_ORIGINAL", "CONVERT_APPROVED_SEGMENTS", "MANUAL_SPLIT_REQUIRED"] as const;
export type VoiceStrategy = (typeof VOICE_STRATEGIES)[number];

export interface ManifestTrack {
  trackNumber: number;
  title: string;
  /** The Stuttr library id; default: the title as a slug. */
  trackId?: string;
  /** Pins this track to a source: a folder or file path inside the drop (as the import report prints it). */
  source?: string;
  /** Suno's own song id, when the owner has it; matched against file names. */
  sunoSongId?: string;
  /** Which take this is, in the owner's words ("v2", "the long one"). */
  takeId?: string;
  /** Fictional performer roles who sing it (e.g. "NIKA NIKA"). Never inferred from audio. */
  performers?: string[];
  languages?: string[];
  /** Default KEEP_ORIGINAL: Suno's own vocals. */
  voiceStrategy?: VoiceStrategy;
  /** CONVERT_APPROVED_SEGMENTS only: solo (one voice for the lead), crew or cast (sections, cast.json). */
  mode?: VoiceMode;
}

export interface AlbumManifest {
  schemaVersion: typeof ALBUM_MANIFEST_SCHEMA;
  albumId: string;
  title: string;
  /** The Suno plan the songs were made under (commercial rights depend on it, STU-02). */
  sunoPlan?: string;
  rights: { state: RightsState; /** Where the owner keeps the evidence (a licence, a plan receipt): a note, never the document. */ reference?: string };
  tracks: ManifestTrack[];
}

export interface VoiceMapEntry {
  performer: string;
  /** The voice's name in the owner's ElevenLabs account (matched by name, like convert). */
  voice: string;
  /** How consent was given, in the owner's words ("my own synthetic voice, made by me"). */
  consent: string;
  approved: boolean;
  approvedAt?: string;
}

export interface VoiceMap {
  schemaVersion: typeof VOICE_MAP_SCHEMA;
  voices: VoiceMapEntry[];
}

export type Severity = "block" | "warn" | "info";
export interface ValidationIssue {
  code: string;
  severity: Severity;
  message: string;
  /** What to do about it. */
  fix?: string;
}

const issue = (code: string, severity: Severity, message: string, fix?: string): ValidationIssue => ({ code, severity, message, ...(fix ? { fix } : {}) });

export const trackIdOf = (t: ManifestTrack) => t.trackId ?? slugify(t.title);
export const strategyOf = (t: ManifestTrack): VoiceStrategy => t.voiceStrategy ?? "KEEP_ORIGINAL";

/** Everything wrong with a manifest, or []. */
export function validateManifest(m: AlbumManifest): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (m?.schemaVersion !== ALBUM_MANIFEST_SCHEMA) out.push(issue("MANIFEST_SCHEMA", "block", `schemaVersion must be "${ALBUM_MANIFEST_SCHEMA}"`));
  if (typeof m?.albumId !== "string" || !m.albumId || slugify(m.albumId) !== m.albumId) out.push(issue("MANIFEST_ALBUM_ID", "block", `albumId ${JSON.stringify(m?.albumId)} must be lowercase letters, digits and dashes`));
  if (typeof m?.title !== "string" || !m.title.trim()) out.push(issue("MANIFEST_TITLE", "block", "the album needs a title"));
  if (!m?.rights || !RIGHTS_STATES.includes(m.rights.state)) out.push(issue("MANIFEST_RIGHTS", "block", `rights.state must be one of ${RIGHTS_STATES.join(", ")}`, `use "UNKNOWN" until you have checked`));
  if (!Array.isArray(m?.tracks)) return [...out, issue("MANIFEST_TRACKS", "block", "tracks must be a list")];
  const numbers = new Set<number>();
  const ids = new Set<string>();
  for (const [i, t] of m.tracks.entries()) {
    const at = `track ${i + 1}`;
    if (!Number.isInteger(t?.trackNumber) || t.trackNumber < 1) out.push(issue("TRACK_NUMBER", "block", `${at}: trackNumber must be 1 or more`));
    else if (numbers.has(t.trackNumber)) out.push(issue("TRACK_NUMBER", "block", `${at}: track number ${t.trackNumber} is used twice`));
    else numbers.add(t.trackNumber);
    if (typeof t?.title !== "string" || !t.title.trim()) { out.push(issue("TRACK_TITLE", "block", `${at}: needs a title`)); continue; }
    const id = trackIdOf(t);
    if (!id || slugify(id) !== id) out.push(issue("TRACK_ID", "block", `${at}: trackId ${JSON.stringify(id)} must be a library id like "eight-bars"`));
    else if (ids.has(id)) out.push(issue("TRACK_ID", "block", `${at}: "${id}" is listed twice`));
    else ids.add(id);
    if (t.voiceStrategy !== undefined && !VOICE_STRATEGIES.includes(t.voiceStrategy)) out.push(issue("VOICE_STRATEGY", "block", `${at}: voiceStrategy must be ${VOICE_STRATEGIES.join(", ")}`));
    if (t.mode !== undefined && !VOICE_MODES.includes(t.mode)) out.push(issue("VOICE_MODE", "block", `${at}: mode must be ${VOICE_MODES.join(", ")}`));
    if (strategyOf(t) === "CONVERT_APPROVED_SEGMENTS" && !t.mode) out.push(issue("VOICE_MODE", "block", `${at}: CONVERT_APPROVED_SEGMENTS needs a mode (solo, crew or cast)`));
    if (t.performers !== undefined && (!Array.isArray(t.performers) || t.performers.some((p) => typeof p !== "string" || !p.trim()))) out.push(issue("PERFORMERS", "block", `${at}: performers must be a list of names`));
    if (t.source !== undefined && (typeof t.source !== "string" || t.source.includes("..") || t.source.startsWith("/"))) out.push(issue("TRACK_SOURCE", "block", `${at}: source must be a path inside the drop, as the import report prints it`));
  }
  return out;
}

/** A starter manifest from what an import found: titles in the order found, everything else at its safe default. */
export function starterManifest(albumId: string, title: string, found: { title: string; source: string }[], sunoPlan?: string): AlbumManifest {
  return {
    schemaVersion: ALBUM_MANIFEST_SCHEMA, albumId, title, ...(sunoPlan ? { sunoPlan } : {}),
    rights: { state: "UNKNOWN" },
    tracks: found.map((f, i) => ({ trackNumber: i + 1, title: f.title, source: f.source, performers: [], voiceStrategy: "KEEP_ORIGINAL" as const })),
  };
}

export function validateVoiceMap(v: VoiceMap): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (v?.schemaVersion !== VOICE_MAP_SCHEMA) out.push(issue("VOICE_MAP_SCHEMA", "block", `schemaVersion must be "${VOICE_MAP_SCHEMA}"`));
  if (!Array.isArray(v?.voices)) return [...out, issue("VOICE_MAP", "block", "voices must be a list")];
  const seen = new Set<string>();
  for (const e of v.voices) {
    if (typeof e?.performer !== "string" || !e.performer.trim()) { out.push(issue("VOICE_MAP", "block", "every entry needs a performer")); continue; }
    if (seen.has(e.performer)) out.push(issue("VOICE_MAP", "block", `${e.performer} is listed twice`));
    seen.add(e.performer);
    if (typeof e.voice !== "string" || !e.voice.trim()) out.push(issue("VOICE_MAP", "block", `${e.performer}: needs the voice's name`));
    if (/^[A-Za-z0-9]{20,}$/.test(e.voice ?? "")) out.push(issue("VOICE_MAP_ID", "block", `${e.performer}: looks like a voice id; give the voice's name, never its id`));
    if (typeof e.consent !== "string" || !e.consent.trim()) out.push(issue("VOICE_CONSENT", "block", `${e.performer}: say how consent was given`));
    if (typeof e.approved !== "boolean") out.push(issue("VOICE_MAP", "block", `${e.performer}: approved must be true or false`));
  }
  return out;
}
