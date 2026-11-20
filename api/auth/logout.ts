// api/auth/logout.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const match = req.headers.cookie?.match(/session_token=([^;]*)/);
  const token = match?.[1];
  if (!token) return res.json({ ok: true });

  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const tokenHash = hashToken(token, process.env.SESSION_SECRET!);

  await fetch(`${url}/rest/v1/sessions?revoked_at=is.null&token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() })
  }).catch(() => {});

  res.setHeader('Set-Cookie',
    'session_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );
  return res.json({ ok: true });
}
