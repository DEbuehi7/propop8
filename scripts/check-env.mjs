#!/usr/bin/env node
/**
 * scripts/check-env.mjs — verify the environment is actually wired, not just populated.
 *
 *   node scripts/check-env.mjs                 checks .env.local
 *   node scripts/check-env.mjs --file .env.production
 *   node scripts/check-env.mjs --offline       format checks only, no network
 *
 * WHY THIS EXISTS
 *
 * Checking that a variable is *present* proves almost nothing. A placeholder is
 * present. A revoked key is present. A key for the wrong project is present.
 * Every one of those passes a presence check and fails in production, usually
 * at the worst moment — after a customer has paid.
 *
 * So this calls each service:
 *   Supabase  — queries audit_intakes, which proves the URL, the key, AND that
 *               schema.sql was actually run
 *   Resend    — lists domains, which proves the key works AND that the domain
 *               in RESEND_FROM is verified (an unverified sender is rejected at
 *               send time, which is discovered when the first upload email
 *               silently fails)
 *   Tally     — fetches the embed URL, which proves the form id is real
 *
 * No dependencies. Node 18+ for global fetch.
 */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const FILE = args.includes('--file') ? args[args.indexOf('--file') + 1] : '.env.local';

/* -------------------------------------------------------------------------- */
/*  Load                                                                       */
/* -------------------------------------------------------------------------- */

const env = { ...process.env };

try {
  const raw = readFileSync(FILE, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in env) || env[key] === '') env[key] = val;
  }
  console.log(`\nReading ${FILE}\n`);
} catch {
  console.log(`\n${FILE} not found — checking process environment only.\n`);
}

/* -------------------------------------------------------------------------- */
/*  Reporting                                                                  */
/* -------------------------------------------------------------------------- */

const PASS = '\x1b[32m  ok  \x1b[0m';
const WARN = '\x1b[33m warn \x1b[0m';
const FAIL = '\x1b[31m fail \x1b[0m';

let failures = 0;
let warnings = 0;

function row(state, name, note = '') {
  if (state === FAIL) failures++;
  if (state === WARN) warnings++;
  console.log(`[${state}] ${name.padEnd(30)} ${note}`);
}

/** Values that look real but are the template defaults. */
const PLACEHOLDERS = [
  'placeholder',
  'YOUR_TALLY_FORM_ID',
  'your-',
  'changeme',
  'xxx',
];

const isPlaceholder = (v) =>
  !v || PLACEHOLDERS.some((p) => v.toLowerCase().includes(p.toLowerCase()));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const bareEmail = (a) => {
  const m = /<([^>]+)>/.exec(a ?? '');
  return (m ? m[1] : a ?? '').trim();
};

/* -------------------------------------------------------------------------- */
/*  Format checks                                                              */
/* -------------------------------------------------------------------------- */

console.log('FORMAT\n');

const {
  NEXT_PUBLIC_SUPABASE_URL: SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  NEXT_PUBLIC_BASE_URL: BASE_URL,
  NEXT_PUBLIC_TALLY_FORM_ID: TALLY_ID,
  TALLY_SIGNING_SECRET: TALLY_SECRET,
  TALLY_PAYMENT_ENABLED: TALLY_PAID,
  RESEND_API_KEY: RESEND_KEY,
  RESEND_FROM,
  AUDIT_NOTIFY_EMAIL: NOTIFY,
} = env;

// Supabase URL
if (!SB_URL) row(FAIL, 'NEXT_PUBLIC_SUPABASE_URL', 'missing');
else if (isPlaceholder(SB_URL)) row(WARN, 'NEXT_PUBLIC_SUPABASE_URL', 'still the placeholder');
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SB_URL))
  row(WARN, 'NEXT_PUBLIC_SUPABASE_URL', 'unexpected shape');
else row(PASS, 'NEXT_PUBLIC_SUPABASE_URL');

