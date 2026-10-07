export type DecisionGate = "execute" | "defer" | "escalate" | "kill"; // EDO-4
export type DecisionLevel = "section" | "phrase" | "move" | "transition";
export type ConfidenceDimension = "signal" | "mapping" | "continuity" | "policy";

export interface DecisionConfidence {
  signal: number;
  mapping: number;
  continuity: number;
  policy: number;
  aggregate: number; // min of the four, never the average
  limitingDimension: ConfidenceDimension;
}

export interface CandidateScore {
  clipId: string;
  tempoFit: number;
  energyFit: number;
  sectionFit: number;
  zoneFit: number;
  continuityFit: number;
  noveltyFit: number;
  transitionCost: number;
  repetitionPenalty: number;
  total: number;
}

export type ReasonCode =
  | "best_candidate"
  | "low_signal_confidence"
  | "low_mapping_confidence"
  | "unknown_input"        // added: unknown required signal → DEFER
  | "invalid_input"        // invalid required signal → KILL
  | "transition_unavailable"
  | "policy_rejected"
  | "fallback_selected"
  | "runtime_failure";

export interface DecisionTrace {
  id: string; // stable: `${trackId}:${level}:${beat}`, never random
  parentId?: string;
  level: DecisionLevel;
  atBeat: number;
  atTime: number;
  candidateScores: CandidateScore[];
  selectedId?: string;
  confidence: DecisionConfidence;
  gate: DecisionGate;
  analysisProfileId: string;
  transitionGraphVersion: number;
  runtimePolicyVersion: number;
  mappingBundleVersion: number;
  reasonCode: ReasonCode;
}

/** Engineering allocation (EDO-3). Keep OUT of the runtime domain. */
export type DeliveryRoute = "execute" | "delegate" | "outsource";
