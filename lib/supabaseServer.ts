import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client for API routes
// Uses service role key - this should NEVER be exposed to the client
// Service role bypasses RLS for administrative operations

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    'Supabase server credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
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
