export type BodyZone = "head" | "arms" | "torso" | "hips" | "legs" | "feet";
export type MovementLevel = "floor" | "low" | "mid" | "high";
export type PoseId = string;

export interface PoseDefinition {
  id: PoseId;
  version: number;
  centerOfMass: "low" | "mid" | "high";
  support: "left" | "right" | "both" | "airborne";
  extension: "none" | "left" | "right" | "bilateral";
  tags: string[];
}

export interface MotionSource {
  type: "mocap" | "recorded" | "procedural" | "human_authored" | "ai_generated";
  createdBy: string;
  createdAt: string;
  recordingSessionId?: string;
  license: "proprietary" | "cc0" | "cc_by" | "cc_by_sa" | "unknown";
  attribution?: string;
}

export interface MotionClip {
  id: string;
  schemaVersion: 1;
  version: number;
  dancerFamily: string;
  durationBeats: number;
  bpmRange: readonly [number, number];
  energyRange: readonly [number, number];
  entryPose: PoseId;
  exitPose: PoseId;
  dominantZones: BodyZone[];
  travel: readonly [number, number];
  rotationDeg: number;
  level: MovementLevel;
  tags: string[];
  source: MotionSource;
}
