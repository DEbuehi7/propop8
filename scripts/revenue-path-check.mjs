#!/usr/bin/env node
/**
 * revenue-path-check.mjs
 * ----------------------------------------------------------------------------
 * The automatable slice of the "Revenue Path Audit": checks the known static
 * pages, every internal link and image found on them, robots.txt and
 * sitemap.xml presence, and basic per-page metadata (title, description,
 * OG tags). Node 18+ only (uses the built-in fetch, no dependencies).
 *
 * Usage:
 *   node revenue-path-check.mjs                        # checks https://propops8.com
 *   node revenue-path-check.mjs http://localhost:3000   # checks your local dev build
 *
 * WHAT THIS DOES NOT CHECK — these need a human, not a script, because they
 * require actually interacting with a form, a mailbox, or a database, not
 * just requesting a URL and reading the status code:
 *   - The Tally form actually accepting input, or partial submissions
 *     actually being captured
 *   - Confirmation / notification emails actually arriving
 *   - Webhooks actually firing into Supabase
 *   - Mobile visual layout (this checks that assets load, not that they
 *     look right at 375px)
 *   - Duplicate-submission handling, back-button behaviour
 *   - Google Search Console / indexing status
 * Run this first. If it comes back clean, do the "go through it as a
 * stranger, on a phone, then try to break it" pass by hand — that's the
 * part that actually proves the funnel works, not just that it's reachable.
 */

const BASE = (process.argv[2] || 'https://propops8.com').replace(/\/$/, '');

// Known static routes, from the last `next build` route table. Dynamic
// [token] routes and the two /api/* routes need real payloads, not a bare
// GET, so they're deliberately left out of this list rather than reported
// as false failures.
const PAGES = [
  '/',
  '/about',
  '/audit',
  '/audit/thank-you',
  '/ingest',
  '/legal/privacy',
  '/legal/terms',
  '/legal/refunds',
  '/tools/vacancy-calculator',
];

const results = { pages: [], resources: new Map() };

function extractAttr(html, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function extractMeta(html) {
  const get = (re) => (html.match(re) || [, null])[1];
  return {
    title: get(/<title>([^<]*)<\/title>/i),
    description: get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    ogTitle: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i),
    ogImage: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i),
  };
}

function toAbsolute(url) {
  if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) return null;
  if (url.startsWith('/cdn-cgi/')) return null; // Cloudflare email-obfuscation route, not a real page
  if (/^https?:\/\//i.test(url)) return url;
  return BASE + (url.startsWith('/') ? url : '/' + url);
}

async function checkResource(url) {
  if (results.resources.has(url)) return;
  let entry;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    entry = { status: res.status, ok: res.ok, finalUrl: res.url };
  } catch (err) {
    entry = { status: null, ok: false, error: err.message };
  }
  results.resources.set(url, entry);
}

async function run() {
  console.log(`Checking ${BASE} against the known static route list...\n`);

  for (const path of PAGES) {
    const url = BASE + path;
    let html = '';
    let status = null;
    try {
      const res = await fetch(url);
      status = res.status;
      html = await res.text();
    } catch (err) {
      results.pages.push({ path, status: null, error: err.message });
      continue;
    }

    const meta = status === 200 ? extractMeta(html) : {};
    const hrefs = status === 200 ? extractAttr(html, 'a', 'href').map(toAbsolute).filter(Boolean) : [];
    const srcs = status === 200 ? extractAttr(html, 'img', 'src').map(toAbsolute).filter(Boolean) : [];

    for (const url of [...hrefs, ...srcs]) await checkResource(url);

    results.pages.push({ path, status, meta, linkCount: hrefs.length, imageCount: srcs.length });
  }

  for (const p of ['/robots.txt', '/sitemap.xml']) {
    await checkResource(BASE + p);
  }

  // ---------------------------------------------------------------- report
  console.log('== Pages ============================================================');
  let pageFail = 0;
  for (const p of results.pages) {
    if (p.error) {
      pageFail++;
      console.log(`FAIL  ${p.path}  (${p.error})`);
      continue;
    }
    const bad = p.status !== 200;
    if (bad) pageFail++;
    console.log(`${bad ? 'FAIL' : 'ok  '}  ${p.path}  [${p.status}]`);
    if (!bad) {
      const missing = [];
      if (!p.meta.title) missing.push('title');
      if (!p.meta.description) missing.push('description');
      if (!p.meta.ogTitle) missing.push('og:title');
      if (!p.meta.ogImage) missing.push('og:image');
      if (missing.length) console.log(`        missing meta: ${missing.join(', ')}`);
    }
  }

  console.log('\n== Internal links & images found on those pages ====================');
  let resFail = 0;
  let resChecked = 0;
  for (const [url, r] of results.resources) {
    if (url.endsWith('/robots.txt') || url.endsWith('/sitemap.xml')) continue;
    resChecked++;
    if (!r.ok) {
      resFail++;
      console.log(`FAIL  ${url}  [${r.status ?? 'ERROR: ' + r.error}]`);
    }
  }
  if (resChecked === 0) {
    console.log('Nothing to check here — every page above failed to load, so no links or images were ever found.');
  } else if (resFail === 0) {
    console.log(`All ${resChecked} internal links and images resolved (200/OK).`);
  }

  console.log('\n== robots.txt / sitemap.xml =========================================');
  let seoFail = 0;
  for (const p of ['/robots.txt', '/sitemap.xml']) {
    const r = results.resources.get(BASE + p);
    if (!r?.ok) seoFail++;
    console.log(`${r?.ok ? 'ok  ' : 'FAIL'}  ${p}  [${r?.status ?? 'ERROR'}]`);
  }

  console.log('\n======================================================================');
  const total = pageFail + resFail + seoFail;
  if (total === 0) {
    console.log('Nothing broken that this script can see.');
    console.log('Now do the manual pass: submit the form for real, confirm the email');
    console.log('arrives, confirm the row lands in Supabase, and test all of it on a phone.');
    process.exitCode = 0;
  } else {
    console.log(`${total} thing(s) need a look — see the FAIL lines above.`);
    process.exitCode = 1;
  }
}

run();
