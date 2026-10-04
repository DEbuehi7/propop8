/**
 * app/api/upload/[token]/route.ts
 * ----------------------------------------------------------------------------
 * The server side of UploadClient.tsx. Doesn't exist yet in the project --
 * this is what the client's fetch calls to /api/upload/${token} are hitting
 * right now (a 404, since the route doesn't exist).
 *
 * GET              -> session info: name, company, existing files, whether
 *                      already submitted, or an error discriminator the
 *                      client already knows how to render (invalid / unpaid
 *                      / expired).
 * POST action=sign     -> a signed direct-upload URL from Supabase Storage,
 *                          so the file goes straight there rather than
 *                          through this server (same reasoning UploadClient's
 *                          own header comment gives for XHR over fetch).
 * POST action=complete -> records the upload against this intake once the
 *                          direct PUT succeeds.
 * POST action=submit   -> marks files_submitted_at on audit_intakes -- this
 *                          is the exact column that's been sitting blank on
 *                          every real submission so far, because nothing
 *                          has ever called this until now.
 *
 * SCHEMA: verified against the live database, not assumed. audit_uploads is
 * id, intake_id, storage_path, original_name, size_bytes, content_type,
 * created_at.
 *
 * NOTE THE COLUMN NAME: it is storage_path, NOT path. An earlier draft of this
 * route inserted `path` and would have failed at runtime on every upload with
 * a column-not-found error -- after the file had already been transferred to
 * storage, so the customer would have watched the upload complete and then
 * fail. content_type exists too and is now populated; it was being computed
 * for the signed URL and then discarded.
 *
 * The bucket 'audit-uploads' exists and is private. Confirmed.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { notifyFilesReceived } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'audit-uploads';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_EXT = ['.csv', '.tsv', '.xls', '.xlsx'];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

const CONTENT_TYPES: Record<string, string> = {
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i).toLowerCase();
}

/**
 * Loads the token row and its linked intake, and classifies it into exactly
 * the discriminators UploadClient already renders a message for. Centralised
 * here so GET and every POST action apply the identical rule -- an action
 * should never succeed against a token that GET would have refused.
 */
async function resolveToken(token: string) {
  const { data: tok, error: tokErr } = await supabase
    .from('upload_tokens')
    .select('token, intake_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (tokErr || !tok || tok.revoked_at) {
    return { error: 'invalid' as const };
  }
  if (new Date(tok.expires_at).getTime() < Date.now()) {
    return { error: 'expired' as const };
  }

  const { data: intake, error: intakeErr } = await supabase
    .from('audit_intakes')
    .select('id, name, company, status, files_submitted_at')
    .eq('id', tok.intake_id)
    .maybeSingle();

  if (intakeErr || !intake) {
    return { error: 'invalid' as const };
  }
  // files_received is the state after a customer submits; the link must keep
  // working then (to show "submitted"), not report the intake as unpaid.
  if (intake.status !== 'paid' && intake.status !== 'files_received') {
    return { error: 'unpaid' as const };
  }

  return { error: null, tok, intake };
}

