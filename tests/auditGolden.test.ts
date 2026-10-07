/**
 * Golden-output test for the paid audit.
 *
 * Runs a fixed, synthetic ledger (tests/fixtures/audit_ledger.csv) through
 * parseCsv + runEngine with a fixed as-of date and compares EVERYTHING the
 * report is built from -- findings, spend table, window, counts -- against
 * tests/fixtures/audit_golden.json.
 *
 * Any change to lib/auditEngine.ts (or the math it imports) that alters the
 * report fails here. If the change is intended, regenerate on purpose:
 *
 *   UPDATE_GOLDEN=1 npm test
 *
 * and review the JSON diff in the pull request. Never regenerate to make a
 * refactor pass: a refactor must leave this file untouched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, runEngine } from "../lib/auditEngine";

const dir = join(__dirname, "fixtures");
const AS_OF = Date.UTC(2026, 7, 1); // 2026-08-01, fixed so aging is reproducible

function produce() {
  const csv = readFileSync(join(dir, "audit_ledger.csv"), "utf8");
  const parsed = parseCsv(csv);
  const result = runEngine(parsed.rows, { asOf: AS_OF });
  return JSON.parse(
    JSON.stringify({
      parse: { totalRows: parsed.totalRows, droppedRows: parsed.droppedRows, rowCount: parsed.rows.length },
      result,
    }),
  );
}

test("golden: full engine output for the fixed ledger is unchanged", () => {
  const actual = produce();
  const goldenPath = join(dir, "audit_golden.json");
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(goldenPath)) {
    writeFileSync(goldenPath, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenPath, "utf8")));
});

test("golden fixture exercises every check", () => {
  const { result } = produce();
  const cats = new Set(result.findings.map((f: { category: string }) => f.category));
  assert.ok(result.findings.length >= 5, `expected several findings, got ${result.findings.length}`);
  // Names are read from the engine output itself, so this stays honest if titles change.
  assert.ok(result.spendTable.length >= 4);
  assert.ok(result.window, "window must be built");
  assert.ok(cats.size >= 4, `expected >=4 finding categories, got ${[...cats].join(", ")}`);
});
