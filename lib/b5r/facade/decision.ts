/**
 * The façade decision: one EDO call per option, and a versioned, hashed
 * Decision Contract (study sections 11.1, 12.2 and 20).
 *
 * Calls reuse the engine's CallName and its meaning (lib/b5r/engine.ts):
 *   KILL      a gate FAILs: a reviewed stop condition, or a protected
 *             window, exit, utility, historic or access area obstructed;
 *   ESCALATE  fire / life safety, structure or envelope is UNKNOWN: it needs
 *             a licensed professional, not more software;
 *   DEFER     any other gate UNKNOWN, a survey or catalogue rule unmet, a
 *             pilot module used, project-file errors, or synthetic data;
 *   EXECUTE   every gate clears on real data. It means "take this option to
 *             licensed design, pricing and permits"; never construction
 *             approval, and always pending the named human review.
 * Scores and ranks are shown beside the call and never change it.
 */
import { capitalFor, type CapitalSummary } from "./capital";
import { moduleOf } from "./catalogue";
import {
  DESIGN_RULE, FACADE_GATES, FIS_CATALOGUE_VERSION, FIS_CONTRACT_VERSION, FIS_ENGINE_VERSION, FIS_SCHEMA_VERSION, PROFESSIONAL_GATES,
  type CallName, type FacadeOption, type FacadeProject, type Maturity, type ModuleId,
} from "./contracts";
import { evaluateGates, type GateResult } from "./gates";
import { checkOption, moduleAt, windowClearance, type Conflict } from "./masks";
import { rank, scoreOption, sensitivity, weightProblems, type OptionScore, type Ranked, type Sensitivity } from "./score";
import { validateProject, type Issue, type ValidateOptions } from "./validate";

export interface OptionEvaluation {
  optionId: string;
  name: string;
  intent: string;
  call: CallName;
  reasons: string[];
  conflicts: Conflict[];
  gates: GateResult[];
  capital: CapitalSummary;
  score: OptionScore;
  maturity: Maturity;
  moduleCounts: Partial<Record<ModuleId, number>>;
  windows: { residentWindows: number; clear: number; screened: string[] };
}

export interface ProjectEvaluation {
  issues: Issue[];
  options: OptionEvaluation[];
  ranking: Ranked[];
  sensitivity: Sensitivity;
}

const CALL_RANK: Record<CallName, number> = { EXECUTE: 0, DEFER: 1, ESCALATE: 2, KILL: 3 };

export function maturityOf(p: FacadeProject, option: FacadeOption, gates: GateResult[]): Maturity {
  const changed = p.cells.filter((c) => moduleAt(option, c.id) !== "F0");
  const cells = changed.length > 0 ? changed : p.cells;
  if (cells.length === 0 || cells.some((c) => c.geometryState === "UNMEASURED")) return "CONCEPT";
  if (cells.some((c) => c.geometryState === "FIELD_OBSERVED")) return "FIELD OBSERVED";
  const engineered = PROFESSIONAL_GATES.every((g) => {
    const r = gates.find((x) => x.gate === g);
    return r !== undefined && (r.state === "PASS" || r.state === "NOT_APPLICABLE");
  });
  // INSTALLED needs installed-asset records, which FIS-Flat does not hold yet.
  return engineered ? "ENGINEER REVIEWED" : "SURVEY VERIFIED";
}

function decide(p: FacadeProject, option: FacadeOption, errors: Issue[], conflicts: Conflict[], gates: GateResult[]): { call: CallName; reasons: string[] } {
  let call: CallName = "EXECUTE";
  const reasons: string[] = [];
  const raise = (c: CallName, why: string) => {
    if (CALL_RANK[c] > CALL_RANK[call]) call = c;
    reasons.push(why);
  };
  for (const e of errors) raise("DEFER", `Project file: ${e.where}: ${e.message}`);
  for (const g of gates.filter((x) => x.state === "FAIL")) raise("KILL", `${g.gate} ${g.name} FAIL: ${g.reasons.filter((r) => r !== "no review recorded").join("; ")}`);
  for (const g of gates.filter((x) => x.state === "UNKNOWN")) {
    const pro = PROFESSIONAL_GATES.includes(g.gate);
    raise(pro ? "ESCALATE" : "DEFER", `${g.gate} ${g.name} UNKNOWN${pro ? " (needs a licensed professional)" : ""}: ${g.reasons.join("; ")}`);
  }
  for (const c of conflicts.filter((x) => x.kind !== "mask")) raise("DEFER", `${c.moduleId} on ${c.cellId}: ${c.reason}`);
  const pilots = [...new Set(p.cells.map((c) => moduleAt(option, c.id)).filter((m) => moduleOf(m).status === "pilot"))];
  for (const m of pilots) raise("DEFER", `${m} ${moduleOf(m).name} is a later pilot module (P2 or later)`);
  if (call === "EXECUTE" && (p.dataStatus !== "LIVE" && p.dataStatus !== "HISTORICAL")) {
    raise("DEFER", `${p.dataStatus} data: the rules clear, but this is a software test, not a property decision`);
  }
  if (call === "EXECUTE") reasons.push("Every gate clears: take this option to licensed design, pricing and permits. Not construction approval; a named human review is still required.");
  return { call, reasons };
}

