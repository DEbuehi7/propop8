/**
 * AIM-B5R design continuity: coverage report and completeness gate.
 *
 * The example proposals in data/aim-b5r/continuity/ are SYNTHETIC (GOV-17):
 * a made-up walk-up, made-up approvals, and no real building or decision.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANON_REGISTER, CANON_VERSION } from "../lib/canon";
import {
  checkContinuity, CONTINUITY_MAP, expandScope, isKnownRef, NEVER_WAIVED, NOT_DESIGN_INPUTS, parseProposal,
  proposalSha256, reportMarkdown, requirements, SCANNED_DOMAINS, starterProposal, verifyReport,
  type Approval, type ContinuityReport, type DesignProposal, type FindingCode,
} from "../lib/b5r/continuity";

const DIR = join(__dirname, "..", "data", "aim-b5r", "continuity");
const load = (name: string): DesignProposal => {
  const { proposal, errors } = parseProposal(JSON.parse(readFileSync(join(DIR, name), "utf8")));
  assert.deepEqual(errors, [], `${name} parses`);
  return proposal!;
};
const V1 = () => load("example-v1.json");
const V2 = () => load("example-v2-drifted.json");
const APPROVAL: Approval = { by: "SYNTHETIC owner", date: "2026-11-10", record: "test fixture" };
const has = (r: ContinuityReport, code: FindingCode, key: string | null = null) => r.findings.some((f) => f.code === code && (key === null || f.key === key));
const severity = (r: ContinuityReport, code: FindingCode, key: string | null) => r.findings.find((f) => f.code === code && f.key === key)?.severity;
/** v1 on real (non-synthetic) data, so EXECUTE is reachable. */
const real = (p: DesignProposal): DesignProposal => ({ ...p, dataStatus: "HISTORICAL" });
const line = (p: DesignProposal, ref: string) => p.components.find((c) => c.ref === ref)!;

test("map: every id is real, never-waived rules are locked, and every locked design rule is mapped or explained", () => {
  const mapped = new Set(Object.values(CONTINUITY_MAP).flat());
  assert.deepEqual([...mapped].filter((r) => !isKnownRef(r)), [], "map ids not in canon or the façade catalogue");
  const status = (id: string) => CANON_REGISTER.find((e) => e.id === id)?.status;
  assert.deepEqual([...NEVER_WAIVED.keys()].filter((id) => status(id) !== "LOCKED"), [], "never-waived rules must be LOCKED");
  assert.deepEqual([...NEVER_WAIVED.keys()].filter((id) => !mapped.has(id)), [], "a never-waived rule must apply somewhere");
  assert.deepEqual([...NOT_DESIGN_INPUTS.keys()].filter((id) => status(id) !== "LOCKED"), [], "only LOCKED entries need explaining");
  assert.deepEqual([...NOT_DESIGN_INPUTS.keys()].filter((id) => mapped.has(id)), [], "an entry is either mapped or explained, not both");
  const unaccounted = CANON_REGISTER
    .filter((e) => e.status === "LOCKED" && SCANNED_DOMAINS.includes(e.domain) && !mapped.has(e.id) && !NOT_DESIGN_INPUTS.has(e.id))
    .map((e) => e.id);
  assert.deepEqual(unaccounted, [], "map these locked entries to a scope in lib/b5r/continuity/map.ts, or list them in NOT_DESIGN_INPUTS with a reason");
});

test("scope: façade and landmark work bring existing-building rules; LOCKED is mandatory, the rest advisory", () => {
  assert.deepEqual(expandScope(["landmark"]), ["existing_building", "landmark"]);
  assert.deepEqual(expandScope(["imagery", "facade"]), ["existing_building", "facade", "imagery"]);
  const reqs = requirements(["facade"]);
  assert.ok(reqs.some((r) => r.ref === "B5R-18" && r.role === "mandatory"), "existing-building rule via facade");
  assert.ok(reqs.some((r) => r.ref === "FIS:F0" && r.role === "mandatory"), "the repair baseline");
  assert.ok(reqs.some((r) => r.ref === "B5R-26" && r.role === "advisory"), "SPEC entries are advisory");
  assert.equal(new Set(reqs.map((r) => r.ref)).size, reqs.length, "each item once");
});

