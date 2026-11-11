/**
 * AIM-B5R design continuity check: proposal in, sealed coverage report out.
 *
 * Deterministic (GOV-14): the same proposal, baseline and canon give the same
 * report and hash. The check proves every applicable canon item was answered,
 * every change since the last version was logged, and every claim carries its
 * evidence tag; it does not prove the answers are true. A named reviewer
 * still reads them (B5R-44).
 */
import { CANON_REGISTER, CANON_VERSION, type CanonEntry } from "../../canon";
import { EVIDENCE_AXES } from "../../canon/vocab";
import { CATALOGUE, type FacadeModule } from "../facade/catalogue";
import { canonicalJson, sha256Hex } from "../facade/decision";
import {
  CLAIM_KINDS, CONTINUITY_ENGINE_VERSION, COVERAGE_DECISIONS, NOT_REAL_DATA, PROPOSAL_SCHEMA, REPORT_SCHEMA,
  type Approval, type CallName, type ChangeLine, type ClaimRow, type ComponentLine, type ContinuityReport,
  type CoverageDecision, type CoverageRow, type DesignProposal, type DiffRow, type Finding, type FindingCode, type Severity,
} from "./contracts";
import { CONTINUITY_MAP, CONTINUITY_MAP_VERSION, FACADE_BASELINE_MODULE, IMPLIES, NEVER_WAIVED, WORK_TYPES, type WorkType } from "./map";

const ENTRY = new Map<string, CanonEntry>(CANON_REGISTER.map((e) => [e.id, e]));
const MODULE = new Map<string, FacadeModule>(CATALOGUE.map((m) => [`FIS:${m.id}`, m]));

export const isKnownRef = (ref: string): boolean => ENTRY.has(ref) || MODULE.has(ref);

/** A short label for a canon item or module: the first sentence, cut at 100 characters. */
export function labelOf(ref: string): string {
  const m = MODULE.get(ref);
  if (m) return `${m.id} ${m.name}${m.status === "available" ? "" : ` (${m.status})`}`;
  const e = ENTRY.get(ref);
  if (!e) return "not in canon or the façade catalogue";
  const first = e.statement.split(/(?<=\.)\s/)[0];
  return first.length > 100 ? `${first.slice(0, 99).trimEnd()}…` : first;
}

/** The scope with everything it implies, in WORK_TYPES order. */
export function expandScope(scope: readonly WorkType[]): WorkType[] {
  const out = new Set<WorkType>();
  const add = (w: WorkType) => {
    if (out.has(w)) return;
    out.add(w);
    for (const x of IMPLIES[w] ?? []) add(x);
  };
  scope.forEach(add);
  return WORK_TYPES.filter((w) => out.has(w));
}

export interface Requirement {
  ref: string;
  role: "mandatory" | "advisory";
  scopes: ("always" | WorkType)[];
}

