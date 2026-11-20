import type { Env } from '../types';
import { hashToken, generateToken, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

const COOKIE_NAME = 'session_token';

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export async function createSession(
  env: Env,
  userId: string,
  ttlSeconds: number
): Promise<{ token: string; session: SessionRecord }> {
  const db = getDb(env.DATABASE_URL);
  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken, env.SESSION_SECRET);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const sessionId = crypto.randomUUID();
  const createdAt = nowISO();
  const lastSeenAt = createdAt;

  await db.none(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [sessionId, userId, tokenHash, createdAt, expiresAt, lastSeenAt]
  );

  return {
    token: rawToken,
    session: { id: sessionId, user_id: userId, token_hash: tokenHash, created_at: createdAt, expires_at: expiresAt, last_seen_at: lastSeenAt, revoked_at: null }
  };
}

export async function revokeSession(env: Env, tokenHash: string): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  await db.none(
    `UPDATE sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL`,
    [new Date().toISOString(), tokenHash]
  );
}

export function clearSessionCookie(): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }
  });
}

export function setSessionCookie(c: Response, token: string, ttlSeconds: number): Response {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  const headers = new Headers(c.headers);
  headers.set('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`);
  return new Response(c.body, { status: c.status, headers });
}
