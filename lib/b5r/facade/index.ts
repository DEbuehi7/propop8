/**
 * AIM-B5R Façade Intelligence System, FIS-Flat (canon B5R-38 to B5R-45). See
 * docs/aim-b5r/FACADE_INTELLIGENCE.md for the audit, the rules and what is
 * still proposed.
 */
export * from "./contracts";
export { CATALOGUE, isModuleId, moduleOf, type FacadeModule } from "./catalogue";
export { JUSTIFY_ROOMS, MASK_NOUN, MASK_RULES, MIN_CLEAR_WALL, besideGates, canPlace, cellById, checkOption, clearWallFraction, maskRefusals, masksOf, moduleAt, windowClearance, type Conflict, type Placement } from "./masks";
export { capitalFor, costProblem, requiredCostKinds, type CapitalSummary } from "./capital";
export { evaluateGates, recordFor, type GateResult } from "./gates";
export { rank, scoreOption, sensitivity, shiftWeights, weightProblems, type OptionScore, type Sensitivity } from "./score";
export { validateProject, type Issue } from "./validate";
export {
  LIMITS, buildContract, canonicalJson, contractIntact, evaluateProject, maturityOf, recommend, sha256Hex,
  type DecisionContract, type HumanReview, type OptionEvaluation, type ProjectEvaluation, type ReviewOutcome,
} from "./decision";
