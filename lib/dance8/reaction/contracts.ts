// lib/dance8/reaction/contracts.ts
//
// The visual reaction layer (canon D8-25): an optional, deterministic overlay
// drawn from a saved Stuttr feature track (lib/stuttr/visualFeatures.ts) and
// from musical or movement events a person has verified. Three families:
//
//   GENOME_LOOM         warp threads and travelling weft knots
//   ALGORITHMIC_CYPHER  a stage ring and three floor rays with light runners
//   RESONANCE_CHAMBER   triadic contours with ripples and spikes
//
// Everything is on the musical clock (D8-02). Energy and onset-like values are
// MEASURED; a beat, chord change, move word or lyric chop is drawn only when a
// named person has VERIFIED it, otherwise it is HOLD and draws nothing. The
// layer is a visual effect: it never claims instrument control, live sensing,
// laboratory measurement or remixing, and it never touches a master or a
// locked choreography rule (D8-06, D8-16, D8-17). Pure types and constants.

export const REACTION_TRACK_SCHEMA = "dance8-reaction-track-1";
export const REACTION_MANIFEST_SCHEMA = "dance8-reaction-manifest-1";
export const REACTION_RENDERER = "dance8-reaction-0.1.0";

export const FAMILIES = ["GENOME_LOOM", "ALGORITHMIC_CYPHER", "RESONANCE_CHAMBER"] as const;
export type Family = (typeof FAMILIES)[number];

/** Events a person must verify before they are drawn. */
export const VERIFIED_KINDS = ["beat", "chord_change", "move_word", "lyric_chop"] as const;
export type VerifiedKind = (typeof VERIFIED_KINDS)[number];
export type EventKind = "energy_envelope" | "onset_like" | VerifiedKind;

/**
 * MEASURED: computed from the audio (energy, not musical meaning).
 * VERIFIED: checked by a named person.
 * HOLD: needed and missing, so nothing is drawn.
 */
export type EvidenceState = "MEASURED" | "VERIFIED" | "HOLD";

export const INTENSITIES = { low: 0.55, medium: 0.8, high: 1 } as const;
export type Intensity = keyof typeof INTENSITIES;

/** Where a family may draw, as fractions of the frame, so faces, mouths and captions stay clear. */
export interface Zone { x: number; y: number; w: number; h: number }

export const DEFAULT_ZONES: Record<Family, Zone> = {
  GENOME_LOOM: { x: 0.04, y: 0.62, w: 0.92, h: 0.3 },
  ALGORITHMIC_CYPHER: { x: 0.1, y: 0.78, w: 0.8, h: 0.21 },
  RESONANCE_CHAMBER: { x: 0.62, y: 0.5, w: 0.36, h: 0.46 },
};

/** A window of the song to draw over, as an editor places it (editorial, not beat-verified). */
export interface WindowSpec {
  id: string;
  family: Family;
  /** The scene under it (SC06), for the editor's reference only. */
  scene?: string;
  musicStartSec: number;
  musicEndSec: number;
  intensity?: Intensity;
  zone?: Zone;
  seed?: number;
}

/** A musical or movement event a person checked. */
export interface VerifiedEventInput {
  kind: VerifiedKind;
  musicSec: number;
  /** A chord ("Em"), a move word ("RA"), a lyric word; shown only in the caption file, never painted. */
  label?: string;
  evidence: { state: string; reviewer?: string; source?: string };
}

export interface ReactionEvent {
  id: string;
  window: string;
  family: Family;
  kind: EventKind;
  clock: "MUSIC";
  musicalTimeSec: number;
  durationSec: number;
  /** Frame on the musical clock: round(musicalTimeSec * fps). */
  frame: number;
  sourceSha256: string;
  visualSeed: number;
  evidenceState: EvidenceState;
  reviewer: string | null;
  label: string | null;
  /** What the event may and may not be read as. */
  note: string;
}

export interface PlannedWindow {
  id: string;
  family: Family;
  scene: string | null;
  musicStartSec: number;
  musicEndSec: number;
  /** First frame on the musical clock. */
  startFrame: number;
  frames: number;
  /** How far the editor's times moved to land on the frame grid, in seconds. */
  snapShiftSec: number;
  intensity: Intensity;
  zone: Zone;
  seed: number;
  /** The geometry is a visual idea, not a measured or built thing (TRI-06). */
  geometry: "CONCEPTUAL";
  renderable: boolean;
}

export interface Hold {
  window: string | null;
  kind: EventKind | "window" | "features";
  reason: string;
}

export interface ReactionTrack {
  schema: typeof REACTION_TRACK_SCHEMA;
  renderer: typeof REACTION_RENDERER;
  songId: string;
  /** sha256 of the feature file's text and of the audio it measured. */
  features: { sha256: string; sourceSha256: string; analyzer: string };
  fps: { num: number; den: number };
  reducedMotion: boolean;
  windows: PlannedWindow[];
  events: ReactionEvent[];
  holds: Hold[];
  /** Never set by code: a person marks the track reviewed. */
  uiStatus: "DRAFT";
  limits: readonly string[];
}

export const REACTION_LIMITS: readonly string[] = [
  "A visual effect drawn from measured audio energy: not instrument control, live sensing, laboratory measurement or remixing.",
  "Onset-like pulses are energy peaks, never verified beats. Beats, chord changes, move words and lyric chops are drawn only when a named person verified them; otherwise they are HOLD.",
  "The music, the masters and the choreography rules (D8-06, D8-16, D8-17) are unchanged; the overlays are silent.",
  "Windows are editorial placements, not measured beat or lyric boundaries.",
];
