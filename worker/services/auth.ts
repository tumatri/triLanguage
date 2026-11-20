import type { Env } from '../types';
import { hashPassword as hashPw, generateSalt, generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

type BootstrapInput = { email: string; password: string };

export async function bootstrapUser(
  env: Env,
  body: BootstrapInput
): Promise<{ id: string; email: string }> {
  const db = getDb(env.DATABASE_URL);

  const existing = await db.maybeOne<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`, [body.email]
  );
  if (existing) throw new Error('Email already registered');

  const ownerCount = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM users WHERE is_owner = 1`
  );
  if ((ownerCount.cnt ?? 0) > 0) throw new Error('Owner already exists');

  const salt = generateSalt();
  const passwordHash = await hashPw(body.password, salt);
  const userId = generateId();
  const createdAt = nowISO();

  await db.none(
    `INSERT INTO users (id, email, password_hash, password_salt, created_at, is_owner) VALUES ($1,$2,$3,$4,$5,1)`,
    [userId, body.email, passwordHash, salt, createdAt]
  );

  return { id: userId, email: body.email };
}

export async function findUserByEmail(env: Env, email: string): Promise<{ id: string; email: string; password_hash: string; password_salt: string } | null> {
  const db = getDb(env.DATABASE_URL);
  return db.maybeOne(
    `SELECT id, email, password_hash, password_salt FROM users WHERE email = $1 LIMIT 1`, [email]
  );
}

export async function checkOwnerExists(env: Env): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const count = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM users WHERE is_owner = 1`
  );
  return (count.cnt ?? 0) > 0;
}
