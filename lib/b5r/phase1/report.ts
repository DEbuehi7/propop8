/**
 * Phase 1 outputs: identity matrix rows, gate decisions, dossiers, blockers
 * and the daily report. Pure string/record builders; the script writes files.
 */
import { createHash } from "node:crypto";
import { CORE, type Evidence, type Field, type GateResult, type Property, type Source } from "./contracts";
import { decideGate, fieldState, validateEvidence } from "./gate";
import { PHASE1_RULES_VERSION } from "./seed";

export interface Signoff {
  lead_id: string;
  final_gate: string;
  reviewer: string;
  signed_at: string;
  evidence_snapshot_id: string;
  notes: string;
}

/** Hash of every evidence row for one property: changes whenever its evidence changes. */
export function snapshotId(rows: Evidence[]): string {
  const canon = [...rows]
    .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id))
    .map((r) => EVIDENCE_COLUMNS.map((k) => `${k}=${String(r[k] ?? "")}`).join("|"))
    .join("\n");
  return "ES-" + createHash("sha256").update(canon).digest("hex").slice(0, 16);
}
export const EVIDENCE_COLUMNS: (keyof Evidence)[] = [
  "evidence_id", "property_uuid", "lead_id", "field", "value", "state", "source_id", "source_uri", "publisher",
  "tier", "observed_date", "retrieved_at", "coverage", "snapshot_ref", "reason", "reviewer", "recorded_at",
];

export interface PropertyOutcome {
  property: Property;
  rows: Evidence[];
  gate: GateResult;
  snapshot: string;
  signoff: Signoff | null; // only when it matches the current gate AND snapshot
  staleSignoff: Signoff | null; // signed, but evidence or gate changed since
}

export function evaluate(props: Property[], evidence: Evidence[], signoffs: Signoff[]): PropertyOutcome[] {
  return props.map((p) => {
    const rows = evidence.filter((r) => r.property_uuid === p.property_uuid);
    const gate = decideGate(p.lead_id, p.property_uuid, evidence);
    const snapshot = snapshotId(rows);
    const signed = signoffs.filter((s) => s.lead_id === p.lead_id && s.reviewer).at(-1) ?? null;
    const valid = signed && signed.evidence_snapshot_id === snapshot && signed.final_gate === gate.proposed_gate;
    if (valid) gate.needs_review = false;
    return { property: p, rows, gate, snapshot, signoff: valid ? signed : null, staleSignoff: signed && !valid ? signed : null };
  });
}

const best = (rows: Evidence[], f: Field) => {
  const fr = rows.filter((r) => r.field === f);
  return fr.find((r) => r.state === "verified") ?? fr.find((r) => r.state === "provisional") ?? fr[0];
};

export function nextAction(o: PropertyOutcome): string {
  const p = o.property;
  const open = o.gate.open_core;
  if (o.gate.proposed_gate === "FAIL") return "Reviewer confirms FAIL; drop from shortlist.";
  if (open.length === 0) return o.gate.needs_review ? "Reviewer signs the gate." : "Phase 2 screening.";
  const [num, ...rest] = p.lead_address.split(",")[0].trim().split(/\s+/);
  const street = rest.filter((w) => !/^(AVE|AVENUE|ST|STREET|BLVD|BOULEVARD|RD|ROAD|DR|DRIVE)$/i.test(w)).join(" ");
  const steps: string[] = [];
  if (open.includes("apn") || open.includes("situs_address")) {
    steps.push(p.county === "Kern"
      ? `Kern Assessor Property Search > Address Search: "${num} ${street}" (no street type). Screenshot the record showing APN and situs address.`
      : `Fresno Assessor Assessed Value Lookup for "${p.lead_address.split(",")[0]}". Screenshot the APN and situs address.`);
  }
  if (open.includes("geometry_match")) {
    steps.push(p.county === "Kern"
      ? "On the same record tap 'View Parcel Map'; screenshot the parcel."
      : "Parcel map viewer (by APN) or the county GIS portal: tap the parcel, screenshot the popup.");
  }
  if (open.includes("jurisdiction")) {
    steps.push(p.county === "Kern"
      ? "Official City of Bakersfield city-limits map (or Kern planning map): screenshot showing the parcel inside or outside city limits."
      : "City of Fresno City Limits map / county GIS city-limit layer: screenshot showing the parcel inside or outside city limits.");
  }
  return steps.join(" ");
}

export const MATRIX_COLUMNS = [
  "property_uuid", "lead_id", "pilot_id", "county", "lead_address", "official_situs_address", "situs_state",
  "apn", "apn_state", "apn_variants", "parcel_status", "apn_history", "jurisdiction", "jurisdiction_state",
  "planning_authority", "zoning", "zoning_state", "geometry_match", "geometry_state", "gis_layer_and_limits",
  "assessor_source_url", "assessor_retrieved_at", "jurisdiction_source_url", "jurisdiction_retrieved_at",
  "conflicts", "title_status", "reviewer", "evidence_snapshot_id", "next_action", "proposed_gate", "final_gate",
  "rules_version",
] as const;

