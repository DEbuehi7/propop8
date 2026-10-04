/**
 * lib/fulfill.ts
 * ----------------------------------------------------------------------------
 * The one path that turns a PAID intake into a customer holding an upload link.
 * Used by the Tally webhook (auto-confirmed payment), by the admin "release"
 * action (payment confirmed by hand), and by "resend link".
 *
 * Why this exists: releasing a held intake used to be a bare SQL statement
 * (`select release_intake(...)`) that flipped status to paid and then did
 * nothing, so the customer paid and never received a link. Every route to a
 * link now goes through here, and a failure is recorded on the row
 * (fulfillment_status = 'failed', fulfillment_error) instead of vanishing.
 */

import { createClient } from '@supabase/supabase-js';
import { issueUploadToken } from '@/lib/uploadTokens';
import { sendUploadInstructions } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

export interface FulfillResult {
  /** true when this call issued a link and sent the email */
  sent: boolean;
  /** true when a link had already gone out and nothing was done */
  alreadySent: boolean;
}

export async function fulfillIntake(
  intakeId: string,
  opts: { reissue?: boolean } = {}
): Promise<FulfillResult> {
  const { data: intake, error } = await supabase
    .from('audit_intakes')
    .select('id, name, email, status, fulfillment_status')
    .eq('id', intakeId)
    .maybeSingle();

  if (error || !intake) throw new Error('Intake not found');
  if (intake.status !== 'paid' && intake.status !== 'files_received') {
    throw new Error(`Intake status is "${intake.status}"; only a paid intake can receive a link`);
  }
  if (intake.fulfillment_status === 'sent' && !opts.reissue) {
    return { sent: false, alreadySent: true };
  }

  await supabase.from('audit_intakes').update({ fulfillment_status: 'sending' }).eq('id', intake.id);

  try {
    const token = await issueUploadToken(intake.id);
    // A reissue must carry a fresh idempotency key or Resend dedupes it away.
    await sendUploadInstructions(
      intake.name,
      intake.email,
      token,
      opts.reissue ? `${intake.id}:reissue:${Date.now()}` : intake.id
    );
    await supabase
      .from('audit_intakes')
      .update({ fulfillment_status: 'sent', fulfillment_error: null })
      .eq('id', intake.id);
    return { sent: true, alreadySent: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('audit_intakes')
      .update({ fulfillment_status: 'failed', fulfillment_error: message.slice(0, 500) })
      .eq('id', intake.id);
    throw err;
  }
}