test("example v1: complete, held only because it is synthetic, and the report is sealed and repeatable", async () => {
  const r = await checkContinuity(V1());
  assert.equal(r.complete, true);
  assert.equal(r.call, "DEFER");
  assert.deepEqual(r.findings.filter((f) => f.severity !== "NOTE").map((f) => f.code), ["SYNTHETIC_INPUT"]);
  assert.match(r.meaning, /synthetic/i);
  assert.equal(r.counts.missing, 0);
  assert.equal(r.proposal.approvedBy, "SYNTHETIC approver (fixture)");
  assert.equal(r.claims.find((c) => c.id === "glare")?.standing, "DESIGN_GOAL");
  assert.ok(await verifyReport(r));
  assert.equal((await checkContinuity(V1())).sha256, r.sha256, "same input, same report");
  const tampered: ContinuityReport = { ...r, call: "EXECUTE" };
  assert.equal(await verifyReport(tampered), false);
});

test("the same proposal on real data with nothing open is EXECUTE", async () => {
  const r = await checkContinuity(real(V1()));
  assert.equal(r.call, "EXECUTE");
  assert.equal(r.complete, true);
  assert.match(r.meaning, /never construction/);
});

test("example v2 against v1: every drift is caught and the owner is needed", async () => {
  const v1 = V1();
  const v2 = V2();
  assert.equal(v2.supersedes?.sha256, await proposalSha256(v1), "the example names the real v1 hash");
  const r = await checkContinuity(v2, { baseline: v1 });
  assert.equal(r.call, "ESCALATE");
  assert.equal(r.complete, false);
  assert.equal(severity(r, "SILENT_OMISSION", "B5R-39"), "ESCALATE", "a never-waived rule left out");
  assert.ok(has(r, "UNAUTHORIZED_CHANGE", "B5R-43"), "locked weights modified without approval");
  assert.ok(has(r, "DISABLED_MODULE", "FIS:F7"));
  assert.ok(has(r, "SILENT_SUBSTITUTION", "FIS:F3"), "30% to 60% open area with no log line");
  assert.ok(has(r, "UNSUPPORTED_CLAIM", "claim:cooling"));
  assert.ok(has(r, "IRREVERSIBLE_WITHOUT_EVIDENCE", "irreversible:cornice"));
  assert.ok(has(r, "IRREVERSIBLE_WITHOUT_APPROVAL", "irreversible:cornice"));
  assert.ok(!has(r, "SILENT_SUBSTITUTION", "FIS:F1"), "the F1 removal was logged");
  assert.ok(!has(r, "BASELINE_MISMATCH"));
  const f3 = r.diff.find((d) => d.key === "FIS:F3")!;
  assert.match(f3.before, /30%/);
  assert.match(f3.after, /60%/);
  assert.equal(f3.log, "no");
});

test("narrowing the scope drops rules, so it is logged and, after an approved version, approved", async () => {
  const base = { ...V1(), scope: ["facade", "imagery"] as DesignProposal["scope"] };
  base.components = [...base.components, ...starterProposal(["imagery"], "x", "x").components.filter((c) => !base.components.some((b) => b.ref === c.ref)).map((c) => ({ ...c, decision: "INCLUDED" as const, reason: "met" }))];
  const next = { ...V1(), version: 2, supersedes: { version: 1, sha256: await proposalSha256(base) } };
  delete next.approval;
  const silent = await checkContinuity(next, { baseline: base });
  assert.ok(has(silent, "SILENT_SUBSTITUTION", "scope"));
  assert.equal(severity(silent, "UNAUTHORIZED_CHANGE", "scope"), "ESCALATE");
  assert.ok(!has(silent, "SILENT_SUBSTITUTION", "GOV-23"), "a line whose rule left with the scope is not a separate substitution");
  next.changes = [{ key: "scope", reason: "No imagery goes out with this version.", approval: APPROVAL }];
  const logged = await checkContinuity(next, { baseline: base });
  assert.ok(!has(logged, "UNAUTHORIZED_CHANGE"));
  assert.ok(!has(logged, "SILENT_SUBSTITUTION"));
  assert.equal(logged.diff.find((d) => d.key === "GOV-23")?.log, "not needed");
  const dataOnly = { ...V1(), version: 2, dataStatus: "HISTORICAL" as const, supersedes: { version: 1, sha256: await proposalSha256(V1()) } };
  assert.ok(has(await checkContinuity(dataOnly, { baseline: V1() }), "SILENT_SUBSTITUTION", "dataStatus"));
});

