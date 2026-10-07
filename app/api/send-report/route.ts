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
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';
import { sendApprovedReport } from '@/lib/sendReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const out = await sendApprovedReport({
    intakeId,
    pdfBuffer: Buffer.from(pdfBase64, 'base64'),
    propertyName,
    triggerCount,
  });
  return NextResponse.json(out.body, { status: out.status });
}
