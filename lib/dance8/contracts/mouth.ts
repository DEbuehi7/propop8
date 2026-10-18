// lib/dance8/contracts/mouth.ts
//
// A mouth track: how open a singer's mouth is on every video frame, measured
// from an approved voice take (D8-14: approved media derivatives only). It
// runs on the song's audio clock in seconds, never on bars (D8-02), at the
// 24 fps sync reference (D8-03). The values are computed, never guessed.

export interface MouthParams {
  /** Frames quieter than this (dBFS) are closed. */
  gateDb: number;
  /** Loudness range mapped onto closed..open, in dB below the reference. */
  rangeDb: number;
  /** The reference ("fully open") is this percentile of the voiced frames' loudness. */
  refPercentile: number;
  /** How far the mouth may close per frame (opening is immediate). */
  closePerFrame: number;
}

export interface MouthTrack {
  id: string;
  schemaVersion: 1;
  trackId: string;
  voice: string;
  lang: string;
  role: "vocals" | "backing_vocals";
  /** The approved take this was measured from (library-relative path). */
  source: { path: string; sha256: string };
  clock: "song_seconds";
  fps: number;
  /** Song time of frame 0, in seconds. */
  startSec: number;
  /** Openness per frame: 0 closed, 1 widest. Three decimals. */
  open: number[];
  params: MouthParams;
  /** Reference loudness that counted as fully open, in dBFS (for review). */
  refDb: number | null;
}
