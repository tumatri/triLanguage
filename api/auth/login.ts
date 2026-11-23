// api/auth/login.ts — Verifies password against stored hash, creates session
import type { NextApiRequest, NextApiResponse } from 'next';
import * as crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, derived) => {
      err ? reject(err) : resolve(derived.toString('hex'));
    });
  });
}

function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function generateToken(): string { return crypto.randomBytes(48).toString('hex'); }
function nowISO(): string { return new Date().toISOString(); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const { email, password } = body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const headers = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` };

  // Find user by email
  let user: { id: string; email: string; password_hash: string; password_salt: string; is_owner: number } | null = null;
  try {
    const userR = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id,email,password_hash,password_salt,is_owner&email=eq.${encodeURIComponent(email)}`,
      { headers }
    );
    const userData = await userR.json() as unknown[];
    user = (userData as typeof user[])[0] ?? null;
  } catch (e) {
    console.error('[login] user lookup error:', e);
    return res.status(500).json({ error: 'Service unavailable' });
  }

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // Verify password
  const computedHash = await hashPassword(password, user.password_salt);
  if (computedHash !== user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  // Create session
  const rawToken = generateToken();
  const ttlSeconds = parseInt(process.env.SESSION_TTL_SECONDS ?? '86400', 10);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const createdAt = nowISO();
  const tokenHash = hashToken(rawToken, process.env.SESSION_SECRET!);

  try {
    const sessR = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(), user_id: user.id, token_hash: tokenHash, created_at: createdAt, expires_at: expiresAt, last_seen_at: createdAt }),
    });
    const sessData = await sessR.json();
    if (!sessR.ok) return res.status(500).json({ error: sessData?.message || 'Session creation failed' });
  } catch (e) {
    console.error('[login] session create error:', e);
    return res.status(500).json({ error: 'Service unavailable' });
  }

  res.setHeader('Set-Cookie',
    `session_token=${rawToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(Date.now() + ttlSeconds * 1000).toUTCString()}`
  );
  return res.json({ user_id: user.id, email: user.email, is_owner: !!user.is_owner });
}
