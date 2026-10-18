// lib/security/scanRepo.ts
//
// Runs the secret scan over every file git tracks. Node-only (uses git and fs);
// used by tests/secretScan.test.ts and scripts/security/scanSecrets.ts.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isForbiddenEnvFile, looksBinary, scanText, type SecretFinding } from "./secretScan";

const MAX_BYTES = 5 * 1024 * 1024;

export function trackedFiles(root: string): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter(Boolean);
}

/**
 * Scans every commit's added lines on every branch. Informational: history
 * cannot be cleaned by a commit, so a historic finding is closed by revoking
 * that credential, not by deleting the file. Findings name commit and path.
 */
export function scanHistory(root: string): SecretFinding[] {
  const log = execFileSync("git", ["log", "--all", "-p", "--no-color", "--no-ext-diff", "--format=@@COMMIT %H"], {
    cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024,
  });
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  let commit = "";
  let file = "";
  for (const line of log.split("\n")) {
    if (line.startsWith("@@COMMIT ")) { commit = line.slice(9, 17); continue; }
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      if (isForbiddenEnvFile(file) && !seen.has(`${file}|env`)) {
        seen.add(`${file}|env`);
        findings.push({ file: `${commit}:${file}`, line: 0, rule: "tracked-env-file", preview: "env file was committed" });
      }
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const f of scanText(file, line.slice(1))) {
      const key = `${f.rule}|${f.preview}`;
      if (seen.has(key)) continue; // report each distinct credential once, at its first appearance
      seen.add(key);
      findings.push({ ...f, file: `${commit}:${file}`, line: 0 });
    }
  }
  return findings;
}

export function scanRepo(root: string): { files: number; findings: SecretFinding[] } {
  const files = trackedFiles(root);
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (isForbiddenEnvFile(file)) {
      findings.push({ file, line: 0, rule: "tracked-env-file", preview: "env file must not be tracked" });
      continue;
    }
    const path = join(root, file);
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue; // deleted in the working tree
    }
    if (size === 0 || size > MAX_BYTES) continue;
    const buf = readFileSync(path);
    if (looksBinary(buf)) continue;
    findings.push(...scanText(file, buf.toString("utf8")));
  }
  return { files: files.length, findings };
}
