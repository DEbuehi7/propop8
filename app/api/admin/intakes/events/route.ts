/**
 * app/api/admin/intakes/events/route.ts
 * GET ?id=<intake uuid> -> that intake's history, oldest first.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const store = await cookies();
  if (!(await verifySessionCookie(store.get(COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { data, error } = await supabase
    .from('audit_intake_events')
    .select('id, created_at, event_type, from_stage, to_stage, detail')
    .eq('intake_id', id)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[admin/intakes/events] query failed', error);
    return NextResponse.json({ error: 'Query failed (has migration 009 been run?)' }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}