/** What a proposal with this scope must answer (mandatory) and should see (advisory). */
export function requirements(scope: readonly WorkType[]): Requirement[] {
  const byRef = new Map<string, Requirement>();
  for (const s of ["always", ...expandScope(scope)] as const) {
    for (const ref of CONTINUITY_MAP[s]) {
      const have = byRef.get(ref);
      if (have) { have.scopes.push(s); continue; }
      const locked = ENTRY.get(ref)?.status === "LOCKED" || ref === FACADE_BASELINE_MODULE;
      byRef.set(ref, { ref, role: locked ? "mandatory" : "advisory", scopes: [s] });
    }
  }
  const rank = (r: Requirement) => (r.role === "mandatory" ? 0 : 1);
  return [...byRef.values()].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// Reading a proposal file. Shape errors stop the check; content problems
// become findings.
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const optStr = (v: unknown) => v === undefined || isStr(v);

function approvalShape(v: unknown, at: string, errors: string[]) {
  if (v === undefined) return;
  if (!isObj(v) || !isStr(v.by) || !isStr(v.date) || !isStr(v.record)) errors.push(`${at}.approval needs by, date and record (text)`);
}

export function parseProposal(raw: unknown): { proposal: DesignProposal | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { proposal: null, errors: ["the proposal must be a JSON object"] };
  if (raw.schema !== PROPOSAL_SCHEMA) errors.push(`schema must be "${PROPOSAL_SCHEMA}"`);
  if (!isStr(raw.id) || !ID.test(raw.id)) errors.push("id: letters, digits, dot, dash or underscore, up to 80 characters");
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) errors.push("version must be a whole number from 1");
  if (!isStr(raw.title) || !raw.title.trim()) errors.push("title is required");
  if (!(EVIDENCE_AXES.dataStatus as readonly unknown[]).includes(raw.dataStatus)) errors.push(`dataStatus must be one of ${EVIDENCE_AXES.dataStatus.join(", ")}`);
  if (!isStr(raw.canonVersion)) errors.push("canonVersion is required (the canon version you worked from)");
  if (!Array.isArray(raw.scope)) errors.push("scope must be a list");
  else for (const s of raw.scope) if (!(WORK_TYPES as readonly unknown[]).includes(s)) errors.push(`scope: unknown work type ${JSON.stringify(s)} (known: ${WORK_TYPES.join(", ")})`);
  if (!Array.isArray(raw.components)) errors.push("components must be a list");
  else raw.components.forEach((c, i) => {
    const at = `components[${i}]`;
    if (!isObj(c)) { errors.push(`${at} must be an object`); return; }
    if (!isStr(c.ref) || !c.ref.trim()) errors.push(`${at}.ref is required`);
    if (!(COVERAGE_DECISIONS as readonly unknown[]).includes(c.decision)) errors.push(`${at}.decision must be one of ${COVERAGE_DECISIONS.join(", ")}`);
    if (!isStr(c.reason)) errors.push(`${at}.reason must be text`);
    if (!optStr(c.detail) || !optStr(c.until)) errors.push(`${at}.detail and .until must be text`);
    approvalShape(c.approval, at, errors);
  });
  if (!Array.isArray(raw.claims)) errors.push("claims must be a list (empty if none)");
  else raw.claims.forEach((c, i) => {
    const at = `claims[${i}]`;
    if (!isObj(c) || !isStr(c.id) || !isStr(c.text)) { errors.push(`${at} needs id and text`); return; }
    if (!(CLAIM_KINDS as readonly unknown[]).includes(c.kind)) errors.push(`${at}.kind must be one of ${CLAIM_KINDS.join(", ")}`);
    if (c.proof !== undefined && !(EVIDENCE_AXES.proofTag as readonly unknown[]).includes(c.proof)) errors.push(`${at}.proof must be one of ${EVIDENCE_AXES.proofTag.join(", ")}`);
    if (!optStr(c.source)) errors.push(`${at}.source must be text`);
  });
  if (!Array.isArray(raw.irreversible)) errors.push("irreversible must be a list (empty if none)");
  else raw.irreversible.forEach((d, i) => {
    const at = `irreversible[${i}]`;
    if (!isObj(d) || !isStr(d.id) || !isStr(d.text) || !Array.isArray(d.evidence) || !d.evidence.every(isStr)) { errors.push(`${at} needs id, text and an evidence list`); return; }
    approvalShape(d.approval, at, errors);
  });
  if (raw.supersedes !== undefined) {
    const s = raw.supersedes;
    if (!isObj(s) || !Number.isInteger(s.version) || !isStr(s.sha256) || !HEX64.test(s.sha256)) errors.push("supersedes needs version and the 64-character sha256 of that version's proposal");
  }
  if (raw.changes !== undefined) {
    if (!Array.isArray(raw.changes)) errors.push("changes must be a list");
    else raw.changes.forEach((c, i) => {
      if (!isObj(c) || !isStr(c.key) || !isStr(c.reason)) errors.push(`changes[${i}] needs key and reason`);
      else approvalShape(c.approval, `changes[${i}]`, errors);
    });
  }
  approvalShape(raw.approval, "proposal", errors);
  return errors.length ? { proposal: null, errors } : { proposal: raw as unknown as DesignProposal, errors };
}

