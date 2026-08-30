import type { NextConfig } from 'next';

/**
 * next.config.ts  —  Next.js 16
 * ----------------------------------------------------------------------------
 * The important thing about this file is what is NOT in it.
 *
 * 1. No `output: 'export'`. Static export emits HTML and silently drops every
 *    API route. The build still succeeds — and then /api/tally-webhook 404s in
 *    production, so no upload token is ever issued and paying customers hear
 *    nothing back. An older source doc recommends it; that doc predates the
 *    backend.
 *
 * 2. No `eslint` key. Next 16 removed it along with `next lint` — that's what
 *    produced the "Unrecognized key(s) in object: 'eslint'" warning. Lint runs
 *    through eslint.config.mjs directly:  npx eslint .
 *
 * 3. No image config. The landing page uses plain <img>, so there is nothing
 *    to misconfigure when this deploys to Netlify.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Next 16 blocks cross-origin requests to dev-server resources by default.
   * Without these entries you get "Blocked cross-origin request to Next.js dev
   * resource /_next/hmr" and the page loads without hot reload — or not at all
   * when opened from anything other than localhost.
   *
   * 127.0.0.1 — needed because it counts as a different origin than localhost.
   * The LAN IP — needed to open the site on your phone. Change it if your
   * router hands out a different address; `npm run dev` prints the current one
   * on the "Network:" line.
   *
   * Development only. Has no effect on the production build.
   */
  allowedDevOrigins: ['127.0.0.1', '192.168.23.166'],
};

export default nextConfig;
