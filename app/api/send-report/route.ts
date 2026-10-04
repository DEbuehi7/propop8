/**
 * app/api/send-report/route.ts
 * ----------------------------------------------------------------------------
 * Emails the approved PDF to a linked intake and stamps the send on
 * audit_intakes.
 *
 * NOTE THE EXTENSION: .ts now, not .tsx. This file no longer renders JSX.
 * DELETE the old route.tsx -- two files in one route folder is the same
 * conflict class as the page/route collision from earlier.
 *
 * WHY THIS WAS REWRITTEN
 *
 * The previous version called renderToBuffer(<AuditPdf report={...} />) and
 * re-rendered the document server-side. Two problems with that:
 *
 *   1. It fails. lib/reportPdf.tsx loads fonts from "/fonts/Inter-Regular.ttf"
 *      and the logo from "/assets/propops8-mark.png". In the browser those
 *      resolve against the page origin. In a Netlify function they are
 *      absolute filesystem paths that don't exist, so the render throws
 *      before Resend is reached -- which is what "Send failed" was.
 *
 *   2. More importantly, a server re-render is a DIFFERENT ARTIFACT from the
 *      one the human just reviewed and approved. The doctrine says only an
 *      approved PDF is client-facing. Re-rendering means the customer
 *      receives a document nobody looked at -- probably identical, but
 *      "probably" is the wrong standard for the thing being sent.
 *
 * So the browser now sends the exact bytes it generated for the download, and
 * this route only emails them. No PDF rendering on the server at all, which
 * also removes the whole class of asset-resolution failures.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);
const resend = new Resend(process.env.RESEND_API_KEY);

/** ~8MB of base64 is ~6MB of PDF -- past what a serverless request body will
 *  carry. A ledger review is tens of KB; anything near this is a bug. */
const MAX_BASE64_CHARS = 8_000_000;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const authed = await verifySessionCookie(cookieStore.get(COOKIE_NAME)?.value);
  if (!authed) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    intakeId?: string;
    pdfBase64?: string;
    propertyName?: string;
    triggerCount?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const { intakeId, pdfBase64, propertyName, triggerCount } = body;

  if (!intakeId || !pdfBase64) {
    return NextResponse.json({ error: 'Missing intakeId or pdfBase64' }, { status: 400 });
  }
  if (pdfBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: 'PDF too large to send this way' }, { status: 413 });
  }

  const { data: intake, error: fetchError } = await supabase
    .from('audit_intakes')
    .select('name, email, report_sent_at')
    .eq('id', intakeId)
    .single();

  if (fetchError || !intake) {
    console.error('[send-report] intake lookup failed', fetchError);
    return NextResponse.json({ error: 'Intake not found' }, { status: 404 });
  }

  // Guard against a double-click sending the customer two copies.
  if (intake.report_sent_at) {
    return NextResponse.json(
      { error: `A report was already sent to this intake on ${intake.report_sent_at}.` },
      { status: 409 }
    );
  }

  const property = propertyName || 'your property';
  const count = typeof triggerCount === 'number' ? triggerCount : null;

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const { data, error } = await resend.emails.send({
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
    });

    if (error) {
      // Resend's error object carries the actual reason -- unverified domain,
      // bad from address, rate limit. Log it whole; the UI only sees "failed".
      console.error('[send-report] resend rejected the send', JSON.stringify(error));
      return NextResponse.json(
        { error: `Email provider rejected the send: ${error.message ?? 'unknown reason'}` },
        { status: 502 }
      );
    }

    const { error: updateError } = await supabase
      .from('audit_intakes')
      .update({
        report_sent_at: new Date().toISOString(),
        resend_message_id: data?.id ?? null,
        status: 'delivered',
      })
      .eq('id', intakeId);

    if (updateError) {
      // The email went out. Say so rather than reporting a failure that would
      // invite a second send to the same customer.
      console.error('[send-report] sent but failed to stamp the row', updateError);
      return NextResponse.json({
        sent: true,
        messageId: data?.id,
        warning: 'Email sent, but the intake row was not updated. Do not send again.',
      });
    }

    return NextResponse.json({ sent: true, messageId: data?.id });
  } catch (err) {
    console.error('[send-report] unexpected failure', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
