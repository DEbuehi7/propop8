/**
 * Run: npm test   (uses tsx via npx; no new dependency)
 * Also run under other time zones:  TZ=Australia/Sydney npm test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, runEngine, toAmount, parseLedgerDate } from "../lib/auditEngine";

const H = "date,vendor,category,amount\n";
const day = (s: string) => new Date(parseLedgerDate(s)!).toISOString().slice(0, 10);

test("amounts: every negative notation reads as negative", () => {
  for (const s of ["(85.00)", "($85.00)", "$(85.00)", "-85", "-$85", "−85", "85.00-", "–85"]) {
    assert.equal(toAmount(s), -85, s);
  }
  assert.equal(toAmount("$1,234.56"), 1234.56);
  assert.equal(toAmount("  $ 12 "), 12);
  assert.equal(toAmount(0), 0);
  assert.equal(toAmount("0"), 0);
});

test("amounts: unreadable formats are rejected, never guessed", () => {
  for (const s of ["1.234,56", "12,50", "12 CR", "abc", "", "1,23,456", "1.2.3", "--", "()"]) {
    assert.ok(Number.isNaN(toAmount(s)), `"${s}" should be NaN`);
  }
});

test("dropped rows are counted and disclosed", () => {
  const p = parseCsv(H + '2026-01-05,V,Plumbing,"12 CR"\n2026-01-06,V,Plumbing,50\n');
  assert.equal(p.rows.length, 1);
  assert.equal(p.droppedRows, 1);
  assert.equal(p.totalRows, 2);
});

test("dates: the written calendar date, regardless of timezone", () => {
  assert.equal(day("10/01/2026"), "2026-10-01");
  assert.equal(day("2026-10-01"), "2026-10-01");
  assert.equal(day("2026-10-01 00:30:00"), "2026-10-01");
  assert.equal(day("2026-10-01T23:59:00Z"), "2026-10-01");
  assert.equal(day("1/2/26"), "2026-01-02");
  assert.equal(day("Oct 5, 2026"), "2026-10-05");
  assert.equal(parseLedgerDate("13/01/2026"), null, "D/M is rejected, not flipped");
  assert.equal(parseLedgerDate("02/30/2026"), null);
  assert.equal(parseLedgerDate("5"), null);
  assert.equal(parseLedgerDate(""), null);
});

test("headers: BOM and loose spellings resolve", () => {
  const csv = "﻿Invoice Date,Vendor_Name,Cost Category,Total,Work-Order ID\n2026-01-05,V,Plumbing,100,WO1\n";
  const p = parseCsv(csv);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].workOrderId, "WO1");
});

function ledger(lines: Array<[string, string, string, number]>) {
  return parseCsv(H + lines.map((l) => l.join(",")).join("\n") + "\n").rows;
}

test("variance: complete months only, partial trailing month excluded and named", () => {
  const rows = ledger([
    ["2026-04-15", "A", "Plumbing", 1000], ["2026-05-15", "A", "Plumbing", 1000],
    ["2026-06-15", "A", "Plumbing", 1000], ["2026-07-15", "A", "Plumbing", 2000],
    ["2026-07-31", "A", "Plumbing", 5],
    ["2026-08-05", "A", "Plumbing", 9999], // partial August
  ]);
  const r = runEngine(rows, { asOf: Date.UTC(2026, 7, 8) });
  assert.equal(r.window?.latestMonth, "2026-07");
  assert.equal(r.window?.partialMonthExcluded, "2026-08");
  const row = r.spendTable.find((x) => x.category === "Plumbing")!;
  assert.equal(row.baselineUsable, true);
  assert.equal(row.variancePct, 100);
});

test("variance: fewer than two prior months prints insufficient baseline", () => {
  const rows = ledger([["2026-05-15", "A", "Plumbing", 1000], ["2026-06-30", "A", "Plumbing", 3000]]);
  const r = runEngine(rows);
  assert.equal(r.spendTable[0].baselineUsable, false);
  assert.equal(r.findings.filter((f) => f.category.endsWith("variance")).length, 0);
});

test("variance: a non-positive baseline is unusable, not a calm 0%", () => {
  const rows = ledger([
    ["2026-03-10", "A", "Plumbing", -500], ["2026-04-10", "A", "Plumbing", -500],
    ["2026-05-31", "A", "Plumbing", 900],
  ]);
  const row = runEngine(rows).spendTable.find((x) => x.category === "Plumbing")!;
  assert.equal(row.baselineUsable, false);
});

test("duplicates: exact and near are separate findings, never summed", () => {
  const rows = ledger([
    ["2026-03-01", "A", "HVAC", 300], ["2026-03-01", "A", "HVAC", 300],
    ["2026-03-10", "B", "HVAC", 120], ["2026-03-13", "B", "HVAC", 120],
  ]);
  const f = runEngine(rows).findings;
  const exact = f.find((x) => x.category === "Exact duplicate candidates")!;
  const near = f.find((x) => x.category === "Near-duplicate candidates")!;
  assert.ok(exact && near);
  assert.equal(exact.amount, "$300");
  assert.equal(near.amount, "$120");
});

test("credits: negative lines are surfaced as a fact with source rows", () => {
  const rows = ledger([["2026-03-01", "A", "HVAC", 300], ["2026-03-05", "A", "HVAC", -85]]);
  const c = runEngine(rows).findings.find((x) => x.category === "Credits and reversals")!;
  assert.equal(c.claimType, "FACT");
  assert.equal(c.amount, "-$85");
  assert.deepEqual(c.sourceRows, [3]);
});

test("aging: measured to an explicit as-of date, so results are reproducible", () => {
  const csv = "date,vendor,category,amount,status,opened_date\n" +
    "2026-01-31,A,HVAC,100,Open,2026-01-01\n2026-01-31,B,HVAC,50,Open,2026-01-25\n";
  const rows = parseCsv(csv).rows;
  const a = runEngine(rows, { asOf: Date.UTC(2026, 1, 10) });
  const b = runEngine(rows, { asOf: Date.UTC(2026, 1, 10) });
  assert.deepEqual(a.findings, b.findings);
  const f = a.findings.find((x) => x.category === "Open-item aging")!;
  assert.match(f.title, /1 open item/);
  assert.match(f.description, /measured to 2026-02-10/);
});

test("concentration: needs a second vendor, and is per category", () => {
  const rows = ledger([
    ["2026-03-01", "A", "Turnover", 900], ["2026-03-02", "B", "Turnover", 100],
    ["2026-03-03", "C", "Landscaping", 500],
  ]);
  const f = runEngine(rows).findings.filter((x) => x.category === "Vendor concentration");
  assert.equal(f.length, 1);
  assert.match(f[0].title, /A accounts for 90\.0% of Turnover/);
});
