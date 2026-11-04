/**
 * Preference scoring (study section 11.1), only after the gates.
 *
 * Scores are design preferences entered by a named person (0-5 per
 * criterion), not engineering results. The weights are editable, must sum
 * to 100, and say who chose them. A total exists only when every criterion
 * is scored. "Evidence-backed lifecycle value" counts as 0 until the option
 * has at least one verified benefit line, whatever was entered. Killed
 * options are not ranked, and a rank never changes a gate or a call.
 * sensitivity() moves each weight 5 points either way and reports whether
 * the leader changes.
 */
import type { CapitalSummary } from "./capital";
import { CRITERIA, SCORE_MAX, type CriterionId, type FacadeOption, type Weights } from "./contracts";

export interface ScorePart {
  criterion: CriterionId;
  label: string;
  value: number | null;
  weight: number;
  points: number | null;
  note?: string;
}

export interface OptionScore {
  total: number | null;
  parts: ScorePart[];
  missing: CriterionId[];
}

export function weightProblems(w: Weights): string[] {
  const out: string[] = [];
  let total = 0;
  for (const c of CRITERIA) {
    const v = w.values[c.id];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) out.push(`${c.label}: weight must be a number of 0 or more`);
    else total += v;
  }
  if (out.length === 0 && Math.abs(total - 100) > 1e-9) out.push(`weights sum to ${Math.round(total * 100) / 100}, not 100`);
  if (!w.chosenBy.trim()) out.push("weights need the name of who chose them");
  return out;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function scoreOption(option: FacadeOption, weights: Weights, capital: Pick<CapitalSummary, "verifiedBenefitCount">): OptionScore {
  const parts: ScorePart[] = [];
  const missing: CriterionId[] = [];
  for (const c of CRITERIA) {
    const w = weights.values[c.id];
    const weight = typeof w === "number" && Number.isFinite(w) ? w : 0;
    const raw = option.scores?.values[c.id];
    let value = typeof raw === "number" && Number.isFinite(raw) ? Math.min(SCORE_MAX, Math.max(0, raw)) : null;
    let note: string | undefined;
    if (value === null) missing.push(c.id);
    if (c.id === "lifecycle_value" && value !== null && value > 0 && capital.verifiedBenefitCount === 0) {
      value = 0;
      note = "counted as 0: no verified benefit evidence yet";
    }
    parts.push({ criterion: c.id, label: c.label, value, weight, points: value === null ? null : r2((value / SCORE_MAX) * weight), ...(note ? { note } : {}) });
  }
  const total = missing.length === 0 ? r2(parts.reduce((t, x) => t + (x.points ?? 0), 0)) : null;
  return { total, parts, missing };
}

export interface Ranked {
  optionId: string;
  total: number;
}

/** Highest total first; ties go to the earlier option id, so the order is stable. */
export function rank(scored: { optionId: string; score: OptionScore }[]): Ranked[] {
  return scored
    .filter((s) => s.score.total !== null)
    .map((s) => ({ optionId: s.optionId, total: s.score.total as number }))
    .sort((a, b) => b.total - a.total || a.optionId.localeCompare(b.optionId));
}

export interface Sensitivity {
  stable: boolean;
  leader: string | null;
  checks: { criterion: CriterionId; delta: number; leader: string | null }[];
}

/** Shift one weight by delta (clamped to 0-100) and rescale the others so the total stays 100. */
export function shiftWeights(w: Weights, criterion: CriterionId, delta: number): Weights {
  const target = Math.min(100, Math.max(0, w.values[criterion] + delta));
  const others = CRITERIA.filter((c) => c.id !== criterion);
  const rest = others.reduce((t, c) => t + w.values[c.id], 0);
  const values = { ...w.values, [criterion]: target };
  for (const c of others) values[c.id] = rest > 0 ? (w.values[c.id] * (100 - target)) / rest : (100 - target) / others.length;
  return { ...w, values };
}

export function sensitivity(
  options: { option: FacadeOption; capital: Pick<CapitalSummary, "verifiedBenefitCount"> }[],
  weights: Weights,
  step = 5,
): Sensitivity {
  const leaderWith = (w: Weights) =>
    rank(options.map((o) => ({ optionId: o.option.id, score: scoreOption(o.option, w, o.capital) })))[0]?.optionId ?? null;
  const leader = leaderWith(weights);
  const checks: Sensitivity["checks"] = [];
  for (const c of CRITERIA) {
    for (const delta of [-step, step]) checks.push({ criterion: c.id, delta, leader: leaderWith(shiftWeights(weights, c.id, delta)) });
  }
  return { stable: checks.every((c) => c.leader === leader), leader, checks };
}
