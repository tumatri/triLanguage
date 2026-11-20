import type { Env } from '../types';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

export interface SkillProfileRow {
  id: string;
  notebook_id: string;
  skill: string;
  estimate: number | null;
  confidence: number | null;
  sample_count: number;
  accuracy_30d: number | null;
  updated_at: string;
}

export async function createPlacementRun(
  env: Env, ownerId: string, notebookId: string
): Promise<{ runId: string }> {
  const db = getDb(env.DATABASE_URL);
  const nb = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, ownerId]
  );
  if (!nb) throw new Error('Notebook not found');

  const id = generateId();
  await db.none(
    `INSERT INTO placement_runs (id, notebook_id, started_at, completed_at, result_json, confidence_json)
     VALUES ($1,$2,$3,NULL,NULL,NULL)`,
    [id, notebookId, nowISO()]
  );
  return { runId: id };
}

export async function completePlacementRun(
  env: Env, notebookId: string, runId: string,
  results: Record<string, unknown>, confidences: Record<string, number>
): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  await db.none(
    `UPDATE placement_runs SET completed_at = $1, result_json = $2, confidence_json = $3
     WHERE id = $4 AND notebook_id = $5`,
    [nowISO(), JSON.stringify(results), JSON.stringify(confidences), runId, notebookId]
  );
}

export async function getSkillProfiles(
  env: Env, notebookId: string
): Promise<SkillProfileRow[]> {
  const db = getDb(env.DATABASE_URL);
  return db.query<SkillProfileRow>(
    `SELECT skill, estimate, confidence, sample_count, accuracy_30d FROM skill_profiles
     WHERE notebook_id = $1 ORDER BY skill ASC`,
    [notebookId]
  );
}

export async function upsertSkillProfile(
  env: Env, notebookId: string, skill: string, estimate: number, confidence: number, sampleCount: number, accuracy30d: number | null
): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  const existing = await db.maybeOne<{ id: string }>(
    `SELECT id FROM skill_profiles WHERE notebook_id = $1 AND skill = $2 LIMIT 1`,
    [notebookId, skill]
  );

  if (existing) {
    await db.none(
      `UPDATE skill_profiles SET estimate = $1, confidence = $2, sample_count = $3, accuracy_30d = $4, updated_at = $5
       WHERE notebook_id = $6 AND skill = $7`,
      [estimate, confidence, sampleCount, accuracy30d, nowISO(), notebookId, skill]
    );
  } else {
    await db.none(
      `INSERT INTO skill_profiles (id, notebook_id, skill, estimate, confidence, sample_count, accuracy_30d, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [generateId(), notebookId, skill, estimate, confidence, sampleCount, accuracy30d, nowISO()]
    );
  }
}
