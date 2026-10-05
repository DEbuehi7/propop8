import type {
  ConfidenceDimension, DecisionConfidence, DecisionGate,
} from "../contracts/decision";
import type { RuntimePolicy } from "../contracts/policy";
import type { SignalFrame } from "../contracts/signal";

export function buildConfidence(
  signal: number, mapping: number, continuity: number, policy: number
): DecisionConfidence {
  const values = { signal, mapping, continuity, policy };
  const entries = Object.entries(values) as [ConfidenceDimension, number][];
  entries.sort(([na, a], [nb, b]) => a - b || na.localeCompare(nb));
  const [limitingDimension, aggregate] = entries[0];
  return { ...values, aggregate, limitingDimension };
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
