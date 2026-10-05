// lib/dance8/authoring/validateBundle.ts
//
// Pure, deterministic, non-throwing validator. Runs BEFORE the deterministic
// boundary. A bundle that fails here can never execute (laws 10 and 15).
// Issues are emitted in a fixed order, so the same input always yields the
// same result.

import type { BodyZone, MotionClip, MovementLevel, PoseDefinition } from "../contracts/motion";
import type { TransitionGraph } from "../contracts/transition";
import type { RuntimePolicy } from "../contracts/policy";
import type { MappingBundle } from "../contracts/mapping";
import type { AnalysisProfile, MusicSection } from "../contracts/signal";

// ---------- Inputs ----------

export interface PoseRegistry {
  version: number;
  poses: PoseDefinition[];
}

export interface MotionLibrary {
  version: number;
  clips: MotionClip[];
}

export interface ValidateBundleInput {
  bundle: MappingBundle;
  poses: PoseRegistry;
  library: MotionLibrary;
  graph: TransitionGraph;
  policy: RuntimePolicy;
  /** Optional but recommended: enables track/profile cross-checks. */
  analysisProfile?: AnalysisProfile;
}

export interface ValidateBundleOptions {
  /**
   * false (default): validate a draft/validated bundle (VALIDATE step).
   * true: also require approvalStatus === "approved" (runtime start).
   */
  requireApproved?: boolean;
}

// ---------- Outputs ----------

export type ValidationCode =
  | "schema_version"
  | "duplicate_id"
  | "invalid_number"
  | "invalid_range"
  | "invalid_enum"
  | "unknown_pose"
  | "unknown_clip"
  | "family_mismatch"
  | "version_mismatch"
  | "profile_mismatch"
  | "weights_invalid"
  | "thresholds_invalid"
  | "no_fallback"
  | "fallback_invalid"
  | "fallback_unreachable"
  | "fallback_dead_end"
  | "fallback_edge_target"
  | "not_approved"
  | "approval_incomplete";

