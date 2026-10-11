// lib/dance8/contracts/scene.ts
//
// Scene and camera layer for Dance8 music videos. The motion engine chooses
// how a dancer moves; this layer chooses WHICH pre-made video clip is on screen
// at each moment of the track (dance stage, Stuttr on the street, AIM-B5R...).
//
// Clips are made outside Dance8 (Kling or any other generator, or real
// footage). Dance8 never generates pixels; it plans cuts against the music.
// Same cue map + same clip library -> same cut plan, every time.

import type { MusicSection } from "./signal";

export type SceneId = string;

/** Camera framing of a clip. Kept small on purpose so cue maps stay readable. */
export type CameraShot =
  | "drone_wide"
  | "wide"
  | "medium"
  | "close"
  | "tracking"
  | "orbit";

export type AspectRatio = "9:16" | "16:9" | "4:5" | "1:1" | "21:9";

/** Output frame size for each aspect ratio (even numbers, 1080 short side). */
export const FRAME_SIZE: Record<AspectRatio, readonly [number, number]> = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "4:5": [1080, 1350],
  "1:1": [1080, 1080],
  "21:9": [2520, 1080],
};

/**
 * Drift check result for a generated clip, measured against its reference set.
 * status "unknown" means nobody has measured it yet; that is NOT a pass.
 * driftScore is 0 (matches the references) .. 1 (unrecognisable).
 */
export interface DriftCheck {
  status: "known" | "unknown";
  driftScore: number | null;
  method?: string; // e.g. "human_review", "face_embedding_cosine"
  checkedAt?: string;
}

export interface VisualClipSource {
  type: "ai_generated" | "recorded" | "human_authored";
  generator?: string; // e.g. "kling-3.0", "kling-3.0-turbo"
  /** Character / location reference pack used to generate this clip. */
  referenceSetId?: string;
  promptId?: string;
  createdAt: string;
  license: "proprietary" | "cc0" | "cc_by" | "cc_by_sa" | "unknown";
}

export interface VisualClip {
  id: string;
  schemaVersion: 1;
  sceneId: SceneId;
  camera: CameraShot;
  /** Usable length of the file in seconds. A shot can never be longer. */
  durationSec: number;
  aspect: AspectRatio;
  /** Relative path to the media file; resolved by the renderer, not here. */
  file: string;
  source: VisualClipSource;
  drift: DriftCheck;
  approvalStatus: "draft" | "approved" | "retired";
  /**
   * A singer's mouth is clearly on screen. Such a clip may only appear during
   * vocals if it is lip-synced to that exact moment (see lipSync), so viewers
   * never see a mouth that is out of sync with the song.
   */
  mouthVisible?: boolean;
  /**
   * Present on lip-synced clips: frame 0 of the file matches songStartSec of
   * the song for this voice. The planner may only place the clip where it
   * lines up with the song, which keeps the sync exact in every variation.
   */
  lipSync?: LipSyncLock;
}

export interface LipSyncLock {
  voice: string; // e.g. "Ja", "Bo", "JaBo"
  songStartSec: number;
}

/** A sung line. Bars are half-open, like cues. */
export interface VocalPhrase {
  id: string;
  voice: string;
  startBar: number;
  endBar: number;
  /** Lyric line, shown as a caption when lyric captions are on. */
  text?: string;
}

export interface VisualClipLibrary {
  version: number;
  clips: VisualClip[];
}

/** A run of bars at one tempo. Segments must start at bar 0 and ascend. */
export interface TempoSegment {
  startBar: number;
  bpm: number;
  beatsPerBar: number;
}

/**
 * One block of the song (usually one section). Bars are half-open:
 * a cue covers startBar <= bar < endBar.
 */
export interface Cue {
  id: string;
  section: MusicSection;
  startBar: number;
  endBar: number;
  sceneId: SceneId;
  /** Camera order to rotate through within this cue. */
  cameras: CameraShot[];
  /** Preferred shot length; shortened automatically if a clip is too short. */
  shotBars: number;
}

export interface CueMap {
  id: string;
  schemaVersion: 1;
  version: number;
  trackId: string;
  analysisProfileId: string;
  aspect: AspectRatio;
  tempo: TempoSegment[];
  cues: Cue[];
  /**
   * Stands in when no approved clip matches a cue's scene + camera, so a draft
   * can be previewed while footage is still being generated. Rendering with
   * requireApproved refuses any cue that would need it.
   */
  fallbackClipId: string;
  /** Approved clips must have a measured drift score at or below this. */
  maxDriftScore: number;
  /** Sung lines. Optional; without it no mouth rule applies. */
  vocals?: VocalPhrase[];
  approvalStatus: "draft" | "validated" | "approved";
  approvedBy?: string;
  approvedAt?: string;
}

export type CutReason =
  | "cue_rotation"
  | "shortened_to_clip"
  | "lip_sync"
  | "fallback_no_match";

/** One line of the edit decision list. */
export interface Cut {
  index: number;
  cueId: string;
  section: MusicSection;
  startBar: number;
  endBar: number;
  startSec: number;
  endSec: number;
  sceneId: SceneId;
  camera: CameraShot;
  clipId: string;
  /**
   * Where in the clip this shot starts. Re-using a clip continues from where
   * its last shot stopped (wrapping to 0 when the rest would not fit), so the
   * same opening seconds are not shown over and over.
   */
  clipInSec: number;
  reason: CutReason;
}