test("answering a required rule that was missing needs no change line", async () => {
  const base = V1();
  base.components = base.components.filter((c) => c.ref !== "GOV-22");
  delete base.approval;
  const next = { ...V1(), version: 2, supersedes: { version: 1, sha256: await proposalSha256(base) } };
  delete next.approval;
  const r = await checkContinuity(next, { baseline: base });
  assert.ok(!has(r, "SILENT_SUBSTITUTION"));
  assert.equal(r.diff.find((d) => d.key === "GOV-22")?.log, "not needed");
});

test("a later version checked alone, or against the wrong file, does not pass", async () => {
  assert.ok(has(await checkContinuity(V2()), "BASELINE_NOT_SUPPLIED"));
  const edited = V1();
  line(edited, "FIS:F3").detail = "edited after approval";
  const r = await checkContinuity(V2(), { baseline: edited });
  assert.equal(severity(r, "BASELINE_MISMATCH", null), "ESCALATE");
  const v3 = { ...real(V1()), version: 2 };
  const r3 = await checkContinuity(v3, { baseline: V1() });
  assert.ok(has(r3, "SUPERSEDES_MISSING"));
});

test("a rule no project approval can waive stops the proposal, even with an approval", async () => {
  const p = real(V1());
  Object.assign(line(p, "GOV-26"), { decision: "EXCLUDED", reason: "Signage runs on the media screens.", approval: APPROVAL });
  const r = await checkContinuity(p);
  assert.equal(r.call, "KILL");
  assert.equal(severity(r, "NEVER_WAIVED", "GOV-26"), "KILL");
  const d = real(V1());
  Object.assign(line(d, "INF-08"), { decision: "DEFERRED", until: "phase 2" });
  assert.equal(severity(await checkContinuity(d), "NEVER_WAIVED_DEFERRED", "INF-08"), "ESCALATE");
});

test("a locked rule modified with a complete approval is a recorded deviation; an incomplete approval does not count", async () => {
  const ok = real(V1());
  Object.assign(line(ok, "B5R-43"), { decision: "MODIFIED", reason: "Project weights chosen by the owner.", approval: APPROVAL });
  const r = await checkContinuity(ok);
  assert.equal(r.call, "EXECUTE");
  assert.ok(has(r, "APPROVED_DEVIATION", "B5R-43"));
  const bad = real(V1());
  Object.assign(line(bad, "B5R-43"), { decision: "MODIFIED", reason: "Project weights.", approval: { by: "Owner", date: "10 Nov", record: "" } });
  const r2 = await checkContinuity(bad);
  assert.ok(has(r2, "APPROVAL_INCOMPLETE", "B5R-43"));
  assert.equal(severity(r2, "UNAUTHORIZED_CHANGE", "B5R-43"), "ESCALATE");
});

test("answers need reasons, deferrals need a trigger, and unresolved items hold the call", async () => {
  const p = real(V1());
  line(p, "GOV-17").reason = " ";
  Object.assign(line(p, "B5R-55"), { until: undefined });
  Object.assign(line(p, "B5R-42"), { decision: "UNRESOLVED" });
  const r = await checkContinuity(p);
  assert.equal(r.call, "DEFER");
  assert.ok(has(r, "MISSING_REASON", "GOV-17"));
  assert.ok(has(r, "OPEN_ENDED_DEFERRAL", "B5R-55"));
  assert.ok(has(r, "UNRESOLVED_COMPONENT", "B5R-42"));
});

