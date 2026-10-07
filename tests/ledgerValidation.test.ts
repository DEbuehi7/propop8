import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateLedgerText, parseCsv, runEngine, vendorTotalsByCategory, topVendorOf } from "../lib/auditEngine";
import { sharePct } from "../lib/calcMath";

const golden = readFileSync(join(__dirname, "fixtures", "audit_ledger.csv"), "utf8");
const H = "date,vendor,category,amount\n";

test("validator and engine read the same rows (golden ledger)", () => {
  const v = validateLedgerText(golden);
  const p = parseCsv(golden);
  assert.equal(v.totalRows, 50);
  assert.equal(v.rows.length, 49);
  assert.equal(v.droppedRows, 1);
  assert.deepEqual(v.rows, p.rows);
  assert.equal(p.droppedRows, v.droppedRows);
});

test("row-level errors carry the file's row number", () => {
  const v = validateLedgerText(golden);
  // The unreadable amount "12 CR" is the last data row: row 51 (row 1 is the header).
  assert.deepEqual(v.issues, [{ row: 51, code: "unreadable_amount", dropped: true, value: "12 CR" }]);
});

test("columns come first: missing required columns are named", () => {
  const v = validateLedgerText("date,vendor,notes\n2026-01-05,Acme,hi\n");
  assert.deepEqual(v.columns.missingRequired, ["category", "amount"]);
  assert.equal(v.columns.found.vendor, true);
  assert.equal(v.rows.length, 0);
});

test("types: blank vs unreadable amounts are told apart, credits counted", () => {
  const v = validateLedgerText(
    H +
      "2026-01-05,Acme,Plumbing,100\n" +
      "2026-01-06,Acme,Plumbing,\n" +
      "2026-01-07,Acme,Plumbing,1.234,56\n".replace("1.234,56", '"1.234,56"') +
      "2026-01-08,Acme,Plumbing,(40.00)\n",
  );
  assert.equal(v.amounts.blank, 1);
  assert.equal(v.amounts.unreadable, 1);
  assert.equal(v.amounts.credits, 1);
  assert.equal(v.amounts.creditTotal, -40);
  assert.deepEqual(v.issues.map((i) => [i.row, i.code]), [[3, "blank_amount"], [4, "unreadable_amount"]]);
});

test("dates: a day-first date is flagged, not guessed, and the row is still read", () => {
  const v = validateLedgerText(H + "2026-01-05,Acme,Plumbing,100\n13/05/2026,Acme,Plumbing,50\n");
  assert.equal(v.dates.unreadable, 1);
  assert.deepEqual(v.issues, [{ row: 3, code: "unreadable_date", dropped: false, value: "13/05/2026" }]);
  assert.equal(v.rows.length, 2); // kept, as the engine always did
  assert.equal(v.dates.earliest, Date.UTC(2026, 0, 5));
  assert.equal(v.dates.latest, Date.UTC(2026, 0, 5));
});

test("missing cells name which cell, and drop the row", () => {
  const v = validateLedgerText(H + "2026-01-05,,Plumbing,100\n,Acme,Plumbing,100\n2026-01-05,Acme,,100\n");
  assert.deepEqual(v.issues.map((i) => [i.row, i.code, i.dropped]), [
    [2, "missing_vendor", true],
    [3, "missing_date", true],
    [4, "missing_category", true],
  ]);
  assert.equal(v.droppedRows, 3);
});

test("duplicates use the engine's key, so the screener and the audit cannot disagree", () => {
  // Same date/vendor/category/amount, different unit: the OLD screener (whole-row compare) said "no duplicates".
  const csv = "date,vendor,category,amount,unit\n2026-03-03,Acme,Plumbing,400,101\n2026-03-03,Acme,Plumbing,400,102\n2026-03-04,Acme,Plumbing,90,103\n";
  const v = validateLedgerText(csv);
  assert.equal(v.duplicates.groups, 1);
  assert.equal(v.duplicates.extraRows, 1);
  assert.equal(v.duplicates.extraValue, 400);
  const engine = runEngine(v.rows, { asOf: Date.UTC(2026, 3, 1) }).findings.find((f) => f.category === "Exact duplicate candidates");
  assert.ok(engine, "engine flags it too");
  assert.equal(engine.sourceRows.length, 2);
});

test("golden ledger: screener duplicates and concentration equal the engine findings", () => {
  const v = validateLedgerText(golden);
  const res = runEngine(v.rows, { asOf: Date.UTC(2026, 7, 1) });
  const dup = res.findings.find((f) => f.category === "Exact duplicate candidates")!;
  assert.equal(v.duplicates.groups, 1);
  assert.equal(dup.title.startsWith(`${v.duplicates.groups} exact duplicate group(s)`), true);
  assert.equal(dup.amount, "$650");
  assert.equal(v.duplicates.extraValue, 650);

  const hvac = vendorTotalsByCategory(v.rows).get("HVAC")!;
  const total = [...hvac.values()].reduce((a, b) => a + b, 0);
  const [vendor, amount] = topVendorOf(hvac);
  const conc = res.findings.find((f) => f.category === "Vendor concentration")!;
  assert.equal(vendor, "Acme HVAC");
  assert.ok(conc.title.includes(`${vendor} accounts for ${sharePct(amount, total)!.toFixed(1)}%`));
});

test("empty and header-only files do not throw", () => {
  assert.equal(validateLedgerText("").totalRows, 0);
  assert.equal(validateLedgerText(H).totalRows, 0);
});
