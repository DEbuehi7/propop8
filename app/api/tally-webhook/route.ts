/**
 * app/api/tally-webhook/route.ts
 * ----------------------------------------------------------------------------
 * Replaces stripe-webhook-route.ts. This is now the keystone: it is the only
 * thing that turns a form submission into a paid intake with an upload link.
 *
 * Tally posts here on submission. This route:
 *   1. verifies the signature          (an unsigned endpoint is a free-token machine)
 *   2. claims the event id             (Tally retries; retries must not re-send email)
 *   3. maps Tally's field array into a record
 *   4. issues an upload token          (only when payment is confirmed)
 *   5. emails the secure upload link
 *
 * TWO THINGS TO VERIFY IN TALLY'S DOCS BEFORE GOING LIVE — I can't confirm
 * either from here, and both are load-bearing:
 *
 *   a) The signature header name and digest encoding. Constants are at the top
 *      so you can correct them in one place. Send a test submission and log
 *      the headers if the docs are ambiguous.
 *
 *   b) WHETHER THE WEBHOOK FIRES BEFORE OR AFTER PAYMENT COMPLETES. If Tally
 *      posts on form submission rather than on successful charge, this route
 *      will issue upload tokens to people who never paid. That is the same
 *      failure as treating Stripe's checkout.session.completed as proof of
 *      payment. Set TALLY_PAYMENT_ENABLED=false until you have confirmed it,
 *      and the route will hold every intake for manual release.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { issueUploadToken, UPLOAD_WINDOW_DAYS } from '@/lib/uploadTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* -------------------------------------------------------------------------- */
/*  Config — verify these two against Tally's webhook documentation            */
/* -------------------------------------------------------------------------- */

const SIGNATURE_HEADER = 'tally-signature';
const SIGNATURE_ENCODING: 'base64' | 'hex' = 'base64';

/** Set true ONLY once you've confirmed the webhook fires after payment clears. */
const PAYMENT_CONFIRMED_BY_WEBHOOK = process.env.TALLY_PAYMENT_ENABLED === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

/* -------------------------------------------------------------------------- */
/*  Field mapping                                                              */
/* -------------------------------------------------------------------------- */

interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
}

/**
 * Tally sends an array of fields, not an object. Match on label first (stable
 * if you rename the internal key) then key. Labels here must match the form
 * exactly — see TALLY-SETUP.md §2.
 */
function pick(fields: TallyField[], ...labels: string[]): string | null {
  for (const wanted of labels) {
    const hit = fields.find(
      (f) =>
        f.label?.trim().toLowerCase() === wanted.toLowerCase() ||
        f.key?.trim().toLowerCase() === wanted.toLowerCase()
    );
    if (!hit || hit.value === undefined || hit.value === null) continue;

    // Dropdowns arrive as arrays; take the first choice.
    const raw = Array.isArray(hit.value) ? hit.value[0] : hit.value;
    const s = String(raw).trim();
    if (s) return s.slice(0, 2000);
  }
  return null;
}

function pickNumber(fields: TallyField[], ...labels: string[]): number | null {
  const s = pick(fields, ...labels);
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* -------------------------------------------------------------------------- */
/*  Fulfilment                                                                 */
/* -------------------------------------------------------------------------- */

async function sendUploadInstructions(name: string, email: string, token: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const link = `${base}/upload/${token}`;
  const pmToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM ?? 'daniel@propops8.com';
  if (!pmToken) throw new Error('POSTMARK_SERVER_TOKEN is not configured');

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
    'Daniel Ebuehi',
    'PropOps8',
  ].join('\n');

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': pmToken,
    },
    body: JSON.stringify({
      From: from,
      To: email,
      Subject: 'Your PropOps8 audit is booked — secure upload link inside',
      TextBody: text,
      MessageStream: 'outbound',
    }),
  });

  if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
}