test("unknown, duplicate, open, concept and pilot items are each named", async () => {
  const p = real(V1());
  p.components.push(
    { ref: "B5R-999", decision: "INCLUDED", reason: "typo" },
    { ref: "GOV-01", decision: "INCLUDED", reason: "twice" },
    { ref: "VIS-03", decision: "INCLUDED", reason: "uses an amber hex" },
    { ref: "B5R-34", decision: "INCLUDED", reason: "Sears study as a reference" },
    { ref: "FIS:F6", decision: "INCLUDED", reason: "fins on the west bays" },
  );
  const r = await checkContinuity(p);
  assert.ok(has(r, "UNKNOWN_REF", "B5R-999"));
  assert.ok(has(r, "DUPLICATE_KEY", "GOV-01"));
  assert.equal(severity(r, "OPEN_DECISION", "VIS-03"), "ESCALATE");
  assert.equal(severity(r, "LABEL_KEPT", "B5R-34"), "NOTE");
  assert.equal(severity(r, "PILOT_MODULE", "FIS:F6"), "DEFER");
  assert.ok(r.coverage.some((c) => c.ref === "B5R-34" && c.role === "declared"));
  assert.ok(!r.coverage.some((c) => c.ref === "B5R-999"), "unknown refs are findings, not rows");
});

test("a façade module needs façade scope; an ordinary omission is DEFER", async () => {
  const p = starterProposal(["site"], "site-only", "Site study");
  p.components = p.components.filter((c) => c.ref !== "GOV-30");
  p.components.push({ ref: "FIS:F1", decision: "INCLUDED", reason: "paint" });
  const r = await checkContinuity(p);
  assert.ok(has(r, "MODULE_OUT_OF_SCOPE", "FIS:F1"));
  assert.equal(severity(r, "SILENT_OMISSION", "GOV-30"), "DEFER");
});

test("against an unapproved baseline, changes need logging but not approval", async () => {
  const base = V1();
  delete base.approval;
  const next = { ...V1(), version: 2, supersedes: { version: 1, sha256: await proposalSha256(base) } };
  delete next.approval;
  line(next, "B5R-43").detail = "default weights, retested";
  next.changes = [{ key: "B5R-43", reason: "Sensitivity rerun." }, { key: "GOV-01", reason: "nothing changed here" }];
  const r = await checkContinuity(next, { baseline: base });
  assert.ok(has(r, "BASELINE_UNAPPROVED"));
  assert.ok(!has(r, "UNAUTHORIZED_CHANGE"));
  assert.ok(!has(r, "SILENT_SUBSTITUTION"));
  assert.ok(has(r, "STALE_CHANGE_LINE", "GOV-01"));
  assert.equal(r.diff.find((d) => d.key === "B5R-43")?.log, "yes");
});

test("against an approved baseline, a change to a locked line needs the owner", async () => {
  const base = V1();
  const next = { ...V1(), dataStatus: "HISTORICAL" as const, version: 2, supersedes: { version: 1, sha256: await proposalSha256(base) } };
  delete next.approval;
  line(next, "B5R-38").detail = "cells cut by floor only";
  next.changes = [{ key: "B5R-38", reason: "Simpler cells." }];
  const r = await checkContinuity(next, { baseline: base });
  assert.equal(severity(r, "UNAUTHORIZED_CHANGE", "B5R-38"), "ESCALATE");
  next.changes = [{ key: "B5R-38", reason: "Simpler cells.", approval: APPROVAL }];
  const r2 = await checkContinuity(next, { baseline: base });
  assert.ok(!has(r2, "UNAUTHORIZED_CHANGE"));
  assert.equal(r2.diff.find((d) => d.key === "B5R-38")?.approvedBy, "SYNTHETIC owner");
});

test("claims: CONCEPTUAL is a design goal, anything stronger names its source, untagged is unsupported", async () => {
  const p = real(V1());
  p.claims = [
    { id: "a", kind: "performance", text: "goal", proof: "CONCEPTUAL" },
    { id: "b", kind: "cost", text: "costs less", proof: "EXPERIMENTALLY_TESTED", source: "  " },
    { id: "c", kind: "schedule", text: "six weeks" },
    { id: "d", kind: "capability", text: "robot-readable", proof: "INDEPENDENTLY_VALIDATED", source: "lab report 7" },
  ];
  const r = await checkContinuity(p);
  assert.deepEqual(r.claims.map((c) => c.standing), ["DESIGN_GOAL", "UNSUPPORTED", "UNSUPPORTED", "SUPPORTED"]);
  assert.ok(has(r, "UNSUPPORTED_CLAIM", "claim:b"));
  assert.ok(has(r, "UNSUPPORTED_CLAIM", "claim:c"));
});

