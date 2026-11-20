import { generateId, nowISO } from '../lib/crypto';
import type { Env } from '../types';
import { getDb } from '../lib/db';

export interface CacheEntry {
  id: string;
  notebook_id: string;
  cache_key: string;
  task: string;
  model_id: string | null;
  prompt_version: string;
  response_json: string;
  created_at: string;
  expires_at: string;
}

export async function computeCacheKey(
  task: string,
  notebookId: string,
  languageVariant: string,
  contentDigest: string,
  promptVersion: string,
  schemaVersion: string,
  modelId: string
): Promise<string> {
  const encoder = new TextEncoder();
  const raw = `${task}|${notebookId}|${languageVariant}|${contentDigest}|${promptVersion}|${schemaVersion}|${modelId}`;
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  return Buffer.from(buffer).toString('hex');
}

export async function getCachedResponse(
  env: Env,
  notebookId: string,
  cacheKey: string
): Promise<string | null> {
  const db = getDb(env.DATABASE_URL);
  const row = await db.maybeOne<{ response_json: string; expires_at: string }>(
    `SELECT response_json, expires_at FROM ai_cache WHERE notebook_id = $1 AND cache_key = $2 AND expires_at > $3 LIMIT 1`,
    [notebookId, cacheKey, nowISO()]
  );
  if (!row) return null;
  return row.response_json;
}

export async function setCachedResponse(
  env: Env,
  input: {
    notebookId: string;
    cacheKey: string;
    task: string;
    modelId: string | null;
    promptVersion: string;
    responseBody: string;
    ttlMinutes: number;
  }
): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60_000).toISOString();
  const id = generateId();
  const createdAt = nowISO();

  await db.none(
    `INSERT INTO ai_cache (id, notebook_id, cache_key, task, model_id, prompt_version, response_json, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.notebookId, input.cacheKey, input.task, input.modelId, input.promptVersion, input.responseBody, createdAt, expiresAt]
  );
}

export const CACHE_TTL_MINUTES: Record<string, number> = {
  enrich: 30 * 24 * 60,
  tutor: 7 * 24 * 60,
  mcq: 7 * 24 * 60
};

export function getCachableTtlMinutes(task: string): number {
  return CACHE_TTL_MINUTES[task] ?? 7 * 24 * 60;
}
