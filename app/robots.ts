import type { MetadataRoute } from 'next';

const BASE_URL = 'https://propops8.com';

/**
 * /api/* and /upload/[token]/* are disallowed — the API routes aren't
 * content, and upload links are private, single-customer URLs that have no
 * business being crawled even though the tokens aren't guessable.
 *
 * /audit/thank-you is deliberately NOT disallowed here even though it's a
 * page you don't want indexed — that page already carries its own
 * `robots: { index: false }` in its metadata, which is the correct tool for
 * "don't index this." Blocking it here too would stop crawlers from ever
 * seeing that noindex tag in the first place, which can backfire (Google's
 * own guidance notes a disallowed-but-linked page can still surface in
 * results with no snippet, precisely because the crawler never got far
 * enough to read the noindex instruction).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/upload/'],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
