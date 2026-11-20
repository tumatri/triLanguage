// api/dashboard/notebooks/[notebookId]/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

function hashToken(token: string, secret: string): string {
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

async function verifySession(req: NextApiRequest): Promise<{ userId: string } | null> {
  const token = getSessionToken(req);
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SECRET_KEY!;
    const tokenHash = hashToken(token, secret);
    const r = await fetch(`${url}/rest/v1/sessions?select=id,user_id&token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const data = await r.json();
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return null;
    return { userId: row.user_id };
  } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await verifySession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { notebookId } = req.query as { notebookId?: string };
  if (!notebookId) return res.status(400).json({ error: 'notebookId required' });

  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    // Verify ownership
    const nbR = await fetch(`${url}/rest/v1/notebooks?select=id&id=eq.${encodeURIComponent(notebookId)}&user_id=eq.${session.userId}&deleted_at=is.null`, { headers });
    const nbData = await nbR.json();
    if (!Array.isArray(nbData) || !nbData[0]) return res.status(404).json({ error: 'Notebook not found' });

    const now = new Date().toISOString();
    const [totalCards, dueCount, masteredCount, unseenCount] = await Promise.all([
      fetch(`${url}/rest/v1/card_progress?select=id&head=true&notebook_id=eq.${encodeURIComponent(notebookId)}`, { headers }).then(r => r.headers.get('x-total-count') ?? '0'),
      fetch(`${url}/rest/v1/card_progress?select=id&head=true&notebook_id=eq.${encodeURIComponent(notebookId)}&next_review_at=lt.${encodeURIComponent(now)}&mastery_level=lt.6`, { headers }).then(r => r.headers.get('x-total-count') ?? '0'),
      fetch(`${url}/rest/v1/card_progress?select=id&head=true&notebook_id=eq.${encodeURIComponent(notebookId)}&mastery_level=eq.6`, { headers }).then(r => r.headers.get('x-total-count') ?? '0'),
      fetch(`${url}/rest/v1/cards?select=id&head=true&notebook_id=eq.${encodeURIComponent(notebookId)}&archived_at=is.null`, { headers }).then(r => r.headers.get('x-total-count') ?? '0'),
    ]);

    const total = parseInt(totalCards, 10) || 0;
    const due = parseInt(dueCount, 10) || 0;
    const mastered = parseInt(masteredCount, 10) || 0;
    const unseenRaw = parseInt(unseenCount, 10) || 0;
    const learning = Math.max(total - unseenRaw - mastered, 0);
    const unseen = Math.max(unseenRaw - total + mastered, 0);

    return res.json({ total_cards: total, due_count: due, mastered_count: mastered, learning_count: learning, unseen_count: unseen });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