/* -------------------------------------------------------------------------- */
/*  GET — session load                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 404 });
  }
  const { tok, intake } = resolved;

  const { data: uploads } = await supabase
    .from('audit_uploads')
    .select('original_name, size_bytes, created_at')
    .eq('intake_id', intake.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({
    firstName: (intake.name ?? '').split(' ')[0] || null,
    company: intake.company ?? null,
    submitted: Boolean(intake.files_submitted_at),
    expiresAt: tok.expires_at,
    files: uploads ?? [],
    limits: { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES, extensions: ALLOWED_EXT },
  });
}

/* -------------------------------------------------------------------------- */
/*  POST — sign / complete / submit                                           */
/* -------------------------------------------------------------------------- */

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 404 });
  }
  const { intake } = resolved;

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  // Once submitted, the file set is frozen: the 48-hour clock has started and
  // analysis may be under way. Adding files afterwards silently changes the
  // input to a review already in progress.
  if ((action === 'sign' || action === 'complete') && intake.files_submitted_at) {
    return NextResponse.json(
      { error: 'Your files were already submitted. Email daniel@propops8.com to add more.' },
      { status: 409 }
    );
  }

  /* ---------------------------------------------------- sign ---------- */
  if (action === 'sign') {
    const filename = String(body?.filename ?? '');
    const size = Number(body?.size ?? 0);
    const ext = extOf(filename);

    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: `File type ${ext || 'unknown'} isn't accepted here.` }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File is too large — ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB max.` }, { status: 400 });
    }

    const { count } = await supabase
      .from('audit_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('intake_id', intake.id);
    if ((count ?? 0) >= MAX_FILES) {
      return NextResponse.json({ error: `${MAX_FILES} files is the limit for one audit — email daniel@propops8.com to send more.` }, { status: 400 });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${intake.id}/${crypto.randomUUID()}-${safeName}`;

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (signErr || !signed) {
      console.error('[upload] createSignedUploadUrl failed', signErr);
      return NextResponse.json({ error: 'Could not start the upload. Try again in a moment.' }, { status: 500 });
    }

    return NextResponse.json({
      uploadUrl: signed.signedUrl,
      path: signed.path,
      contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    });
  }

  /* ------------------------------------------------- complete --------- */
  if (action === 'complete') {
    const path = String(body?.path ?? '');
    const filename = String(body?.filename ?? '');
    const size = Number(body?.size ?? 0);

    if (!path || !filename) {
      return NextResponse.json({ error: 'Missing upload details.' }, { status: 400 });
    }
    // A path is only ever issued under this intake's own folder. Refuse to
    // register anything else, or one customer could attach another's file.
    if (!path.startsWith(`${intake.id}/`) || path.includes('..')) {
      return NextResponse.json({ error: 'Unrecognised upload.' }, { status: 400 });
    }

    // Column is storage_path. Content type is re-derived here from the
    // extension rather than trusted from the client -- the client could send
    // anything, and this value is what a later download will be served as.
    const { error: insErr } = await supabase.from('audit_uploads').insert({
      intake_id: intake.id,
      storage_path: path,
      original_name: filename,
      size_bytes: Number.isFinite(size) ? size : 0,
      content_type: CONTENT_TYPES[extOf(filename)] ?? 'application/octet-stream',
    });

    if (insErr) {
      console.error('[upload] recording upload failed', insErr);
      return NextResponse.json({ error: 'The upload did not register. Try again.' }, { status: 500 });
    }

    const { data: uploads } = await supabase
      .from('audit_uploads')
      .select('original_name, size_bytes, created_at')
      .eq('intake_id', intake.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ files: uploads ?? [] });
  }

  /* --------------------------------------------------- submit ---------- */
  if (action === 'submit') {
    // Idempotent: a double-tap must not send you two "48-hour clock" emails.
    if (intake.files_submitted_at) {
      return NextResponse.json({ submitted: true });
    }

    const { data: uploads, count } = await supabase
      .from('audit_uploads')
      .select('original_name, size_bytes', { count: 'exact' })
      .eq('intake_id', intake.id);

    if (!count) {
      return NextResponse.json({ error: 'Add at least one file before submitting.' }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from('audit_intakes')
      .update({ files_submitted_at: new Date().toISOString(), status: 'files_received' })
      .eq('id', intake.id)
      .is('files_submitted_at', null);

    if (updErr) {
      console.error('[upload] marking submitted failed', updErr);
      return NextResponse.json({ error: 'Could not submit. Your files are safe — try again.' }, { status: 500 });
    }

    // This email is what starts the 48-hour clock. It existed in lib/email.ts
    // but nothing ever called it, so submissions went unannounced. A failure
    // here must not fail the customer's submit.
    try {
      await notifyFilesReceived(intake.company ?? 'Unknown company', intake.name ?? '', intake.id, uploads ?? []);
    } catch (err) {
      console.error('[upload] files-received notice failed', err);
    }

    return NextResponse.json({ submitted: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
