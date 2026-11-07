/**
 * Site fit (canon GOV-30), on the Eon site's numbers (canon LET-03): a 150 x 75 ft
 * lot, setbacks 25 / 15 / 10 ft, 40% coverage, a primary home, an ADU and a JADU,
 * height limit not yet known.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { acresOf, checkProgram, siteEnvelope, SQFT_PER_ACRE, type SiteRules } from "../lib/b5r/site/envelope";
import { CANON_REGISTER } from "../lib/canon";

const EON: SiteRules = {
  widthFt: 75, depthFt: 150, setbacksFt: { front: 25, rear: 15, side: 10 }, maxCoverage: 0.4,
  homesAllowed: 3, floorsAllowed: null, parkingSpaces: 2, source: "Twentynine Palms planning reply, 27 Jan 2026",
};

test("acres are always sq ft / 43,560: 11,236 sq ft is 0.26 acre, not 0.28", () => {
  assert.equal(SQFT_PER_ACRE, 43_560);
  assert.equal(Math.round(acresOf(11_236) * 100) / 100, 0.26);
  assert.equal(Math.round(acresOf(11_250) * 1000) / 1000, 0.258);
  assert.ok(Math.round(0.28 * SQFT_PER_ACRE) === 12_197, "0.28 acre would be 12,197 sq ft");
});

test("the Eon envelope: 11,250 sq ft lot, 4,500 sq ft buildable whichever side faces the street", () => {
  const e = siteEnvelope(EON);
  assert.equal(e.lotSqft, 11_250);
  assert.equal(e.coverageCapSqft, 4_500);
  assert.equal(e.setbackEnvelopeSqft, 4_550, "the 150 ft side facing the street gives the smaller envelope");
  assert.equal(e.footprintSqft, 4_500);
  assert.deepEqual(e.unknown, ["height limit (floors allowed)"]);
  assert.throws(() => siteEnvelope({ ...EON, source: " " }), /need a source/);
});

test("the 3,200 sq ft modular home fits; a 22,000 sq ft compound does not, or waits on the height limit", () => {
  assert.deepEqual(checkProgram(EON, { name: "modular home", grossSqft: 3_200, homes: 1, floors: 1 }), {
    fits: true, floorsNeeded: 3_200 / 4_500, issues: [], unknown: [],
  });
  const compound = checkProgram(EON, { name: "compound", grossSqft: 22_000, homes: 2 });
  assert.equal(compound.fits, null, "with the height limit unknown it is not a fit yet");
  assert.match(compound.unknown[0], /compound needs 4\.9 floors of full footprint \(4,500 sq ft buildable\)/);
  const twoFloors = checkProgram({ ...EON, floorsAllowed: 2 }, { name: "compound", grossSqft: 22_000, homes: 2 });
  assert.equal(twoFloors.fits, false);
  assert.match(twoFloors.issues[0], /needs 4\.9 floors of full footprint; the height limit allows 2/);
  const flat = checkProgram(EON, { name: "compound", grossSqft: 22_000, homes: 2, floors: 1 });
  assert.match(flat.issues.join(" "), /drawn on 1 floor\(s\) of 22,000 sq ft; the buildable footprint is 4,500 sq ft/);
  const fourHomes = checkProgram(EON, { name: "fourplex", grossSqft: 3_000, homes: 4 });
  assert.equal(fourHomes.fits, false);
  assert.match(fourHomes.issues[0], /has 4 homes; the site allows 3/);
});

test("unknown rules stay unknown: an area-only lot with no coverage gives no footprint", () => {
  const e = siteEnvelope({ areaSqft: 20_000, setbacksFt: null, maxCoverage: null, homesAllowed: null, floorsAllowed: null, source: "parcel record" });
  assert.equal(e.footprintSqft, null);
  assert.deepEqual(e.unknown, ["maximum lot coverage", "setbacks", "homes allowed", "height limit (floors allowed)"]);
  const fit = checkProgram({ areaSqft: 20_000, setbacksFt: null, maxCoverage: null, homesAllowed: null, floorsAllowed: null, source: "parcel record" },
    { name: "duplex", grossSqft: 2_000, homes: 2 });
  assert.equal(fit.fits, null);
  assert.equal(fit.floorsNeeded, null);
});

test("canon LET-03 states the corrected area and GOV-30 points at this check", () => {
  const let03 = CANON_REGISTER.find((e) => e.id === "LET-03")!;
  assert.match(let03.statement, /about 0\.26 acre/);
  assert.doesNotMatch(let03.statement, /0\.28/);
  assert.match(let03.statement, /4,500 sq ft/);
  const gov30 = CANON_REGISTER.find((e) => e.id === "GOV-30")!;
  assert.equal(gov30.status, "LOCKED");
  assert.ok(gov30.where?.includes("lib/b5r/site/envelope.ts"));
});

test("the ChatGPT brief cites only real canon ids, and its Eon facts match LET-03", () => {
  const brief = readFileSync(join(__dirname, "..", "docs", "canon", "CHATGPT_PROMPT.md"), "utf8");
  const ids = [...new Set(brief.match(/\b[A-Z0-9]{2,4}-\d{2}\b/g) ?? [])];
  assert.ok(ids.length >= 10, `the brief cites ${ids.length} ids`);
  const known = new Set(CANON_REGISTER.map((e) => e.id));
  assert.deepEqual(ids.filter((id) => !known.has(id)), [], "every id in the brief is in the register");
  const let03 = CANON_REGISTER.find((e) => e.id === "LET-03")!.statement;
  for (const fact of ["0.26 acre", "11,250 sq ft", "4,500 sq ft", "25 ft front", "15 ft rear", "10 ft each side", "40%", "500 sq ft"]) {
    assert.ok(let03.includes(fact) && brief.includes(fact), `"${fact}" in both LET-03 and the brief`);
  }
  const body = brief.slice(brief.indexOf("\n---\n") + 5, brief.lastIndexOf("\n---"));
  assert.ok(body.length > 3000 && body.length < 8000, `the pasted part is ${body.length} characters`);
});
