// app/api/admin/pending-intakes/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifySessionCookie, COOKIE_NAME } from '@/lib/adminAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

export async function GET() {
  const cookieStore = await cookies();
  const authed = await verifySessionCookie(cookieStore.get(COOKIE_NAME)?.value);
  if (!authed) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('audit_intakes')
    .select('id, name, email, company, created_at, status, files_submitted_at')
    .in('status', ['paid', 'files_received', 'in_analysis'])
    .is('report_sent_at', null)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  return NextResponse.json({ intakes: data ?? [] });
}