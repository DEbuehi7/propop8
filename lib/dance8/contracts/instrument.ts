// lib/dance8/contracts/instrument.ts
//
// The Kirtled instrument as a performer (docs/DANCE8_OCULAR_DIRECTOR.md,
// "Instrument cameras"). Two cameras show it on its own, independent of the
// studio cameras, and either can lead a grid:
//
//   CAM-KIR-01  instrument isolation, overhead: the whole instrument in its
//               canon geometry (D8-21) and the hands playing it. Mandatory.
//   CAM-KIR-02  performance detail, close: fingers, single triangles and the
//               light that answers them.
//
// What the instrument does on screen comes from an event map, never from the
// picture: each event records the playing (which triangle, when, which hand),
// the musical event it stands for (a chord of the song's harmony timeline),
// the light and dancer response, and what the camera does. The song is
// prerecorded, so the map is authored and approved by a person; the video
// never claims the instrument made the recording (the harmony contract's
// sounding: false, D8-25).
//
// Files: <song>/dance8/<song>.kirtled-events.json (the event map) and
// <song>/dance8/<song>.principals.json (who and what must have its own view
// before a multi-camera composition is approved).

export type InstrumentCamera = "CAM-KIR-01" | "CAM-KIR-02";

export const INSTRUMENT_CAMERAS: Record<InstrumentCamera, { name: string; shows: string; required: boolean }> = {
  "CAM-KIR-01": { name: "Instrument isolation (overhead)", shows: "the whole instrument from above in its fixed geometry, and the playing hands", required: true },
  "CAM-KIR-02": { name: "Performance detail (close-up)", shows: "finger movements, single triangles and their light response", required: false },
};

export type KirtledArmId = "A" | "B" | "C";

/** A triangle of the instrument: its arm and its place on the strip, 1 next to the hub to 8 at the tip ("A1" .. "C8"). */
export type TriangleId = `${KirtledArmId}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export interface KirtledPlayEvent {
  id: string;
  /** 0-based bar and beat on the cue map's grid; the beat may be fractional, on a sixteenth. */
  bar: number;
  beat: number;
  /** 1. The playing: which triangle, and which hand. */
  play: { triangle: TriangleId; hand: "left" | "right" };
  /** 2. The musical event it stands for: a chord change of the song's harmony timeline. It adds no sound. */
  music: { harmonyEventId: string; chord: string };
  /** 3. The answer on screen: the chord's own triangles light (one, or two for a seventh), and the dancers step or hold. */
  visual: { lights: TriangleId[]; dancers: "step" | "hold" | "none" };
  /** 4. The camera: hold, enlarge the instrument cell, or switch to the other instrument camera. Changes land on bar lines. */
  camera: { action: "hold" | "enlarge" | "switch"; to?: InstrumentCamera };
}

export interface KirtledEventMap {
  id: string;
  schemaVersion: 1;
  trackId: string;
  /** The harmony timeline (<song>/dance8/<song>.harmony.json) the chords come from. */
  harmonyTimelineId: string;
  /** The song exists before the performance; the map is authored, not captured. */
  source: "prerecorded";
  /** Who plays: EDO EDO BOY (canon D8-24, KIRTLED_PLAYER), unless a map names another cast id. */
  performer: string | null;
  status: "draft" | "approved";
  approvedBy?: string;
  approvedAt?: string;
  events: KirtledPlayEvent[];
}

/** Who and what in a song must have a view of its own. */
export interface Principal {
  id: string;
  kind: "performer" | "instrument" | "object";
  name: string;
}

export interface PrincipalList {
  schemaVersion: 1;
  trackId: string;
  principals: Principal[];
}

/** The id the Kirtled instrument goes by in a principal list. */
export const KIRTLED_PRINCIPAL = "kirtled";
