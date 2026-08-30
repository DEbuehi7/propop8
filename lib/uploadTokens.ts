/**
 * lib/uploadTokens.ts
 * ----------------------------------------------------------------------------
 * Issuing and revoking upload tokens. One module so the webhook, any reissue
 * script, and a future admin action all go through the same path — a token
 * minted two different ways is a token you can't reason about.
 *
 * The partial unique index in upload-schema.sql permits only one un-revoked
 * token per intake, so issuing always revokes first. That's the point: a
 * reissued link invalidates the old one, including any copy that was forwarded
 * or ended up in a shared inbox.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } }
);

export const UPLOAD_WINDOW_DAYS = 14;

/**
 * Revokes any live token for this intake and mints a fresh one.
 * Returns the raw token to put in the link.
 */
export async function issueUploadToken(
  intakeId: string,
  windowDays: number = UPLOAD_WINDOW_DAYS
): Promise<string> {
  const { error: revokeError } = await supabase
    .from('upload_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('intake_id', intakeId)
    .is('revoked_at', null);

  if (revokeError) throw revokeError;

  const expiresAt = new Date(Date.now() + windowDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from('upload_tokens')
    .insert({ intake_id: intakeId, expires_at: expiresAt })
    .select('token')
    .single();

  if (error || !data?.token) {
    throw error ?? new Error('Token insert returned no row');
  }

  return data.token as string;
}

/** Kills every live link for an intake — refunds, disputes, wrong recipient. */
export async function revokeUploadTokens(intakeId: string): Promise<void> {
  const { error } = await supabase
    .from('upload_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('intake_id', intakeId)
    .is('revoked_at', null);

  if (error) throw error;
}