export function matrixRow(o: PropertyOutcome): Record<(typeof MATRIX_COLUMNS)[number], string> {
  const r = o.rows;
  const v = (f: Field) => best(r, f)?.value ?? "";
  const st = (f: Field) => fieldState(r, f);
  const apnVals = [...new Set(r.filter((x) => x.field === "apn" && x.value).map((x) => x.value))];
  const apn = best(r, "apn");
  const jur = best(r, "jurisdiction");
  const geo = best(r, "geometry_match");
  return {
    property_uuid: o.property.property_uuid,
    lead_id: o.property.lead_id,
    pilot_id: o.property.pilot_id,
    county: o.property.county,
    lead_address: o.property.lead_address,
    official_situs_address: st("situs_address") === "verified" ? v("situs_address") : "",
    situs_state: st("situs_address"),
    apn: st("apn") === "verified" ? v("apn") : "",
    apn_state: st("apn"),
    apn_variants: apnVals.join(" | "),
    parcel_status: st("parcel_status") === "missing" ? "UNKNOWN" : v("parcel_status"),
    apn_history: st("apn_history") === "missing" ? "NOT_AVAILABLE" : v("apn_history"),
    jurisdiction: st("jurisdiction") === "verified" ? v("jurisdiction") : "",
    jurisdiction_state: st("jurisdiction"),
    planning_authority: v("planning_authority"),
    zoning: v("zoning"),
    zoning_state: st("zoning"),
    geometry_match: v("geometry_match"),
    geometry_state: st("geometry_match"),
    gis_layer_and_limits: geo?.coverage ?? "",
    assessor_source_url: apn?.tier && apn.tier <= 2 ? apn.source_uri : "",
    assessor_retrieved_at: apn?.tier && apn.tier <= 2 ? apn.retrieved_at : "",
    jurisdiction_source_url: jur?.state === "verified" ? jur.source_uri : "",
    jurisdiction_retrieved_at: jur?.state === "verified" ? jur.retrieved_at : "",
    conflicts: o.gate.conflicts.join(";"),
    title_status: st("title_status") === "missing" ? "NOT_RETRIEVED" : v("title_status"),
    reviewer: o.signoff?.reviewer ?? "",
    evidence_snapshot_id: o.snapshot,
    next_action: nextAction(o),
    proposed_gate: o.gate.proposed_gate,
    final_gate: o.signoff?.final_gate ?? "",
    rules_version: PHASE1_RULES_VERSION,
  };
}

const cell = (s: string) => (s || "").replace(/\|/g, "/").replace(/\n/g, " ");

export function dossier(o: PropertyOutcome, sources: Source[]): string {
  const p = o.property;
  const byId = new Map(sources.map((s) => [s.source_id, s]));
  const lines = [
    `# ${p.lead_id} — ${p.lead_address}`,
    "",
    `Property UUID \`${p.property_uuid}\` · ${p.pilot_id} · ${p.county} County · rules \`${PHASE1_RULES_VERSION}\` · evidence snapshot \`${o.snapshot}\``,
    "",
    `**Proposed gate: ${o.gate.proposed_gate}**${o.signoff ? ` · signed ${o.signoff.final_gate} by ${o.signoff.reviewer} on ${o.signoff.signed_at}` : " · not yet reviewed"}`,
    "",
    ...o.gate.reasons.map((r) => `- ${r}`),
    ...(o.staleSignoff ? ["", `> A sign-off by ${o.staleSignoff.reviewer} (${o.staleSignoff.signed_at}) no longer matches the current evidence or gate; it must be re-signed.`] : []),
    "",
    "## Core identity",
    "",
    "| Fact | State | Value | Source | Retrieved | Snapshot |",
    "|---|---|---|---|---|---|",
    ...CORE.map((f) => {
      const b = best(o.rows, f);
      const src = b?.source_id ? b.source_id.split(";").map((id) => byId.get(id)?.publisher ?? id).join("; ") : "";
      return `| ${f} | ${fieldState(o.rows, f)} | ${cell(b?.value ?? "")} | ${cell(src)} | ${cell(b?.retrieved_at ?? "")} | ${cell(b?.snapshot_ref ?? "")} |`;
    }),
    "",
    "## All evidence rows",
    "",
    "| ID | Fact | State | Value | Tier | Why |",
    "|---|---|---|---|---|---|",
    ...o.rows.map((r) => `| ${r.evidence_id} | ${r.field} | ${r.state} | ${cell(r.value)} | ${r.tier} | ${cell(r.reason)} |`),
    "",
    "## Advertised (not evidence)",
    "",
    `Asking price $${Number(p.advertised_asking_price_usd).toLocaleString("en-US")} and broker cap rate ${p.advertised_cap_rate_pct}% as listed (${p.listing_source_url}). Broker figures are not used in Phase 1.`,
    "",
    "## Next action",
    "",
    nextAction(o),
    "",
    "## Review",
    "",
    "Reviewer: ______________________  Date: __________  Final gate: PASS / CONDITIONAL / HOLD / FAIL",
    "",
    "Source discovery, parcel-record verification and acquisition feasibility are separate stages. A Phase 1 gate says nothing about price, condition, legal units or financing.",
    "",
  ];
  return lines.join("\n");
}

