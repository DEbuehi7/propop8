/**
 * AIM-B5R Phase 1 build: inputs + evidence -> registers, gates, dossiers.
 *
 *   npx --yes tsx scripts/b5r/phase1.ts            (writes data/aim-b5r/phase1/out/)
 *   npx --yes tsx scripts/b5r/phase1.ts --date 2026-10-10
 *
 * Inputs (data/aim-b5r/phase1/):
 *   inputs/*.csv          the two pilot CSVs, unchanged
 *   sources.csv           source registry (hand-maintained)
 *   evidence_manual.csv   append-only evidence from official lookups
 *   signoffs.csv          human reviewer sign-offs
 * Re-running is safe: outputs are rebuilt, inputs are never modified.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import type { Evidence, Source } from "../../lib/b5r/phase1/contracts";
import { validateEvidence } from "../../lib/b5r/phase1/gate";
import { buildProperties, seedEvidence, PHASE1_RULES_VERSION, type Row } from "../../lib/b5r/phase1/seed";
import { blockers, dailyReport, dossier, evaluate, EVIDENCE_COLUMNS, lookupChecklist, matrixRow, MATRIX_COLUMNS, type Signoff } from "../../lib/b5r/phase1/report";

const DIR = join(__dirname, "..", "..", "data", "aim-b5r", "phase1");
const OUT = join(DIR, "out");
const argv = process.argv.slice(2);
const date = argv.includes("--date") ? argv[argv.indexOf("--date") + 1] : new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

const read = (f: string): Row[] => {
  const r = Papa.parse<Row>(readFileSync(join(DIR, f), "utf8"), { header: true, skipEmptyLines: true });
  if (r.errors.length) throw new Error(`${f}: ${r.errors.map((e) => e.message).join("; ")}`);
  return r.data;
};
const write = (f: string, rows: object[], columns?: readonly string[]) => {
  writeFileSync(join(OUT, f), Papa.unparse(rows as Record<string, unknown>[], columns ? { columns: [...columns] } : undefined) + "\n");
  return `out/${f}`;
};

const pilot = read("inputs/AIM_B5R_Kern_Fresno_10_Property_Pilot.csv");
const identity = read("inputs/AIM_B5R_Phase1_Identity_Authority_2026-10-09.csv");
const sources = read("sources.csv").map((s) => ({ ...s, tier: Number(s.tier) })) as unknown as Source[];
const manual = read("evidence_manual.csv").map((e) => ({ ...e, tier: Number(e.tier) })) as unknown as Evidence[];
const signoffs = read("signoffs.csv") as unknown as Signoff[];

const props = buildProperties(pilot, identity);
const known = new Set(props.map((p) => p.property_uuid));
for (const e of manual) {
  if (!known.has(e.property_uuid)) throw new Error(`${e.evidence_id}: unknown property_uuid ${e.property_uuid}`);
  const p = props.find((x) => x.property_uuid === e.property_uuid)!;
  if (p.lead_id !== e.lead_id) throw new Error(`${e.evidence_id}: lead_id ${e.lead_id} does not match ${p.lead_id}`);
}
const evidence = [...seedEvidence(props, identity), ...manual];
const outcomes = evaluate(props, evidence, signoffs);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "dossiers"), { recursive: true });
const changed = [
  write("properties.csv", props),
  write("source_registry.csv", sources),
  write("evidence_register.csv", evidence, EVIDENCE_COLUMNS),
  write("phase1_identity_authority.csv", outcomes.map(matrixRow), MATRIX_COLUMNS),
  write("gate_decisions.csv", outcomes.map((o) => ({
    lead_id: o.property.lead_id,
    property_uuid: o.property.property_uuid,
    proposed_gate: o.gate.proposed_gate,
    reasons: o.gate.reasons.join(" | "),
    open_core: o.gate.open_core.join(";"),
    conflicts: o.gate.conflicts.join(";"),
    evidence_snapshot_id: o.snapshot,
    reviewer: o.signoff?.reviewer ?? "",
    signed_at: o.signoff?.signed_at ?? "",
    final_gate: o.signoff?.final_gate ?? "",
    stale_signoff: o.staleSignoff ? `${o.staleSignoff.reviewer} ${o.staleSignoff.signed_at}` : "",
    rules_version: PHASE1_RULES_VERSION,
  }))),
];
for (const o of outcomes) {
  writeFileSync(join(OUT, "dossiers", `${o.property.lead_id}.md`), dossier(o, sources));
}
changed.push("out/dossiers/*.md");
writeFileSync(join(OUT, "source_access_blockers.md"), blockers(sources));
writeFileSync(join(OUT, "lookup_checklist.md"), lookupChecklist(outcomes));
changed.push("out/lookup_checklist.md");
changed.push("out/source_access_blockers.md");
const report = dailyReport(date, outcomes, sources, evidence, changed);
writeFileSync(join(OUT, `daily_report_${date}.md`), report);

const issues = validateEvidence(evidence);
console.log(report);
for (const o of outcomes) console.log(`${o.property.lead_id.padEnd(3)} ${o.gate.proposed_gate.padEnd(12)} ${o.gate.reasons.join("; ")}`);
if (issues.length) process.exitCode = 1;
