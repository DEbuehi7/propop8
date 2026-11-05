/**
 * Writes docs/PROJECT_STATE.md from the repo (canon GOV-18).
 * Run: npm run state
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderProjectState } from "../../lib/state/projectState";

const root = join(__dirname, "..", "..");
writeFileSync(join(root, "docs", "PROJECT_STATE.md"), renderProjectState(root));
console.log("wrote docs/PROJECT_STATE.md");
