/**
 * The continuity report as Markdown, for the design package and for review.
 * It renders the sealed report and adds nothing to it (GOV-01).
 */
import type { ContinuityReport } from "./contracts";
import { WORK_TYPE_MEANING } from "./map";

const cell = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ") || "–";

export function reportMarkdown(r: ContinuityReport): string {
  const p = r.proposal;
  const out: string[] = [];
  out.push(`# Design continuity: ${p.title}, version ${p.version}`, "");
  out.push(`**${r.call}**, coverage ${r.complete ? "complete" : "incomplete"}. ${r.meaning}`, "");
  out.push(
    `Proposal \`${p.id}\` version ${p.version}, ${p.dataStatus}, proposal hash \`${p.sha256}\`.`,
    `Checked against canon ${r.canonVersion} (written against ${p.canonVersion}), ${r.mapVersion}, ${r.engineVersion}.`,
    `Version approved by: ${p.approvedBy ?? "nobody yet"}.`,
    r.baseline
      ? `Replaces version ${r.baseline.version} (hash \`${r.baseline.sha256}\`, approved by ${r.baseline.approvedBy ?? "nobody"}).`
      : "No earlier version supplied.",
    `Report seal \`${r.sha256}\`.`,
    "",
  );
  out.push("Scope:", "", ...p.scope.map((w) => `- ${w}: ${WORK_TYPE_MEANING[w]}`), "");

  const c = r.counts;
  out.push(`## Findings (${r.findings.length})`, "");
  if (!r.findings.length) out.push("None.", "");
  else {
    out.push("| Call | Finding | Item | What | Fix |", "|---|---|---|---|---|");
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.code} | ${cell(f.key)} | ${cell(f.message)} | ${cell(f.fix)} |`);
    out.push("");
  }

  out.push(
    `## Coverage: ${c.answered} of ${c.mandatory} required items answered`, "",
    `Required items missing: ${c.missing}. All lines, including modules and items the author added: ${c.included} included, ${c.modified} modified, ${c.deferred} deferred, ${c.excluded} excluded, ${c.unresolved} unresolved.`, "",
    "| Item | Canon | Role | Decision | Reason | Until | Approved by | Flags |", "|---|---|---|---|---|---|---|---|",
  );
  for (const row of r.coverage) {
    out.push(`| ${row.ref}: ${cell(row.label)} | ${row.status} | ${row.role} | ${row.decision ?? "**not answered**"} | ${cell(row.reason)} | ${cell(row.until)} | ${cell(row.approvedBy)} | ${row.codes.join(", ") || "–"} |`);
  }
  out.push("");

  if (r.baseline) {
    out.push(`## Changes since version ${r.baseline.version} (${r.diff.length})`, "");
    if (!r.diff.length) out.push("None.", "");
    else {
      out.push("| Item | Before | After | Logged | Approved by |", "|---|---|---|---|---|");
      for (const d of r.diff) out.push(`| ${cell(d.key)} | ${cell(d.before)} | ${cell(d.after)} | ${d.logged ? "yes" : "**no**"} | ${cell(d.approvedBy)} |`);
      out.push("");
    }
  }

  out.push(`## Claims (${r.claims.length})`, "");
  if (!r.claims.length) out.push("None.", "");
  else {
    out.push("| Claim | Kind | Standing | Proof | Source | Text |", "|---|---|---|---|---|---|");
    for (const cl of r.claims) out.push(`| ${cell(cl.id)} | ${cl.kind} | ${cl.standing === "DESIGN_GOAL" ? "design goal, not a result" : cl.standing.toLowerCase()} | ${cl.proof ?? "–"} | ${cell(cl.source)} | ${cell(cl.text)} |`);
    out.push("");
  }

  out.push(`## Irreversible decisions (${r.irreversible.length})`, "");
  if (!r.irreversible.length) out.push("None.", "");
  else {
    out.push("| Decision | Evidence items | Approved by | Text |", "|---|---|---|---|");
    for (const d of r.irreversible) out.push(`| ${cell(d.id)} | ${d.evidence} | ${cell(d.approvedBy)} | ${cell(d.text)} |`);
    out.push("");
  }

  out.push("## Limits", "", ...r.limits.map((l) => `- ${l}`), "");
  return out.join("\n");
}
