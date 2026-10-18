/**
 * Phase 0D: no secrets in tracked files (canon GOV-08).
 * The fakes below are assembled at runtime so this file never contains a
 * string that looks like a real credential.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { isForbiddenEnvFile, scanText, SECRET_RULES } from "../lib/security/secretScan";
import { scanRepo } from "../lib/security/scanRepo";

const rep = (ch: string, n: number) => ch.repeat(n);
const FAKES: Record<string, string> = {
  "private-key": ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
  jwt: ["eyJ" + rep("a", 20), "eyJ" + rep("b", 20), rep("c", 20)].join("."),
  "supabase-secret": "sb_" + "secret_" + rep("x", 30),
  "stripe-key": "sk_" + "live_" + rep("A1", 12),
  "stripe-webhook": "whsec_" + rep("Z9", 12),
  "resend-key": "re_" + "Ab1" + rep("c", 25),
  "anthropic-key": "sk-" + "ant-" + rep("q", 30),
  "openai-key": "sk-" + "proj-" + rep("w", 40),
  "github-token": "ghp_" + rep("G", 36),
  "aws-access-key": "AKIA" + rep("Q", 16),
  "google-api-key": "AIza" + rep("y", 35),
  "db-url-password": "postgres://admin:" + "hunter22x" + "@db.example.com/x",
};

test("secret scan: every rule catches its fake", () => {
  for (const rule of SECRET_RULES) {
    const fake = FAKES[rule.id];
    assert.ok(fake, `no fake for ${rule.id}`);
    const found = scanText("fake.txt", `const v = "${fake}";`).map((f) => f.rule);
    assert.ok(found.includes(rule.id), `${rule.id} missed`);
  }
});

test("secret scan: findings never contain the value", () => {
  for (const fake of Object.values(FAKES)) {
    for (const f of scanText("fake.txt", fake)) {
      assert.ok(!JSON.stringify(f).includes(fake.slice(4)), `${f.rule} leaked its value`);
      assert.match(f.preview, /^.{1,4}… \(\d+ chars\)$/);
    }
  }
});

test("secret scan: ordinary code, placeholders and the allow marker pass", () => {
  const clean = [
    "SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here",
    "const key = process.env.RESEND_API_KEY;",
    "re_render_the_component_tree_again",
    "postgres://user:[YOUR-PASSWORD]@host/db",
    `const t = "${FAKES["stripe-key"]}"; // secret-scan: allow (test fixture)`,
  ].join("\n");
  assert.deepEqual(scanText("clean.ts", clean), []);
});

test("secret scan: env files are refused, templates are allowed", () => {
  for (const p of [".env", ".env.local", "app/.env.production", ".env.development.local"]) assert.ok(isForbiddenEnvFile(p), p);
  for (const p of [".env.local.example", ".env.example", "docs/.env.sample", "lib/env.ts", "environment.md"]) assert.ok(!isForbiddenEnvFile(p), p);
});

test("secret scan: no tracked file holds a credential or an env file", () => {
  const { files, findings } = scanRepo(join(__dirname, ".."));
  assert.ok(files > 100, "git ls-files returned too few files");
  assert.deepEqual(findings.map((f) => `${f.file}:${f.line} ${f.rule}`), []);
});
