/**
 * app/api/admin/reviews/route.ts
 * ----------------------------------------------------------------------------
 * POST -> save a human review of one intake's ledger, and move its review_stage.
 *
 *   approved: false  -> stage 'draft'
 *   approved: true   -> stage 'approved'  (needs every gate item + the PDF hash)
 *
 * Every step is awaited and every failure is returned. The review page treats a
 * non-OK answer as "not saved" and will not offer Send, so a review can never
 * be sent that this table does not know about.
 *
 * Writes, in order: audit_reviews (append-only) -> audit_intakes.review_stage
 * -> audit_intake_events (append-only). If the stage update fails the intake
 * stays where it was, which is the safe direction: nothing becomes sendable.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';
import {
  validateReviewPayload,
  canSaveFrom,
  REVIEWABLE_STATUSES,
  type ReviewStage,
} from '@/lib/reviewPayload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

/** Engine output plus edits for a big ledger is well under this; anything near it is a bug. */
const MAX_BODY_CHARS = 12_000_000;

export async function POST(req: Request) {
  const store = await cookies();
  if (!(await verifySessionCookie(store.get(COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'Review too large to save' }, { status: 413 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }

  const parsed = validateReviewPayload(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const p = parsed.value;

  const { data: intake, error: lookupError } = await supabase
    .from('audit_intakes')
    .select('id, status, review_stage, report_sent_at')
    .eq('id', p.intakeId)
    .maybeSingle();

  if (lookupError) {
    console.error('[admin/reviews] intake lookup failed', lookupError);
    return NextResponse.json({ error: 'Intake lookup failed' }, { status: 500 });
  }
  if (!intake) return NextResponse.json({ error: 'Intake not found' }, { status: 404 });

  if (!(REVIEWABLE_STATUSES as readonly string[]).includes(intake.status)) {
    return NextResponse.json(
      { error: `Intake is "${intake.status}"; only a paid intake that has not been delivered can be reviewed.` },
      { status: 409 }
    );
  }
  const fromStage = intake.review_stage as ReviewStage;
  if (intake.report_sent_at || !canSaveFrom(fromStage)) {
    return NextResponse.json(
      { error: 'A report has already been sent for this intake; the review is closed.' },
      { status: 409 }
    );
  }

  const toStage: ReviewStage = p.approved ? 'approved' : 'draft';

  // Store the approved bytes first. audit_reviews is append-only, so the path has
  // to be known at insert time; the id is chosen here rather than by the database.
  const reviewId = randomUUID();
  let pdfPath: string | null = null;
  if (p.approved && p.pdfBase64) {
    pdfPath = `${p.intakeId}/${reviewId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('audit-reports')
      .upload(pdfPath, Buffer.from(p.pdfBase64, 'base64'), { contentType: 'application/pdf', upsert: false });
    if (uploadError) {
      console.error('[admin/reviews] pdf upload failed', uploadError);
      return NextResponse.json(
        { error: 'The approved PDF could not be stored (has migration 010 been run?). Nothing was saved.' },
        { status: 500 }
      );
    }
  }

  const { data: review, error: reviewError } = await supabase
    .from('audit_reviews')
    .insert({
      id: reviewId,
      pdf_path: pdfPath,
      intake_id: p.intakeId,
      engine_version: p.engineVersion,
      engine_output: p.engineOutput,
      reviewer_edits: p.reviewerEdits,
      gate_checks: p.gateChecks,
      approved: p.approved,
      pdf_sha256: p.pdfSha256,
    })
    .select('id')
    .single();

  if (reviewError || !review) {
    console.error('[admin/reviews] review insert failed', reviewError);
    if (pdfPath) await supabase.storage.from('audit-reports').remove([pdfPath]);
    return NextResponse.json({ error: 'Review was not saved. Nothing changed.' }, { status: 500 });
  }

  const { error: stageError } = await supabase
    .from('audit_intakes')
    .update({ review_stage: toStage })
    .eq('id', p.intakeId)
    // Only move it if nobody sent in the meantime.
    .is('report_sent_at', null);

  if (stageError) {
    console.error('[admin/reviews] stage update failed', stageError);
    return NextResponse.json(
      { error: 'Review row saved but the stage did not change, so it cannot be sent. Save again.' },
      { status: 500 }
    );
  }

  const { error: eventError } = await supabase.from('audit_intake_events').insert({
    intake_id: p.intakeId,
    event_type: p.approved ? 'review_approved' : 'review_saved',
    from_stage: fromStage,
    to_stage: toStage,
    detail: {
      review_id: review.id,
      engine_version: p.engineVersion,
      pdf_sha256: p.pdfSha256,
      included_findings: p.reviewerEdits.findings.filter(
        (f) => typeof f === 'object' && f !== null && (f as { include?: unknown }).include === true
      ).length,
    },
  });

  if (eventError) {
    // The review and stage are saved; only the history line is missing. Say so.
    console.error('[admin/reviews] event insert failed', eventError);
    return NextResponse.json({
      ok: true,
      reviewId: review.id,
      stage: toStage,
      warning: 'Saved, but the history entry could not be written.',
    });
  }

  return NextResponse.json({ ok: true, reviewId: review.id, stage: toStage });
}
