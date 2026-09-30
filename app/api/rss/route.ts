import { NextResponse } from 'next/server';
import dns from 'node:dns/promises';

export const runtime = 'nodejs';       // the SSRF guard needs a real DNS lookup
export const dynamic = 'force-dynamic';

/**
 * Server-side RSS fetch for Plate's news page.
 *
 * CORS is a browser rule, not a server one, so a feed the browser refuses
 * to read is fetched here instead. Public http(s) hosts only — without the
 * address check this route would happily read anything on the local network.
 */
const PRIVATE =
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i;

async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('only http and https are allowed');
  const { address } = await dns.lookup(u.hostname);
  if (PRIVATE.test(address)) throw new Error('refusing to fetch a private address');
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
    await assertPublic(target);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: 'BAD_URL', message: (e as Error).message } },
      { status: 400 },
    );
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const r = await fetch(target, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'PlateReader/1.0 (+personal feed reader)',
        accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!r.ok) throw new Error('upstream returned HTTP ' + r.status);
    const body = await r.text();
    if (body.length > 4_000_000) throw new Error('feed is too large');
    return new NextResponse(body, {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'FETCH_FAILED', message: String((e as Error).message ?? e), url: target.href },
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
