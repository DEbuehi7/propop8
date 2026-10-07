/**
 * app/api/admin/reports/retry/route.ts
 * ----------------------------------------------------------------------------
 * POST { intakeId } -> re-send the APPROVED report after a failed send.
 *
 * The bytes come from the private audit-reports bucket (what the reviewer
 * approved), not from a re-render, and go through the same guard as the first
 * send: stage must be send_failed, SHA-256 must match, 409 if already sent.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';
import { sendApprovedReport } from '@/lib/sendReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const store = await cookies();
  if (!(await verifySessionCookie(store.get(COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const intakeId = typeof body?.intakeId === 'string' ? body.intakeId : '';
  if (!UUID.test(intakeId)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { data: intake } = await supabase
    .from('audit_intakes')
    .select('review_stage')
    .eq('id', intakeId)
    .maybeSingle();
  if (!intake) return NextResponse.json({ error: 'Intake not found' }, { status: 404 });
  if (intake.review_stage !== 'send_failed') {
    return NextResponse.json(
      { error: `Only a failed send can be retried; this intake is "${intake.review_stage}".` },
      { status: 409 }
    );
  }

  const { data: review, error: reviewError } = await supabase
    .from('audit_reviews')
    .select('pdf_path, reviewer_edits')
    .eq('intake_id', intakeId)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewError || !review?.pdf_path) {
    return NextResponse.json({ error: 'No stored approved PDF for this intake. Re-approve the review.' }, { status: 409 });
  }

  const { data: file, error: downloadError } = await supabase.storage.from('audit-reports').download(review.pdf_path);
  if (downloadError || !file) {
    console.error('[reports/retry] download failed', downloadError);
    return NextResponse.json({ error: 'The stored PDF could not be read. Nothing was sent.' }, { status: 500 });
  }

  const edits = review.reviewer_edits as { meta?: { propertyName?: string }; triggerCount?: number };
  const out = await sendApprovedReport({
    intakeId,
    pdfBuffer: Buffer.from(await file.arrayBuffer()),
    propertyName: edits?.meta?.propertyName || undefined,
    triggerCount: typeof edits?.triggerCount === 'number' ? edits.triggerCount : undefined,
  });
  return NextResponse.json(out.body, { status: out.status });
}
