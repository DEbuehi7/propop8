// Scans for credentials. Prints file:line and rule only; values are redacted.
//   npx tsx scripts/security/scanSecrets.ts            tracked files (exit 1 on any finding)
//   npx tsx scripts/security/scanSecrets.ts --history  every commit on every branch (informational)
// A history finding is closed by revoking that credential; deleting the file does not remove it.
import { scanHistory, scanRepo } from "../../lib/security/scanRepo";

if (process.argv.includes("--history")) {
  const findings = scanHistory(process.cwd());
  for (const f of findings) console.log(`${f.file}  ${f.rule}  ${f.preview}`);
  console.log(`${findings.length} distinct credential(s) or env file(s) found in history.`);
  console.log("Each one must be revoked or rotated at its provider; record the date in docs/security/README.md.");
} else {
  const { files, findings } = scanRepo(process.cwd());
  for (const f of findings) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.preview}`);
  console.log(`${files} tracked files scanned, ${findings.length} finding(s).`);
  process.exit(findings.length ? 1 : 0);
}