export function blockers(sources: Source[]): string {
  const rows = sources.filter((s) => s.access_status !== "reachable");
  return [
    "# Source access blockers",
    "",
    "Sources Claude's workspace cannot use directly, with the official alternative.",
    "",
    "| Source | Status | Why | Official alternative |",
    "|---|---|---|---|",
    ...rows.map((s) => {
      const alt = s.access_status === "interactive_only" || s.access_status === "blocked"
        ? "Owner looks it up on the official site and sends a screenshot; Claude logs it as evidence with time and file hash."
        : "Check when Phase 1 reaches it.";
      return `| ${s.source_id} ${cell(s.title)} (${cell(s.publisher)}) | ${s.access_status} | ${cell(s.access_notes)} | ${alt} |`;
    }),
    "",
  ].join("\n");
}

export function dailyReport(date: string, outcomes: PropertyOutcome[], sources: Source[], evidence: Evidence[], changedFiles: string[]): string {
  const count = (g: string) => outcomes.filter((o) => o.gate.proposed_gate === g).length;
  const verifiedApn = outcomes.filter((o) => fieldState(o.rows, "apn") === "verified").map((o) => o.property.lead_id);
  const jur = outcomes.filter((o) => fieldState(o.rows, "jurisdiction") === "verified").map((o) => o.property.lead_id);
  const geo = outcomes.filter((o) => fieldState(o.rows, "geometry_match") === "verified").map((o) => o.property.lead_id);
  const conflicts = outcomes.filter((o) => o.gate.conflicts.length).map((o) => `${o.property.lead_id} (${o.gate.conflicts.join(", ")})`);
  const touched = [...new Set(evidence.filter((e) => e.recorded_at.startsWith(date)).map((e) => e.lead_id))];
  const issues = validateEvidence(evidence);
  return [
    `# Daily report — ${date}`,
    "",
    `- Sources accessed: ${sources.filter((s) => s.checked_at.startsWith(date) && s.checked_at.includes("T")).map((s) => s.source_id).join(", ") || "none"}`,
    `- Properties touched: ${touched.join(", ") || "none"}`,
    `- Official APNs verified: ${verifiedApn.length}${verifiedApn.length ? ` (${verifiedApn.join(", ")})` : ""}`,
    `- Jurisdictions verified: ${jur.length}${jur.length ? ` (${jur.join(", ")})` : ""}`,
    `- Geometry reconciled: ${geo.length}${geo.length ? ` (${geo.join(", ")})` : ""}`,
    `- Conflicts: ${conflicts.join("; ") || "none"}`,
    `- Blocked sources: ${sources.filter((s) => s.access_status === "blocked" || s.access_status === "interactive_only").map((s) => `${s.source_id} (${s.access_status})`).join(", ") || "none"}`,
    `- Gates: PASS ${count("PASS")} · CONDITIONAL ${count("CONDITIONAL")} · HOLD ${count("HOLD")} · FAIL ${count("FAIL")} (proposed; ${outcomes.filter((o) => !o.gate.needs_review).length} signed)`,
    `- Evidence rows rejected by validation: ${issues.length}${issues.length ? " — " + issues.map((i) => `${i.evidence_id}: ${i.message}`).join("; ") : ""}`,
    `- Next 24 h: ${outcomes.filter((o) => o.gate.open_core.length).length} properties need official lookups (see each dossier's next action).`,
    `- Changed files: ${changedFiles.join(", ") || "none"}`,
    "",
  ].join("\n");
}

/** Phone-friendly list of the official lookups still needed, one block per property. */
export function lookupChecklist(outcomes: PropertyOutcome[]): string {
  const open = outcomes.filter((o) => o.gate.open_core.length > 0);
  const lines = [
    "# Official lookups still needed",
    "",
    "For each property: take the screenshots listed, make sure the APN, the address and the website address bar (or page title) are visible, and send them with the property ID (e.g. \"K2\").",
    "",
  ];
  for (const county of ["Kern", "Fresno"] as const) {
    const these = open.filter((o) => o.property.county === county);
    if (!these.length) continue;
    lines.push(`## ${county}`, "");
    for (const o of these) {
      const lead = o.rows.filter((r) => r.field === "apn" && r.value).map((r) => r.value);
      lines.push(`- [ ] **${o.property.lead_id}** ${o.property.lead_address}${lead.length ? ` (listing APN to compare: ${lead.join(" / ")})` : ""}`);
      lines.push(`  ${nextAction(o)}`);
    }
    lines.push("");
  }
  if (!open.length) lines.push("All core facts are evidenced. Next: reviewer sign-off.");
  return lines.join("\n") + "\n";
}
