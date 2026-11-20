import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client for server-side API routes.
 * Uses service_role key when available (admin access), otherwise anon key.
 */
export function createSupabaseClient(): ReturnType<typeof createClient> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  }

  // Prefer service_role key for admin operations, fall back to anon key
  const key = serviceKey || anonKey;

  return createClient(url, key, {
    global: {
      headers: {
        'apikey': key,
        'Authorization': key.startsWith('sb_') ? `Bearer ${key}` : ''
      }
    }
  });
}

export type SupabaseClient = ReturnType<typeof createClient>;
