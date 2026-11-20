import type { Env } from '../types';
import type { CreateCardInput, UpdateCardInput } from '../schemas/cards';
import { generateId, nowISO } from '../lib/crypto';
import { computeDuplicateHash } from '../lib/duplicateHash';
import { getDb } from '../lib/db';

export interface CardRecord {
  id: string;
  notebook_id: string;
  card_type: string;
  knowledge_type: string | null;
  source: 'manual' | 'ai' | 'import';
  front_text: string;
  fields_json: string | null;
  duplicate_hash: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export async function createCard(
  env: Env,
  ownerId: string,
  notebookId: string,
  input: CreateCardInput
): Promise<{ card: CardRecord; isDuplicate: boolean }> {
  const db = getDb(env.DATABASE_URL);

  const nb = await db.maybeOne<{ language_variant: string }>(
    `SELECT language_variant FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, ownerId]
  );
  if (!nb) throw new Error('Notebook not found or access denied');

  const duplicateHash = await computeDuplicateHash(
    notebookId, nb.language_variant, input.card_type, input.front_text
  );

  const existing = await db.maybeOne<{ id: string }>(
    `SELECT id FROM cards WHERE notebook_id = $1 AND duplicate_hash = $2 AND archived_at IS NULL LIMIT 1`,
    [notebookId, duplicateHash]
  );

  const now = nowISO();
  const cardId = generateId();
  const fieldsJson = input.fields_json ? JSON.stringify(input.fields_json) : null;

  await db.none(
    `INSERT INTO cards (id, notebook_id, card_type, knowledge_type, source, front_text, fields_json, duplicate_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [cardId, notebookId, input.card_type, null, input.source, input.front_text, fieldsJson, duplicateHash, now, now]
  );

  return {
    card: {
      id: cardId, notebook_id: notebookId, card_type: input.card_type,
      knowledge_type: null, source: input.source, front_text: input.front_text,
      fields_json: fieldsJson, duplicate_hash: duplicateHash,
      created_at: now, updated_at: now, archived_at: null
    },
    isDuplicate: !!existing
  };
}

export async function listCards(env: Env, notebookId: string): Promise<CardRecord[]> {
  const db = getDb(env.DATABASE_URL);
  return db.query<CardRecord>(
    `SELECT id, notebook_id, card_type, knowledge_type, source, front_text, fields_json,
            duplicate_hash, created_at, updated_at, archived_at
     FROM cards WHERE notebook_id = $1 AND archived_at IS NULL
     ORDER BY created_at DESC`,
    [notebookId]
  );
}

export async function getCard(
  env: Env, ownerId: string, notebookId: string, cardId: string
): Promise<CardRecord | null> {
  const db = getDb(env.DATABASE_URL);
  const exists = await db.maybeOne<{ '1': number }>(
    `SELECT 1 FROM cards c JOIN notebooks n ON c.notebook_id = n.id
     WHERE c.id = $1 AND n.id = $2 AND n.user_id = $3 AND c.archived_at IS NULL LIMIT 1`,
    [cardId, notebookId, ownerId]
  );
  if (!exists) return null;

  return db.maybeOne<CardRecord>(
    `SELECT id, notebook_id, card_type, knowledge_type, source, front_text, fields_json,
            duplicate_hash, created_at, updated_at, archived_at
     FROM cards WHERE id = $1 AND notebook_id = $2 AND archived_at IS NULL LIMIT 1`,
    [cardId, notebookId]
  );
}

export async function updateCard(
  env: Env, ownerId: string, notebookId: string, cardId: string, input: UpdateCardInput
): Promise<CardRecord | null> {
  const existing = await getCard(env, ownerId, notebookId, cardId);
  if (!existing) return null;

  const db = getDb(env.DATABASE_URL);
  const updatedAt = nowISO();
  const frontText = input.front_text ?? existing.front_text;
  const fieldsJson = input.fields_json !== undefined
    ? (input.fields_json === null ? null : JSON.stringify(input.fields_json))
    : existing.fields_json;
  const archivedAt = input.archived_at ?? existing.archived_at;

  await db.none(
    `UPDATE cards SET front_text = $1, fields_json = $2, archived_at = $3, updated_at = $4
     WHERE id = $5 AND notebook_id = $6`,
    [frontText, fieldsJson, archivedAt, updatedAt, cardId, notebookId]
  );

  return { ...existing, front_text: frontText, fields_json: fieldsJson, archived_at: archivedAt, updated_at: updatedAt };
}

export async function deleteCard(
  env: Env, ownerId: string, notebookId: string, cardId: string
): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const result = await db.query<{ rows_affected?: number }>(
    `DELETE FROM cards WHERE id = $1 AND notebook_id = $2 AND archived_at IS NULL RETURNING 1`,
    [cardId, notebookId]
  );
  return result.length > 0;
}
