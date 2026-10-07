import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReviewPayload, canSaveFrom } from "../lib/reviewPayload";
import { ENGINE_VERSION } from "../lib/engineVersion";
import { GATE } from "../lib/reviewGate";
import { sha256Hex } from "../lib/sendGuard";

const PDF = Buffer.from("%PDF synthetic approved bytes");

const good = () => ({
  intakeId: "00000000-0000-4000-8000-0000000000a1",
  engineVersion: ENGINE_VERSION,
  engineOutput: { findings: [{ id: "f1" }], netLedger: 10 },
  reviewerEdits: { meta: { propertyName: "Synthetic Court" }, findings: [{ id: "f1" }] },
  gateChecks: GATE.map(() => true),
  approved: true,
  pdfSha256: sha256Hex(PDF),
  pdfBase64: PDF.toString("base64"),
});

test("a complete approved payload is accepted and keeps engine output and edits separate", () => {
  const r = validateReviewPayload(good());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.value.engineOutput.findings, [{ id: "f1" }]);
    assert.notEqual(r.value.engineOutput, r.value.reviewerEdits);
  }
});

test("a draft needs no hash and no ticked gate", () => {
  const r = validateReviewPayload({ ...good(), approved: false, pdfSha256: undefined, pdfBase64: undefined, gateChecks: GATE.map(() => false) });
  assert.equal(r.ok, true);
});

test("approval is refused unless every gate item is ticked (server-side, not just the button)", () => {
  const checks = GATE.map(() => true);
  checks[2] = false;
  const r = validateReviewPayload({ ...good(), gateChecks: checks });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 422);
});

test("approval without the PDF hash is refused", () => {
  const r = validateReviewPayload({ ...good(), pdfSha256: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 422);
});

test("approval without the PDF bytes is refused (retry needs them)", () => {
  const r = validateReviewPayload({ ...good(), pdfBase64: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 422);
});

test("a hash that does not describe the supplied PDF is refused", () => {
  const r = validateReviewPayload({ ...good(), pdfSha256: "b".repeat(64) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /does not match/);
});

test("a malformed hash is refused", () => {
  assert.equal(validateReviewPayload({ ...good(), pdfSha256: "xyz" }).ok, false);
});

test("a stale engine version is a 409, not a silent save", () => {
  const r = validateReviewPayload({ ...good(), engineVersion: "0.0.1" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 409);
});

test("bad shapes are rejected", () => {
  assert.equal(validateReviewPayload(null).ok, false);
  assert.equal(validateReviewPayload({ ...good(), intakeId: "not-a-uuid" }).ok, false);
  assert.equal(validateReviewPayload({ ...good(), engineOutput: {} }).ok, false);
  assert.equal(validateReviewPayload({ ...good(), reviewerEdits: { findings: [] } }).ok, false);
  assert.equal(validateReviewPayload({ ...good(), gateChecks: [true] }).ok, false);
  assert.equal(validateReviewPayload({ ...good(), approved: "yes" }).ok, false);
});

test("'sent' is terminal; every other stage may be saved again", () => {
  assert.equal(canSaveFrom("sent"), false);
  for (const s of ["not_started", "draft", "approved", "send_failed"] as const) assert.equal(canSaveFrom(s), true);
});
