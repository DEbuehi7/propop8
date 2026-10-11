/**
 * Phase 1 evidence validation and gate decision. Pure and deterministic.
 *
 * Gate rules (handoff v1.1):
 *   FAIL        a documented material identity contradiction, or confirmed
 *               ineligibility: a verified identity_contradiction / ineligible
 *               row from an official source WITH a named reviewer.
 *   PASS        apn, situs_address, jurisdiction and geometry_match all
 *               verified from official sources, with no conflicts on them.
 *   CONDITIONAL apn, situs_address and jurisdiction verified; geometry only
 *               provisional (screening match not yet reconciled). This is the
 *               one gap treated as non-critical for identity.
 *   HOLD        everything else. Missing evidence never becomes FAIL.
 * Every proposed gate stays "needs review" until a human signs it.
 */
import { CORE, type Evidence, type EvidenceState, type Field, type GateResult } from "./contracts";

export interface EvidenceIssue {
  evidence_id: string;
  message: string;
}

/** Rows that break the evidence rules. Such rows are ignored by the gate. */
export function validateEvidence(rows: Evidence[]): EvidenceIssue[] {
  const issues: EvidenceIssue[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const bad = (message: string) => issues.push({ evidence_id: r.evidence_id, message });
    if (!r.evidence_id) bad("evidence_id is required");
    if (seen.has(r.evidence_id)) bad("duplicate evidence_id");
    seen.add(r.evidence_id);
    if (r.state === "verified") {
      if (r.tier > 2) bad("only official sources (tier 1-2) can verify a fact; listings stay provisional");
      if (!r.source_uri) bad("verified needs source_uri");
      if (!r.retrieved_at) bad("verified needs retrieved_at");
      if (!r.snapshot_ref) bad("verified needs snapshot_ref (screenshot or saved file)");
      if (!r.value) bad("verified needs a value");
    }
    if (r.state === "missing" && r.value) bad("a missing fact has no value");
    if ((r.field === "identity_contradiction" || r.field === "ineligible") && !r.reviewer) {
      bad(`${r.field} must name a human reviewer`);
    }
  }
  return issues;
}

/** Digits only. Formats differ by source (dashes, suffixes); the digits are the identity. */
export function apnDigits(apn: string): string {
  return apn.replace(/\D/g, "");
}

/**
 * Same APN? "same" = identical digits; "variant" = one is a leading part of
 * the other (at least 8 digits), which needs an official lookup to settle;
 * "different" otherwise. Never used to verify, only to spot conflicts.
 */
export function compareApn(a: string, b: string): "same" | "variant" | "different" {
  const x = apnDigits(a);
  const y = apnDigits(b);
  if (!x || !y) return "different";
  if (x === y) return "same";
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 8 && l.startsWith(s) ? "variant" : "different";
}

const normAddr = (a: string) =>
  a.toUpperCase().replace(/[.,#]/g, " ").replace(/\b(AVENUE)\b/g, "AVE").replace(/\b(STREET)\b/g, "ST")
    .replace(/\b(BOULEVARD)\b/g, "BLVD").replace(/\s+/g, " ").trim();

function sameValue(field: Field, a: string, b: string): boolean {
  if (field === "apn") return compareApn(a, b) === "same";
  if (field === "situs_address") return normAddr(a) === normAddr(b);
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** Effective state of one field for one property, from its valid rows. */
export function fieldState(rows: Evidence[], field: Field): EvidenceState {
  const f = rows.filter((r) => r.field === field);
  if (f.length === 0) return "missing";
  const verified = f.filter((r) => r.state === "verified");
  if (verified.length > 0) {
    const first = verified[0];
    if (verified.some((r) => !sameValue(field, r.value, first.value))) return "conflicting";
    // An official value that disagrees with an explicit conflicting row stays conflicting.
    if (f.some((r) => r.state === "conflicting")) return "conflicting";
    return "verified";
  }
  if (f.some((r) => r.state === "conflicting")) return "conflicting";
  if (f.some((r) => r.state === "provisional")) return "provisional";
  if (f.some((r) => r.state === "stale")) return "stale";
  return "missing";
}

export function decideGate(lead_id: string, property_uuid: string, all: Evidence[]): GateResult {
  const invalid = new Set(validateEvidence(all).map((i) => i.evidence_id));
  const rows = all.filter((r) => r.property_uuid === property_uuid && !invalid.has(r.evidence_id));
  const state = (f: Field) => fieldState(rows, f);
  const reasons: string[] = [];
  const open_core = CORE.filter((f) => state(f) !== "verified");
  const conflicts = (CORE as Field[]).concat(["zoning", "planning_authority"]).filter((f) => state(f) === "conflicting");

  const failRows = rows.filter(
    (r) => (r.field === "identity_contradiction" || r.field === "ineligible") && r.state === "verified" && r.reviewer,
  );
  let proposed_gate: GateResult["proposed_gate"];
  if (failRows.length > 0) {
    proposed_gate = "FAIL";
    for (const r of failRows) reasons.push(`${r.field}: ${r.value} (${r.evidence_id}, reviewer ${r.reviewer})`);
  } else if (open_core.length === 0) {
    proposed_gate = "PASS";
    reasons.push("APN, address, jurisdiction and screening geometry verified from official sources");
  } else if (
    state("apn") === "verified" && state("situs_address") === "verified" &&
    state("jurisdiction") === "verified" && state("geometry_match") === "provisional"
  ) {
    proposed_gate = "CONDITIONAL";
    reasons.push("Core identity verified; parcel geometry only screened, not reconciled");
  } else {
    proposed_gate = "HOLD";
    for (const f of open_core) reasons.push(`${f}: ${state(f)}`);
  }
  for (const f of conflicts) if (!reasons.some((r) => r.startsWith(f))) reasons.push(`${f}: conflicting`);
  if (invalid.size > 0 && all.some((r) => r.property_uuid === property_uuid && invalid.has(r.evidence_id))) {
    reasons.push("some evidence rows were rejected by validation (see report)");
  }
  return { lead_id, property_uuid, proposed_gate, reasons, open_core, conflicts, needs_review: true };
}
