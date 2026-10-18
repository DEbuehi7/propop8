// lib/canon/report.ts
//
// Renders the canon register as markdown for docs/canon/REGISTER.md.
// tests/canon.test.ts checks that the committed file matches this output,
// so the readable copy can never drift from the locked data.
// Regenerate with: npx tsx scripts/canon/report.ts

import { CANON_REGISTER, CANON_VERSION, STUDIES } from "./index";
import type { CanonEntry, CanonStatus } from "./register";

const ORDER: CanonStatus[] = ["CONFLICT", "OPEN", "LOCKED", "SPEC", "PROPOSED", "RESEARCH", "CONCEPT"];

const cite = (e: CanonEntry) => e.sources.map((x) => `${x.study} p${x.page}`).join("; ");
const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderRegisterMarkdown(): string {
  const out: string[] = [];
  out.push(`# AIM canon register (v${CANON_VERSION})`, "");
  out.push("Generated from `lib/canon/` by `npx tsx scripts/canon/report.ts`. Do not edit by hand; edit the register and regenerate.", "");

  const counts = ORDER.map((st) => `${st} ${CANON_REGISTER.filter((e) => e.status === st).length}`).join(" · ");
  out.push(`${CANON_REGISTER.length} entries from ${STUDIES.length} studies: ${counts}.`, "");

  out.push("## Coverage by study", "", "| Study | File | Pages | Entries |", "|---|---|---|---|");
  for (const s of STUDIES) {
    const ids = CANON_REGISTER.filter((e) => e.sources.some((x) => x.study === s.id)).map((e) => e.id);
    out.push(`| ${cell(s.title)} (\`${s.id}\`) | ${s.fileKey} | ${s.pages} | ${ids.join(", ")} |`);
  }
  out.push("");

  for (const st of ORDER) {
    const rows = CANON_REGISTER.filter((e) => e.status === st);
    if (!rows.length) continue;
    out.push(`## ${st}`, "", "| ID | Domain | Statement | Built | Where | Sources |", "|---|---|---|---|---|---|");
    for (const e of rows) {
      const statement = e.note ? `${e.statement} *${e.note}*` : e.statement;
      out.push(`| ${e.id} | ${e.domain} | ${cell(statement)} | ${e.impl} | ${cell((e.where ?? []).join("; "))} | ${cite(e)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}
