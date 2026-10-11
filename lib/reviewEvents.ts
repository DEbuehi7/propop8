/**
 * lib/reviewEvents.ts
 * Turns an audit_intake_events row into one plain line for the admin timeline.
 * Pure and tested: the timeline is what you read when a send is in doubt, so an
 * unknown event type is shown as-is rather than hidden.
 */

export interface IntakeEvent {
  id: string;
  created_at: string;
  event_type: string;
  from_stage: string | null;
  to_stage: string | null;
  detail: Record<string, unknown> | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function describeEvent(e: IntakeEvent): string {
  const d = e.detail ?? {};
  switch (e.event_type) {
    case "review_saved":
      return `Draft review saved (engine ${str(d.engine_version) ?? "?"}, ${String(d.included_findings ?? "?")} findings included)`;
    case "review_approved":
      return `Review approved (engine ${str(d.engine_version) ?? "?"}, ${String(d.included_findings ?? "?")} findings included, PDF ${(str(d.pdf_sha256) ?? "").slice(0, 8) || "?"})`;
    case "report_sent":
      return `Report emailed to ${str(d.to) ?? "customer"} — Resend id ${str(d.resend_message_id) ?? "none returned"}`;
    case "report_send_failed":
      return `Send FAILED: ${str(d.error) ?? "no reason recorded"}`;
    default:
      return `${e.event_type}${e.from_stage || e.to_stage ? ` (${e.from_stage ?? "?"} → ${e.to_stage ?? "?"})` : ""}`;
  }
}
