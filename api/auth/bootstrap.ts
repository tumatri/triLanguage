// api/auth/bootstrap.ts — Simple sign up / sign in (no email verification)
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

function generateId(): string { return crypto.randomUUID(); }
function nowISO(): string { return new Date().toISOString(); }

async function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, derived) => {
      err ? reject(err) : resolve(derived.toString('hex'));
    });
  });
}

async function forceSchemaCacheRefresh() {
  if (!SUPABASE_URL || !SECRET_KEY) return;
  const headers = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` };
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=0`, { headers }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/sessions?select=id&limit=0`, { headers }).catch(() => {}),
    fetch(`${SUPABASE_URL}/rest/v1/notebooks?select=id&limit=0`, { headers }).catch(() => {}),
  ]);
}

function getHeaders() {
  return { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Refresh schema cache to avoid PGRST205
  try { await forceSchemaCacheRefresh(); } catch { /* non-fatal */ }
  const headers = getHeaders();

  if (req.method === 'GET') {
    // Check if any owner exists
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&is_owner=eq.1&head=true`, { headers });
      const count = parseInt(r.headers.get('x-total-count') ?? '0');
      return res.json({ can_bootstrap: count === 0, count });
    } catch (e) {
      return res.json({ can_bootstrap: true, _debug: String(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: { email?: string; password?: string };
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { email, password } = body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 8 ký tự' });

  // Step 1: Check if user already exists
  let existingUser: { id: string; is_owner: number } | null = null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,is_owner&email=eq.${encodeURIComponent(email)}&limit=1`,
      { headers }
    );
    const data = await r.json() as unknown[];
    existingUser = (data as { id: string; is_owner: number }[])[0] ?? null;
  } catch (e) {
    console.error('[bootstrap] check user error:', e);
  }

  if (existingUser) {
    // Existing user — just log them in
    return res.status(200).json({ id: existingUser.id, email, is_new: false, is_owner: !!existingUser.is_owner });
  }

  // Step 2: Create new user (first becomes owner)
  const ownerCountResp = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&is_owner=eq.1&head=true`, { headers });
  const isFirstOwner = parseInt(ownerCountResp.headers.get('x-total-count') ?? '0') === 0;

  const id = generateId();
  const salt = crypto.randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(password, salt);
  const createdAt = nowISO();

  try {
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        id, email, password_hash: passwordHash, password_salt: salt,
        created_at: createdAt, is_owner: isFirstOwner ? 1 : 0,
      }),
    });
    const insertText = await insertResp.text();

    if (insertResp.status >= 400) {
      return res.status(500).json({ error: `Database error: ${insertText.slice(0, 200)}` });
    }

    const inserted = JSON.parse(insertText) as { id: string }[];
    return res.status(201).json({ id: inserted[0].id, email, is_new: true, is_owner: isFirstOwner });
  } catch (e) {
    return res.status(500).json({ error: `Insert error: ${String(e).slice(0, 200)}` });
  }
}
