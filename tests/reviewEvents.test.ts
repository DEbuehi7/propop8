import { test } from "node:test";
import assert from "node:assert/strict";
import { describeEvent, type IntakeEvent } from "../lib/reviewEvents";

const ev = (event_type: string, detail: Record<string, unknown> | null = {}): IntakeEvent => ({
  id: "e1", created_at: "2026-10-07T12:00:00Z", event_type, from_stage: "approved", to_stage: "sent", detail,
});

test("a sent report shows the Resend message id", () => {
  assert.match(describeEvent(ev("report_sent", { resend_message_id: "re_123", to: "a@example.test" })), /re_123/);
});

test("a failed send shows the reason", () => {
  assert.match(describeEvent(ev("report_send_failed", { error: "domain not verified" })), /domain not verified/);
});

test("an approval shows the short PDF fingerprint", () => {
  const t = describeEvent(ev("review_approved", { engine_version: "1.0.0", included_findings: 4, pdf_sha256: "abcdef0123456789" }));
  assert.match(t, /abcdef01/);
  assert.match(t, /4 findings/);
});

test("unknown events and null detail are shown, not hidden", () => {
  assert.match(describeEvent(ev("something_new", null)), /something_new/);
  assert.match(describeEvent(ev("report_sent", null)), /none returned/);
});
