import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENGINE_VERSION as direct } from "../lib/engineVersion";
import { ENGINE_VERSION as viaEngine, runEngine, parseCsv } from "../lib/auditEngine";

test("ENGINE_VERSION is semver and the engine re-exports the same value", () => {
  assert.match(direct, /^\d+\.\d+\.\d+$/);
  assert.equal(viaEngine, direct);
});

test("ENGINE_VERSION is not part of the engine output (golden stays unchanged)", () => {
  const csv = readFileSync("tests/fixtures/audit_ledger.csv", "utf8");
  const result = runEngine(parseCsv(csv).rows);
  assert.equal("engineVersion" in result, false);
});

test("every PDF footer prints the engine version", () => {
  const src = readFileSync("lib/reportPdf.tsx", "utf8");
  const footers = src.match(/CONFIDENTIAL[^\n]*/g) ?? [];
  assert.ok(footers.length >= 3);
  for (const f of footers) assert.match(f, /ENGINE v/);
});