/** The proposal's hash: what a later version names in supersedes. */
export const proposalSha256 = (p: DesignProposal): Promise<string> => sha256Hex(canonicalJson(p));

function approvalProblems(a: Approval): string[] {
  const out: string[] = [];
  if (!a.by.trim()) out.push("who approved");
  if (!DATE.test(a.date) || Number.isNaN(Date.parse(`${a.date}T00:00:00Z`))) out.push("a YYYY-MM-DD date");
  if (!a.record.trim()) out.push("where it is recorded");
  return out;
}
const validApproval = (a?: Approval): a is Approval => !!a && approvalProblems(a).length === 0;

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const ORDER: Record<Severity, number> = { KILL: 0, ESCALATE: 1, DEFER: 2, NOTE: 3, EXECUTE: 4 };
const ACTIVE = (d: CoverageDecision) => d === "INCLUDED" || d === "MODIFIED";
/** Findings that hold the call but say nothing about whether the proposal is complete. */
const NOT_COMPLETENESS: readonly FindingCode[] = ["SYNTHETIC_INPUT"];

const MEANING: Record<CallName, string> = {
  EXECUTE: "Complete and continuous: every applicable canon item is answered, changes are logged and approved, and claims carry their evidence. Next, a named reviewer reads the answers. This is the next design stage, never construction or publication approval.",
  DEFER: "Not yet: the author can fix what is listed (missing answers, open-ended deferrals, untagged claims, unlogged changes, synthetic data).",
  ESCALATE: "Needs the owner: a locked rule is changed or left out without approval, a disabled module or an open decision is used, or an irreversible decision has no approval.",
  KILL: "Stops here: the proposal waives a rule no project approval can waive. Changing that rule needs a canon change, not a project approval.",
};

export const LIMITS: readonly string[] = [
  "The check proves every applicable item was answered; it does not prove the answers are true. A named reviewer still reads them (B5R-44).",
  "EXECUTE means the next design stage; it is never construction, permit or publication approval.",
  "An approval on a line records a project decision; it never changes canon. Changing a rule needs the owner and a CANON_VERSION bump.",
  `Which items apply comes from the continuity map (${CONTINUITY_MAP_VERSION}), a reading of canon that is not canon itself.`,
];

const describeComponent = (c: ComponentLine | undefined) => (c ? `${c.decision}${c.detail ? `: ${c.detail}` : ""}` : "ABSENT");

