/**
 * GOV-18: docs/PROJECT_STATE.md is made from the repo and must match it, and
 * docs/README.md must list every document, so neither can quietly go stale.
 * Regenerate with `npm run state` (or UPDATE_GOLDEN=1 on this test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { envNames, renderProjectState, routePath } from "../lib/state/projectState";

const ROOT = join(__dirname, "..");

test("project state: docs/PROJECT_STATE.md matches the repo", () => {
  const path = join(ROOT, "docs", "PROJECT_STATE.md");
  const expected = renderProjectState(ROOT);
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(path, expected);
  assert.ok(existsSync(path), "run: npm run state");
  assert.equal(readFileSync(path, "utf8"), expected, "PROJECT_STATE.md is stale: run npm run state");
});

test("project state: names only, never values; deterministic", () => {
  const a = renderProjectState(ROOT);
  assert.equal(renderProjectState(ROOT), a);
  assert.doesNotMatch(a, /sk-[A-Za-z0-9_-]{12}|eyJ[A-Za-z0-9_-]{20}|re_[A-Za-z0-9]{16}/, "a credential-shaped string");
  for (const name of envNames(ROOT).keys()) assert.match(name, /^[A-Z][A-Z0-9_]+$/);
  assert.ok(envNames(ROOT).has("SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(envNames(ROOT).has("ANTHROPIC_API_KEY"), "names declared as *_ENV constants are found too");
});

test("project state: route paths", () => {
  assert.equal(routePath("app/page.tsx"), "/");
  assert.equal(routePath("app/admin/b5r/facade/page.tsx"), "/admin/b5r/facade");
  assert.equal(routePath("app/(marketing)/about/page.tsx"), "/about");
  assert.equal(routePath("app/api/upload/[token]/route.ts"), "/api/upload/[token]");
});

test("docs index: every document in the repo is listed in docs/README.md, and every link resolves", () => {
  const index = readFileSync(join(ROOT, "docs", "README.md"), "utf8");
  const linked = new Set([...index.matchAll(/\]\(([^)#\s]+\.md)\)/g)].map((m) => normalize(join("docs", m[1])).split("\\").join("/")));
  for (const p of linked) assert.ok(existsSync(join(ROOT, p)), `docs/README.md links to a missing file: ${p}`);
  const tracked = execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const docs = [...new Set([...tracked, "docs/PROJECT_STATE.md", "docs/README.md"])]
    .filter((p) => existsSync(join(ROOT, p)))
    .filter((p) => !p.startsWith("data/aim-b5r/phase1/out/")) // records, not documents
    .filter((p) => p !== "docs/README.md");
  const missing = docs.filter((p) => !linked.has(p));
  assert.deepEqual(missing, [], "add these to docs/README.md");
});
