import type { Context, Next } from 'hono';
import type { Env, UserSession } from '../types';

const CSRF_HEADER = 'x-csrf-token';

export async function csrfProtection(
  c: Context<{ Bindings: Env; Variables: { user?: UserSession } }>,
  next: Next
): Promise<Response | void> {
  const method = c.req.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const csrfToken = c.req.header(CSRF_HEADER);
  const cookieHeader = c.req.header('Cookie') ?? '';
  const sessionCookie = parseCookie(cookieHeader, 'session_token');

  if (!csrfToken || !sessionCookie) {
    return c.json({ error: 'CSRF validation failed' }, 403);
  }

  const validTokenPattern = /^[a-f0-9-]{36}$/;
  if (!validTokenPattern.test(csrfToken)) {
    return c.json({ error: 'Invalid CSRF token' }, 403);
  }

  return next();
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = cookieHeader.match(new RegExp('(?:^|;)\\s*' + escapedName + '\\s*=\\s*([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}
