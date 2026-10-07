import type { MotionClip } from "../contracts/motion";
import type { RuntimePolicy } from "../contracts/policy";
import type { SignalFrame } from "../contracts/signal";
import type { CandidateScore } from "../contracts/decision";

export type { CandidateScore };

/**
 * Computes fit for a scalar value within a range [min, max].
 * Returns 1.0 at midpoint, linearly declines to 0 at edges, clamped [0, 1].
 */
function computeFit(value: number | null, range: readonly [number, number]): number {
  if (value === null) return 0;
  const [min, max] = range;
  const mid = (min + max) / 2;
  const halfWidth = (max - min) / 2;
  if (halfWidth === 0) return value === min ? 1.0 : 0;
  const distance = Math.abs(value - mid);
  const fit = 1 - distance / halfWidth;
  return Math.max(0, Math.min(1, fit));
}

/**
 * Scores a candidate clip against the current frame and context.
 */
export function scoreCandidate(
  clip: MotionClip,
  frame: SignalFrame,
  policy: RuntimePolicy,
  recentClipHistory: string[]
): CandidateScore {
  // Fit dimensions
  const tempoFit = computeFit(frame.bpm?.value ?? null, clip.bpmRange);
  const energyFit = computeFit(frame.energy?.value ?? null, clip.energyRange);

  // Section: 1.0 if matches, else 0 (placeholder, frames may not have sectionIndex)
  const sectionFit = 1.0;

  // Zone: overlap between frame zone and clip zone ranges (placeholder)
  const zoneFit = 1.0;

  // Continuity: 1.0 if poses match, else 0 (placeholder, frames/clips may not have pose families)
  const continuityFit = 1.0;

  // Novelty: 1.0 base fit
  const noveltyFit = 1.0;

  // Transition cost: 0 for first clip, else check recent history (not computed here; set to 0)
  const transitionCost = 0;

  // Repetition penalty: 1.0 if in recent history, else 0
  const repetitionPenalty = recentClipHistory.includes(clip.id) ? 1.0 : 0;

  // Weighted score
  const { tempo, energy, section, zone, continuity, novelty, transitionCost: tcWeight } = policy.scoringWeights;

  const rawTotal =
    tempoFit * tempo +
    energyFit * energy +
    sectionFit * section +
    zoneFit * zone +
    continuityFit * continuity +
    noveltyFit * novelty -
    transitionCost * tcWeight -
    repetitionPenalty * 0.05;

  const total = Math.max(0, Math.min(1, rawTotal));

  return {
    clipId: clip.id,
    tempoFit,
    energyFit,
    sectionFit,
    zoneFit,
    continuityFit,
    noveltyFit,
    transitionCost,
    repetitionPenalty,
    total,
  };
}

/**
 * Scores all candidate clips and returns them sorted by total (descending), tiebreak by clipId.
 */
export function scoreCandidates(
  clips: MotionClip[],
  frame: SignalFrame,
  policy: RuntimePolicy,
  recentClipHistory: string[]
): CandidateScore[] {
  const scores = clips.map((clip) => scoreCandidate(clip, frame, policy, recentClipHistory));

  // Sort descending by total, tiebreak ascending by clipId
  scores.sort((a, b) => {
    if (Math.abs(a.total - b.total) > 1e-9) {
      return b.total - a.total;
    }
    return a.clipId.localeCompare(b.clipId);
  });

  return scores;
}
