/**
 * Aging against the file's own history. The main golden fixture has no
 * opened_date on closed rows, so this check stays silent there (proved below);
 * a second fixture with those dates exercises it, with its own golden.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, runEngine } from "../lib/auditEngine";

const dir = join(__dirname, "fixtures");
const AS_OF = Date.UTC(2026, 7, 1);
const run = (f: string) => runEngine(parseCsv(readFileSync(join(dir, f), "utf8")).rows, { asOf: AS_OF });
const CAT = "Open-item aging vs this file's history";

test("silent when closed items have no opened_date (main fixture)", () => {
  assert.ok(!run("audit_ledger.csv").findings.some((f) => f.category === CAT));
});

test("golden: aging fixture output is unchanged", () => {
  const actual = JSON.parse(JSON.stringify(run("audit_ledger_aging.csv")));
  const p = join(dir, "audit_aging_golden.json");
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(p)) {
    writeFileSync(p, JSON.stringify(actual, null, 2) + "\n");
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(p, "utf8")));
});

test("fewer than 8 closed items: skipped, not estimated", () => {
  const csv = "date,vendor,category,amount,status,opened_date,closed_date\n" +
    "2026-06-01,A,X,10,closed,2026-05-30,2026-06-01\n2026-06-02,A,X,10,open,2026-01-01,\n";
  const r = runEngine(parseCsv(csv).rows, { asOf: AS_OF });
  assert.ok(!r.findings.some((f) => f.category === CAT));
});
