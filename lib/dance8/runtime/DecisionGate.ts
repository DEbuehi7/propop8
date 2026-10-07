import type {
  ConfidenceDimension, DecisionConfidence, DecisionGate,
} from "../contracts/decision";
import type { RuntimePolicy } from "../contracts/policy";
import type { SignalFrame } from "../contracts/signal";
import type { CandidateScore } from "../contracts/decision";

export function buildConfidence(
  signal: number, mapping: number, continuity: number, policyConfidence: number
): DecisionConfidence {
  const values = { signal, mapping, continuity, policy: policyConfidence };
  const entries = Object.entries(values) as [ConfidenceDimension, number][];
  entries.sort(([na, a], [nb, b]) => a - b || na.localeCompare(nb));
  const [limitingDimension, aggregate] = entries[0];
  return { signal, mapping, continuity, policy: policyConfidence, aggregate, limitingDimension };
}

/** Semantic state precedes numeric confidence. */
export function resolveSignalState(frame: SignalFrame): DecisionGate | null {
  const required = [frame.bpm, frame.energy];
  if (required.some(s => s.status === "invalid")) return "kill";
  if (required.some(s => s.status === "unknown" || s.value === null)) return "defer";
  return null;
}

export function resolveGate(
  c: DecisionConfidence, policy: RuntimePolicy
): DecisionGate {
  if (c.aggregate >= policy.executeMin) return "execute";
  if (c.aggregate >= policy.deferMin) return "defer";
  if (c.aggregate >= policy.escalateMin) return "escalate";
  return "kill";
}

export function resolveDecisionGate(
  frame: SignalFrame,
  topScore: CandidateScore | null,
  policy: RuntimePolicy
): { gate: DecisionGate; confidence: DecisionConfidence } {
  // Check signal state first
  const signalGate = resolveSignalState(frame);
  if (signalGate) {
    const confidence: DecisionConfidence = {
      signal: 0,
      mapping: 0,
      continuity: 0,
      policy: 0,
      aggregate: 0,
      limitingDimension: "signal",
    };
    return { gate: signalGate, confidence };
  }

  // Build confidence from signal quality and top score
  const bpmConf = frame.bpm?.confidence ?? 0;
  const energyConf = frame.energy?.confidence ?? 0;
  const signalConf = (bpmConf + energyConf) / 2;

  const mappingConf =
    topScore &&
    topScore.sectionFit > 0 &&
    topScore.zoneFit > 0 &&
    topScore.continuityFit > 0
      ? 1.0
      : 0;

  const continuityConf = topScore ? topScore.continuityFit : 0;
  const policyConf = topScore ? topScore.total : 0;

  const confidence = buildConfidence(signalConf, mappingConf, continuityConf, policyConf);
  const gate = resolveGate(confidence, policy);

  return { gate, confidence };
}
