// api/cards/index.ts — GET list / POST create
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'nodejs' };

function generateId() { return crypto.randomUUID(); }
function nowISO() { return new Date().toISOString(); }
function hashToken(token: string, secret: string) { return crypto.createHmac('sha256', secret).update(token).digest('hex'); }

async function computeDuplicateHash(notebookId: string, languageVariant: string, cardType: string, frontText: string): Promise<string> {
  const normalizeLatin = (t: string) => t.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,!?;:'"())\]}>]+$/, '').trim();
  const isCJK = /[\u4E00-\u9FFF\u3040-\u30FF\u31F0-\u31FF]/.test(frontText);
  const normalized = isCJK ? frontText.normalize('NFKC').trim().replace(/\s+/g, ' ') : normalizeLatin(frontText);
  const raw = `${notebookId}|${languageVariant}|${cardType}|${normalized}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Buffer.from(buffer).toString('hex');
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

  const { notebook_id } = req.query as { notebook_id?: string };
  if (!notebook_id) return res.status(400).json({ error: 'notebook_id required' });

  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const nbR = await fetch(`${url}/rest/v1/notebooks?select=id,language_variant&id=eq.${encodeURIComponent(notebook_id)}&user_id=eq.${userId}&deleted_at=is.null`, { headers });
    const nbData = await nbR.json();
    const nb = Array.isArray(nbData) ? nbData[0] : null;
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    if (req.method === 'GET') {
      const r = await fetch(`${url}/rest/v1/cards?select=*&notebook_id=eq.${encodeURIComponent(notebook_id)}&archived_at=is.null&order=created_at.desc`, { headers });
      const data = await r.json();
      return res.json({ cards: Array.isArray(data) ? data : [] });
    }

    if (req.method === 'POST') {
      let body: any;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
      const { card_type, front_text, fields_json } = body;
      if (!front_text) return res.status(400).json({ error: 'front_text required' });

      const duplicateHash = await computeDuplicateHash(notebook_id, nb.language_variant, card_type ?? 'vocab', front_text.trim());
      const existingR = await fetch(`${url}/rest/v1/cards?select=id&notebook_id=eq.${encodeURIComponent(notebook_id)}&duplicate_hash=eq.${encodeURIComponent(duplicateHash)}&archived_at=is.null`, { headers });
      const existingData = await existingR.json();
      const existing = Array.isArray(existingData) ? existingData[0] : null;

      const id = generateId();
      const now = nowISO();
      const fieldsJsonStr = fields_json ? JSON.stringify(fields_json) : null;
      const insertR = await fetch(`${url}/rest/v1/cards`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ id, notebook_id, card_type: card_type ?? 'vocab', source: 'manual', front_text: front_text.trim(), fields_json: fieldsJsonStr, duplicate_hash: duplicateHash, created_at: now, updated_at: now })
      });
      const insertData = await insertR.json();
      if (!insertR.ok) return res.status(500).json({ error: insertData?.message || 'Insert failed' });
      return res.status(201).json({ card: insertData[0], isDuplicate: !!existing });
    }
  } catch (e) {
    console.error('[cards] error:', e);
    return res.status(500).json({ error: String(e) });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
