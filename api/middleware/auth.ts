import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes, pbkdf2Sync, createHmac } from 'crypto';

const SESSION_COOKIE_NAME = 'session_token';

/** Parse session cookie from request */
export function getSessionCookie(req: NextApiRequest): string | undefined {
  const cookies = req.headers.cookie?.split('; ').reduce<Record<string, string>>((acc, c) => {
    const [name, ...rest] = c.split('=');
    acc[name.trim()] = rest.join('=').trim();
    return acc;
  }, {}) ?? {};
  return cookies[SESSION_COOKIE_NAME];
}

/** Set session cookie on response */
export function setSessionCookie(
  res: NextApiResponse,
  token: string,
  ttlSeconds: number
): void {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`
  );
}

/** Clear session cookie */
export function clearSessionCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

/** Hash a token using HMAC-SHA256 for secure comparison — NO prefix */
export async function hashToken(token: string, secret: string): Promise<string> {
  const hmac = createHmac('sha256', secret);
  hmac.update(token);
  return hmac.digest('hex');
}

/** Generate a random hex token */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Generate a UUID-like ID */
export function generateId(): string {
  return randomBytes(16).toString('hex');
}

/** Current ISO timestamp */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Password hashing via PBKDF2 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const iterations = 100_000;
  const keyLen = 32;
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pbkdf2Sync(password, salt, iterations, keyLen, 'sha256', (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
  return buffer.toString('hex');
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

/** Auth context extracted from request */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** Verify session and return auth context, or null */
export async function verifySession(
  req: NextApiRequest,
  res: NextApiResponse,
  db: any,
  sessionSecret: string
): Promise<AuthContext | null> {
  const rawToken = getSessionCookie(req);
  if (!rawToken) return null;

  const tokenHash = await hashToken(rawToken, sessionSecret);
  const result = await db.maybeOne<{ id: string; user_id: string; expires_at: string }>(
    `SELECT id, user_id, expires_at FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [tokenHash]
  );

  if (!result) return null;

  await db.none(`UPDATE sessions SET last_seen_at = NOW() WHERE id = $1`, [result.id]);

  return {
    userId: result.user_id,
    sessionId: result.id
  };
}
