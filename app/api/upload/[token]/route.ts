/**
 * app/api/upload/[token]/route.ts
 * ----------------------------------------------------------------------------
 * GET  — validate the token, return the session state the page renders from
 * POST — sign / complete / submit
 *
 * WHY FILES DON'T PASS THROUGH THIS ROUTE
 *
 * Serverless request bodies are capped well below a real work-order export
 * (4.5 MB on Vercel; Netlify's limit is also far under 50 MB). A large file
 * proxied through a route handler fails at request time, for a customer who
 * has already paid. So the browser uploads straight to Supabase Storage using
 * a short-lived signed URL that this route mints. The server validates,
 * authorises, and records — it never holds the bytes.
 *
 * Error bodies use machine codes, not sentences, because the page branches on
 * them to choose which message a paying customer sees. A revoked token reports
 * `expired`: the remedy is identical ("I'll send a fresh link"), and
 * revoked_at is on the row if you need the distinction.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyFilesReceived } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'audit-uploads';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 12;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * Browsers report CSV inconsistently — sometimes text/csv, sometimes
 * application/vnd.ms-excel, sometimes an empty string. The bucket enforces an
 * allow-list on mime type, so an empty content-type gets rejected at the
 * storage layer. The server decides the canonical type from the extension and
 * hands it back for the client to send.
 */
const EXTENSIONS: Record<string, string> = {
  csv: 'text/csv',
  tsv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const UPLOADABLE_STATUSES = ['paid', 'files_received', 'in_analysis'];

/**
 * TEMPORARY DIAGNOSTIC BUILD.
 *
 * Every error response carries this marker, so one request proves which code
 * is actually deployed — Netlify has been serving cached function bundles all
 * week, and "I copied the file" and "the file is running" turned out to be
 * different things more than once.
 *
 * The failure codes below are also split apart rather than collapsed into a
 * single `invalid`. Three different faults were returning the same string,
 * which is why this took four rounds to find. Swap back to the plain codes
 * once the upload flow is proven.
 */
const BUILD = '2026-09-04-diag';

// gen_random_uuid() emits v4, so pinning the version nibble rejects a little
// more junk than a generic UUID pattern.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function safeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const base = raw.split(/[\\/]/).pop()?.trim() ?? '';
  if (!base || base.length > 200) return null;
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function extensionOf(name: string): string | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  return m ? m[1].toLowerCase() : null;
}

interface Intake {
  id: string;
  name: string;
  company: string;
  status: string;
  files_submitted_at: string | null;
}

interface Session {
  intake: Intake;
  expiresAt: string;
}

type Loaded =
  | { ok: true; session: Session }
  | { ok: false; code: string; status: number; detail?: string };

/**
 * Two plain queries instead of one embedded join.
 *
 * The previous version fetched the token and its intake together using a
 * PostgREST embed. That works — verified by hand against the REST API — but it
 * fails as a single opaque "no rows" if the relationship can't be resolved,
 * which is indistinguishable from a bad token. Two queries cost one extra
 * round trip and can each say what went wrong.
 */
async function loadSession(token: string): Promise<Loaded> {
  if (!UUID_RE.test(token)) {
    return { ok: false, code: 'bad-format', status: 400 };
  }

  const { data: tok, error: tokErr } = await supabase
    .from('upload_tokens')
    .select('intake_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (tokErr) {
    console.error('[upload] token query failed', tokErr);
    return { ok: false, code: 'db-error-token', status: 503, detail: tokErr.message };
  }
  if (!tok) {
    console.error('[upload] no token row for', token);
    return { ok: false, code: 'no-token-row', status: 404 };
  }
  if (tok.revoked_at) return { ok: false, code: 'revoked', status: 410 };
  if (new Date(tok.expires_at) < new Date()) {
    return { ok: false, code: 'expired', status: 410 };
  }

  const { data: intake, error: intErr } = await supabase
    .from('audit_intakes')
    .select('id, name, company, status, files_submitted_at')
    .eq('id', tok.intake_id)
    .maybeSingle();

  if (intErr) {
    console.error('[upload] intake query failed', intErr);
    return { ok: false, code: 'db-error-intake', status: 503, detail: intErr.message };
  }
  if (!intake) {
    console.error('[upload] no intake for', tok.intake_id);
    return { ok: false, code: 'no-intake', status: 404 };
  }
  if (!UPLOADABLE_STATUSES.includes(intake.status)) {
    return { ok: false, code: 'unpaid', status: 403, detail: intake.status };
  }

  return { ok: true, session: { intake: intake as Intake, expiresAt: tok.expires_at } };
}

/** Fire-and-forget access trail. Never blocks the response. */
function touch(token: string) {
  supabase
    .rpc('increment_upload_token_seen', { p_token: token })
    .then(undefined, () => undefined);
}

