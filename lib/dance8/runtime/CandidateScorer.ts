import type { MappingRule } from "../contracts/mapping";
import type { MotionClip } from "../contracts/motion";
import type { RuntimePolicy } from "../contracts/policy";
import { knownValue, type SignalFrame } from "../contracts/signal";
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
 * Fit of a clip to the mapping rules that apply at this frame (a rule applies
 * when its sections, BPM range and energy range all match the frame; an
 * unknown value never matches a range). zoneFit: the share of the rules'
 * preferred zones the clip leads with. sectionFit: the share of their
 * preferred tags the clip carries (its level counts as the tag
 * "level:<level>"). Weighted by rule weight. null when no rule applies.
 */
export function ruleFits(clip: MotionClip, frame: SignalFrame, rules: MappingRule[]): { sectionFit: number; zoneFit: number } | null {
  const inRange = (v: number | null, r?: readonly [number, number]) => r === undefined || (v !== null && v >= r[0] && v <= r[1]);
  const live = rules.filter((r) => (!r.sections?.length || r.sections.includes(frame.section))
    && inRange(knownValue(frame.bpm), r.bpmRange) && inRange(knownValue(frame.energy), r.energyRange) && r.weight > 0);
  if (!live.length) return null;
  const tags = new Set([...clip.tags, `level:${clip.level}`]);
  let w = 0, zone = 0, tag = 0;
  for (const r of live) {
    const pz = r.preferredZones ?? [], pt = r.preferredTags ?? [];
    zone += r.weight * (pz.length ? pz.filter((z) => clip.dominantZones.includes(z)).length / pz.length : 1);
    tag += r.weight * (pt.length ? pt.filter((t) => tags.has(t)).length / pt.length : 1);
    w += r.weight;
  }
  return { sectionFit: tag / w, zoneFit: zone / w };
}

/**
 * Scores a candidate clip against the current frame and context. With mapping
 * rules (e.g. the owner's dance rules, canon D8-17) the section and zone fits
 * come from them; without, both stay at 1 as before.
 */
export function scoreCandidate(
  clip: MotionClip,
  frame: SignalFrame,
  policy: RuntimePolicy,
  recentClipHistory: string[],
  rules?: MappingRule[]
): CandidateScore {
  // Fit dimensions
  const tempoFit = computeFit(frame.bpm?.value ?? null, clip.bpmRange);
  const energyFit = computeFit(frame.energy?.value ?? null, clip.energyRange);

  // Section and zone: from the mapping rules when given; otherwise neutral (1.0).
  const fits = rules?.length ? ruleFits(clip, frame, rules) : null;
  const sectionFit = fits ? fits.sectionFit : 1.0;
  const zoneFit = fits ? fits.zoneFit : 1.0;

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
  recentClipHistory: string[],
  rules?: MappingRule[]
): CandidateScore[] {
  const scores = clips.map((clip) => scoreCandidate(clip, frame, policy, recentClipHistory, rules));

  // Sort descending by total, tiebreak ascending by clipId
  scores.sort((a, b) => {
    if (Math.abs(a.total - b.total) > 1e-9) {
      return b.total - a.total;
    }
    return a.clipId.localeCompare(b.clipId);
  });

  return scores;
}
