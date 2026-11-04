/**
 * Capital constraints and lifecycle value (study section 11.2).
 *
 *   C_total   = required repairs + design/permits + access + materials +
 *               fabrication + install + tenant disruption + contingency + other
 *   B_optional = max(0, B_approved - C_required_work - C_contingency)
 *   Annual net benefit = verified energy savings + verified avoided
 *               maintenance + verified, causally argued NOI effects
 *               - incremental O&M
 *   NPV       = -C_total + sum_t ANB / (1 + r)^t - end_of_life / (1 + r)^T
 *
 * Unknown is null, never zero: one unpriced line makes C_total unknown.
 * Figures from concept boards (UNVERIFIED_VISUAL_PLACEHOLDER), lines backed
 * only by AI images or design boards, and unverified benefits never enter a
 * sum; each is listed with the reason it was left out. There is no rent,
 * occupancy, cap-rate or property-value line at all, so none can be double
 * counted, and nothing here feeds the underwriting engine.
 */
import { moduleOf } from "./catalogue";
import { moduleAt } from "./masks";
import {
  CONCEPT_SOURCE_TYPES,
  type BenefitLine, type CostKind, type CostLine, type FacadeOption, type FacadeProject,
} from "./contracts";

export interface Excluded {
  id: string;
  label: string;
  why: string;
}

