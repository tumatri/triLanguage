import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';

/**
 * CSRF protection middleware for Vercel API routes.
 * Checks X-CSRF-Token header against session-stored token.
 */
export function csrfProtection(
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void
): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const token = req.headers['x-csrf-token'] as string;
  if (!token) {
    res.status(403).json({ error: 'CSRF token missing' });
    return;
  }

  const storedToken = req.cookies?.csrf_token;
  if (!storedToken || token !== storedToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}

/** Generate a CSRF token and set cookie */
export function generateCsrfToken(res: NextApiResponse): string {
  const token = randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `csrf_token=${token}; Path=/; HttpOnly; SameSite=Lax`);
  return token;
}
