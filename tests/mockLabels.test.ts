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

test("the other Plate8 instruments: placeholder pages say so, and every card number carries MOCK", () => {
  for (const p of ["mate8", "skate8", "plate8", "slate8"]) {
    const page = src(`app/plate8/${p}/page.tsx`);
    assert.match(page, /<MockNotice>[\s\S]*placeholder[\s\S]*<\/MockNotice>/, `${p} page`);
    const grid = page.slice(page.indexOf("{/* Stats Grid */}"), page.indexOf("{/* Tabs */}"));
    assert.equal((grid.match(/<MockTag \/>/g) ?? []).length, 4, `${p}: the four stats`);
    assert.ok(!/<h2 className="text-lg font-semibold mb-6">[^<{]+<\/h2>/.test(page), `${p}: every section heading is labelled`);
  }
  const cards: Record<string, string[]> = {
    State8: ["Current Session", "Transcription Accuracy"], Mate8: ["Games Analyzed", "Avg. Evaluation"], Skate8: ["Top Speed", "Best Lap"],
    Plate8: ["Plates Decoded", "Avg. Word Length"], Slate8: ["Videos Added", "Watch Time"],
  };
  for (const [name, labels] of Object.entries(cards)) {
    const card = src(`components/plate8/${name}Card.tsx`);
    for (const l of labels) assert.ok(card.includes(`${l}<MockTag />`), `${name} card: ${l}`);
  }
  const dash = src("app/plate8/page.tsx");
  assert.ok(dash.includes("System Status<MockTag />") && !dash.includes("All Systems Nominal"), "no health check runs, so none is claimed");
});

test("State8: live audio readings stay unlabelled; the stored accuracy and word count, which are not measured, carry MOCK", () => {
  const page = src("app/plate8/state8/page.tsx");
  assert.ok(page.includes("<p>Words<MockTag /></p>") && page.includes("<p>Accuracy<MockTag /></p>") && page.includes("%<MockTag /></li>"));
  assert.ok(!page.includes("Dominant Frequency<MockTag />") && !page.includes("Audio Volume<MockTag />"));
});