test("starter: every required item listed as UNRESOLVED on the current canon, and it does not pass", async () => {
  const p = starterProposal(["facade", "imagery"], "starter", "Starter");
  const mandatory = requirements(["facade", "imagery"]).filter((r) => r.role === "mandatory").map((r) => r.ref);
  assert.deepEqual(p.components.map((c) => c.ref), mandatory);
  assert.ok(p.components.every((c) => c.decision === "UNRESOLVED"));
  assert.equal(p.canonVersion, CANON_VERSION);
  const r = await checkContinuity(p);
  assert.equal(r.complete, false);
  assert.equal(r.counts.missing, 0);
  assert.equal(parseProposal(JSON.parse(JSON.stringify(p))).errors.length, 0, "the starter round-trips through JSON");
});

test("parse: shape errors are listed and stop the check", () => {
  const { proposal, errors } = parseProposal({ ...V1(), scope: ["facade", "towers"], components: [{ ref: "GOV-01", decision: "MAYBE", reason: "x" }], version: 0 });
  assert.equal(proposal, null);
  assert.ok(errors.some((e) => /towers/.test(e)));
  assert.ok(errors.some((e) => /decision/.test(e)));
  assert.ok(errors.some((e) => /version/.test(e)));
  assert.equal(parseProposal("nope").proposal, null);
});

test("markdown: shows the call, escapes table pipes and lists every coverage row", async () => {
  const p = V1();
  line(p, "GOV-01").reason = "renders | never decides";
  const r = await checkContinuity(p);
  const md = reportMarkdown(r);
  assert.match(md, /\*\*DEFER\*\*, coverage complete/);
  assert.match(md, /renders \\\| never decides/);
  for (const row of r.coverage) assert.ok(md.includes(`| ${row.ref}: `), row.ref);
});

test("AIM-OCULAR as drawn stops on two never-waived rules; reframed, it answers every rule", async () => {
  const drawn = load("aim-ocular-v1.json");
  const reframed = load("aim-ocular-v2.json");
  const r1 = await checkContinuity(drawn);
  assert.equal(r1.call, "KILL");
  assert.equal(severity(r1, "NEVER_WAIVED", "GOV-29"), "KILL", "the Tenant Eye tracks behaviour and risk");
  assert.equal(severity(r1, "NEVER_WAIVED", "B5R-39"), "KILL", "screens across the historic façade");
  for (const ref of ["GOV-16", "GOV-26", "B5R-40"]) assert.equal(severity(r1, "SILENT_OMISSION", ref), "ESCALATE", ref);
  assert.ok(has(r1, "DISABLED_MODULE", "FIS:F7"));
  assert.ok(has(r1, "UNAUTHORIZED_CHANGE", "TRI-14"));
  assert.equal(r1.claims.filter((c) => c.standing === "UNSUPPORTED").length, drawn.claims.length, "every outcome range is unsupported");

  assert.equal(reframed.supersedes?.sha256, await proposalSha256(drawn));
  const r2 = await checkContinuity(reframed, { baseline: drawn });
  assert.equal(r2.complete, true);
  assert.equal(r2.call, "DEFER");
  assert.deepEqual(r2.findings.filter((f) => f.severity !== "NOTE").map((f) => f.code), ["SYNTHETIC_INPUT"]);
  assert.equal(r2.counts.missing, 0);
  assert.deepEqual(r2.diff.filter((d) => d.log === "no").map((d) => d.key), [], "every change is logged");
  assert.equal(r2.diff.find((d) => d.key === "ROB-06")?.log, "not needed", "robot rules left with the scope");
  assert.ok(!has(r2, "STALE_CHANGE_LINE"));
});