export function evaluateProject(p: FacadeProject, opts: ValidateOptions = {}): ProjectEvaluation {
  const issues = validateProject(p, opts);
  const errors = issues.filter((i) => i.severity === "error");
  const options = p.options.map((option): OptionEvaluation => {
    const conflicts = checkOption(p, option);
    const capital = capitalFor(p, option);
    const gates = evaluateGates(p, option, conflicts, capital);
    const { call, reasons } = decide(p, option, errors, conflicts, gates);
    const moduleCounts: Partial<Record<ModuleId, number>> = {};
    for (const c of p.cells) {
      const m = moduleAt(option, c.id);
      moduleCounts[m] = (moduleCounts[m] ?? 0) + 1;
    }
    return {
      optionId: option.id, name: option.name, intent: option.intent, call, reasons, conflicts, gates, capital,
      score: scoreOption(option, p.weights, capital), maturity: maturityOf(p, option, gates), moduleCounts,
      windows: windowClearance(p, option),
    };
  });
  const alive = options.filter((o) => o.call !== "KILL");
  const ranking = rank(alive.map((o) => ({ optionId: o.optionId, score: o.score })));
  const sens: Sensitivity = weightProblems(p.weights).length > 0
    ? { stable: false, leader: null, checks: [] }
    : sensitivity(alive.map((o) => ({ option: p.options.find((x) => x.id === o.optionId) as FacadeOption, capital: o.capital })), p.weights);
  return { issues, options, ranking, sensitivity: sens };
}

// ---------------------------------------------------------------------------
// Decision Contract.
// ---------------------------------------------------------------------------

export const LIMITS = [
  "Decision support only: not construction documents, a permit set, an engineering certification or a financial return.",
  "Every elevation here is schematic (drawing status AI_CONCEPT); nothing is architect- or engineer-reviewed.",
  "EXECUTE means take one option to licensed design, pricing and permits; it is never construction approval.",
  "Costs and benefits count only with sources: unpriced lines leave totals unknown, and placeholder, image-board and unverified figures are excluded.",
  "No energy, daylight, wind or structural model was run.",
  "Nothing here changes AIM-B5R underwriting, refinance probability or valuation.",
] as const;

export type ReviewOutcome = "accepted" | "revisions_requested" | "rejected";

export interface HumanReview {
  reviewer: string;
  outcome: ReviewOutcome;
  note: string;
  at: string;
}

export interface DecisionContract {
  contractVersion: typeof FIS_CONTRACT_VERSION;
  engineVersion: string;
  schemaVersion: string;
  catalogueVersion: string;
  generatedAt: string;
  project: Pick<FacadeProject, "id" | "name" | "revision" | "dataStatus" | "mode" | "locationContext" | "property">;
  drawingStatus: "AI_CONCEPT";
  designRule: string;
  inputSha256: string;
  issues: Issue[];
  options: {
    optionId: string;
    name: string;
    call: CallName;
    reasons: string[];
    maturity: Maturity;
    gates: { gate: string; name: string; state: string; reasons: string[]; reviewer: string | null; date: string | null }[];
    conflicts: Conflict[];
    capital: Pick<CapitalSummary, "cTotal" | "cRequiredWork" | "bApproved" | "bOptional" | "withinBudget" | "annualNetBenefit" | "npv" | "unpriced" | "excluded" | "nonFinancial">;
    score: { total: number | null; missing: string[] };
    windows: OptionEvaluation["windows"];
  }[];
  ranking: Ranked[];
  sensitivity: { stable: boolean; leader: string | null };
  recommendation: { optionId: string; call: CallName; why: string; nextEvidence: string[] } | null;
  limits: readonly string[];
  humanReview: { required: true } & ({ reviewer: null; outcome: null; note: ""; at: null } | HumanReview);
  sha256: string;
}

