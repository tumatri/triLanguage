import type { Context, Next } from 'hono';
import type { Env, UserSession } from '../types';
import { hashToken } from '../lib/crypto';
import { getDb } from '../lib/db';

export async function authenticate(
  c: Context<{ Bindings: Env; Variables: { user?: UserSession } }>,
  next: Next
): Promise<Response | void> {
  const token = parseCookie(c.req.header('Cookie') ?? '', 'session_token');

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await getUserSession(c.env, token);
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', session);
  return next();
}

async function getUserSession(env: Env, rawToken: string): Promise<UserSession | null> {
  const db = getDb(env.DATABASE_URL);
  const tokenHash = await hashToken(rawToken, env.SESSION_SECRET);

  const result = await db.maybeOne<{ id: string; user_id: string; expires_at: string }>(
    `SELECT s.id, s.user_id, s.expires_at FROM sessions s
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 LIMIT 1`,
    [tokenHash, new Date().toISOString()]
  );

  if (!result) return null;

  await db.none(
    `UPDATE sessions SET last_seen_at = $1 WHERE id = $2`,
    [new Date().toISOString(), result.id]
  );

  return {
    userId: result.user_id,
    sessionId: result.id,
    expiresAt: new Date(result.expires_at).getTime()
  };
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = cookieHeader.match(new RegExp('(?:^|;)\\s*' + escapedName + '\\s*=\\s*([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}
