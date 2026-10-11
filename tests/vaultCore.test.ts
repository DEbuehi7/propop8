import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkAdd, isAgeEncrypted, isPrivilegedKey, objectPath, planDerivatives, pureExport, sha256 } from "../lib/vault/core";

const jwt = (role: string) =>
  ["e30", Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url"), "sig"].join(".");

test("vault tool refuses keys that bypass the access rules", () => {
  assert.equal(isPrivilegedKey(jwt("service_role")), true);
  assert.equal(isPrivilegedKey("sb_secret_abc123"), true);
  assert.equal(isPrivilegedKey(jwt("anon")), false);
  assert.equal(isPrivilegedKey("sb_publishable_abc123"), false);
});

test("object paths are readable, safe and fingerprinted", () => {
  const sha = sha256(Buffer.from("x"));
  assert.equal(objectPath("filing", "/Users/d/Articles of Org (AIM).pdf", sha, 2024), `filing/2024/${sha.slice(0, 8)}-Articles_of_Org_AIM_.pdf`);
  assert.ok(!objectPath("filing", "../../etc/passwd", sha, 2024).includes(".."));
});

test("restricted items get no light copies; images and lossless audio do", () => {
  assert.deepEqual(planDerivatives("logo.png", 3), []);
  assert.equal(planDerivatives("logo.png", 1)[0].ext, ".webp");
  assert.deepEqual(planDerivatives("logo.webp", 1), []);
  assert.equal(planDerivatives("master.wav", 2)[0].ext, ".m4a");
  assert.deepEqual(planDerivatives("song.m4a", 2), []);
  assert.deepEqual(planDerivatives("filing.pdf", 2), []);
});

const hasAge = spawnSync("age", ["--version"]).status === 0 && spawnSync("age-keygen", ["--version"]).status === 0;

test("tier 3 needs a real age-encrypted file; tier 0-2 must not be encrypted", { skip: !hasAge && "age not installed" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-age-"));
  try {
    const key = join(dir, "key.txt");
    spawnSync("age-keygen", ["-o", key]);
    const recipient = readFileSync(key, "utf8").match(/public key: (age1\w+)/)![1];
    writeFileSync(join(dir, "doc.pdf"), "%PDF-1.4 synthetic");
    assert.equal(spawnSync("age", ["-r", recipient, "-o", join(dir, "doc.pdf.age"), join(dir, "doc.pdf")]).status, 0);
    const enc = readFileSync(join(dir, "doc.pdf.age"));
    const plain = readFileSync(join(dir, "doc.pdf"));
    assert.equal(isAgeEncrypted(enc), true);
    assert.equal(isAgeEncrypted(plain), false);
    const base = { entity: "sbi-inc", category: "filing", title: "EIN letter" };
    assert.deepEqual(checkAdd({ ...base, tier: 3, fileName: "doc.pdf.age", head: enc }), []);
    assert.match(checkAdd({ ...base, tier: 3, fileName: "doc.pdf", head: plain }).join(), /encrypted first/);
    assert.match(checkAdd({ ...base, tier: 3, fileName: "fake.pdf.age", head: plain }).join(), /not age-encrypted/);
    assert.match(checkAdd({ ...base, tier: 2, fileName: "doc.pdf.age", head: enc }).join(), /tier 3/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown entity, category or tier is refused before anything uploads", () => {
  const issues = checkAdd({ entity: "his-llc", category: "memo", title: "", tier: 5, fileName: "a.pdf", head: Buffer.from("%PDF") });
  assert.equal(issues.length, 4);
});

test("Pure export carries tier 0-1 titles and open deadlines only", () => {
  const md = pureExport(
    [
      { id: "1", entity_id: "aim-llc", category: "plan", title: "PropOps8 roadmap", doc_date: "2026-10-01", expires_on: null, status: "active", tier: 1, tags: ["plan"], projects: [] },
      { id: "2", entity_id: "sbi-inc", category: "filing", title: "EIN letter", doc_date: "2024-01-05", expires_on: null, status: "active", tier: 3, tags: [], projects: [] },
      { id: "3", entity_id: "aim-llc", category: "contract", title: "Vendor agreement", doc_date: null, expires_on: null, status: "active", tier: 2, tags: [], projects: [] },
    ],
    [
      { entity_id: "aim-llc", title: "Statement of Information", due_on: "2027-03-31", recurrence: "biennial", status: "open" },
      { entity_id: "aim-llc", title: "Old filing", due_on: "2025-01-01", recurrence: "none", status: "done" },
    ],
    "2026-10-10",
  );
  assert.match(md, /PropOps8 roadmap/);
  assert.doesNotMatch(md, /EIN letter|Vendor agreement|Old filing/);
  assert.match(md, /Statement of Information/);
});
