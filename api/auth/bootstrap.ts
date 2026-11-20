// api/auth/bootstrap.ts — Sign up or sign in (auto-creates account if missing)
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL!;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
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

function parseBody(obj: unknown): { email?: string; password?: string } | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const email = String(o.email ?? '');
  const password = String(o.password ?? '');
  if (!email && !password) return null;
  return { email, password };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!SUPABASE_URL || !ANON_KEY || !SECRET_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' };

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&is_owner=eq.1&head=true`, { headers });
      const count = parseInt(r.headers.get('x-total-count') ?? '0');
      return res.json({ can_bootstrap: !(count > 0), count });
    } catch (e) {
      return res.json({ can_bootstrap: true, _debug: String(e) });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body
  let body: { email?: string; password?: string } | null = parseBody(req.body);
  if (!body?.email) {
    try {
      const readable = req as any;
      const chunks: Buffer[] = [];
      if (readable.readable) {
        for await (const chunk of readable) chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim()) body = parseBody(JSON.parse(raw));
    } catch {}
  }
  if (!body?.email || !body?.password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const email = body.email;
  const password = body.password;

  // Step 1: Ensure Supabase Auth user exists
  let authUserId: string;
  {
    const signUpResp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { ...headers, apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ email, password })
    });
    const signUpText = await signUpResp.text();

    if (signUpResp.ok) {
      try { authUserId = JSON.parse(signUpText).id; } catch { return res.status(500).json({ error: 'Failed to parse auth response' }); }
    } else if (signUpText.includes('already registered') || signUpText.includes('already exists')) {
      // User exists in Auth — sign in to get their id
      const signInResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { ...headers, apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ email, password })
      });
      const signInText = await signInResp.text();
      if (!signInResp.ok) return res.status(400).json({ error: `Auth: ${signUpText.substring(0, 200)}` });
      try { authUserId = JSON.parse(signInText).user?.id; } catch { return res.status(500).json({ error: 'Auth service error' }); }
    } else {
      return res.status(400).json({ error: `Auth: ${signUpText.substring(0, 200)}` });
    }
  }
  if (!authUserId) return res.status(500).json({ error: 'Auth user creation failed' });

  // Step 2: Check custom users table
  const existingR = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,is_owner&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers }
  );
  const existingData = await existingR.json();
  const existingUser = Array.isArray(existingData) ? existingData[0] : null;

  if (existingUser) {
    // Existing custom user — just sync auth_user_id
    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${existingUser.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ auth_user_id: authUserId })
    }).catch(() => {});
    return res.status(200).json({ id: existingUser.id, email, is_new: false });
  }

  // Step 3: Insert new user — be first owner only if no owners exist
  const ownerCountResp = await fetch(`${SUPABASE_URL}/rest/v1/users?select=id&is_owner=eq.1&head=true`, { headers });
  const isFirstOwner = parseInt(ownerCountResp.headers.get('x-total-count') ?? '0') === 0;

  const id = generateId();
  const salt = crypto.randomBytes(32).toString('hex');
  const passwordHash = await hashPassword(password, salt);
  const createdAt = nowISO();

  const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ id, email, password_hash: passwordHash, password_salt: salt, created_at: createdAt, is_owner: isFirstOwner ? 1 : 0, auth_user_id: authUserId })
  });
  const insertText = await insertResp.text();

  if (insertResp.status >= 400) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, { method: 'DELETE', headers }).catch(() => {});
    return res.status(500).json({ error: `Database error: ${insertText.substring(0, 200)}` });
  }

  return res.status(201).json({ id, email, is_new: true });
}
