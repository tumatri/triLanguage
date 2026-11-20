import type { Env } from '../types';
import type { CreateNotebookInput, UpdateNotebookInput } from '../schemas/notebooks';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

export interface NotebookRecord {
  id: string;
  user_id: string;
  name: string;
  language_variant: 'zh-Hant' | 'zh-Hans' | 'en-US';
  timezone: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function createNotebook(
  env: Env,
  ownerId: string,
  input: CreateNotebookInput
): Promise<NotebookRecord> {
  const db = getDb(env.DATABASE_URL);
  const id = generateId();
  const now = nowISO();

  await db.none(
    `INSERT INTO notebooks (id, user_id, name, language_variant, timezone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, ownerId, input.name, input.language_variant, input.timezone, now, now]
  );

  return {
    id, user_id: ownerId, name: input.name,
    language_variant: input.language_variant,
    timezone: input.timezone,
    created_at: now, updated_at: now, deleted_at: null
  };
}

export async function listNotebooks(env: Env, ownerId: string): Promise<NotebookRecord[]> {
  const db = getDb(env.DATABASE_URL);
  const rows = await db.query<NotebookRecord>(
    `SELECT id, user_id, name, language_variant, timezone, created_at, updated_at, deleted_at
     FROM notebooks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [ownerId]
  );
  return rows;
}

export async function getNotebook(
  env: Env, ownerId: string, notebookId: string
): Promise<NotebookRecord | null> {
  const db = getDb(env.DATABASE_URL);
  const row = await db.maybeOne<NotebookRecord>(
    `SELECT id, user_id, name, language_variant, timezone, created_at, updated_at, deleted_at
     FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, ownerId]
  );
  return row ?? null;
}

export async function updateNotebook(
  env: Env, ownerId: string, notebookId: string, input: UpdateNotebookInput
): Promise<NotebookRecord | null> {
  const existing = await getNotebook(env, ownerId, notebookId);
  if (!existing) return null;

  const db = getDb(env.DATABASE_URL);
  const name = input.name ?? existing.name;
  const timezone = input.timezone ?? existing.timezone;
  const updatedAt = nowISO();

  await db.none(
    `UPDATE notebooks SET name = $1, timezone = $2, updated_at = $3 WHERE id = $4 AND user_id = $5`,
    [name, timezone, updatedAt, notebookId, ownerId]
  );

  return { ...existing, name, timezone, updated_at: updatedAt };
}

export async function deleteNotebook(
  env: Env, ownerId: string, notebookId: string
): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const result = await db.query<{ rows_affected?: number }>(
    `UPDATE notebooks SET deleted_at = $1, updated_at = $2 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL RETURNING 1`,
    [nowISO(), nowISO(), notebookId, ownerId]
  );
  return (result.length > 0);
}

export async function deleteNotebookPermanently(
  env: Env, ownerId: string, notebookId: string
): Promise<{ cardsDeleted: number; mediaDeleted: number }> {
  const db = getDb(env.DATABASE_URL);

  const cardsBefore = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM cards WHERE notebook_id = $1`,
    [notebookId]
  );

  const mediaBefore = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM media WHERE notebook_id = $1`,
    [notebookId]
  );

  await db.none(
    `DELETE FROM notebooks WHERE id = $1 AND user_id = $2`,
    [notebookId, ownerId]
  );

  return {
    cardsDeleted: cardsBefore.cnt,
    mediaDeleted: mediaBefore.cnt
  };
}
