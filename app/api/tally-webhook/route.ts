/**
 * app/api/tally-webhook/route.ts
 * ----------------------------------------------------------------------------
 * Turns a Tally submission into a paid intake with an upload link. Nothing else
 * issues tokens.
 *
 *   1. verify the signature   — an unsigned endpoint is a free-token machine
 *   2. claim the event id     — Tally retries; retries must not re-send email
 *   3. map Tally's field array into a record
 *   4. issue an upload token  — only when payment is confirmed
 *   5. email the secure link  — via lib/email.ts (Resend)
 *
 * WHAT CHANGED IN THIS VERSION
 *
 * Dropdowns. Tally sends the answer as an array of option UUIDs plus a separate
 * `options` lookup table:
 *
 *     "value":   ["7d169bd0-faf4-4a62-adba-9c859cee3d80"]
 *     "options": [{ "id": "7d169bd0-...", "text": "500+ units" }, ...]
 *
 * The previous version stored the raw UUID, so audit_intakes read
 * `portfolio_size: 7d169bd0-faf4-4a62-adba-9c859cee3d80` — which makes the
 * held_intakes queue unreadable at a glance, and means any later filter on
 * portfolio size compares meaningless strings. resolveValue() now looks the id
 * up and stores "500+ units".
 *
 * Payment capture. The payload carries Payment (price) and Payment (currency)
 * fields. When Stripe is connected they hold real values; until then they are
 * null. Reading them means the intake records what was actually charged rather
 * than what the form was configured to charge — and it gives you a second,
 * independent signal for whether money moved.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { fulfillIntake } from '@/lib/fulfill';
import { notifyOwner } from '@/lib/email';
import { sanitizeHandoff } from '@/lib/calculatorHandoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* -------------------------------------------------------------------------- */
/*  Config                                                                     */
/* -------------------------------------------------------------------------- */

const SIGNATURE_HEADER = 'tally-signature';
const SIGNATURE_ENCODING: 'base64' | 'hex' = 'base64';

/** True ONLY once you've confirmed the webhook fires after payment clears. */
const PAYMENT_CONFIRMED_BY_WEBHOOK = process.env.TALLY_PAYMENT_ENABLED === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

/* -------------------------------------------------------------------------- */
/*  Field mapping                                                              */
/* -------------------------------------------------------------------------- */

interface TallyOption {
  id?: string;
  text?: string;
}

interface TallyField {
  key?: string;
  label?: string;
  type?: string;
  value?: unknown;
  options?: TallyOption[];
}

/**
 * Turns a field's raw value into the string a human would recognise.
 *
 * Dropdowns, multi-selects and checkboxes arrive as arrays of option ids that
 * only mean something against the field's own `options` table. Everything else
 * arrives as a plain scalar.
 */
function resolveValue(field: TallyField): string | null {
  const raw = field.value;
  if (raw === undefined || raw === null) return null;

  const lookup = (id: unknown): string => {
    const hit = field.options?.find((o) => o.id === id);
    return (hit?.text ?? String(id)).trim();
  };

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    // Multi-selects keep every choice, comma-joined, in the order given.
    const parts = raw.map(lookup).filter(Boolean);
    return parts.length ? parts.join(', ').slice(0, 2000) : null;
  }

  // A scalar can still be an option id when the field allows a single choice.
  if (field.options?.length) return lookup(raw).slice(0, 2000);

  const s = String(raw).trim();
  return s ? s.slice(0, 2000) : null;
}

/**
 * Match on label first — stable if the internal key is renamed — then key.
 * Labels must match the Tally form exactly; see TALLY-SETUP.md §2.
 */
function pick(fields: TallyField[], ...labels: string[]): string | null {
  for (const wanted of labels) {
    const hit = fields.find(
      (f) =>
        f.label?.trim().toLowerCase() === wanted.toLowerCase() ||
        f.key?.trim().toLowerCase() === wanted.toLowerCase()
    );
    if (!hit) continue;
    const v = resolveValue(hit);
    if (v) return v;
  }
  return null;
}

