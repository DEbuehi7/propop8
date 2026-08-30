/**
 * app/api/upload/[token]/route.ts
 * ----------------------------------------------------------------------------
 * Token-scoped upload session. The token is the only credential — it's a v4
 * UUID stored on the intake, issued by the Stripe webhook after payment, and
 * scoped to a 14-day window.
 *
 * WHY FILES DON'T PASS THROUGH THIS ROUTE
 *
 * Vercel caps serverless request bodies at 4.5 MB. A 50 MB work-order export
 * proxied through a route handler fails — and fails at request time, for a
 * customer who has already paid $497. So the browser uploads straight to
 * Supabase Storage using a short-lived signed URL that this route mints. The
 * server never holds the bytes; it validates, authorises, and records.
 *
 * Actions (all POST, discriminated by `action`):
 *   sign     — validate a proposed file, return a signed upload URL
 *   complete — record a file that finished uploading
 *   submit   — mark the intake files_received and notify once
 *
 * GET returns the session state so the page can render.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'audit-uploads';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // matches the bucket's file_size_limit
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strips any path component and anything that isn't a safe filename char. */
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

interface Session {
  id: string;
  name: string;
  company: string;
  status: string;
  upload_expires_at: string | null;
  files_submitted_at: string | null;
}

type Loaded =
  | { ok: true; intake: Session }
  | { ok: false; code: 'invalid' | 'unpaid' | 'expired'; status: number };

async function loadSession(token: string): Promise<Loaded> {
  if (!UUID_RE.test(token)) return { ok: false, code: 'invalid', status: 404 };

  const { data, error } = await supabase
    .from('audit_intakes')
    .select('id, name, company, status, upload_expires_at, files_submitted_at')
    .eq('upload_token', token)
    .maybeSingle();

  if (error || !data) return { ok: false, code: 'invalid', status: 404 };

  const intake = data as Session;

  // Refunded, unpaid or still-settling intakes get no upload session.
  if (!['paid', 'files_received', 'in_analysis'].includes(intake.status)) {
    return { ok: false, code: 'unpaid', status: 403 };
  }
  if (intake.upload_expires_at && new Date(intake.upload_expires_at) < new Date()) {
    return { ok: false, code: 'expired', status: 410 };
  }

  return { ok: true, intake };
}

async function listFiles(intakeId: string) {
  const { data } = await supabase
    .from('audit_uploads')
    .select('original_name, size_bytes, created_at')
    .eq('intake_id', intakeId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

async function notifyFilesReceived(intake: Session, files: { original_name: string; size_bytes: number }[]) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.POSTMARK_FROM ?? 'daniel@propops8.com';
  const to = process.env.AUDIT_NOTIFY_EMAIL ?? from;
  if (!token) throw new Error('POSTMARK_SERVER_TOKEN is not configured');

  const body = [
    `${intake.company} (${intake.name}) has submitted their audit export.`,
    '',
    `Intake: ${intake.id}`,
    `Files: ${files.length}`,
    ...files.map((f) => `  • ${f.original_name} (${Math.round(f.size_bytes / 1024)} KB)`),
    '',
    '48-hour clock starts now.',
  ].join('\n');

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: `Audit export received — ${intake.company}`,
      TextBody: body,
      MessageStream: 'outbound',
    }),
  });

  if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
}

/* -------------------------------------------------------------------------- */
/*  GET — session state                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> | { token: string } }
) {
  const { token } = await ctx.params;
  const loaded = await loadSession(token);

  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.code }, { status: loaded.status });
  }

  const files = await listFiles(loaded.intake.id);

  return NextResponse.json({
    firstName: loaded.intake.name.split(' ')[0] ?? '',
    company: loaded.intake.company,
    submitted: Boolean(loaded.intake.files_submitted_at),
    expiresAt: loaded.intake.upload_expires_at,
    files,
    limits: { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES, extensions: Object.keys(EXTENSIONS) },
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
      return NextResponse.json({ error: loaded.code }, { status: loaded.status });
    }
    const intake = loaded.intake;

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
          { error: `Send a ${Object.keys(EXTENSIONS).join(', ')} export. Other formats aren't accepted.` },
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
        return NextResponse.json({ error: 'That exceeds the total upload allowance.' }, { status: 413 });
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
      // The path must live under this intake's folder. Without this check a
      // valid token could register a row pointing at another customer's file.
      if (!path.startsWith(`${intake.id}/`)) {
        return NextResponse.json({ error: 'Path does not belong to this session.' }, { status: 400 });
      }

      // Confirm the object actually exists before recording it, so a failed
      // upload can't leave a phantom row in your review queue.
      const folder = intake.id;
      const filename = path.slice(folder.length + 1);
      const { data: listed } = await supabase.storage.from(BUCKET).list(folder, { search: filename });
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
          await notifyFilesReceived(intake, files);
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
