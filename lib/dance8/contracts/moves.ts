// lib/dance8/contracts/moves.ts
//
// The owner's filmed dance (canon D8-17). Three records, kept apart because
// they run on different clocks (D8-02):
//
//   PoseCapture  what the camera saw: body points per video frame, on the
//                capture clock (seconds into the video). Measured once.
//   CaptureSync  the checked link between the two clocks: the song second at
//                video second 0, found by matching the song's onset pattern.
//   MoveTrack    the dance on the musical clock: per-beat motion and the
//                Kirtled words, derived from the two above. Rebuilt any time.
//
// None of these go in the repo: the video and body data stay in the owner's
// Stuttr library. Tests use synthetic dancers only.

import type { BodyZone, MotionSource, MovementLevel } from "./motion";

/** MediaPipe Pose Landmarker's 33 body points, in its index order. */
export const POSE_POINTS = [
  "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye", "right_eye_outer",
  "left_ear", "right_ear", "mouth_left", "mouth_right", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel",
  "left_foot_index", "right_foot_index",
] as const;
export type PosePointName = (typeof POSE_POINTS)[number];
export const P = Object.fromEntries(POSE_POINTS.map((n, i) => [n, i])) as Record<PosePointName, number>;

/**
 * One video frame. `image` is 33 × [x, y, z, visibility] flattened, x and y as
 * fractions of the frame's width and height (y down). `world` is the same in
 * metres from the hip midpoint (y down, z away from the camera). Null when no
 * body was found in the frame.
 */
export interface PoseFrame {
  /** Capture seconds (video presentation time). */
  t: number;
  image: number[] | null;
  world: number[] | null;
}

export interface PoseCapture {
  schemaVersion: 1;
  takeId: string;
  video: {
    /** File name only; the video stays where the owner keeps it. */
    file: string;
    sha256: string;
    width: number;
    height: number;
    durationSec: number;
    /** Presentation time of the first video frame and first audio sample (ffprobe start_time). */
    videoStartSec: number;
    audioStartSec: number | null;
  };
  /** Frames are sampled at exactly this rate from videoStartSec. */
  fps: number;
  model: { id: string; sha256: string; library: string; delegate: "GPU" | "CPU" };
  capturedAt: string;
  frames: PoseFrame[];
}

export interface CaptureSync {
  method: "onset_match" | "manual";
  /** songSec = captureSec + songAtCapture0. */
  songAtCapture0: number;
  /** Correlation of the onset patterns at the match, and the best one at least a second away from it. */
  r: number | null;
  rNext: number | null;
  /** The match measured on each half of the take separately; their difference. */
  driftMs: number | null;
  /** How much of the take overlaps the song, in seconds. */
  overlapSec: number | null;
  status: "checked" | "manual";
  checkedAt: string;
}

export type MoveWordId = "DO" | "RA" | "LA" | "KA" | "TI" | "FREEZE";
export type MoveName = "STOMP" | "ROLL" | "FLIP" | "SPIN" | "JUMP" | "FREEZE";

export interface MoveBeat {
  /** Beats from bar 0's downbeat (bar × beats per bar + beat in bar). */
  beat: number;
  bar: number;
  beatInBar: number;
  songSec: number;
  status: "known" | "unknown";
  /** Mean visibility of the core joints times the share of frames with a body. */
  confidence: number;
  /** 0-1: mean joint speed against a vigorous reference (ENERGY_FULL). */
  energy: number | null;
  level: MovementLevel | null;
  /** Hip height over the floor against standing height: about 1 standing, under 0.4 on the floor. */
  levelRatio: number | null;
  /** The body zones leading this beat, strongest first. */
  zones: BodyZone[];
  /** Hip travel over the beat in body-widths: x screen-right, depth toward the camera. */
  travel: { x: number; toward: number } | null;
  /** Signed turn over the beat in degrees. */
  turnDeg: number | null;
  airborne: boolean | null;
  still: boolean | null;
  /** Where in the beat the body moves fastest, as a fraction of a beat (-0.5 to 0.5; 0 is on the beat). */
  accent: number | null;
}

export interface MoveWord {
  word: MoveWordId;
  move: MoveName;
  songSec: number;
  bar: number;
  /** Beat in bar, with a fraction: 1.5 is halfway between beats 2 and 3 (counting from 0). */
  beatInBar: number;
  /** STOMP impact speed, ROLL body-widths, FLIP level change, SPIN degrees, JUMP height (m), FREEZE beats held. */
  size: number;
  detail: string;
}

export interface MoveTrack {
  schemaVersion: 1;
  analyzer: string;
  trackId: string;
  takeId: string;
  source: MotionSource;
  sync: CaptureSync;
  beats: MoveBeat[];
  words: MoveWord[];
  coverage: { fromBar: number; toBar: number; beats: number; knownBeats: number };
  approvalStatus: "draft" | "approved" | "retired";
  createdAt: string;
}
