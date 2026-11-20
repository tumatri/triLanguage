import { Hono } from 'hono';
import type { Env } from '../types';
import { bootstrapSchema, loginSchema } from '../schemas/auth';
import { bootstrapUser, findUserByEmail, checkOwnerExists } from '../services/auth';
import { createSession, clearSessionCookie, revokeSession } from '../services/session';

export const authRoutes = new Hono<{ Bindings: Env }>();

// GET /api/auth/bootstrap — kiểm tra đã có owner chưa
authRoutes.get('/bootstrap', async (c) => {
  const hasOwner = await checkOwnerExists(c.env);
  return c.json({ hasOwner });
});

// POST /api/auth/bootstrap — tạo tài khoản chủ sở hữu đầu tiên
authRoutes.post('/bootstrap', async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!raw) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const parsed = bootstrapSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const hasOwner = await checkOwnerExists(c.env);
  if (hasOwner) {
    return c.json({ error: 'Bootstrap already completed' }, 403);
  }

  try {
    const user = await bootstrapUser(c.env, parsed.data);
    const ttl = parseInt(c.env.SESSION_TTL_SECONDS || '86400', 10);
    const { token } = await createSession(c.env, user.id, ttl);
    const resp = c.json({ id: user.id, email: user.email });
    return setSessionCookie(resp, token, ttl);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'Email already registered') {
        return c.json({ error: 'Email already registered' }, 409);
      }
      if (err.message === 'Owner already exists') {
        return c.json({ error: 'Owner already exists' }, 403);
      }
    }
    console.error('[auth/bootstrap] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/auth/register — đăng ký (luôn bị chặn sau lần bootstrap)
authRoutes.post('/register', async (c) => {
  const hasOwner = await checkOwnerExists(c.env);
  if (!hasOwner) {
    return c.json({ error: 'Use /api/auth/bootstrap instead' }, 405);
  }
  return c.json({ error: 'Registration is closed' }, 404);
});

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const raw = await c.req.json().catch(() => null);
  if (!raw) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const user = await findUserByEmail(c.env, parsed.data.email);
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Verify password: SHA-256(salt + password)
  const saltedPassword = `${user.password_salt}${parsed.data.password}`;
  const encoder = new TextEncoder();
  const cryptoObj = globalThis.crypto as Crypto;
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', encoder.encode(saltedPassword));
  const computedHash = Buffer.from(hashBuffer).toString('hex');

  if (computedHash !== user.password_hash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const ttl = parseInt(c.env.SESSION_TTL_SECONDS || '86400', 10);
  const { token } = await createSession(c.env, user.id, ttl);
  const resp = c.json({ id: user.id, email: user.email });
  return setSessionCookie(resp, token, ttl);
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? '';
  const token = parseCookie(cookieHeader, 'session_token');
  if (token) {
    const tokenHash = await import('../lib/crypto').then(m => m.hashToken(token, c.env.SESSION_SECRET));
    await revokeSession(c.env, tokenHash);
  }
  return clearSessionCookie();
});

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const matches = cookieHeader.match(new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

function setSessionCookie(c: Response, token: string, ttlSeconds: number): Response {
  const expires = new Date(Date.now() + ttlSeconds * 1000).toUTCString();
  const headers = new Headers(c.headers);
  headers.set('Set-Cookie', `session_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${expires}`);
  return new Response(c.body, { status: c.status, headers });
}
