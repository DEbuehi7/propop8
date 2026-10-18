// Writes docs/canon/REGISTER.md from lib/canon. Run: npx tsx scripts/canon/report.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderRegisterMarkdown } from "../../lib/canon/report";

const path = join(__dirname, "..", "..", "docs", "canon", "REGISTER.md");
writeFileSync(path, renderRegisterMarkdown());
console.log(`wrote ${path}`);
