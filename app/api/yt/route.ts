import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/yt — the search and channel backend for Plate's Slate page.
 *
 * Two modes, picked automatically:
 *
 *   1. If YOUTUBE_API_KEY is set, requests go to the official
 *      YouTube Data API v3. Supported, stable, 10k units/day free
 *      (a search costs 100, so ~100 searches a day).
 *   2. Otherwise it reads youtube.com's own HTML and pulls the
 *      video list out of the ytInitialData blob the page ships.
 *      No key, no quota — but unofficial, so it can break whenever
 *      YouTube changes that markup. The route reports which mode
 *      answered in `via`, and Slate shows it.
 *
 * Runs server-side on purpose: the browser cannot reach either of
 * these cross-origin, and a key must never reach the client.
 *
 *   GET /api/yt?q=ethio+jazz&n=18   -> { via, q, items:[{id,title,author,dur}] }
 *   GET /api/yt?channel=@handle     -> { via, channelId, feed, items:[...] }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const ID_RE = /^[\w-]{11}$/;
const CHAN_RE = /^UC[\w-]{22}$/;

type Item = { id: string; title: string; author: string; dur: number };

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  });

/** "1:02:33" | "4:11" | "251" -> seconds */
function secs(v: string | number | undefined): number {
  if (v == null) return 0;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s);
  // ISO-8601 from the Data API: PT1H2M33S
  const iso = s.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (iso) return (+(iso[1] || 0)) * 3600 + (+(iso[2] || 0)) * 60 + (+(iso[3] || 0));
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

async function grab(url: string, timeoutMs = 9000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        'accept-language': 'en-US,en;q=0.9',
        // skips the EU consent interstitial, which otherwise replaces the page
        cookie: 'CONSENT=YES+1; SOCS=CAI',
      },
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/** Pull the ytInitialData object out of a YouTube HTML page. */
function initialData(html: string): unknown | null {
  const marks = ['var ytInitialData = ', 'window["ytInitialData"] = ', 'ytInitialData = '];
  for (const m of marks) {
    const i = html.indexOf(m);
    if (i < 0) continue;
    const start = i + m.length;
    // walk braces so we stop at the real end of the object, not the first "};"
    let depth = 0, inStr = false, esc = false;
    for (let j = start; j < html.length; j++) {
      const ch = html[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(html.slice(start, j + 1)); } catch { return null; }
        }
      }
    }
  }
  return null;
}

/** Collect every videoRenderer in the tree, in document order. */
function collectVideos(node: unknown, out: Item[], cap: number): void {
  if (out.length >= cap || node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const v of node) collectVideos(v, out, cap);
    return;
  }
  const o = node as Record<string, any>;
  const vr = o.videoRenderer || o.compactVideoRenderer || o.gridVideoRenderer;
  if (vr && typeof vr.videoId === 'string' && ID_RE.test(vr.videoId)) {
    if (!out.some(x => x.id === vr.videoId)) {
      out.push({
        id: vr.videoId,
        title:
          vr.title?.runs?.[0]?.text ??
          vr.title?.simpleText ??
          vr.title?.accessibility?.accessibilityData?.label ??
          '',
        author:
          vr.ownerText?.runs?.[0]?.text ??
          vr.longBylineText?.runs?.[0]?.text ??
          vr.shortBylineText?.runs?.[0]?.text ??
          '',
        dur: secs(vr.lengthText?.simpleText ?? vr.lengthSeconds),
      });
    }
    if (out.length >= cap) return;
  }
  for (const k of Object.keys(o)) collectVideos(o[k], out, cap);
}

async function searchOfficial(q: string, n: number, key: string): Promise<Item[]> {
  const u =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video' +
    `&maxResults=${n}&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error(`data api ${r.status}`);
  const j = await r.json();
  return (j.items || [])
    .filter((it: any) => it?.id?.videoId)
    .map((it: any) => ({
      id: it.id.videoId,
      title: it.snippet?.title || '',
      author: it.snippet?.channelTitle || '',
      dur: 0,
    }));
}

async function searchScrape(q: string, n: number): Promise<Item[]> {
  const html = await grab(
    'https://www.youtube.com/results?hl=en&gl=US&search_query=' + encodeURIComponent(q),
  );
  const data = initialData(html);
  if (!data) throw new Error('could not read the results page');
  const out: Item[] = [];
  collectVideos(data, out, n);
  return out;
}

/** Resolve @handle | /c/name | /channel/UC... | bare handle -> channelId */
async function resolveChannel(raw: string): Promise<string> {
  const v = raw.trim();
  const direct = v.match(/(UC[\w-]{22})/);
  if (direct) return direct[1];

  let url: string;
  if (/^https?:\/\//i.test(v)) {
    const u = new URL(v);
    if (u.hostname !== 'www.youtube.com' && u.hostname !== 'youtube.com' && u.hostname !== 'm.youtube.com')
      throw new Error('only youtube.com channel links are accepted');
    url = 'https://www.youtube.com' + u.pathname;
  } else {
    url = 'https://www.youtube.com/' + (v.startsWith('@') ? v : '@' + v);
  }
  const html = await grab(url);
  const m =
    html.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/) ||
    html.match(/channel\/(UC[\w-]{22})/) ||
    html.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/);
  if (!m) throw new Error('no channel id on that page');
  return m[1];
}

function parseChannelFeed(xml: string): Item[] {
  const out: Item[] = [];
  const entries = xml.split('<entry>').slice(1);
  for (const e of entries) {
    const id = e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    if (!id) continue;
    const title = e.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const author = e.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '';
    out.push({
      id,
      title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim(),
      author: author.trim(),
      dur: 0,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').slice(0, 200).trim();
  const channel = (sp.get('channel') || '').slice(0, 300).trim();
  const n = Math.min(Math.max(parseInt(sp.get('n') || '18', 10) || 18, 1), 40);
  const key = process.env.YOUTUBE_API_KEY || '';

  try {
    if (channel) {
      const channelId = await resolveChannel(channel);
      if (!CHAN_RE.test(channelId)) throw new Error('resolved to something that is not a channel id');
      const feed = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
      const items = parseChannelFeed(await grab(feed)).slice(0, n);
      return json({ via: 'channel-rss', channelId, feed, items });
    }
    if (!q) return json({ error: 'pass ?q= to search or ?channel= to follow a channel' }, 400);

    if (key) {
      try {
        return json({ via: 'data-api', q, items: await searchOfficial(q, n, key) });
      } catch (e) {
        // a bad or exhausted key should degrade, not fail the page
        const items = await searchScrape(q, n);
        return json({ via: 'scrape-after-api-error', q, items, note: String((e as Error).message) });
      }
    }
    return json({ via: 'scrape', q, items: await searchScrape(q, n) });
  } catch (e) {
    return json({ error: String((e as Error).message || e), via: key ? 'data-api' : 'scrape', items: [] }, 502);
  }
}
