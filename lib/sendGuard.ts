/**
 * lib/sendGuard.ts
 * ----------------------------------------------------------------------------
 * The checks that must pass before a report email leaves. Pure, so every refusal
 * is unit-tested. send-report calls this; nothing here touches the network.
 *
 * What it proves before a customer is emailed:
 *  1. the intake has been reviewed and APPROVED (not just uploaded),
 *  2. nothing was sent already,
 *  3. the bytes about to be attached are the bytes the reviewer approved
 *     (SHA-256 equal), not a re-render or an older draft.
 */

import { createHash } from "node:crypto";
import type { ReviewStage } from "./reviewPayload";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type SendCheck = { ok: true } | { ok: false; error: string; status: number };

export function checkSendable(args: {
  reviewStage: ReviewStage;
  reportSentAt: string | null;
  approvedPdfSha256: string | null;
  pdfBytes: Uint8Array;
}): SendCheck {
  if (args.reportSentAt) {
    return { ok: false, status: 409, error: `A report was already sent to this intake on ${args.reportSentAt}.` };
  }
  // 'send_failed' may be retried: the review it failed on is still the approved one.
  if (args.reviewStage !== "approved" && args.reviewStage !== "send_failed") {
    return {
      ok: false,
      status: 409,
      error: `Review stage is "${args.reviewStage}". Approve the review (all gate items ticked) before sending.`,
    };
  }
  if (!args.approvedPdfSha256) {
    return { ok: false, status: 409, error: "No approved review with a PDF fingerprint exists for this intake." };
  }
  if (sha256Hex(args.pdfBytes) !== args.approvedPdfSha256) {
    return {
      ok: false,
      status: 409,
      error: "This PDF is not the one that was approved. Re-approve the review, then send.",
    };
  }
  return { ok: true };
}

/** Resend deduplicates on this key for 24h. Including the failure count means a
 *  double-click is deduplicated, but a deliberate retry after a failure is not. */
export function sendIdempotencyKey(reviewId: string, failedAttempts: number): string {
  return `report:${reviewId}:${failedAttempts}`;
}
