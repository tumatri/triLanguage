import { type Context, type Next } from 'hono';
import type { Env } from '../types';

type AppEnv = { Bindings: Env };

/** Security middleware — strict headers on every response. */
export async function securityMiddleware(
  c: Context<AppEnv>,
  next: Next
): Promise<Response> {
  const res = (await next()) as unknown as Response;

  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const appOrigin = (c.env as any).APP_ORIGIN || 'http://localhost:5173';
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self' ${appOrigin} https://apihub.agnes-ai.com https://*.agnes-ai.com`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
}

/** CORS middleware — allow only APP_ORIGIN. */
export async function corsMiddleware(
  c: Context<AppEnv>,
  next: Next
): Promise<Response> {
  const origin = c.req.header('origin') ?? '';
  const allowed = [(c.env as any).APP_ORIGIN || 'http://localhost:5173'].filter(Boolean) as string[];
  const ok = allowed.includes(origin);

  const res = (await next()) as unknown as Response;

  if (ok) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  if (c.req.method === 'OPTIONS') {
    const h = new Headers(res.headers);
    h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Cookie');
    h.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers: h });
  }

  return res;
}
