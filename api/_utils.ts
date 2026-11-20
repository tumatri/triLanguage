// api/{handler}.ts — Standard Next.js/Vercel API route handler
// All routes follow this pattern: export default async function handler(req, res)

import type { NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

/** Create fresh Supabase client per request (no pooling needed for serverless) */
export function createDb() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  return createClient(url, anonKey);
}

export { createClient };
export type { SupabaseClient } from '@supabase/supabase-js';

/** JSON response helper */
export function json(res: NextApiResponse, data: unknown, status = 200) {
  res.status(status).json(data);
}

/** JSON error helper */
export function error(res: NextApiResponse, msg: string, status = 400) {
  res.status(status).json({ error: msg });
}