async function listFiles(intakeId: string) {
  const { data } = await supabase
    .from('audit_uploads')
    .select('original_name, size_bytes, created_at')
    .eq('intake_id', intakeId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> | { token: string } }
) {
  const { token } = await ctx.params;
  const loaded = await loadSession(token);

  if (!loaded.ok) {
    return NextResponse.json(
      { error: loaded.code, detail: loaded.detail, build: BUILD },
      { status: loaded.status }
    );
  }

  touch(token);

  const { intake, expiresAt } = loaded.session;

  // Shape is the page's contract. intakeId is deliberately not returned — the
  // client never uses it, and internal ids don't belong in a browser.
  return NextResponse.json({
    build: BUILD,
    firstName: intake.name.split(' ')[0] ?? '',
    company: intake.company,
    submitted: Boolean(intake.files_submitted_at),
    expiresAt,
    files: await listFiles(intake.id),
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      maxFiles: MAX_FILES,
      extensions: Object.keys(EXTENSIONS),
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  POST — sign / complete / submit                                            */
/* -------------------------------------------------------------------------- */

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> | { token: string } }
) {
  const { token } = await ctx.params;

  try {
    const loaded = await loadSession(token);
    if (!loaded.ok) {
      return NextResponse.json(
        { error: loaded.code, detail: loaded.detail, build: BUILD },
        { status: loaded.status }
      );
    }
    const intake = loaded.session.intake;

    const body = await req.json().catch(() => null);
    const action = body?.action;

    /* ------------------------------------------------------------- sign */
    if (action === 'sign') {
      const name = safeName(body.filename);
      if (!name) {
        return NextResponse.json({ error: 'That filename is not usable.' }, { status: 400 });
      }

      const ext = extensionOf(name);
      if (!ext || !EXTENSIONS[ext]) {
        return NextResponse.json(
          {
            error: `Send a ${Object.keys(EXTENSIONS).join(', ')} export. Other formats aren't accepted.`,
          },
          { status: 400 }
        );
      }

      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ error: 'That file appears to be empty.' }, { status: 400 });
      }
      if (size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `Files must be under ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.` },
          { status: 413 }
        );
      }

      const existing = await listFiles(intake.id);
      if (existing.length >= MAX_FILES) {
        return NextResponse.json(
          { error: `That's the maximum of ${MAX_FILES} files. Email me if you need to send more.` },
          { status: 409 }
        );
      }
      const used = existing.reduce((s, f) => s + Number(f.size_bytes ?? 0), 0);
      if (used + size > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { error: 'That exceeds the total upload allowance.' },
          { status: 413 }
        );
      }

      // Namespaced by intake id, so one token can never write into another's
      // folder and two customers can't collide on a filename.
      const path = `${intake.id}/${Date.now()}-${name}`;

      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error('No signed URL returned');

      return NextResponse.json({
        uploadUrl: data.signedUrl,
        path: data.path ?? path,
        contentType: EXTENSIONS[ext],
      });
    }

    /* --------------------------------------------------------- complete */
    if (action === 'complete') {
      const path = typeof body.path === 'string' ? body.path : '';
      // Must live under this intake's folder. Without this check a valid token
      // could register a row pointing at another customer's file.
      if (!path.startsWith(`${intake.id}/`)) {
        return NextResponse.json(
          { error: 'Path does not belong to this session.' },
          { status: 400 }
        );
      }

      // Confirm the object exists before recording it, so a failed upload
      // can't leave a phantom row in your review queue.
      const folder = intake.id;
      const filename = path.slice(folder.length + 1);
      const { data: listed } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: filename });
      const found = listed?.find((o) => o.name === filename);
      if (!found) {
        return NextResponse.json({ error: 'That upload did not complete.' }, { status: 409 });
      }

      const original = safeName(body.filename) ?? filename;
      const ext = extensionOf(original);

      const { error } = await supabase.from('audit_uploads').insert({
        intake_id: intake.id,
        storage_path: path,
        original_name: original,
        content_type: ext ? EXTENSIONS[ext] ?? null : null,
        size_bytes: Number(found.metadata?.size ?? body.size ?? 0),
      });

      // 23505 means we already recorded it — a retried request, not an error.
      if (error && error.code !== '23505') throw error;

      return NextResponse.json({ ok: true, files: await listFiles(intake.id) });
    }

    /* ----------------------------------------------------------- submit */
    if (action === 'submit') {
      const files = await listFiles(intake.id);
      if (files.length === 0) {
        return NextResponse.json({ error: 'Upload at least one export first.' }, { status: 400 });
      }

      // Conditional update claims the notification exactly once.
      const { data: claimed, error } = await supabase
        .from('audit_intakes')
        .update({ status: 'files_received', files_submitted_at: new Date().toISOString() })
        .eq('id', intake.id)
        .is('files_submitted_at', null)
        .select('id')
        .maybeSingle();

      if (error) throw error;

      if (claimed) {
        try {
          await notifyFilesReceived(intake.company, intake.name, intake.id, files);
        } catch (err) {
          // The customer's submission succeeded; only the notification failed.
          // Don't fail their request over it — record it and move on.
          console.error('[upload] notify failed', err);
          await supabase
            .from('audit_intakes')
            .update({ fulfillment_error: `notify: ${String(err).slice(0, 400)}` })
            .eq('id', intake.id);
        }
      }

      return NextResponse.json({ ok: true, submitted: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    console.error('[upload]', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again, or email daniel@propops8.com.' },
      { status: 500 }
    );
  }
}
