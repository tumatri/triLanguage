// api/debug.ts — Diagnose API issues
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const results: Record<string, unknown> = {
    env_count: Object.keys(process.env).filter(k =>
      k.startsWith('SUPABASE') || k.startsWith('AGNES') || k.startsWith('SESSION')
    ).length,
    has_supabase_url: !!process.env.SUPABASE_URL,
    has_secret_key: !!process.env.SUPABASE_SECRET_KEY,
  };

  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY! || process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Test various queries
    const tests = [
      { name: 'users_select', fn: () => sb.from('users').select('id', { count: 'exact' }).single() },
      { name: 'users_insert', fn: () => sb.from('users').insert({ id: 'dbg_' + Date.now(), email: 'x@x.com', password_hash: 'x', password_salt: 'x', is_owner: 0 }) },
      { name: 'notebooks_select', fn: () => sb.from('notebooks').select('id', { count: 'exact' }).single() },
      { name: 'cards_select', fn: () => sb.from('cards').select('id', { count: 'exact' }).single() },
    ];

    for (const test of tests) {
      try {
        await test.fn();
        (results as Record<string, string>)[`${test.name}_ok`] = 'true';
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        (results as Record<string, string>)[`${test.name}_error`] = msg.substring(0, 200);
      }
    }

  } catch (e) {
    results.exception = e instanceof Error ? e.message : String(e);
  }

  return res.json(results);
}
