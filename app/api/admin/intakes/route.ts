/**
 * app/api/admin/intakes/route.ts
 * ----------------------------------------------------------------------------
 * GET  -> the intake queue (held, paid, files received, in analysis).
 * POST -> { id, action: 'release' | 'resend' }
 *
 *   release  a HELD intake (status 'submitted') whose $497 you have confirmed:
 *            marks it paid, issues the upload token and emails the link. This
 *            replaces the bare `select release_intake(...)`, which flipped the
 *            status and then sent nothing.
 *   resend   a paid intake: revokes the old link and emails a fresh one.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';
import { fulfillIntake } from '@/lib/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifySessionCookie(store.get(COOKIE_NAME)?.value);
}

export async function GET() {
  if (!(await authed())) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('audit_intakes')
    .select(
      'id, created_at, name, email, company, portfolio_size, primary_concern, status, fulfillment_status, fulfillment_error, files_submitted_at, report_sent_at, resend_message_id, review_stage, calculator_snapshot'
    )
    .in('status', ['submitted', 'paid', 'files_received', 'in_analysis', 'delivered'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  return NextResponse.json({ intakes: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await authed())) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const action = body?.action;
  if (!id || (action !== 'release' && action !== 'resend')) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  try {
    if (action === 'release') {
      const { data: row, error } = await supabase
        .from('audit_intakes')
        .select('status')
        .eq('id', id)
        .maybeSingle();
      if (error || !row) return NextResponse.json({ error: 'Intake not found' }, { status: 404 });
      if (row.status !== 'submitted') {
        return NextResponse.json({ error: `Intake is "${row.status}", not held.` }, { status: 409 });
      }
      const { error: upErr } = await supabase
        .from('audit_intakes')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'submitted');
      if (upErr) throw upErr;
      await fulfillIntake(id);
      return NextResponse.json({ ok: true, message: 'Released. Upload link emailed.' });
    }

    await fulfillIntake(id, { reissue: true });
    return NextResponse.json({ ok: true, message: 'New upload link emailed. The old link no longer works.' });
  } catch (err) {
    console.error('[admin/intakes] action failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Action failed' },
      { status: 500 }
    );
  }
}
