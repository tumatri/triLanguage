// api/notebooks/index.ts — GET list / POST create
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

function generateId() { return crypto.randomUUID(); }
function nowISO() { return new Date().toISOString(); }
function hashToken(token: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split('; ').reduce((acc: any, c: string) => {
    const [k, ...v] = c.split('=');
    acc[k.trim()] = v.join('=');
    return acc;
  }, {}) ?? {};
  return cookies['session_token'] ?? null;
}

async function verifySession(req: NextApiRequest) {
  const token = getSessionToken(req);
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
    const tokenHash = hashToken(token, secret);
    const { data, error } = await sb.from('sessions')
      .select('id, user_id').eq('token_hash', tokenHash)
      .eq('revoked_at', null).gt('expires_at', new Date().toISOString()).single();
    if (error || !data) return null;
    return { userId: data.user_id, sessionId: data.id };
  } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method!)) return res.status(405).json({ error: 'Method not allowed' });

  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const session = await verifySession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const userId = session.userId;
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${url}/rest/v1/notebooks?select=id,name,language_variant,timezone,created_at,updated_at&user_id=eq.${userId}&deleted_at=is.null&order=created_at.asc`, { headers });
      const data = await r.json();
      return res.json({ notebooks: Array.isArray(data) ? data : [] });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  }

  if (req.method === 'POST') {
    let body: any;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    if (!body?.name || !body?.language_variant) return res.status(400).json({ error: 'name and language_variant required' });
    try {
      const id = generateId();
      const now = nowISO();
      const r = await fetch(`${url}/rest/v1/notebooks`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ id, user_id: userId, name: body.name, language_variant: body.language_variant, timezone: body.timezone ?? 'Asia/Ho_Chi_Minh', created_at: now, updated_at: now })
      });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ error: data?.message || 'Insert failed' });
      return res.status(201).json({ notebook: data[0] });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
