import { NextResponse } from 'next/server';
import { assertPublicUrl, safeGet } from '@/lib/safeFetch';

export const runtime = 'nodejs';       // the SSRF guard needs a real DNS lookup
export const dynamic = 'force-dynamic';

/**
 * Server-side RSS fetch for Plate's news page.
 *
 * CORS is a browser rule, not a server one, so a feed the browser refuses
 * to read is fetched here instead. Public http(s) hosts only. The pre-check
 * gives a clear 400; lib/safeFetch then re-checks every connection,
 * including each redirect hop, at connect time (which also defeats DNS
 * rebinding). Without that, a public URL that redirects to an internal
 * address would get past a first-hop-only check.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
    await assertPublicUrl(target);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: 'BAD_URL', message: (e as Error).message } },
      { status: 400 },
    );
  }

  try {
    const r = await safeGet(target.href, {
      timeoutMs: 12_000,
      maxBytes: 4_000_000,
      maxRedirects: 5,
      headers: {
        'user-agent': 'PlateReader/1.0 (+personal feed reader)',
        accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (r.status < 200 || r.status >= 300) throw new Error('upstream returned HTTP ' + r.status);
    return new NextResponse(r.body, {
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
  }
}
