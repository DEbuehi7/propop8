/**
 * lib/email.ts
 * ----------------------------------------------------------------------------
 * All outbound email, in one place. Previously each route carried its own copy
 * of the send logic — three copies of the same fetch call meant three places to
 * change when the provider did. Now the provider swap is this file only.
 *
 * RESEND FREE TIER, WHICH BITES DIFFERENTLY THAN THE HEADLINE SUGGESTS:
 *   3,000 emails/month, but capped at 100/day, one verified domain.
 *   The daily cap is the real ceiling — a 3,000-email month averages exactly
 *   100/day, so the monthly figure only holds if traffic arrives perfectly
 *   evenly, which it never does. Every To/CC/BCC recipient counts separately.
 *
 * At two audits a month you are nowhere near it. Worth knowing before you wire
 * a nurture sequence into the same key.
 *
 * `from` must be on a domain verified in Resend. An unverified sender is
 * rejected at the API, not silently dropped — you will see it.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const UPLOAD_WINDOW_DAYS = 14;

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  /**
   * Optional. Guards against a webhook retry sending the same message twice.
   * Harmless if the API ignores it — an unknown header costs nothing.
   */
  idempotencyKey?: string;
}

export async function sendEmail({ to, subject, text, idempotencyKey }: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'PropOps8 <daniel@propops8.com>';

  if (!key) throw new Error('RESEND_API_KEY is not configured');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to: [to], subject, text }),
  });

  if (!res.ok) {
    // Include the body — Resend's errors are specific (unverified domain,
    // rate limit, malformed address) and the message is the whole diagnosis.
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                   */
/* -------------------------------------------------------------------------- */

/** Sent once, after payment is confirmed. Carries the private upload link. */
export async function sendUploadInstructions(
  name: string,
  email: string,
  token: string,
  idempotencyKey?: string
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const link = `${base}/upload/${token}`;
  const firstName = name.split(' ')[0] || 'there';

  const text = [
    `${firstName},`,
    '',
    'Your PropOps8 Operations Audit is booked.',
    '',
    `Upload your export here (private to you, valid ${UPLOAD_WINDOW_DAYS} days):`,
    link,
    '',
    'What to send — whichever of these you can export:',
    '  • Work orders (unit, date opened, date completed, category, vendor, cost)',
    '  • Vacancy / turn data (move-out, rent-ready, lease-signed, monthly rent)',
    '  • Vendor invoices (vendor, date, amount, category)',
    '',
    'CSV or XLSX. Straight out of your PMS is fine — normalising it is my job.',
    '',
    'Please send de-identified operational data only. Strip resident names,',
    'SSNs, financial account numbers and any medical information before',
    'uploading. Unit numbers and dates are all I need.',
    '',
    'Turnaround is 48 hours from upload. You get a written findings report and',
    'a 30-minute call to walk through it.',
    '',
    'Reply to this email if anything is unclear about the export.',
    '',
    'Daniel Ebuehi',
    'PropOps8',
  ].join('\n');

  await sendEmail({
    to: email,
    subject: 'Your PropOps8 audit is booked — secure upload link inside',
    text,
    idempotencyKey,
  });
}

/**
 * Internal notice. Never throws into the caller's happy path — a failed
 * notification to you must not fail a customer's request.
 */
export async function notifyOwner(subject: string, body: string): Promise<void> {
  const to = process.env.AUDIT_NOTIFY_EMAIL ?? process.env.RESEND_FROM;
  if (!to) return;

  try {
    await sendEmail({ to: stripDisplayName(to), subject, text: body });
  } catch (err) {
    console.error('[email] owner notification failed', err);
  }
}

/** Sent to you when a customer finishes uploading. Starts the 48-hour clock. */
export async function notifyFilesReceived(
  company: string,
  name: string,
  intakeId: string,
  files: { original_name: string; size_bytes: number }[]
): Promise<void> {
  const body = [
    `${company} (${name}) has submitted their audit export.`,
    '',
    `Intake: ${intakeId}`,
    `Files: ${files.length}`,
    ...files.map((f) => `  • ${f.original_name} (${Math.round(f.size_bytes / 1024)} KB)`),
    '',
    '48-hour clock starts now.',
  ].join('\n');

  await sendEmail({
    to: stripDisplayName(process.env.AUDIT_NOTIFY_EMAIL ?? process.env.RESEND_FROM ?? ''),
    subject: `Audit export received — ${company}`,
    text: body,
  });
}

/** `PropOps8 <daniel@propops8.com>` → `daniel@propops8.com` */
function stripDisplayName(addr: string): string {
  const m = /<([^>]+)>/.exec(addr);
  return (m ? m[1] : addr).trim();
}
