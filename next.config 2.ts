import type { NextConfig } from 'next';

/**
 * next.config.ts  —  Next.js 16
 * ----------------------------------------------------------------------------
 * The important thing about this file is what is NOT in it.
 *
 * 1. No `output: 'export'`. Static export emits HTML and silently drops every
 *    API route. The build still succeeds — and then /api/tally-webhook 404s in
 *    production, so no upload token is ever issued and paying customers hear
 *    nothing back. One of the older source docs recommends it; that doc was
 *    written before this project had a backend.
 *
 * 2. No `eslint` key. Next 16 removed it along with `next lint`, which is what
 *    produced the "Unrecognized key(s) in object: 'eslint'" warning. Lint runs
 *    through eslint.config.mjs directly now:  npx eslint .
 *
 * 3. No image config. The landing page uses plain <img>, so there is nothing
 *    to get wrong when this deploys to Netlify.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;