export interface CapitalSummary {
  cTotal: number | null;
  cRequiredWork: number | null;
  cContingency: number | null;
  bApproved: number | null;
  bOptional: number | null;
  /** C_total less required work and contingency: the discretionary part. */
  optionalScope: number | null;
  withinBudget: boolean | null;
  /** Why C_total is unknown, if it is. */
  unpriced: string[];
  annualNetBenefit: number | null;
  benefitUnknown: string[];
  verifiedBenefitCount: number;
  npv: number | null;
  npvUnknown: string[];
  excluded: Excluded[];
  nonFinancial: string[];
  /** The FG7 finding the numbers support, if any. */
  gate: { state: "FAIL" | "UNKNOWN"; reasons: string[] } | null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cents = (n: number) => Math.round(n * 100) / 100;

function conceptOnly(p: FacadeProject, ids: string[]): boolean {
  const types = ids.map((id) => p.sources.find((s) => s.id === id)?.type);
  return types.length > 0 && types.every((t) => t !== undefined && CONCEPT_SOURCE_TYPES.includes(t));
}

/** Why a cost line cannot be summed, or null when it can. */
export function costProblem(p: FacadeProject, l: CostLine): string | null {
  if (l.estimateClass === "UNVERIFIED_VISUAL_PLACEHOLDER") return "an unverified figure from concept art";
  if (l.amountUsd === null) return "not priced";
  if (!Number.isFinite(l.amountUsd) || l.amountUsd < 0) return "not a valid amount";
  if (l.sourceIds.length === 0) return "no source";
  if (conceptOnly(p, l.sourceIds)) return "backed only by a concept image or design board";
  if (!l.date.trim()) return "no effective date";
  if (!l.scopeDefinition.trim()) return "no scope definition";
  return null;
}

/** Cost kinds an option must price, given its modules and occupancy. */
export function requiredCostKinds(p: FacadeProject, option: FacadeOption): CostKind[] {
  const mods = p.cells.map((c) => moduleOf(moduleAt(option, c.id)));
  const kinds: CostKind[] = ["access", "contingency"];
  if (mods.some((m) => m.id !== "F0")) kinds.push("design_permits", "materials", "install");
  if (mods.some((m) => m.fabricated)) kinds.push("fabrication");
  if (p.occupied !== false) kinds.push("tenant_disruption");
  return kinds;
}

function sum(lines: CostLine[]): number {
  return lines.reduce((t, l) => t + (l.amountUsd ?? 0), 0);
}

function benefitProblem(p: FacadeProject, b: BenefitLine): string | null {
  if (b.estimateClass === "UNVERIFIED_VISUAL_PLACEHOLDER") return "an unverified figure from concept art";
  if (b.annualUsd === null || !Number.isFinite(b.annualUsd)) return "no amount";
  if (b.sourceIds.length === 0) return "no source";
  if (conceptOnly(p, b.sourceIds)) return "backed only by a concept image or design board";
  if (b.kind === "incremental_om") return b.state === "missing" ? "missing" : null;
  if (b.state !== "verified") return `${b.state}, not verified`;
  if (b.kind === "noi_effect" && !b.causalChain?.trim()) return "an NOI effect needs a stated causal chain";
  return null;
}

export function capitalFor(p: FacadeProject, option: FacadeOption): CapitalSummary {
  const excluded: Excluded[] = [];
  const unpriced: string[] = [];

  // Required work: the F0 baseline every option carries.
  let cRequiredWork: number | null = null;
  if (p.requiredWork.length === 0) {
    unpriced.push("required repairs not assessed (the F0 baseline needs a condition survey)");
  } else {
    const bad = p.requiredWork.filter((l) => costProblem(p, l));
    for (const l of bad) {
      const why = costProblem(p, l) as string;
      unpriced.push(`required work "${l.label}": ${why}`);
      if (l.estimateClass === "UNVERIFIED_VISUAL_PLACEHOLDER") excluded.push({ id: l.id, label: l.label, why });
    }
    if (bad.length === 0) cRequiredWork = sum(p.requiredWork);
  }

  // Option lines, and the kinds the option must price.
  const usable: CostLine[] = [];
  for (const l of option.costLines) {
    const why = costProblem(p, l);
    if (why) {
      unpriced.push(`"${l.label}": ${why}`);
      if (l.estimateClass === "UNVERIFIED_VISUAL_PLACEHOLDER" || why.startsWith("backed only")) excluded.push({ id: l.id, label: l.label, why });
    } else usable.push(l);
  }
  for (const k of requiredCostKinds(p, option)) {
    if (!option.costLines.some((l) => l.kind === k)) unpriced.push(`no ${k.replace("_", " ")} line`);
  }
  const contingency = option.costLines.filter((l) => l.kind === "contingency");
  const cContingency = contingency.length > 0 && contingency.every((l) => !costProblem(p, l)) ? sum(contingency) : null;
  const cTotal = unpriced.length === 0 && cRequiredWork !== null ? cents(cRequiredWork + sum(usable)) : null;

  const b = p.budget;
  const bApproved = b.approvedUsd !== null && Number.isFinite(b.approvedUsd) && b.approvedUsd >= 0 && b.approvedBy.trim() && b.date.trim() && b.sourceIds.length > 0
    ? b.approvedUsd : null;
  const bOptional = bApproved !== null && cRequiredWork !== null && cContingency !== null
    ? cents(Math.max(0, bApproved - cRequiredWork - cContingency)) : null;
  const optionalScope = cTotal !== null && cRequiredWork !== null && cContingency !== null ? cents(cTotal - cRequiredWork - cContingency) : null;
  const withinBudget = cTotal !== null && bApproved !== null ? cTotal <= bApproved : null;

  // FG7: required work first; then whether decoration fits what is left.
  let gate: CapitalSummary["gate"] = null;
  if (bApproved !== null && cRequiredWork !== null && cContingency !== null && cRequiredWork + cContingency > bApproved) {
    gate = { state: "FAIL", reasons: [`Required work and contingency (${money(cRequiredWork + cContingency)}) exceed the approved budget (${money(bApproved)})`] };
  } else if (withinBudget === false && optionalScope !== null && bOptional !== null) {
    gate = { state: "FAIL", reasons: [`Optional scope (${money(optionalScope)}) is more than the budget leaves after required work and contingency (${money(bOptional)}): decoration would displace required repair`] };
  } else if (cTotal === null || bApproved === null) {
    const reasons = [...unpriced];
    if (bApproved === null) reasons.push("no approved budget (amount, approver, date and source)");
    gate = { state: "UNKNOWN", reasons };
  }

  // Annual net benefit: verified benefits only; known O&M costs always count.
  let verifiedBenefitCount = 0;
  let benefits = 0;
  let om = 0;
  const benefitUnknown: string[] = [];
  const nonF0 = p.cells.some((c) => moduleAt(option, c.id) !== "F0");
  for (const l of option.benefitLines) {
    const why = benefitProblem(p, l);
    if (l.kind === "incremental_om") {
      if (why) benefitUnknown.push(`incremental O&M "${l.label}": ${why}`);
      else om += l.annualUsd as number;
      continue;
    }
    if (why) excluded.push({ id: l.id, label: l.label, why });
    else { benefits += l.annualUsd as number; verifiedBenefitCount++; }
  }
  if (nonF0 && !option.benefitLines.some((l) => l.kind === "incremental_om")) benefitUnknown.push("no incremental O&M line for the new modules");
  const annualNetBenefit = benefitUnknown.length === 0 ? cents(benefits - om) : null;

  // NPV, only when every input is known.
  const f = p.finance;
  const npvUnknown: string[] = [];
  if (cTotal === null) npvUnknown.push("C_total unknown");
  if (annualNetBenefit === null) npvUnknown.push("annual net benefit unknown");
  if (f.discountRate === null || !Number.isFinite(f.discountRate) || f.discountRate <= -1) npvUnknown.push("no discount rate");
  if (f.horizonYears === null || !Number.isInteger(f.horizonYears) || f.horizonYears < 1) npvUnknown.push("no horizon");
  if (f.endOfLifeUsd === null || !Number.isFinite(f.endOfLifeUsd) || f.endOfLifeUsd < 0) npvUnknown.push("no end-of-life cost");
  if (f.sourceIds.length === 0) npvUnknown.push("finance inputs have no source");
  let npv: number | null = null;
  if (npvUnknown.length === 0) {
    const r = f.discountRate as number;
    const T = f.horizonYears as number;
    let pv = 0;
    for (let t = 1; t <= T; t++) pv += (annualNetBenefit as number) / (1 + r) ** t;
    npv = cents(-(cTotal as number) + pv - (f.endOfLifeUsd as number) / (1 + r) ** T);
  }

  return {
    cTotal, cRequiredWork, cContingency, bApproved, bOptional, optionalScope, withinBudget, unpriced,
    annualNetBenefit, benefitUnknown, verifiedBenefitCount, npv, npvUnknown, excluded,
    nonFinancial: [...option.nonFinancialBenefits], gate,
  };
}
