// api/_lib.ts — Shared helpers for all Vercel API routes
import * as crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';

/** Lazily create Supabase client to avoid early init failures */
export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** Force PostgREST schema reload on cache miss */
async function forceSchemaReload() {
  if (!SUPABASE_URL || !SECRET_KEY) return;
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=0`, { headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` } }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/sessions?select=id&limit=0`, { headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` } }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/notebooks?select=id&limit=0`, { headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` } }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/cards?select=id&limit=0`, { headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` } }).catch(() => {}),
  ]);
}

/** Parse session token from cookie header */
export function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split('; ').reduce<Record<string, string>>((acc, c) => {
    const [k, ...v] = c.split('=');
    acc[k.trim()] = v.join('=');
    return acc;
  }, {}) ?? {};
  return cookies['session_token'] ?? null;
}

/** Hash a token using HMAC-SHA256 */
export function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

/** Verify session and return user_id, or null if invalid */
export async function verifySession(
  req: NextApiRequest,
  _res: NextApiResponse
): Promise<{ userId: string; sessionId: string } | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  try {
    const sb = getSupabase();
    const tokenHash = hashToken(token, secret);
    const { data: rows, error } = await sb
      .from('sessions')
      .select('id, user_id')
      .eq('token_hash', tokenHash)
      .eq('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error && error.message?.includes('schema cache')) {
      // Force reload and retry once
      await forceSchemaReload();
      const { data: rows2, error: err2 } = await sb
        .from('sessions')
        .select('id, user_id')
        .eq('token_hash', tokenHash)
        .eq('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();
      if (err2 || !rows2) return null;
      return { userId: rows2.user_id, sessionId: rows2.id };
    }

    if (error || !rows) return null;
    return { userId: rows.user_id, sessionId: rows.id };
  } catch (e) {
    console.error('[verifySession] error:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** JSON response helper */
export function json(res: NextApiResponse, data: unknown, status = 200) {
  res.status(status).json(data);
}

/** JSON error helper */
export function apiError(res: NextApiResponse, msg: string, status = 400) {
  res.status(status).json({ error: msg });
}
