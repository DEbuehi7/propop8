import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Plate probes this on load to decide whether a backend exists. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'plate',
    node: process.version,
    host: 'propops8',
  });
}
