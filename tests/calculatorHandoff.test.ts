import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHandoff, buildAuditHref, parseHandoff } from "../lib/calculatorHandoff";

test("sanitizeHandoff keeps registry slugs and plain headlines", () => {
  assert.deepEqual(sanitizeHandoff("vendor-money-pit", "71%"), { slug: "vendor-money-pit", headline: "71%" });
  assert.deepEqual(sanitizeHandoff("utility-energy-bleed", "-$1,240"), { slug: "utility-energy-bleed", headline: "-$1,240" });
});

test("sanitizeHandoff rejects unknown slugs and drops the headline with them", () => {
  assert.deepEqual(sanitizeHandoff("evil-slug", "99%"), { slug: null, headline: null });
  assert.deepEqual(sanitizeHandoff(null, "99%"), { slug: null, headline: null });
  assert.deepEqual(sanitizeHandoff(42, 42), { slug: null, headline: null });
});

test("sanitizeHandoff strips markup, collapses space, caps length", () => {
  assert.equal(sanitizeHandoff("vendor-money-pit", "<b>71%</b>\n").headline, "b71%b");
  assert.equal(sanitizeHandoff("vendor-money-pit", "7".repeat(200)).headline?.length, 40);
  assert.equal(sanitizeHandoff("vendor-money-pit", "<>").headline, null);
});

test("a headline with no digit (the em dash placeholder) is dropped", () => {
  assert.equal(sanitizeHandoff("vendor-money-pit", "\u2014").headline, null);
  assert.equal(sanitizeHandoff("vendor-money-pit", "n/a").headline, null);
  assert.equal(sanitizeHandoff("vendor-money-pit", "0%").headline, "0%");
});

test("buildAuditHref -> parseHandoff round-trips", () => {
  const href = buildAuditHref("vendor-money-pit", "71%");
  assert.ok(href.startsWith("/audit?"));
  const q = new URL(href, "https://x.test").searchParams;
  assert.equal(q.get("calculator_slug"), "vendor-money-pit");
  assert.deepEqual(parseHandoff(q), { slug: "vendor-money-pit", headline: "71%" });
});

test("buildAuditHref keeps vacancy extras and falls back to the bare base for bad input", () => {
  const href = buildAuditHref("vacancy-black-hole", "27 days", { type: "vacancy", days: 27, exposure: 1890, totalDays: 31, total: 2170 });
  const q = new URL(href, "https://x.test").searchParams;
  assert.equal(q.get("days"), "27");
  assert.equal(q.get("totalDays"), "31");
  assert.equal(q.get("calculator_headline"), "27 days");
  assert.equal(buildAuditHref("nope", "1%"), "/audit");
});