function pickNumber(fields: TallyField[], ...labels: string[]): number | null {
  const s = pick(fields, ...labels);
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Payment fields, matched on TYPE rather than label.
 *
 * Tally builds a payment field's label from the question's own title, so the
 * same field has arrived as "Payment (price)", "Make a payment below: (price)"
 * and " (price)" across three tests — every rename in the form editor produces
 * a different label, and a label-based lookup silently returns null each time.
 * `type: "PAYMENT"` never changes. Match on that, then on the suffix.
 */
function pickPayment(fields: TallyField[], suffix: string): unknown {
  const hit = fields.find(
    (f) => f.type === 'PAYMENT' && (f.label ?? '').trim().toLowerCase().endsWith(`(${suffix})`)
  );
  return hit?.value ?? null;
}

function paymentAmount(fields: TallyField[]): number | null {
  const raw = pickPayment(fields, 'price');
  if (raw === null || raw === undefined) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function paymentString(fields: TallyField[], suffix: string): string | null {
  const raw = pickPayment(fields, suffix);
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s ? s.slice(0, 500) : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    // 23505 = unique violation = already seen. Tally retried; acknowledge.
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
      // 200 so Tally stops retrying — this payload will never improve.
      return NextResponse.json({ received: true, incomplete: true }, { status: 200 });
    }

    /* ------------------------------------------------- payment, if any */

    // Null until Stripe is connected in Tally. When it is connected these
    // carry what was actually charged — a second, independent signal that
    // money moved, separate from the TALLY_PAYMENT_ENABLED flag.
    const paidAmount = paymentAmount(fields);
    const paidCurrency = paymentString(fields, 'currency');
    const paymentLink = paymentString(fields, 'link');
    const paymentSeen = paidAmount !== null && paidAmount > 0;

    const paid = PAYMENT_CONFIRMED_BY_WEBHOOK && paymentSeen;

    /* Resume-safe: if an earlier delivery of this same response already saved
       the intake (and then failed later, e.g. on email), pick it up instead of
       inserting again. The unique index on tally_response_id would otherwise
       reject the retry forever -- the customer would have paid, no link would
       have gone out, and nothing would tell you. */
    const responseId = payload.data?.responseId ?? null;
    type IntakeRef = { id: string; status: string; fulfillment_status: string };
    let intake: IntakeRef | null = null;

    if (responseId) {
      const { data: existing } = await supabase
        .from('audit_intakes')
        .select('id, status, fulfillment_status')
        .eq('tally_response_id', responseId)
        .maybeSingle();
      if (existing) intake = existing as IntakeRef;
    }

    if (!intake) {
      const handoff = sanitizeHandoff(
        pick(fields, 'calculator_slug'),
        pick(fields, 'calculator_headline'),
      );
      const { data: created, error: dbError } = await supabase
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
            // Source calculator. Re-validated here: hidden fields come from a
            // query string anyone can edit, so only registry slugs are kept.
            calculatorSlug: handoff.slug,
            calculatorHeadline: handoff.headline,
            operationalDays: pickNumber(fields, 'days', 'operational_days'),
            operationalExposure: pickNumber(fields, 'exposure', 'operational_exposure'),
            totalDays: pickNumber(fields, 'total_days'),
            totalExposure: pickNumber(fields, 'total_exposure'),
            paidAmount,
            paidCurrency,
            paymentLink,
          },
          tally_response_id: responseId,
          status: paid ? 'paid' : 'submitted',
          paid_at: paid ? new Date().toISOString() : null,
        })
        .select('id, status, fulfillment_status')
        .single();

      if (dbError || !created) throw dbError ?? new Error('Intake insert returned no row');
      intake = created as IntakeRef;
    }

    /* ------------------------------------------------- 4. token + email */

    if (intake.status === 'paid') {
      if (intake.fulfillment_status === 'sent') {
        // A retry of a delivery that already finished. Nothing to do.
        await supabase
          .from('webhook_events')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('event_id', eventId);
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }

      // intake.id as idempotency key: a retry cannot send a second upload link.
      await fulfillIntake(intake.id);

      await notifyOwner(
        `PropOps8 — audit booked: ${company ?? name}`,
        [
          `${name} (${email}) at ${company ?? 'unknown'} booked an audit.`,
          `Intake: ${intake.id}`,
          paidAmount ? `Charged: ${paidAmount} ${paidCurrency ?? ''}`.trim() : '',
          'Upload link sent.',
        ]
          .filter(Boolean)
          .join('\n')
      );
    } else {
      const why = !PAYMENT_CONFIRMED_BY_WEBHOOK
        ? 'TALLY_PAYMENT_ENABLED is not true'
        : 'the payload carried no payment amount — is Stripe connected in Tally?';

      await notifyOwner(
        `PropOps8 — intake HELD, confirm payment: ${company ?? name}`,
        [
          `${name} (${email}) at ${company ?? 'unknown'} submitted the audit form.`,
          `Intake: ${intake.id}`,
          `Portfolio: ${pick(fields, 'Portfolio size') ?? 'unknown'}`,
          `Data available: ${pick(fields, 'Data you can export') ?? 'unknown'}`,
          '',
          `No upload link was sent — ${why}.`,
          'Confirm the payment, then release the intake:',
          '',
          `  select public.release_intake('${intake.id}');`,
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
    // Tell the owner. A paid customer with no link is otherwise invisible
    // until they write to ask where it is.
    await notifyOwner(
      'PropOps8 — webhook FAILED, a customer may not have their link',
      [
        `Tally response: ${payload.data?.responseId ?? eventId}`,
        `Error: ${err instanceof Error ? err.message : String(err)}`,
        '',
        'Tally will retry. The retry resumes the saved intake and will not duplicate it or double-send.',
        'If it keeps failing, open /admin/intakes and use Release or Resend link.',
      ].join('\n')
    );
    // Release the claim so Tally's retry can re-process this event id.
    await supabase.from('webhook_events').delete().eq('event_id', eventId);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
