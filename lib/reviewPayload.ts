/**
 * lib/reviewPayload.ts
 * ----------------------------------------------------------------------------
 * Validation for POST /api/admin/reviews. Pure: no I/O, so it is unit-tested.
 *
 * Rules (each one exists because the alternative lets an unreviewed or
 * unreproducible report reach a customer):
 *  - engineVersion must equal this server's ENGINE_VERSION. A tab opened before
 *    a deploy would otherwise record results under the wrong rules.
 *  - an APPROVED review needs every gate item ticked and the SHA-256 of the
 *    exact PDF bytes, so send-report can prove it is sending the approved file.
 *  - engineOutput (what the engine said) and reviewerEdits (what the human
 *    changed) are stored separately and never merged.
 */

import { ENGINE_VERSION } from "./engineVersion";
import { GATE } from "./reviewGate";
import { sha256Hex } from "./sendGuard";

/** ~8M base64 chars is ~6 MB of PDF; the bucket allows 5 MB. A ledger review is tens of KB. */
export const MAX_PDF_BASE64_CHARS = 6_000_000;

export interface ReviewPayload {
  intakeId: string;
  engineVersion: string;
  engineOutput: { findings: unknown[] } & Record<string, unknown>;
  reviewerEdits: { meta: Record<string, unknown>; findings: unknown[] } & Record<string, unknown>;
  gateChecks: boolean[];
  approved: boolean;
  pdfSha256: string | null;
  /** The exact approved PDF, stored privately so a failed send can be retried with the same bytes. */
  pdfBase64: string | null;
}

export type PayloadResult = { ok: true; value: ReviewPayload } | { ok: false; error: string; status: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = (error: string, status = 400): PayloadResult => ({ ok: false, error, status });

export function validateReviewPayload(body: unknown): PayloadResult {
  if (!isObj(body)) return fail("Malformed request body");

  const { intakeId, engineVersion, engineOutput, reviewerEdits, gateChecks, approved, pdfSha256, pdfBase64 } = body;

  if (typeof intakeId !== "string" || !UUID.test(intakeId)) return fail("intakeId must be a UUID");

  if (engineVersion !== ENGINE_VERSION) {
    return fail(
      `This page ran engine ${String(engineVersion)} but the server is on ${ENGINE_VERSION}. Reload the page and re-run the ledger.`,
      409,
    );
  }

  if (!isObj(engineOutput) || !Array.isArray(engineOutput.findings)) {
    return fail("engineOutput must be the engine result, including findings");
  }
  if (!isObj(reviewerEdits) || !isObj(reviewerEdits.meta) || !Array.isArray(reviewerEdits.findings)) {
    return fail("reviewerEdits must include meta and findings");
  }

  if (
    !Array.isArray(gateChecks) ||
    gateChecks.length !== GATE.length ||
    !gateChecks.every((g) => typeof g === "boolean")
  ) {
    return fail(`gateChecks must be ${GATE.length} booleans`);
  }

  if (typeof approved !== "boolean") return fail("approved must be true or false");

  let hash: string | null = null;
  if (pdfSha256 !== undefined && pdfSha256 !== null) {
    if (typeof pdfSha256 !== "string" || !SHA256.test(pdfSha256)) return fail("pdfSha256 must be 64 hex characters");
    hash = pdfSha256;
  }

  let pdf: string | null = null;
  if (pdfBase64 !== undefined && pdfBase64 !== null) {
    if (typeof pdfBase64 !== "string" || pdfBase64.length === 0) return fail("pdfBase64 must be a base64 string");
    if (pdfBase64.length > MAX_PDF_BASE64_CHARS) return fail("PDF too large to store", 413);
    pdf = pdfBase64;
  }

  if (approved) {
    if (!gateChecks.every(Boolean)) return fail("Every release-gate item must be ticked to approve", 422);
    if (!hash) return fail("An approved review needs the SHA-256 of the exact PDF", 422);
    if (!pdf) return fail("An approved review needs the PDF itself, so a failed send can be retried", 422);
    // The fingerprint must describe the bytes actually sent to us, not a different file.
    if (sha256Hex(Buffer.from(pdf, "base64")) !== hash) {
      return fail("pdfSha256 does not match the PDF supplied", 422);
    }
  }

  return {
    ok: true,
    value: {
      intakeId,
      engineVersion,
      engineOutput: engineOutput as ReviewPayload["engineOutput"],
      reviewerEdits: reviewerEdits as ReviewPayload["reviewerEdits"],
      gateChecks: gateChecks as boolean[],
      approved,
      pdfSha256: hash,
      pdfBase64: pdf,
    },
  };
}

export type ReviewStage = "not_started" | "draft" | "approved" | "sent" | "send_failed";

/** 'sent' is terminal. Everything else may be saved again (a correction is a new row). */
export function canSaveFrom(stage: ReviewStage): boolean {
  return stage !== "sent";
}

/** Only these intake statuses can be reviewed: paid and not yet delivered or refunded. */
export const REVIEWABLE_STATUSES = ["paid", "files_received", "in_analysis"] as const;
