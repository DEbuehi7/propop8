/**
 * Upload retention (finding R1): the purge rule must match the window the
 * privacy policy publishes, and must never auto-delete an undated file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { batches, intakeObjects, planPurge, UPLOAD_RETENTION_DAYS } from "../lib/security/retention";

const NOW = new Date("2026-10-18T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test("retention: the purge window equals the published window", () => {
  const legal = readFileSync(join(__dirname, "..", "lib", "legal-content.ts"), "utf8");
  assert.match(legal, new RegExp(`deleted ${UPLOAD_RETENTION_DAYS} days after upload`), "privacy policy and purge rule disagree");
  const page = readFileSync(join(__dirname, "..", "app", "legal", "[slug]", "page.tsx"), "utf8");
  const m = page.match(/RETENTION_DAYS\s*=\s*(\d+)/);
  if (m) assert.equal(Number(m[1]), UPLOAD_RETENTION_DAYS, "/legal RETENTION_DAYS and purge rule disagree");
});

test("retention: files past the window expire; recent and undated ones stay", () => {
  const plan = planPurge(
    [
      { path: "a/old.csv", createdAt: daysAgo(31) },
      { path: "a/edge.csv", createdAt: daysAgo(29.9) },
      { path: "b/new.csv", createdAt: daysAgo(1) },
      { path: "b/nodate.csv", createdAt: null },
      { path: "b/bad.csv", createdAt: "not a date" },
    ],
    NOW,
  );
  assert.deepEqual(plan.expired.map((o) => o.path), ["a/old.csv"]);
  assert.deepEqual(plan.undated.map((o) => o.path), ["b/nodate.csv", "b/bad.csv"]);
  assert.equal(plan.kept, 2);
});

test("retention: a refund selects only that intake's folder, and the id must be a UUID", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const objs = [{ path: `${id}/x.csv`, createdAt: null }, { path: `${id}x/y.csv`, createdAt: null }, { path: "other/z.csv", createdAt: null }];
  assert.deepEqual(intakeObjects(objs, id).map((o) => o.path), [`${id}/x.csv`]);
  assert.throws(() => intakeObjects(objs, "../etc"));
});

test("retention: removal batches cover every path once", () => {
  const items = Array.from({ length: 250 }, (_, i) => i);
  const b = batches(items, 100);
  assert.deepEqual(b.map((x) => x.length), [100, 100, 50]);
  assert.equal(b.flat().length, 250);
});