export interface ValidationIssue {
  code: ValidationCode;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// ---------- Constants ----------

const WEIGHT_EPS = 1e-9;

const ZONES: readonly BodyZone[] = ["head", "arms", "torso", "hips", "legs", "feet"];
const LEVELS: readonly MovementLevel[] = ["floor", "low", "mid", "high"];
const SECTIONS: readonly MusicSection[] = [
  "intro", "verse", "build", "chorus", "break", "outro", "unknown",
];
const COM = ["low", "mid", "high"] as const;
const SUPPORT = ["left", "right", "both", "airborne"] as const;
const EXTENSION = ["none", "left", "right", "bilateral"] as const;

// ---------- Helpers ----------

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function inSet<T extends string>(v: unknown, set: readonly T[]): v is T {
  return typeof v === "string" && (set as readonly string[]).includes(v);
}

class Collector {
  readonly issues: ValidationIssue[] = [];
  add(code: ValidationCode, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }
}

/** Checks a [lo, hi] tuple: finite, lo <= hi, and optional bounds. */
function checkRange(
  c: Collector,
  path: string,
  r: readonly number[] | undefined,
  min: number | null,
  max: number | null
): void {
  if (!Array.isArray(r) || r.length !== 2) {
    c.add("invalid_range", path, "range must be a [low, high] pair");
    return;
  }
  const lo = r[0];
  const hi = r[1];
  if (!isNum(lo) || !isNum(hi)) {
    c.add("invalid_range", path, "range values must be finite numbers");
    return;
  }
  if (lo > hi) {
    c.add("invalid_range", path, `low (${lo}) exceeds high (${hi})`);
  }
  if (min !== null && lo < min) {
    c.add("invalid_range", path, `low (${lo}) is below minimum ${min}`);
  }
  if (max !== null && hi > max) {
    c.add("invalid_range", path, `high (${hi}) is above maximum ${max}`);
  }
}

function checkUnit(c: Collector, path: string, v: unknown): void {
  if (!isNum(v) || v < 0 || v > 1) {
    c.add("invalid_number", path, "must be a finite number in 0..1");
  }
}

function checkNonNegative(c: Collector, path: string, v: unknown): void {
  if (!isNum(v) || v < 0) {
    c.add("invalid_number", path, "must be a finite number >= 0");
  }
}

function checkPositiveInt(c: Collector, path: string, v: unknown): void {
  if (!isNum(v) || !Number.isInteger(v) || v < 1) {
    c.add("invalid_number", path, "must be an integer >= 1");
  }
}

// ---------- Section validators ----------

function validatePoses(c: Collector, poses: PoseRegistry): Set<string> {
  const ids = new Set<string>();
  poses.poses.forEach((p, i) => {
    const path = `poses.poses[${i}]`;
    if (ids.has(p.id)) {
      c.add("duplicate_id", `${path}.id`, `duplicate pose id "${p.id}"`);
    }
    ids.add(p.id);
    if (!inSet(p.centerOfMass, COM)) {
      c.add("invalid_enum", `${path}.centerOfMass`, `invalid value "${String(p.centerOfMass)}"`);
    }
    if (!inSet(p.support, SUPPORT)) {
      c.add("invalid_enum", `${path}.support`, `invalid value "${String(p.support)}"`);
    }
    if (!inSet(p.extension, EXTENSION)) {
      c.add("invalid_enum", `${path}.extension`, `invalid value "${String(p.extension)}"`);
    }
  });
  return ids;
}

function validateClips(
  c: Collector,
  library: MotionLibrary,
  poseIds: Set<string>,
  graphFamily: string
): Map<string, MotionClip> {
  const byId = new Map<string, MotionClip>();
  library.clips.forEach((clip, i) => {
    const path = `library.clips[${i}]`;
    if (byId.has(clip.id)) {
      c.add("duplicate_id", `${path}.id`, `duplicate clip id "${clip.id}"`);
    }
    byId.set(clip.id, clip);

    if (clip.schemaVersion !== 1) {
      c.add("schema_version", `${path}.schemaVersion`, "must be 1");
    }
    if (clip.dancerFamily !== graphFamily) {
      c.add(
        "family_mismatch",
        `${path}.dancerFamily`,
        `clip family "${clip.dancerFamily}" differs from graph family "${graphFamily}"`
      );
    }
    if (!poseIds.has(clip.entryPose)) {
      c.add("unknown_pose", `${path}.entryPose`, `pose "${clip.entryPose}" is not in the registry`);
    }
    if (!poseIds.has(clip.exitPose)) {
      c.add("unknown_pose", `${path}.exitPose`, `pose "${clip.exitPose}" is not in the registry`);
    }
    checkPositiveInt(c, `${path}.durationBeats`, clip.durationBeats);
    checkRange(c, `${path}.bpmRange`, clip.bpmRange, 1, null);
    checkRange(c, `${path}.energyRange`, clip.energyRange, 0, 1);
    if (!isNum(clip.rotationDeg)) {
      c.add("invalid_number", `${path}.rotationDeg`, "must be a finite number");
    }
    if (
      !Array.isArray(clip.travel) ||
      clip.travel.length !== 2 ||
      !isNum(clip.travel[0]) ||
      !isNum(clip.travel[1])
    ) {
      c.add("invalid_number", `${path}.travel`, "must be a [x, y] pair of finite numbers");
    }
    if (!inSet(clip.level, LEVELS)) {
      c.add("invalid_enum", `${path}.level`, `invalid value "${String(clip.level)}"`);
    }
    clip.dominantZones.forEach((z, zi) => {
      if (!inSet(z, ZONES)) {
        c.add("invalid_enum", `${path}.dominantZones[${zi}]`, `invalid zone "${String(z)}"`);
      }
    });
  });
  return byId;
}

function validatePolicy(c: Collector, policy: RuntimePolicy): void {
  if (policy.schemaVersion !== 1) {
    c.add("schema_version", "policy.schemaVersion", "must be 1");
  }

  checkUnit(c, "policy.executeMin", policy.executeMin);
  checkUnit(c, "policy.deferMin", policy.deferMin);
  checkUnit(c, "policy.escalateMin", policy.escalateMin);
  checkUnit(c, "policy.minimumSignalConfidence", policy.minimumSignalConfidence);
  checkUnit(c, "policy.minimumMappingConfidence", policy.minimumMappingConfidence);
  checkUnit(c, "policy.minimumContinuityConfidence", policy.minimumContinuityConfidence);
  checkUnit(c, "policy.minimumPolicyConfidence", policy.minimumPolicyConfidence);
  checkUnit(c, "policy.transitionMaxCost", policy.transitionMaxCost);

  if (!(policy.executeMin > policy.deferMin && policy.deferMin > policy.escalateMin)) {
    c.add(
      "thresholds_invalid",
      "policy",
      "require executeMin > deferMin > escalateMin"
    );
  }

  checkNonNegative(c, "policy.defaultBlendMs", policy.defaultBlendMs);
  checkNonNegative(c, "policy.maximumBlendMs", policy.maximumBlendMs);
  if (
    isNum(policy.defaultBlendMs) &&
    isNum(policy.maximumBlendMs) &&
    policy.defaultBlendMs > policy.maximumBlendMs
  ) {
    c.add("invalid_number", "policy.defaultBlendMs", "exceeds maximumBlendMs");
  }

  checkPositiveInt(c, "policy.planningHorizonBeats", policy.planningHorizonBeats);
  checkPositiveInt(c, "policy.maxLookaheadFrames", policy.maxLookaheadFrames);
  checkNonNegative(c, "policy.planningHorizonMs", policy.planningHorizonMs);
  checkNonNegative(c, "policy.repetitionPenaltyPerUse", policy.repetitionPenaltyPerUse);
  checkPositiveInt(c, "policy.repetitionWindowDecisions", policy.repetitionWindowDecisions);

  if (!isNum(policy.outputLatencyCompensationMs)) {
    c.add("invalid_number", "policy.outputLatencyCompensationMs", "must be a finite number (signed)");
  }

  // Scoring weights: each >= 0; the six fit weights sum to 1.0;
  // transitionCost is a separate subtractive coefficient.
  const w = policy.scoringWeights;
  const fitKeys = ["tempo", "energy", "section", "zone", "continuity", "novelty"] as const;
  let sum = 0;
  let weightsOk = true;
  for (const k of fitKeys) {
    const v = w[k];
    if (!isNum(v) || v < 0) {
      c.add("weights_invalid", `policy.scoringWeights.${k}`, "must be a finite number >= 0");
      weightsOk = false;
    } else {
      sum += v;
    }
  }
  if (!isNum(w.transitionCost) || w.transitionCost < 0) {
    c.add("weights_invalid", "policy.scoringWeights.transitionCost", "must be a finite number >= 0");
  }
  if (weightsOk && Math.abs(sum - 1) > WEIGHT_EPS) {
    c.add(
      "weights_invalid",
      "policy.scoringWeights",
      `tempo+energy+section+zone+continuity+novelty must sum to 1.0 (got ${sum})`
    );
  }
}

function validateGraph(
  c: Collector,
  graph: TransitionGraph,
  clips: Map<string, MotionClip>,
  policy: RuntimePolicy,
  fallbackIds: Set<string>
): void {
  if (graph.schemaVersion !== 1) {
    c.add("schema_version", "graph.schemaVersion", "must be 1");
  }
  const edgeIds = new Set<string>();
  graph.edges.forEach((e, i) => {
    const path = `graph.edges[${i}]`;
    if (edgeIds.has(e.id)) {
      c.add("duplicate_id", `${path}.id`, `duplicate edge id "${e.id}"`);
    }
    edgeIds.add(e.id);

    if (!clips.has(e.fromClipId)) {
      c.add("unknown_clip", `${path}.fromClipId`, `clip "${e.fromClipId}" does not exist`);
    }
    if (!clips.has(e.toClipId)) {
      c.add("unknown_clip", `${path}.toClipId`, `clip "${e.toClipId}" does not exist`);
    }
    if (e.bridgeClipId !== undefined && !clips.has(e.bridgeClipId)) {
      c.add("unknown_clip", `${path}.bridgeClipId`, `clip "${e.bridgeClipId}" does not exist`);
    }
    checkUnit(c, `${path}.cost`, e.cost);
    if (!isNum(e.blendMs) || e.blendMs < 0) {
      c.add("invalid_number", `${path}.blendMs`, "must be a finite number >= 0");
    } else if (isNum(policy.maximumBlendMs) && e.blendMs > policy.maximumBlendMs) {
      c.add("invalid_number", `${path}.blendMs`, `exceeds policy.maximumBlendMs (${policy.maximumBlendMs})`);
    }
    if (e.fallbackOnly === true && !fallbackIds.has(e.toClipId)) {
      c.add(
        "fallback_edge_target",
        `${path}.toClipId`,
        `fallbackOnly edge must target a safeFallbackClipIds clip, not "${e.toClipId}"`
      );
    }
  });
}

function validateFallbacks(
  c: Collector,
  policy: RuntimePolicy,
  graph: TransitionGraph,
  clips: Map<string, MotionClip>,
  poseIds: Set<string>
): Set<string> {
  const fallbackIds = new Set<string>();

  if (!Array.isArray(policy.safeFallbackClipIds) || policy.safeFallbackClipIds.length < 1) {
    c.add(
      "no_fallback",
      "policy.safeFallbackClipIds",
      "at least one safe fallback clip is required; the runtime never improvises one"
    );
    return fallbackIds;
  }

  policy.safeFallbackClipIds.forEach((id, i) => {
    const path = `policy.safeFallbackClipIds[${i}]`;
    if (fallbackIds.has(id)) {
      c.add("duplicate_id", path, `duplicate fallback id "${id}"`);
    }
    const clip = clips.get(id);
    if (clip === undefined) {
      c.add("fallback_invalid", path, `fallback clip "${id}" does not exist in the library`);
      return;
    }
    fallbackIds.add(id);
    if (clip.dancerFamily !== graph.dancerFamily) {
      c.add("fallback_invalid", path, `fallback clip "${id}" is in the wrong dancer family`);
    }
    if (!poseIds.has(clip.entryPose) || !poseIds.has(clip.exitPose)) {
      c.add("fallback_invalid", path, `fallback clip "${id}" has an undefined pose`);
    }
    // A fallback must be able to resume ordinary choreography afterwards.
    const canResume = graph.edges.some(
      e => e.fromClipId === id && e.compatible && e.fallbackOnly !== true
    );
    if (!canResume) {
      c.add(
        "fallback_dead_end",
        path,
        `fallback clip "${id}" has no compatible ordinary outgoing edge to resume from`
      );
    }
  });

  // Every non-fallback clip must have a compatible fallbackOnly edge into a safe fallback.
  clips.forEach((clip, clipId) => {
    if (fallbackIds.has(clipId)) return;
    const reachable = graph.edges.some(
      e =>
        e.fromClipId === clipId &&
        e.fallbackOnly === true &&
        e.compatible &&
        fallbackIds.has(e.toClipId)
    );
    if (!reachable) {
      c.add(
        "fallback_unreachable",
        `library.clips[id=${clipId}]`,
        `no compatible fallbackOnly edge from "${clipId}" into a safe fallback`
      );
    }
  });

  return fallbackIds;
}

function validateBundleRefs(
  c: Collector,
  input: ValidateBundleInput,
  options: ValidateBundleOptions
): void {
  const { bundle, library, graph, policy, analysisProfile } = input;

  if (bundle.schemaVersion !== 1) {
    c.add("schema_version", "bundle.schemaVersion", "must be 1");
  }

  if (bundle.motionLibraryVersion !== library.version) {
    c.add(
      "version_mismatch",
      "bundle.motionLibraryVersion",
      `bundle expects ${bundle.motionLibraryVersion}, library is ${library.version}`
    );
  }
  if (bundle.transitionGraphVersion !== graph.version) {
    c.add(
      "version_mismatch",
      "bundle.transitionGraphVersion",
      `bundle expects ${bundle.transitionGraphVersion}, graph is ${graph.version}`
    );
  }
  if (bundle.runtimePolicyVersion !== policy.version) {
    c.add(
      "version_mismatch",
      "bundle.runtimePolicyVersion",
      `bundle expects ${bundle.runtimePolicyVersion}, policy is ${policy.version}`
    );
  }

  if (analysisProfile !== undefined) {
    if (bundle.analysisProfileId !== analysisProfile.id) {
      c.add(
        "profile_mismatch",
        "bundle.analysisProfileId",
        `bundle references "${bundle.analysisProfileId}", profile is "${analysisProfile.id}"`
      );
    }
    if (bundle.trackId !== analysisProfile.trackId) {
      c.add(
        "profile_mismatch",
        "bundle.trackId",
        `bundle track "${bundle.trackId}" differs from profile track "${analysisProfile.trackId}"`
      );
    }
  }

  const ruleIds = new Set<string>();
  bundle.rules.forEach((r, i) => {
    const path = `bundle.rules[${i}]`;
    if (ruleIds.has(r.id)) {
      c.add("duplicate_id", `${path}.id`, `duplicate rule id "${r.id}"`);
    }
    ruleIds.add(r.id);
    checkNonNegative(c, `${path}.weight`, r.weight);
    if (r.energyRange !== undefined) checkRange(c, `${path}.energyRange`, r.energyRange, 0, 1);
    if (r.bpmRange !== undefined) checkRange(c, `${path}.bpmRange`, r.bpmRange, 1, null);
    r.sections?.forEach((s, si) => {
      if (!inSet(s, SECTIONS)) {
        c.add("invalid_enum", `${path}.sections[${si}]`, `invalid section "${String(s)}"`);
      }
    });
    r.preferredZones?.forEach((z, zi) => {
      if (!inSet(z, ZONES)) {
        c.add("invalid_enum", `${path}.preferredZones[${zi}]`, `invalid zone "${String(z)}"`);
      }
    });
  });

  if (bundle.approvalStatus === "approved") {
    if (!bundle.approvedAt || !bundle.approvedBy) {
      c.add(
        "approval_incomplete",
        "bundle",
        "approved bundles must record approvedAt and approvedBy"
      );
    }
  }
  if (options.requireApproved === true && bundle.approvalStatus !== "approved") {
    c.add(
      "not_approved",
      "bundle.approvalStatus",
      `bundle is "${bundle.approvalStatus}"; only "approved" bundles may run`
    );
  }
}

// ---------- Public API ----------

export function validateBundle(
  input: ValidateBundleInput,
  options: ValidateBundleOptions = {}
): ValidationResult {
  const c = new Collector();
  const { poses, library, graph, policy } = input;

  const poseIds = validatePoses(c, poses);
  const clips = validateClips(c, library, poseIds, graph.dancerFamily);
  validatePolicy(c, policy);
  const fallbackIds = validateFallbacks(c, policy, graph, clips, poseIds);
  validateGraph(c, graph, clips, policy, fallbackIds);
  validateBundleRefs(c, input, options);

  return { ok: c.issues.length === 0, issues: c.issues };
}

/** Convenience for runtime start: throws if the bundle is not safe to execute. */
export function assertRuntimeReady(input: ValidateBundleInput): void {
  const result = validateBundle(input, { requireApproved: true });
  if (!result.ok) {
    const lines = result.issues.map(i => `[${i.code}] ${i.path}: ${i.message}`);
    throw new Error(`MappingBundle rejected:\n${lines.join("\n")}`);
  }
}