export async function checkContinuity(p: DesignProposal, opts: { baseline?: DesignProposal } = {}): Promise<ContinuityReport> {
  const findings: Finding[] = [];
  const add = (code: FindingCode, severity: Severity, key: string | null, message: string, fix: string) => {
    if (!findings.some((f) => f.code === code && f.key === key)) findings.push({ code, severity, key, message, fix });
  };
  const approved = (a: Approval | undefined, key: string | null): boolean => {
    if (!a) return false;
    const missing = approvalProblems(a);
    if (missing.length) add("APPROVAL_INCOMPLETE", "DEFER", key, `the approval lacks ${missing.join(", ")}, so it does not count`, "name who approved, the date (YYYY-MM-DD) and where it is recorded");
    return missing.length === 0;
  };

  const scope = expandScope(p.scope);
  const reqs = requirements(scope);
  const reqByRef = new Map(reqs.map((r) => [r.ref, r]));

  // One line per item.
  const lines = new Map<string, ComponentLine>();
  for (const c of p.components) {
    if (lines.has(c.ref)) add("DUPLICATE_KEY", "DEFER", c.ref, `${c.ref} is answered more than once`, "keep one line per item");
    else lines.set(c.ref, c);
  }

  for (const c of lines.values()) {
    const entry = ENTRY.get(c.ref);
    const mod = MODULE.get(c.ref);
    if (!entry && !mod) { add("UNKNOWN_REF", "DEFER", c.ref, `${c.ref} is not a canon id (canon ${CANON_VERSION}) or a façade module`, "use a canon id such as B5R-39 or a module such as FIS:F3"); continue; }
    if (!c.reason.trim()) add("MISSING_REASON", "DEFER", c.ref, `${c.ref} is ${c.decision} with no reason`, "say how it is met, or why it is modified, deferred, excluded or unresolved");
    const ok = approved(c.approval, c.ref);
    if (c.decision === "UNRESOLVED") add("UNRESOLVED_COMPONENT", "DEFER", c.ref, `${c.ref} is not resolved yet`, "decide it, or defer it to a named stage with until");
    if (c.decision === "DEFERRED" && !c.until?.trim()) add("OPEN_ENDED_DEFERRAL", "DEFER", c.ref, `${c.ref} is deferred without saying until when`, "set until: the stage, survey or date it waits for");
    const mandatory = entry?.status === "LOCKED" || reqByRef.get(c.ref)?.role === "mandatory";
    const never = NEVER_WAIVED.get(c.ref);
    if (mandatory && (c.decision === "MODIFIED" || c.decision === "EXCLUDED")) {
      if (never) add("NEVER_WAIVED", "KILL", c.ref, `${c.ref} is ${c.decision}, but ${never}; no project approval can waive it`, "answer it as INCLUDED, or ask the owner for a canon change");
      else if (!ok) add("UNAUTHORIZED_CHANGE", "ESCALATE", c.ref, `${c.ref} is locked and ${c.decision} without an approval`, "record the owner's approval on the line, or answer it as INCLUDED");
      else add("APPROVED_DEVIATION", "NOTE", c.ref, `${c.ref} is ${c.decision} with ${c.approval!.by}'s approval (${c.approval!.date}, ${c.approval!.record})`, "none");
    }
    if (never && c.decision === "DEFERRED") {
      if (!ok) add("NEVER_WAIVED_DEFERRED", "ESCALATE", c.ref, `${c.ref} is deferred, but ${never}; only the owner can let it wait`, "answer it now, or record the owner's approval to defer");
      else add("APPROVED_DEVIATION", "NOTE", c.ref, `${c.ref} is deferred with ${c.approval!.by}'s approval`, "none");
    }
    if (entry && ACTIVE(c.decision)) {
      if (entry.status === "OPEN" || entry.status === "CONFLICT") add("OPEN_DECISION", "ESCALATE", c.ref, `${c.ref} is ${entry.status}: the design builds on a decision the owner has not made`, "ask the owner to decide it, or defer this line until they do");
      else if (entry.status !== "LOCKED") add("LABEL_KEPT", "NOTE", c.ref, `${c.ref} is ${entry.status} and keeps that label; it is never evidence`, "none");
    }
    if (mod && ACTIVE(c.decision)) {
      if (mod.status === "disabled") add("DISABLED_MODULE", "ESCALATE", c.ref, `${mod.id} is disabled until it has its own decision contract (B5R-41)`, "use a flat module (F0-F5), or ask the owner to open F7 with its own contract");
      else if (mod.status === "pilot") add("PILOT_MODULE", "DEFER", c.ref, `${mod.id} is a later selective pilot (P2+), so the option waits`, "use F0-F5 now, or defer this line to the pilot stage");
      if (!scope.includes("facade")) add("MODULE_OUT_OF_SCOPE", "DEFER", c.ref, `${c.ref} is a façade module but facade is not in scope`, "add facade to scope so the façade rules apply");
    }
  }
  for (const r of reqs) {
    if (r.role !== "mandatory" || lines.has(r.ref)) continue;
    const never = NEVER_WAIVED.get(r.ref);
    add("SILENT_OMISSION", never ? "ESCALATE" : "DEFER", r.ref, `${r.ref} applies (${r.scopes.join(", ")}) and is not answered${never ? `; ${never}` : ""}`, `add a line for ${r.ref}: ${labelOf(r.ref)}`);
  }

  // Claims (TRI-06, VIS-05, EDO-14).
  const claimIds = new Set<string>();
  const claims: ClaimRow[] = [];
  for (const c of p.claims) {
    const key = `claim:${c.id}`;
    if (claimIds.has(c.id)) { add("DUPLICATE_KEY", "DEFER", key, `claim ${c.id} appears more than once`, "give each claim its own id"); continue; }
    claimIds.add(c.id);
    let standing: ClaimRow["standing"] = "SUPPORTED";
    if (!c.proof) {
      standing = "UNSUPPORTED";
      add("UNSUPPORTED_CLAIM", "DEFER", key, `claim ${c.id} carries no proof tag`, "tag it CONCEPTUAL, SIMULATED, EXPERIMENTALLY_TESTED or INDEPENDENTLY_VALIDATED, or remove it");
    } else if (c.proof === "CONCEPTUAL") {
      standing = "DESIGN_GOAL";
      if (c.kind !== "other") add("DESIGN_GOAL", "NOTE", key, `claim ${c.id} is CONCEPTUAL: shown as a design goal, never as a result`, "none");
    } else if (!c.source?.trim()) {
      standing = "UNSUPPORTED";
      add("UNSUPPORTED_CLAIM", "DEFER", key, `claim ${c.id} is tagged ${c.proof} but names no source`, "name the model run, test report or validation behind it, or tag it CONCEPTUAL");
    }
    claims.push({ id: c.id, kind: c.kind, text: c.text, proof: c.proof ?? null, source: c.source?.trim() || null, standing });
  }

  // Irreversible decisions.
  const irrIds = new Set<string>();
  const irreversible: ContinuityReport["irreversible"] = [];
  for (const d of p.irreversible) {
    const key = `irreversible:${d.id}`;
    if (irrIds.has(d.id)) { add("DUPLICATE_KEY", "DEFER", key, `irreversible decision ${d.id} appears more than once`, "give each its own id"); continue; }
    irrIds.add(d.id);
    const evidence = d.evidence.filter((e) => e.trim()).length;
    const ok = approved(d.approval, key);
    if (!evidence) add("IRREVERSIBLE_WITHOUT_EVIDENCE", "DEFER", key, `${d.id} cannot be undone and lists no evidence`, "list the survey, test or record that supports it");
    if (!ok) add("IRREVERSIBLE_WITHOUT_APPROVAL", "ESCALATE", key, `${d.id} cannot be undone and has no named approval`, "record the owner's approval (by, date, record)");
    irreversible.push({ id: d.id, text: d.text, evidence, approvedBy: ok ? d.approval!.by : null });
  }

  if (NOT_REAL_DATA.includes(p.dataStatus)) add("SYNTHETIC_INPUT", "DEFER", null, `the proposal is ${p.dataStatus}; that data never gives EXECUTE (GOV-17, B5R-44)`, "run it on real, sourced records");
  if (p.canonVersion !== CANON_VERSION) add("CANON_MOVED", "NOTE", null, `written against canon ${p.canonVersion}, checked against ${CANON_VERSION}`, "re-read the canon change log; new items show up as omissions");
  const proposalApproved = approved(p.approval, null);

  // Continuity with the version this one replaces.
  const sha256 = await proposalSha256(p);
  let baseline: ContinuityReport["baseline"] = null;
  const diff: DiffRow[] = [];
  const b = opts.baseline;
  if (p.supersedes && !b) add("BASELINE_NOT_SUPPLIED", "DEFER", null, `this is version ${p.version} and replaces version ${p.supersedes.version}, which was not supplied`, "run the check with the previous version as the baseline");
  if (b) {
    const bSha = await proposalSha256(b);
    const bApproved = validApproval(b.approval);
    baseline = { version: b.version, sha256: bSha, approvedBy: bApproved ? b.approval!.by : null };
    if (b.id !== p.id) add("BASELINE_MISMATCH", "DEFER", null, `the baseline is proposal ${b.id}, not ${p.id}`, "supply the previous version of this proposal");
    if (p.version <= b.version) add("VERSION_NOT_NEWER", "DEFER", null, `version ${p.version} does not follow baseline version ${b.version}`, "raise the version number");
    if (!p.supersedes) add("SUPERSEDES_MISSING", "DEFER", null, "the proposal does not say which version it replaces", `set supersedes to {"version": ${b.version}, "sha256": "${bSha}"}`);
    else if (p.supersedes.version !== b.version || p.supersedes.sha256 !== bSha) add("BASELINE_MISMATCH", "ESCALATE", null, "the baseline supplied is not the version this proposal says it replaces (version or hash differ)", "find the version it really replaces; if that file was edited after approval, ask the owner");
    if (!bApproved) add("BASELINE_UNAPPROVED", "NOTE", null, `baseline version ${b.version} has no recorded approval, so changes need logging but not approval`, "none");

    const log = new Map<string, ChangeLine>();
    for (const c of p.changes ?? []) {
      if (log.has(c.key)) add("DUPLICATE_KEY", "DEFER", c.key, `the change log has ${c.key} more than once`, "one change line per item");
      else log.set(c.key, c);
    }
    const before = new Map<string, string>();
    const after = new Map<string, string>();
    // Scope and data status are part of what a version says: narrowing the
    // scope drops rules, so it is logged like any other change.
    const bScope = expandScope(b.scope);
    const narrowed = bScope.filter((w) => !scope.includes(w));
    before.set("scope", bScope.join(", ") || "(none)");
    after.set("scope", scope.join(", ") || "(none)");
    before.set("dataStatus", b.dataStatus);
    after.set("dataStatus", p.dataStatus);
    const bReqs = new Map(requirements(bScope).map((r) => [r.ref, r]));
    const bLines = new Map(b.components.map((c) => [c.ref, c]));
    for (const ref of new Set([...bLines.keys(), ...lines.keys()])) { before.set(ref, describeComponent(bLines.get(ref))); after.set(ref, describeComponent(lines.get(ref))); }
    const claimText = (c?: DesignProposal["claims"][number]) => (c ? `${c.proof ?? "untagged"}: ${c.text}${c.source ? ` [${c.source}]` : ""}` : "ABSENT");
    for (const id of new Set([...b.claims.map((c) => c.id), ...p.claims.map((c) => c.id)])) {
      before.set(`claim:${id}`, claimText(b.claims.find((c) => c.id === id)));
      after.set(`claim:${id}`, claimText(p.claims.find((c) => c.id === id)));
    }
    for (const id of new Set([...b.irreversible.map((d) => d.id), ...p.irreversible.map((d) => d.id)])) {
      before.set(`irreversible:${id}`, b.irreversible.find((d) => d.id === id)?.text ?? "ABSENT");
      after.set(`irreversible:${id}`, p.irreversible.find((d) => d.id === id)?.text ?? "ABSENT");
    }
    for (const [key, was] of before) {
      const now = after.get(key)!;
      if (was === now) continue;
      const entry = log.get(key);
      const logged = !!entry && !!entry.reason.trim();
      const isLine = lines.has(key) || bLines.has(key);
      // Answering a required rule that was missing, or dropping a line whose
      // rule left with the scope, is not a substitution of its own: the scope
      // change carries the finding.
      const answersGap = isLine && was === "ABSENT" && reqByRef.get(key)?.role === "mandatory";
      const leftWithScope = isLine && now === "ABSENT" && !reqByRef.has(key) && bReqs.has(key);
      const needed = !answersGap && !leftWithScope;
      if (needed && !logged) add("SILENT_SUBSTITUTION", "DEFER", key, `${key} changed (${was} → ${now}) with no line in the change log`, `add {"key": "${key}", "reason": "..."} to changes`);
      const lineApproval = lines.get(key)?.approval;
      const ok = (entry?.approval && approved(entry.approval, key)) || validApproval(lineApproval);
      const constrained = key === "scope" ? narrowed.length > 0 : needed && (ENTRY.get(key)?.status === "LOCKED" || reqByRef.get(key)?.role === "mandatory");
      if (constrained && bApproved && !ok) {
        const what = key === "scope" ? `the scope drops ${narrowed.join(", ")}, and the rules that come with it, ` : `${key} was approved in version ${b.version} and `;
        add("UNAUTHORIZED_CHANGE", "ESCALATE", key, `${what}has changed without an approval`, "record the owner's approval on the change line");
      }
      const by = entry?.approval && validApproval(entry.approval) ? entry.approval.by : validApproval(lineApproval) ? lineApproval.by : null;
      diff.push({ key, before: was, after: now, log: logged ? "yes" : needed ? "no" : "not needed", approvedBy: by });
    }
    for (const key of log.keys()) if (!diff.some((d) => d.key === key)) add("STALE_CHANGE_LINE", "NOTE", key, `the change log mentions ${key}, which did not change`, "remove the line, or check that the change was made");
  }

  // Coverage table: mandatory, then advisory, then items the author added.
  const codesFor = (key: string) => findings.filter((f) => f.key === key).map((f) => f.code);
  const row = (ref: string, role: CoverageRow["role"], scopes: CoverageRow["scopes"]): CoverageRow => {
    const c = lines.get(ref);
    return {
      ref, label: labelOf(ref), status: MODULE.has(ref) ? "MODULE" : ENTRY.get(ref)?.status ?? "OPEN", role, scopes,
      decision: c?.decision ?? null, reason: c?.reason.trim() || null, until: c?.until?.trim() || null,
      approvedBy: validApproval(c?.approval) ? c!.approval!.by : null, codes: codesFor(ref),
    };
  };
  const coverage: CoverageRow[] = reqs.map((r) => row(r.ref, r.role, r.scopes));
  for (const ref of lines.keys()) if (!reqByRef.has(ref) && isKnownRef(ref)) coverage.push(row(ref, "declared", []));

  const mandatory = reqs.filter((r) => r.role === "mandatory");
  const tally = (d: CoverageDecision) => [...lines.values()].filter((c) => c.decision === d).length;
  const counts = {
    mandatory: mandatory.length,
    answered: mandatory.filter((r) => lines.has(r.ref)).length,
    missing: mandatory.filter((r) => !lines.has(r.ref)).length,
    included: tally("INCLUDED"), modified: tally("MODIFIED"), deferred: tally("DEFERRED"), excluded: tally("EXCLUDED"), unresolved: tally("UNRESOLVED"),
  };

  findings.sort((a, b2) => ORDER[a.severity] - ORDER[b2.severity] || (a.key ?? "").localeCompare(b2.key ?? "") || a.code.localeCompare(b2.code));
  const blocking = findings.filter((f) => f.severity !== "NOTE");
  const call: CallName = (blocking[0]?.severity as CallName | undefined) ?? "EXECUTE";
  const complete = blocking.every((f) => NOT_COMPLETENESS.includes(f.code));
  const meaning = complete && call === "DEFER"
    ? "Complete and continuous, but held: synthetic, mock or illustrative data never gives EXECUTE (GOV-17, B5R-44)."
    : MEANING[call];

  const body: Omit<ContinuityReport, "sha256"> = {
    schema: REPORT_SCHEMA, engineVersion: CONTINUITY_ENGINE_VERSION, mapVersion: CONTINUITY_MAP_VERSION, canonVersion: CANON_VERSION,
    proposal: {
      id: p.id, version: p.version, title: p.title, dataStatus: p.dataStatus, canonVersion: p.canonVersion, sha256, scope,
      approvedBy: proposalApproved ? p.approval!.by : null,
    },
    baseline, coverage, diff, claims, irreversible, findings, counts, complete, call, meaning, limits: LIMITS,
  };
  return { ...body, sha256: await sha256Hex(canonicalJson(body)) };
}

/** True when the report's seal matches its content. */
export async function verifyReport(r: ContinuityReport): Promise<boolean> {
  const { sha256, ...body } = r;
  return sha256 === (await sha256Hex(canonicalJson(body)));
}

/** A first version with every mandatory item listed as UNRESOLVED, for the author to answer. */
export function starterProposal(scope: readonly WorkType[], id: string, title: string): DesignProposal {
  return {
    schema: PROPOSAL_SCHEMA, id, version: 1, title, dataStatus: "SYNTHETIC", canonVersion: CANON_VERSION, scope: [...scope],
    components: requirements(scope).filter((r) => r.role === "mandatory").map((r) => ({ ref: r.ref, decision: "UNRESOLVED", reason: "" })),
    claims: [], irreversible: [],
  };
}
