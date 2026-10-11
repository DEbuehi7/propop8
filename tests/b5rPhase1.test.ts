/**
 * AIM-B5R Phase 1 gate rules (handoff v1.1). Synthetic evidence only; the
 * last tests import the real pilot CSVs, which contain no official facts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import type { Evidence } from "../lib/b5r/phase1/contracts";
import { compareApn, decideGate, fieldState, validateEvidence } from "../lib/b5r/phase1/gate";
import { buildProperties, seedEvidence, uuidv5, type Row } from "../lib/b5r/phase1/seed";
import { evaluate, snapshotId } from "../lib/b5r/phase1/report";

const P = "11111111-1111-5111-8111-111111111111";
let n = 0;
const ev = (field: Evidence["field"], state: Evidence["state"], value = "", extra: Partial<Evidence> = {}): Evidence => ({
  evidence_id: `T-${++n}`, property_uuid: P, lead_id: "X1", field, value, state,
  source_id: "S01", source_uri: state === "verified" ? "https://example.gov/record" : "", publisher: "County",
  tier: 1, observed_date: "", retrieved_at: state === "verified" ? "2026-10-10T09:00-07:00" : "",
  coverage: "", snapshot_ref: state === "verified" ? "shot.png sha256:abc" : "", reason: "", reviewer: "",
  recorded_at: "2026-10-10", ...extra,
});
const core = () => [
  ev("apn", "verified", "433-450-06"),
  ev("situs_address", "verified", "3449 N Marks Ave, Fresno"),
  ev("jurisdiction", "verified", "City of Fresno"),
  ev("geometry_match", "verified", "parcel polygon contains address point"),
];
const gate = (rows: Evidence[]) => decideGate("X1", P, rows);

test("nothing known -> HOLD, never FAIL", () => {
  assert.equal(gate([]).proposed_gate, "HOLD");
  assert.equal(gate([ev("apn", "missing"), ev("jurisdiction", "missing")]).proposed_gate, "HOLD");
});

test("all four core facts verified from official sources -> PASS (proposed, needs review)", () => {
  const g = gate(core());
  assert.equal(g.proposed_gate, "PASS");
  assert.equal(g.needs_review, true);
});

test("geometry only screened -> CONDITIONAL; geometry missing -> HOLD", () => {
  const rows = core().slice(0, 3);
  assert.equal(gate([...rows, ev("geometry_match", "provisional", "visual match on GIS")]).proposed_gate, "CONDITIONAL");
  assert.equal(gate(rows).proposed_gate, "HOLD");
});

test("a listing can never verify a fact", () => {
  const listing = ev("apn", "verified", "13741004008", { tier: 3, source_id: "S20" });
  assert.ok(validateEvidence([listing]).some((i) => /tier 1-2/.test(i.message)));
  // the invalid row is ignored, so APN is not verified and the gate holds
  const rows = [listing, ...core().slice(1)];
  assert.equal(gate(rows).proposed_gate, "HOLD");
});

test("verified needs source, time and a snapshot", () => {
  const bare = ev("apn", "verified", "433-450-06", { snapshot_ref: "", retrieved_at: "" });
  const msgs = validateEvidence([bare]).map((i) => i.message).join(" ");
  assert.match(msgs, /snapshot_ref/);
  assert.match(msgs, /retrieved_at/);
});

test("two official APNs that disagree -> conflicting -> HOLD", () => {
  const rows = [...core(), ev("apn", "verified", "433-450-07")];
  assert.equal(fieldState(rows, "apn"), "conflicting");
  const g = gate(rows);
  assert.equal(g.proposed_gate, "HOLD");
  assert.deepEqual(g.conflicts, ["apn"]);
});

test("same APN in different formats is the same fact", () => {
  assert.equal(compareApn("014-290-20-00-4", "01429020004"), "same");
  assert.equal(compareApn("01736010006", "01736010"), "variant");
  assert.equal(compareApn("433-450-06", "407-391-10"), "different");
  assert.equal(fieldState([...core(), ev("apn", "verified", "43345006")], "apn"), "verified");
});

test("FAIL only from a documented, reviewed contradiction", () => {
  const unreviewed = ev("identity_contradiction", "verified", "assessor situs is a different street");
  assert.ok(validateEvidence([unreviewed]).length > 0);
  assert.equal(gate([...core(), unreviewed]).proposed_gate, "PASS", "unreviewed contradiction is rejected, not acted on");
  const reviewed = ev("identity_contradiction", "verified", "assessor situs is a different street", { reviewer: "Daniel" });
  assert.equal(gate([...core(), reviewed]).proposed_gate, "FAIL");
});

test("sign-off counts only while gate and evidence are unchanged", () => {
  const props = [{ property_uuid: P, lead_id: "X1", pilot_id: "PILOT-X", county: "Fresno" as const,
    lead_address: "3449 N Marks Ave, Fresno, CA", advertised_asking_price_usd: "1", advertised_cap_rate_pct: "1", listing_source_url: "" }];
  const rows = core();
  const snap = snapshotId(rows);
  const signed = [{ lead_id: "X1", final_gate: "PASS", reviewer: "Daniel", signed_at: "2026-10-11", evidence_snapshot_id: snap, notes: "" }];
  const [ok] = evaluate(props, rows, signed);
  assert.equal(ok.gate.needs_review, false);
  const [stale] = evaluate(props, [...rows, ev("zoning", "provisional", "RM-2")], signed);
  assert.equal(stale.gate.needs_review, true);
  assert.ok(stale.staleSignoff);
});

const dir = join(__dirname, "..", "data", "aim-b5r", "phase1", "inputs");
const csv = (f: string) => Papa.parse<Row>(readFileSync(join(dir, f), "utf8"), { header: true, skipEmptyLines: true }).data;

test("real pilot import: 10 properties, stable UUIDs, all HOLD, nothing verified", () => {
  const pilot = csv("AIM_B5R_Kern_Fresno_10_Property_Pilot.csv");
  const identity = csv("AIM_B5R_Phase1_Identity_Authority_2026-10-09.csv");
  const props = buildProperties(pilot, identity);
  assert.equal(props.length, 10);
  assert.equal(new Set(props.map((p) => p.property_uuid)).size, 10);
  assert.equal(props[0].property_uuid, uuidv5("aim-b5r-pilot-2026-10:K1"));
  assert.deepEqual(props.map((p) => p.pilot_id), Array.from({ length: 10 }, (_, i) => `PILOT-${String(i + 1).padStart(2, "0")}`));
  const seed = seedEvidence(props, identity);
  assert.deepEqual(validateEvidence(seed), []);
  assert.ok(!seed.some((e) => e.state === "verified"));
  const outcomes = evaluate(props, seed, []);
  assert.ok(outcomes.every((o) => o.gate.proposed_gate === "HOLD"));
  const k5 = seed.filter((e) => e.lead_id === "K5" && e.field === "apn");
  assert.equal(k5.length, 1);
  assert.equal(k5[0].state, "missing");
  assert.ok(!seed.some((e) => e.value.includes("00555555")), "the rejected K5 value is never stored as an APN");
  const k3 = seed.filter((e) => e.lead_id === "K3" && e.field === "apn").map((e) => e.value);
  assert.deepEqual(k3, ["01736010006", "01736010"]);
});
