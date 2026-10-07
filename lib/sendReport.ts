/**
 * lib/sendReport.ts
 * ----------------------------------------------------------------------------
 * The one function that emails an approved report. Used by /api/send-report
 * (bytes from the browser) and /api/admin/reports/retry (bytes from storage), so
 * both go through the same guard: approved review, matching SHA-256, 409 if
 * already sent, every outcome recorded on the intake and in audit_intake_events.
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { checkSendable, sendIdempotencyKey } from '@/lib/sendGuard';
import type { ReviewStage } from '@/lib/reviewPayload';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);
const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendOutcome {
  status: number;
  body: Record<string, unknown>;
}

export async function sendApprovedReport(args: {
  intakeId: string;
  pdfBuffer: Buffer;
  propertyName?: string;
  triggerCount?: number;
}): Promise<SendOutcome> {
  const { intakeId, pdfBuffer, propertyName, triggerCount } = args;
  const json = (body: Record<string, unknown>, init?: { status?: number }): SendOutcome => ({
    status: init?.status ?? 200,
    body,
  });

  const { data: intake, error: fetchError } = await supabase
    .from('audit_intakes')
    .select('name, email, report_sent_at, review_stage')
    .eq('id', intakeId)
    .single();

  if (fetchError || !intake) {
    console.error('[send-report] intake lookup failed', fetchError);
    return json({ error: 'Intake not found' }, { status: 404 });
  }

  // The review the reviewer approved: its fingerprint is what we compare against.
  const { data: review, error: reviewError } = await supabase
    .from('audit_reviews')
    .select('id, pdf_sha256')
    .eq('intake_id', intakeId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reviewError) {
    console.error('[send-report] review lookup failed', reviewError);
    return json({ error: 'Review lookup failed. Nothing was sent.' }, { status: 500 });
  }

  const fromStage = intake.review_stage as ReviewStage;

  // Refuses: not approved, already sent (409 guard kept), or not the approved bytes.
  const check = checkSendable({
    reviewStage: fromStage,
    reportSentAt: intake.report_sent_at,
    approvedPdfSha256: review?.pdf_sha256 ?? null,
    pdfBytes: pdfBuffer,
  });
  if (!check.ok) return json({ error: check.error }, { status: check.status });
  if (!review) return json({ error: 'No approved review found' }, { status: 409 });

  const { count: failedBefore } = await supabase
    .from('audit_intake_events')
    .select('id', { count: 'exact', head: true })
    .eq('intake_id', intakeId)
    .eq('event_type', 'report_send_failed');

  const property = propertyName || 'your property';
  const count = typeof triggerCount === 'number' ? triggerCount : null;

  /** Append a history line. Never throws: the send outcome matters more than the log. */
  async function logEvent(eventType: string, toStage: ReviewStage, detail: Record<string, unknown>) {
    const { error } = await supabase.from('audit_intake_events').insert({
      intake_id: intakeId,
      event_type: eventType,
      from_stage: fromStage,
      to_stage: toStage,
      detail: { review_id: review!.id, ...detail },
    });
    if (error) console.error('[send-report] event insert failed', error);
    return !error;
  }

  async function recordFailure(message: string) {
    const { error } = await supabase.from('audit_intakes').update({ review_stage: 'send_failed' }).eq('id', intakeId);
    if (error) console.error('[send-report] could not mark send_failed', error);
    await logEvent('report_send_failed', 'send_failed', { error: message.slice(0, 500) });
  }

  try {
    const { data, error } = await resend.emails.send(
      {
        from: process.env.RESEND_FROM || 'Daniel Ebuehi <daniel@propops8.com>',
        to: [intake.email],
        subject: `Your PropOps8 ledger review — ${property}`,
        html:
          `<p>Hi ${esc(String(intake.name ?? ''))},</p>` +
          `<p>Your ledger review for ${esc(property)} is attached.` +
          (count !== null
            ? ` It identifies <strong>${count} ${count === 1 ? 'item' : 'items'}</strong> worth a closer look, each traced back to rows in the export you sent.`
            : '') +
          `</p>` +
          `<p>These are review triggers, not quantified savings — the last page sets out exactly ` +
          `what this analysis can and cannot establish from the data provided. Happy to walk ` +
          `through any of it on the review call.</p>` +
          `<p>Daniel</p>`,
        attachments: [
          {
            filename: `${property.replace(/[^a-z0-9]+/gi, '_')}_Ledger_Review.pdf`,
            content: pdfBuffer,
          },
        ],
      },
      { idempotencyKey: sendIdempotencyKey(review.id, failedBefore ?? 0) }
    );

    if (error) {
      // Resend's error object carries the actual reason -- unverified domain,
      // bad from address, rate limit. Log it whole and record it on the intake.
      console.error('[send-report] resend rejected the send', JSON.stringify(error));
      const reason = error.message ?? 'unknown reason';
      await recordFailure(reason);
      return json(
        { error: `Email provider rejected the send: ${reason}. It is recorded on the intake and can be retried.` },
        { status: 502 }
      );
    }

    const { error: updateError } = await supabase
      .from('audit_intakes')
      .update({
        report_sent_at: new Date().toISOString(),
        resend_message_id: data?.id ?? null,
        status: 'delivered',
        review_stage: 'sent',
      })
      .eq('id', intakeId);

    // The email went out, so the history line is written either way.
    await logEvent('report_sent', 'sent', {
      resend_message_id: data?.id ?? null,
      pdf_sha256: review.pdf_sha256,
      to: intake.email,
    });

    if (updateError) {
      // Say so rather than reporting a failure that would invite a second send.
      console.error('[send-report] sent but failed to stamp the row', updateError);
      return json({
        sent: true,
        messageId: data?.id,
        warning: 'Email sent, but the intake row was not updated. Do not send again.',
      });
    }

    return json({ sent: true, messageId: data?.id });
  } catch (err) {
    console.error('[send-report] unexpected failure', err);
    // Unknown whether it went out: do NOT mark failed (that invites a retry that could
    // double-send). The idempotency key makes a retry safe within 24h, but say so plainly.
    return json(
      { error: 'Processing failed. Check the Resend dashboard before sending again.' },
      { status: 500 }
    );
  }
}
