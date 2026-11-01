/**
 * GOV-17: placeholder values on public pages carry a MOCK label. A source
 * check on the Late8 page, its dashboard card and the dashboard's activity
 * feed, which show only hard-coded sample data today.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vocab } from "../lib/canon";
import { MOCK_LABEL } from "../components/plate8/MockLabel";

const src = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

test("the MOCK label is the canon's own data-status word", () => {
  assert.ok((vocab.EVIDENCE_AXES.dataStatus as readonly string[]).includes(MOCK_LABEL));
});

test("Late8: the page says it is all placeholder, and every number and section carries MOCK", () => {
  const page = src("app/plate8/late8/page.tsx");
  assert.match(page, /<MockNotice>[\s\S]*placeholder[\s\S]*<\/MockNotice>/);
  for (const label of ["New Dispatches", "Listening Time", "Sources Tracked", "Topics Covered", "News & Audio Feed", "Trending Topics", "News Sources"]) {
    assert.ok(page.includes(`${label}<MockTag />`), `${label} is labelled`);
  }
  const card = src("components/plate8/Late8Card.tsx");
  for (const label of ["New Dispatches", "Listening Time"]) assert.ok(card.includes(`${label}<MockTag />`), `card: ${label} is labelled`);
});

test("the Plate8 dashboard never calls its sample activity live", () => {
  const dash = src("app/plate8/page.tsx");
  assert.ok(!dash.includes(">Live Activity<"));
  assert.ok(dash.includes("Activity<MockTag />"));
});
