import type { MetadataRoute } from 'next';

const BASE_URL = 'https://propops8.com';

/**
 * /audit/thank-you is deliberately left out — it's a post-purchase
 * confirmation page, not something you want a stranger landing on from a
 * Google search. Dynamic routes (/upload/[token]) and API routes are never
 * sitemap material either.
 */
const ROUTES: Array<{ path: string; priority: number }> = [
  { path: '', priority: 1.0 },
  { path: '/audit', priority: 0.9 },
  { path: '/tools/vacancy-calculator', priority: 0.8 },
  { path: '/about', priority: 0.7 },
  { path: '/ingest', priority: 0.6 },
  { path: '/legal/privacy', priority: 0.3 },
  { path: '/legal/terms', priority: 0.3 },
  { path: '/legal/refunds', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority,
  }));
}
