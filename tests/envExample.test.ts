/**
 * Phase 0D: .env.local.example lists every variable the deployed code reads,
 * by name, with no real values. A new process.env.X in app/, lib/, components/,
 * hooks/ or proxy.ts fails here until it is documented.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanText } from "../lib/security/secretScan";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "lib", "components", "hooks"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function namesUsed(): Set<string> {
  const files = [...DIRS.flatMap((d) => walk(join(ROOT, d))), join(ROOT, "proxy.ts")];
  const names = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
  names.delete("NODE_ENV");
  names.delete("NEXT_RUNTIME");
  return names;
}

const example = readFileSync(join(ROOT, ".env.local.example"), "utf8");
const listed = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));

test("env example: every variable the app reads is listed", () => {
  const missing = [...namesUsed()].filter((n) => !listed.has(n)).sort();
  assert.deepEqual(missing, [], "add these to .env.local.example");
});

test("env example: secret-looking variables have no value", () => {
  for (const m of example.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
    const [, name, value] = m;
    if (/KEY|SECRET|PASSWORD|TOKEN/.test(name)) assert.equal(value.trim(), "", `${name} must be blank in the template`);
  }
  assert.deepEqual(scanText(".env.local.example", example), []);
});