async function notifyOwner(subject: string, body: string) {
  const pmToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM ?? 'daniel@propops8.com';
  const to = process.env.AUDIT_NOTIFY_EMAIL ?? from;
  if (!pmToken) return;

  await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': pmToken,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: subject,
      TextBody: body,
      MessageStream: 'outbound',
    }),
  }).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(req: Request) {
  const raw = await req.text();

  /* --------------------------------------------------- 1. verify signature */

  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) {
    console.error('[tally-webhook] TALLY_SIGNING_SECRET is not set — refusing');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const provided = req.headers.get(SIGNATURE_HEADER) ?? '';
  const expected = crypto
    .createHmac('sha256', secret)
    .update(raw)
    .digest(SIGNATURE_ENCODING);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.error('[tally-webhook] signature mismatch');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  /* ------------------------------------------------------- 2. claim event */

  let payload: {
    eventId?: string;
    eventType?: string;
    data?: { responseId?: string; formId?: string; fields?: TallyField[] };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
  }

  const eventId = payload.eventId ?? payload.data?.responseId;
  if (!eventId) {
    return NextResponse.json({ error: 'No event id' }, { status: 400 });
  }

  const { error: logError } = await supabase.from('webhook_events').insert({
    event_id: eventId,
    source: 'tally',
    event_type: payload.eventType ?? 'FORM_RESPONSE',
    payload: payload as unknown as Record<string, unknown>,
  });

  if (logError) {
    // 23505 = already seen. Tally retried; do nothing and acknowledge.
    if (logError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    console.error('[tally-webhook] event log failed', logError);
    return NextResponse.json({ error: 'Event log unavailable' }, { status: 500 });
  }

  /* ------------------------------------------------------------ 3. map it */

  try {
    const fields = payload.data?.fields ?? [];

    const name = pick(fields, 'Your name', 'name');
    const email = pick(fields, 'Work email', 'email');
    const company = pick(fields, 'Business / portfolio', 'company');

    if (!name || !email || !EMAIL_RE.test(email)) {
      await supabase
        .from('webhook_events')
        .update({ status: 'failed', error: 'missing name or valid email' })
        .eq('event_id', eventId);
      await notifyOwner(
        'PropOps8 — form submission missing name or email',
        `Response ${payload.data?.responseId} arrived without a usable name/email. Check the form field labels against TALLY-SETUP.md §2.`
      );
      // 200 so Tally stops retrying — the payload will never improve.
      return NextResponse.json({ received: true, incomplete: true }, { status: 200 });
    }

    const paid = PAYMENT_CONFIRMED_BY_WEBHOOK;

    const { data: intake, error: dbError } = await supabase
      .from('audit_intakes')
      .insert({
        name,
        email: email.toLowerCase(),
        company: company ?? '(not given)',
        role: pick(fields, 'Your role', 'role'),
        portfolio_size: pick(fields, 'Portfolio size', 'portfolio_size') ?? '(not given)',
        primary_concern:
          pick(fields, "What's the problem you'd most want answered?", 'primary_concern') ??
          '(not given)',
        data_availability: pick(fields, 'Data you can export', 'data_availability'),
        authority_confirmed: true,
        calculator_snapshot: {
          operationalDays: pickNumber(fields, 'days', 'operational_days'),
          operationalExposure: pickNumber(fields, 'exposure', 'operational_exposure'),
          totalDays: pickNumber(fields, 'total_days'),
          totalExposure: pickNumber(fields, 'total', 'total_exposure'),
        },
        tally_response_id: payload.data?.responseId ?? null,
        status: paid ? 'paid' : 'submitted',
        paid_at: paid ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (dbError || !intake) throw dbError ?? new Error('Intake insert returned no row');

    /* ------------------------------------------------- 4. token + email */

    if (paid) {
      const token = await issueUploadToken(intake.id);
      await sendUploadInstructions(name, email, token);
      await supabase
        .from('audit_intakes')
        .update({ fulfillment_status: 'sent' })
        .eq('id', intake.id);

      await notifyOwner(
        `PropOps8 — audit booked: ${company ?? name}`,
        `${name} (${email}) at ${company ?? 'unknown'} booked an audit.\nIntake: ${intake.id}\nUpload link sent.`
      );
    } else {
      // Payment not proven. Hold it. Release manually — see TALLY-SETUP.md §5.
      await notifyOwner(
        `PropOps8 — intake HELD, confirm payment: ${company ?? name}`,
        [
          `${name} (${email}) at ${company ?? 'unknown'} submitted the audit form.`,
          `Intake: ${intake.id}`,
          '',
          'No upload link was sent — TALLY_PAYMENT_ENABLED is not true, so this',
          'route cannot prove the $497 was collected. Confirm the payment, then',
          'release the intake to send the link.',
        ].join('\n')
      );
    }

    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[tally-webhook] processing failed', err);
    // Release the claim so Tally's retry can re-process this event id.
    await supabase.from('webhook_events').delete().eq('event_id', eventId);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
