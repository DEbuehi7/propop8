export interface ScoringWeights {
  tempo: number;
  energy: number;
  section: number;
  zone: number;
  continuity: number;
  novelty: number;
  transitionCost: number;
}

export interface RuntimePolicy {
  id: string;
  schemaVersion: 1;
  version: number;

  executeMin: number;
  deferMin: number;
  escalateMin: number;

  minimumSignalConfidence: number;
  minimumMappingConfidence: number;
  minimumContinuityConfidence: number;
  minimumPolicyConfidence: number;

  transitionMaxCost: number;
  defaultBlendMs: number;
  maximumBlendMs: number;

  planningHorizonBeats: number;
  planningHorizonMs: number;
  maxLookaheadFrames: number;

  scoringWeights: ScoringWeights; // must sum (excluding transitionCost) to 1.0

  /** Validation requires length >= 1; every ID must exist and be a valid fallback. */
  safeFallbackClipIds: string[];

  /** Signed. Positive delays visuals, negative advances them. */
  outputLatencyCompensationMs: number;

  /** Applied per recent use of a clip within the repetition window. */
  repetitionPenaltyPerUse: number;
  repetitionWindowDecisions: number;
}