// Service role key
if (!SB_KEY) row(FAIL, 'SUPABASE_SERVICE_ROLE_KEY', 'missing');
else if (isPlaceholder(SB_KEY)) row(WARN, 'SUPABASE_SERVICE_ROLE_KEY', 'still the placeholder');
else if (!SB_KEY.startsWith('eyJ'))
  row(WARN, 'SUPABASE_SERVICE_ROLE_KEY', 'not a JWT — is this the anon key?');
else row(PASS, 'SUPABASE_SERVICE_ROLE_KEY');

// The mistake that leaks everything
if (env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
  row(FAIL, 'NEXT_PUBLIC_SUPABASE_SERVICE...', 'NEVER prefix the service key with NEXT_PUBLIC_ — it ships to every browser');
}

// Base URL
if (!BASE_URL) row(FAIL, 'NEXT_PUBLIC_BASE_URL', 'missing');
else if (!/^https?:\/\//.test(BASE_URL)) row(FAIL, 'NEXT_PUBLIC_BASE_URL', 'not a URL');
else if (BASE_URL.includes('localhost'))
  row(WARN, 'NEXT_PUBLIC_BASE_URL', 'localhost — upload links in emails will not work for customers');
else row(PASS, 'NEXT_PUBLIC_BASE_URL', BASE_URL);

// Tally
if (!TALLY_ID) row(FAIL, 'NEXT_PUBLIC_TALLY_FORM_ID', 'missing');
else if (isPlaceholder(TALLY_ID)) row(WARN, 'NEXT_PUBLIC_TALLY_FORM_ID', 'placeholder — /audit shows a Tally 404');
else row(PASS, 'NEXT_PUBLIC_TALLY_FORM_ID', TALLY_ID);

if (!TALLY_SECRET) row(FAIL, 'TALLY_SIGNING_SECRET', 'missing — the webhook refuses every request without it');
else if (isPlaceholder(TALLY_SECRET))
  row(WARN, 'TALLY_SIGNING_SECRET', 'placeholder — signature check will reject real submissions');
else row(PASS, 'TALLY_SIGNING_SECRET');

if (TALLY_PAID === 'true')
  row(WARN, 'TALLY_PAYMENT_ENABLED', 'true — confirm the webhook fires only AFTER payment clears');
else if (TALLY_PAID === 'false' || TALLY_PAID === undefined)
  row(PASS, 'TALLY_PAYMENT_ENABLED', 'false — intakes held for manual release');
else row(WARN, 'TALLY_PAYMENT_ENABLED', `"${TALLY_PAID}" is neither true nor false`);

// Resend
if (!RESEND_KEY) row(FAIL, 'RESEND_API_KEY', 'missing');
else if (isPlaceholder(RESEND_KEY)) row(WARN, 'RESEND_API_KEY', 'still the placeholder');
else if (!RESEND_KEY.startsWith('re_')) row(WARN, 'RESEND_API_KEY', 'does not start with re_');
else row(PASS, 'RESEND_API_KEY');

if (!RESEND_FROM) row(FAIL, 'RESEND_FROM', 'missing');
else if (!EMAIL_RE.test(bareEmail(RESEND_FROM))) row(FAIL, 'RESEND_FROM', 'no valid address');
else row(PASS, 'RESEND_FROM', RESEND_FROM);

if (!NOTIFY) row(WARN, 'AUDIT_NOTIFY_EMAIL', 'missing — falls back to RESEND_FROM');
else if (!EMAIL_RE.test(bareEmail(NOTIFY))) row(FAIL, 'AUDIT_NOTIFY_EMAIL', 'no valid address');
else row(PASS, 'AUDIT_NOTIFY_EMAIL', NOTIFY);

/* -------------------------------------------------------------------------- */
/*  Live checks                                                                */
/* -------------------------------------------------------------------------- */

if (!OFFLINE) {
  console.log('\nLIVE\n');

  // Supabase — proves URL, key, and that schema.sql was run
  if (SB_URL && SB_KEY && !isPlaceholder(SB_URL) && !isPlaceholder(SB_KEY)) {
    try {
      const r = await fetch(
        `${SB_URL.replace(/\/$/, '')}/rest/v1/audit_intakes?select=id&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (r.ok) row(PASS, 'Supabase → audit_intakes', 'reachable, table exists');
      else if (r.status === 401) row(FAIL, 'Supabase → audit_intakes', '401 — wrong key or wrong project');
      else if (r.status === 404) row(FAIL, 'Supabase → audit_intakes', '404 — schema.sql has not been run');
      else row(FAIL, 'Supabase → audit_intakes', `${r.status} ${(await r.text()).slice(0, 90)}`);
    } catch (e) {
      row(FAIL, 'Supabase', String(e.message).slice(0, 70));
    }

    // Token table — separate check because it is created later in schema.sql
    try {
      const r = await fetch(
        `${SB_URL.replace(/\/$/, '')}/rest/v1/upload_tokens?select=token&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      row(r.ok ? PASS : FAIL, 'Supabase → upload_tokens', r.ok ? 'table exists' : `${r.status}`);
    } catch {
      row(FAIL, 'Supabase → upload_tokens', 'unreachable');
    }

    // Storage bucket
    try {
      const r = await fetch(`${SB_URL.replace(/\/$/, '')}/storage/v1/bucket/audit-uploads`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      });
      if (r.ok) {
        const b = await r.json();
        if (b.public) row(FAIL, 'Storage → audit-uploads', 'BUCKET IS PUBLIC — customer exports would be world-readable');
        else row(PASS, 'Storage → audit-uploads', 'private');
      } else row(FAIL, 'Storage → audit-uploads', `${r.status} — bucket missing`);
    } catch {
      row(FAIL, 'Storage → audit-uploads', 'unreachable');
    }
  } else {
    row(WARN, 'Supabase', 'skipped — placeholder credentials');
  }

  // Resend — proves the key AND that RESEND_FROM's domain is verified
  if (RESEND_KEY && !isPlaceholder(RESEND_KEY)) {
    try {
      const r = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${RESEND_KEY}` },
      });
      if (!r.ok) {
        row(FAIL, 'Resend → auth', `${r.status} — key rejected`);
      } else {
        row(PASS, 'Resend → auth', 'key accepted');
        const body = await r.json();
        const domains = (body?.data ?? []).map((d) => ({
          name: d.name,
          status: d.status,
        }));
        const fromDomain = bareEmail(RESEND_FROM ?? '').split('@')[1];
        const hit = domains.find((d) => d.name === fromDomain);
        if (!fromDomain) row(WARN, 'Resend → sender domain', 'no RESEND_FROM to check');
        else if (!hit)
          row(FAIL, 'Resend → sender domain', `${fromDomain} is not in this account — every send will be rejected`);
        else if (hit.status !== 'verified')
          row(FAIL, 'Resend → sender domain', `${fromDomain} status is "${hit.status}", not verified`);
        else row(PASS, 'Resend → sender domain', `${fromDomain} verified`);
      }
    } catch (e) {
      row(FAIL, 'Resend', String(e.message).slice(0, 70));
    }
  } else {
    row(WARN, 'Resend', 'skipped — placeholder key');
  }

  // Tally form
  if (TALLY_ID && !isPlaceholder(TALLY_ID)) {
    try {
      const r = await fetch(`https://tally.so/embed/${TALLY_ID}`, { redirect: 'follow' });
      row(r.ok ? PASS : FAIL, 'Tally → form', r.ok ? 'embed resolves' : `${r.status} — form id wrong or not published`);
    } catch {
      row(WARN, 'Tally → form', 'unreachable');
    }
  } else {
    row(WARN, 'Tally → form', 'skipped — placeholder id');
  }
}

/* -------------------------------------------------------------------------- */
/*  Summary                                                                    */
/* -------------------------------------------------------------------------- */

console.log('');
if (failures === 0 && warnings === 0) {
  console.log('\x1b[32mEverything checks out.\x1b[0m\n');
} else {
  console.log(`${failures} failing, ${warnings} warning${warnings === 1 ? '' : 's'}.\n`);
  if (warnings > 0 && failures === 0) {
    console.log('Warnings are fine for local development. Every one must clear');
    console.log('before you take a real payment.\n');
  }
}

process.exit(failures > 0 ? 1 : 0);
