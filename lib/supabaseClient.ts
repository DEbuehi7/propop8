import { createClient } from '@supabase/supabase-js';

// Supabase client initialization for client-side use
// Uses anonymous key for public operations, JWT from auth for private operations

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client-side auth state management
export const getAuthUser = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
};

export const getAuthSession = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
};

export const signInWithEmail = async (email: string, password: string) => {
  return supabase.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string) => {
  return supabase.auth.signUp({ email, password });
};

export const signOut = async () => {
  return supabase.auth.signOut();
};
