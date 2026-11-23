// api/auth/check.ts — Verify current session, return 200 if authenticated
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

/** Consistent HMAC-SHA256 hash — NO prefix (matches login.ts) */
function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const match = req.headers.cookie?.match(/session_token=([^;]*)/);
  const token = match?.[1];
  if (!token) {
    // No cookie — return 200 with authenticated=false (not 401)
    // so the frontend can distinguish "no session" from "invalid session"
    return res.json({ authenticated: false });
  }

  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const sessionSecret = process.env.SESSION_SECRET!;
  const tokenHash = hashToken(token, sessionSecret);

  try {
    const r = await fetch(
      `${url}/rest/v1/sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&expires_at=gt.${new Date().toISOString()}&select=user_id&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    const data = await r.json();
    const isValid = Array.isArray(data) && data.length > 0;
    return res.json({ authenticated: isValid });
  } catch {
    return res.json({ authenticated: false });
  }
}
