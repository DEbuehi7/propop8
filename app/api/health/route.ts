import { NextResponse } from 'next/server';
import { ENGINE_VERSION } from '@/lib/engineVersion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** First label of the public Supabase URL, e.g. "abcd1234" from https://abcd1234.supabase.co.
 *  The URL is already shipped to every browser (NEXT_PUBLIC_*), so the ref is not a secret.
 *  It lets you confirm at a glance which database this deploy talks to. */
function supabaseProjectRef(): string | null {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

/** Plate probes this on load to decide whether a backend exists. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'plate',
    node: process.version,
    host: 'propops8',
    supabaseProject: supabaseProjectRef(),
    auditEngine: ENGINE_VERSION,
  });
}
