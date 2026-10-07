import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSendable, sha256Hex, sendIdempotencyKey } from "../lib/sendGuard";

const pdf = new TextEncoder().encode("%PDF synthetic approved bytes");
const base = () => ({
  reviewStage: "approved" as const,
  reportSentAt: null as string | null,
  approvedPdfSha256: sha256Hex(pdf),
  pdfBytes: pdf,
});

test("approved review + identical bytes may be sent", () => {
  assert.deepEqual(checkSendable(base()), { ok: true });
});

test("a failed send may be retried with the same approved bytes", () => {
  assert.deepEqual(checkSendable({ ...base(), reviewStage: "send_failed" }), { ok: true });
});

test("not approved: refused", () => {
  for (const s of ["not_started", "draft"] as const) {
    const r = checkSendable({ ...base(), reviewStage: s });
    assert.equal(r.ok, false);
  }
});

test("already sent: refused with the date, even if the stage looks fine", () => {
  const r = checkSendable({ ...base(), reportSentAt: "2026-10-07T12:00:00Z" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /already sent/);
});

test("a different PDF than the approved one is refused", () => {
  const other = new TextEncoder().encode("%PDF a re-rendered copy");
  const r = checkSendable({ ...base(), pdfBytes: other });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /not the one that was approved/);
});

test("no recorded fingerprint: refused", () => {
  assert.equal(checkSendable({ ...base(), approvedPdfSha256: null }).ok, false);
});

test("idempotency key: same attempt dedupes, a retry after failure does not", () => {
  assert.equal(sendIdempotencyKey("r1", 0), sendIdempotencyKey("r1", 0));
  assert.notEqual(sendIdempotencyKey("r1", 0), sendIdempotencyKey("r1", 1));
});
