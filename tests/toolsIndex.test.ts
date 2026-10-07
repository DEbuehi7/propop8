import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DIAGNOSTIC_CALCULATORS, calculatorHref, renderableCalculators } from "../lib/diagnosticCalculators";

test("every calculator has a reachable page and a card image", () => {
  const root = join(__dirname, "..");
  for (const c of DIAGNOSTIC_CALCULATORS) {
    const href = calculatorHref(c);
    assert.ok(href.startsWith("/tools/"), `${c.slug} -> ${href}`);
    if (c.externalHref) {
      assert.ok(existsSync(join(root, "app", href, "page.tsx")), `${c.slug}: no page at ${href}`);
    } else {
      assert.ok(renderableCalculators().includes(c), c.slug); // served by app/tools/[slug]
    }
    assert.ok(existsSync(join(root, "public", "widgets", "sm", `${c.slug}.png`)), `${c.slug}: missing card image`);
  }
  assert.ok(existsSync(join(root, "app", "tools", "page.tsx")), "/tools index page must exist");
});
