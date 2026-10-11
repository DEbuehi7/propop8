import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client for API routes
// Uses service role key - this should NEVER be exposed to the client
// Service role bypasses RLS for administrative operations

// Plate8 can use its own Supabase project via PLATE8_SUPABASE_URL and
// PLATE8_SUPABASE_SERVICE_ROLE_KEY. When those are unset it falls back to the
// shared variables, so nothing changes until you set them.
const supabaseUrl = process.env.PLATE8_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey =
  process.env.PLATE8_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    'Supabase server credentials not configured. Set PLATE8_SUPABASE_URL and PLATE8_SUPABASE_SERVICE_ROLE_KEY (or the shared NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) in .env.local'
  );
}

// Server client - use for admin operations, migrations, etc.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Create a client with user's JWT token for RLS-enforced queries
export const createSupabaseClientWithAuth = (accessToken: string) => {
  return createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
};
