/**
 * Phase 0D source/version registry: every agency form the recert engine
 * links to (public/tools/recert/engine.html, FORMS) has a row in
 * data/propops8/sources.csv with the same URL and edition. Updating a form in
 * the engine without updating the registry fails here. Columns follow the
 * dataset contract's `sources` table (docs/aim-dataset/CONTRACT.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";

const ROOT = join(__dirname, "..");
const CT = "https://www.treasurer.ca.gov/sites/default/files/";
const COLUMNS = ["source_id", "publisher", "title", "url", "tier", "edition", "coverage", "limitations", "checked_at", "access_status", "source_type", "sha256"];

function engineForms() {
  const s = readFileSync(join(ROOT, "public", "tools", "recert", "engine.html"), "utf8");
  const block = s.slice(s.indexOf("const FORMS = {"));
  const body = block.slice(0, block.indexOf("};"));
  return [...body.matchAll(/(\w+):\s*\{name:"([^"]+)",\s*ver:"([^"]+)",\s*src:(null|CT\+"([^"]+)")/g)].map((m) => ({
    key: m[1], name: m[2], ver: m[3], url: m[5] ? CT + m[5] : "",
  }));
}

const csv = Papa.parse<Record<string, string>>(readFileSync(join(ROOT, "data", "propops8", "sources.csv"), "utf8"), { header: true, skipEmptyLines: true });

test("source registry: header matches the dataset contract", () => {
  assert.deepEqual(csv.meta.fields, COLUMNS);
});

test("source registry: every engine form has a row with the same URL and edition", () => {
  const forms = engineForms();
  assert.ok(forms.length >= 16, "FORMS table not found in engine.html");
  const byId = new Map(csv.data.map((r) => [r.source_id, r]));
  for (const f of forms) {
    const row = byId.get(`P8-RECERT-${f.key}`);
    assert.ok(row, `no registry row for engine form '${f.key}'`);
    assert.equal(row.url, f.url, `${f.key}: URL differs from the engine`);
    assert.equal(row.edition, f.ver, `${f.key}: edition differs from the engine`);
    assert.equal(row.access_status, f.url ? row.access_status : "no_link");
  }
  assert.equal(csv.data.length, forms.length, "registry has rows the engine no longer uses");
});

test("source registry: a checked row carries its date", () => {
  for (const r of csv.data) {
    if (r.access_status === "ok") assert.match(r.checked_at, /^\d{4}-\d{2}-\d{2}$/, `${r.source_id} marked ok without checked_at`);
  }
});
