/**
 * AIM-B5R design continuity: the proposal and report contracts.
 *
 * A design proposal answers every canon item that applies to its scope
 * (map.ts) with one of five decisions and a reason. The check (check.ts)
 * turns it into a coverage report and a call in the EDO.DECISION words
 * (EXECUTE / DEFER / ESCALATE / KILL; no new vocabulary, TRI-03).
 *
 * Governing rule (proposed for canon): no undocumented omissions, no silent
 * substitutions, no unsupported performance claims, no irreversible design
 * decision without evidence and approval.
 * Pure types and constants: no I/O, no AI.
 */
import type { CanonStatus } from "../../canon";
import { EVIDENCE_AXES } from "../../canon/vocab";
import type { CallName } from "../engine";
import type { WorkType } from "./map";

export type { CallName, WorkType };

export const PROPOSAL_SCHEMA = "aim-design-proposal-1";
export const REPORT_SCHEMA = "aim-continuity-report-1";
export const CONTINUITY_ENGINE_VERSION = "aim-continuity-0.1.0";

export const COVERAGE_DECISIONS = ["INCLUDED", "MODIFIED", "DEFERRED", "EXCLUDED", "UNRESOLVED"] as const;
export type CoverageDecision = (typeof COVERAGE_DECISIONS)[number];

export const CLAIM_KINDS = ["performance", "cost", "schedule", "capability", "other"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export type ProofTag = (typeof EVIDENCE_AXES.proofTag)[number];
export type DataStatus = (typeof EVIDENCE_AXES.dataStatus)[number];
/** Data that can never give EXECUTE (GOV-17, B5R-44). */
export const NOT_REAL_DATA: readonly DataStatus[] = ["SYNTHETIC", "MOCK", "ILLUSTRATIVE"];

/** A named person's decision, kept beside the line it approves. */
export interface Approval {
  by: string;
  /** YYYY-MM-DD */
  date: string;
  /** Where the decision is written down: a decision record, PR or minute. */
  record: string;
}

export interface ComponentLine {
  /** A canon id (GOV-26, B5R-39) or a façade module (FIS:F3). */
  ref: string;
  decision: CoverageDecision;
  /** How the item is met, or why it is modified, deferred, excluded or unresolved. */
  reason: string;
  /** What the design does with it; a change here between versions is a substitution. */
  detail?: string;
  /** For DEFERRED: what it waits for (a stage, a survey, a date). */
  until?: string;
  approval?: Approval;
}

export interface Claim {
  id: string;
  kind: ClaimKind;
  text: string;
  /** CONCEPTUAL, SIMULATED, EXPERIMENTALLY_TESTED or INDEPENDENTLY_VALIDATED (TRI-06). */
  proof?: ProofTag;
  /** Where the evidence is; required for anything above CONCEPTUAL. */
  source?: string;
}

export interface IrreversibleDecision {
  id: string;
  text: string;
  evidence: string[];
  approval?: Approval;
}

/** A logged change from the version this one supersedes. key: a component ref, claim:<id> or irreversible:<id>. */
export interface ChangeLine {
  key: string;
  reason: string;
  approval?: Approval;
}

export interface DesignProposal {
  schema: typeof PROPOSAL_SCHEMA;
  id: string;
  /** 1, 2, 3 ... */
  version: number;
  title: string;
  dataStatus: DataStatus;
  /** The canon version the author worked from. */
  canonVersion: string;
  scope: WorkType[];
  components: ComponentLine[];
  claims: Claim[];
  irreversible: IrreversibleDecision[];
  /** The version this one replaces and that version's proposal hash. */
  supersedes?: { version: number; sha256: string };
  changes?: ChangeLine[];
  /** Approval of this version as a whole. */
  approval?: Approval;
}

export const FINDING_CODES = [
  "SILENT_OMISSION", "UNKNOWN_REF", "DUPLICATE_KEY", "MISSING_REASON", "UNRESOLVED_COMPONENT", "OPEN_ENDED_DEFERRAL",
  "UNAUTHORIZED_CHANGE", "NEVER_WAIVED", "NEVER_WAIVED_DEFERRED", "APPROVED_DEVIATION", "APPROVAL_INCOMPLETE",
  "OPEN_DECISION", "LABEL_KEPT", "DISABLED_MODULE", "PILOT_MODULE", "MODULE_OUT_OF_SCOPE",
  "UNSUPPORTED_CLAIM", "DESIGN_GOAL", "IRREVERSIBLE_WITHOUT_EVIDENCE", "IRREVERSIBLE_WITHOUT_APPROVAL",
  "SYNTHETIC_INPUT", "CANON_MOVED",
  "BASELINE_NOT_SUPPLIED", "BASELINE_MISMATCH", "SUPERSEDES_MISSING", "VERSION_NOT_NEWER", "BASELINE_UNAPPROVED",
  "SILENT_SUBSTITUTION", "STALE_CHANGE_LINE",
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

/** NOTE is shown and never blocks; the others are the call they force. */
export type Severity = CallName | "NOTE";

export interface Finding {
  code: FindingCode;
  severity: Severity;
  /** The component ref, claim:<id>, irreversible:<id>, or null for the proposal. */
  key: string | null;
  message: string;
  fix: string;
}

export interface CoverageRow {
  ref: string;
  label: string;
  /** Canon status, or MODULE for a façade module. */
  status: CanonStatus | "MODULE";
  /** mandatory / advisory from the map; declared: the author added it. */
  role: "mandatory" | "advisory" | "declared";
  scopes: ("always" | WorkType)[];
  decision: CoverageDecision | null;
  reason: string | null;
  until: string | null;
  approvedBy: string | null;
  codes: FindingCode[];
}

export interface DiffRow {
  key: string;
  before: string;
  after: string;
  logged: boolean;
  approvedBy: string | null;
}

export interface ClaimRow {
  id: string;
  kind: ClaimKind;
  text: string;
  proof: ProofTag | null;
  source: string | null;
  standing: "SUPPORTED" | "DESIGN_GOAL" | "UNSUPPORTED";
}

export interface ContinuityReport {
  schema: typeof REPORT_SCHEMA;
  engineVersion: string;
  mapVersion: string;
  canonVersion: string;
  proposal: {
    id: string; version: number; title: string; dataStatus: DataStatus; canonVersion: string;
    sha256: string; scope: WorkType[]; approvedBy: string | null;
  };
  baseline: { version: number; sha256: string; approvedBy: string | null } | null;
  coverage: CoverageRow[];
  diff: DiffRow[];
  claims: ClaimRow[];
  irreversible: { id: string; text: string; evidence: number; approvedBy: string | null }[];
  findings: Finding[];
  counts: { mandatory: number; answered: number; missing: number } & Record<Lowercase<CoverageDecision>, number>;
  /** The coverage gate: true when nothing but synthetic data holds the proposal back. */
  complete: boolean;
  call: CallName;
  meaning: string;
  limits: readonly string[];
  sha256: string;
}