/** JSON with object keys sorted, so a hash depends on content, not key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The option to carry into the next decision: the best-ranked option not killed, else the least intervention not killed. */
export function recommend(p: FacadeProject, ev: ProjectEvaluation): DecisionContract["recommendation"] {
  const alive = ev.options.filter((o) => o.call !== "KILL");
  if (alive.length === 0) return null;
  const ranked = ev.ranking[0] ? alive.find((o) => o.optionId === ev.ranking[0].optionId) : undefined;
  const pick = ranked ?? [...alive].sort((a, b) => (b.moduleCounts.F0 ?? 0) - (a.moduleCounts.F0 ?? 0) || a.optionId.localeCompare(b.optionId))[0];
  const why = ranked
    ? `Highest preference score among options not killed (${ranked.score.total} of 100); the score does not change its call.`
    : "No option is fully scored, so the least intervention not killed is carried forward (B5R-18: adaptive reuse first).";
  const nextEvidence = pick.gates.filter((g) => g.blocking).map((g) => {
    const def = FACADE_GATES.find((d) => d.id === g.gate);
    return `${g.gate} ${g.name}: ${def?.check ?? ""}${def?.professional ? " (licensed professional)" : ""}`;
  });
  if (pick.capital.cTotal === null) nextEvidence.push("Price every required cost line with a source, date and scope; get an approved budget");
  if (p.cells.some((c) => c.geometryState === "UNMEASURED")) nextEvidence.push("Survey the unmeasured cells");
  return { optionId: pick.optionId, call: pick.call, why, nextEvidence };
}

export async function buildContract(
  p: FacadeProject,
  ev: ProjectEvaluation,
  meta: { generatedAt: string; review?: HumanReview | null },
): Promise<DecisionContract> {
  const body: Omit<DecisionContract, "sha256"> = {
    contractVersion: FIS_CONTRACT_VERSION,
    engineVersion: FIS_ENGINE_VERSION,
    schemaVersion: FIS_SCHEMA_VERSION,
    catalogueVersion: FIS_CATALOGUE_VERSION,
    generatedAt: meta.generatedAt,
    project: { id: p.id, name: p.name, revision: p.revision, dataStatus: p.dataStatus, mode: p.mode, locationContext: p.locationContext, property: p.property },
    drawingStatus: "AI_CONCEPT",
    designRule: DESIGN_RULE.join(" → "),
    inputSha256: await sha256Hex(canonicalJson(p)),
    issues: ev.issues,
    options: ev.options.map((o) => ({
      optionId: o.optionId, name: o.name, call: o.call, reasons: o.reasons, maturity: o.maturity,
      gates: o.gates.map((g) => ({ gate: g.gate, name: g.name, state: g.state, reasons: g.reasons, reviewer: g.record?.reviewer || null, date: g.record?.date || null })),
      conflicts: o.conflicts,
      capital: {
        cTotal: o.capital.cTotal, cRequiredWork: o.capital.cRequiredWork, bApproved: o.capital.bApproved, bOptional: o.capital.bOptional,
        withinBudget: o.capital.withinBudget, annualNetBenefit: o.capital.annualNetBenefit, npv: o.capital.npv,
        unpriced: o.capital.unpriced, excluded: o.capital.excluded, nonFinancial: o.capital.nonFinancial,
      },
      score: { total: o.score.total, missing: o.score.missing },
      windows: o.windows,
    })),
    ranking: ev.ranking,
    sensitivity: { stable: ev.sensitivity.stable, leader: ev.sensitivity.leader },
    recommendation: recommend(p, ev),
    limits: LIMITS,
    humanReview: meta.review
      ? { required: true, ...meta.review }
      : { required: true, reviewer: null, outcome: null, note: "", at: null },
  };
  return { ...body, sha256: await sha256Hex(canonicalJson(body)) };
}

/** True when the contract's hash still matches its content. */
export async function contractIntact(c: DecisionContract): Promise<boolean> {
  const { sha256, ...body } = c;
  return sha256 === (await sha256Hex(canonicalJson(body)));
}
