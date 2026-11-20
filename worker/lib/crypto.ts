import crypto from 'node:crypto';

export function generateId(): string {
  return crypto.randomUUID();
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}${password}`)
  );
  return Buffer.from(buffer).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function hashToken(token: string, secret: string): Promise<string> {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(token);
  return hmac.digest('hex');
}

export function generateToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function nowISO(): string {
  return new Date().toISOString();
}
