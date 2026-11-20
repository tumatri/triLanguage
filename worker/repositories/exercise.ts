import type { Env } from '../types';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';
import type { ExercisePayload } from '../schemas/exercises';

export interface CreateSessionInput {
  ownerId: string;
  notebookId: string;
  cardId: string;
  mode: 'learn' | 'review' | 'test' | 'placement';
  exercises: ExercisePayload[];
  coverageRequiredJson: string | null;
  coverageCompletedJson: string | null;
}

export interface ExerciseRecord {
  id: string;
  notebook_id: string;
  session_id: string;
  exercise_type: 'flashcard' | 'multiple_choice';
  payload_json: string;
  tested_fields_json: string | null;
  source: 'ai' | 'template';
  schema_version: string;
  created_at: string;
}

export async function createExerciseSession(
  env: Env,
  input: CreateSessionInput
): Promise<{ sessionId: string; exercises: ExerciseRecord[] }> {
  const db = getDb(env.DATABASE_URL);

  const nb = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.notebookId, input.ownerId]
  );
  if (!nb) throw new Error('Notebook not found or access denied');

  const startedAt = new Date().toISOString();
  const sessionId = generateId();
  const now = nowISO();

  await db.none(
    `INSERT INTO exercise_sessions
     (id, notebook_id, card_id, mode, started_at, completed_at, coverage_required_json, coverage_completed_json)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7)`,
    [sessionId, input.notebookId, input.cardId, input.mode, startedAt,
     input.coverageRequiredJson, input.coverageCompletedJson]
  );

  const insertedExercises: ExerciseRecord[] = [];
  for (const ex of input.exercises) {
    const exId = generateId();
    const testedFields = computeTestedFields(ex);
    const source = (ex as Record<string, unknown>).source as ('ai' | 'template') ?? 'template';
    await db.none(
      `INSERT INTO exercises
       (id, notebook_id, session_id, exercise_type, payload_json, tested_fields_json, source, schema_version, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [exId, input.notebookId, sessionId, ex.exercise_type,
       JSON.stringify(ex), testedFields, source,
       ex.schema_version ?? '1', now]
    );
    insertedExercises.push({
      id: exId,
      notebook_id: input.notebookId,
      session_id: sessionId,
      exercise_type: ex.exercise_type as 'flashcard' | 'multiple_choice',
      payload_json: JSON.stringify(ex),
      tested_fields_json: testedFields,
      source,
      schema_version: ex.schema_version ?? '1',
      created_at: now
    });
  }

  return { sessionId, exercises: insertedExercises };
}

export async function completeExerciseSession(
  env: Env, notebookId: string, sessionId: string, rating: string | null, score: number | null
): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  await db.none(
    `UPDATE exercise_sessions SET completed_at = $1, rating = $2, score = $3 WHERE id = $4 AND notebook_id = $5`,
    [nowISO(), rating, score, sessionId, notebookId]
  );
}

function computeTestedFields(ex: ExercisePayload): string | null {
  try {
    return JSON.stringify(ex.tested_field_refs ?? []);
  } catch {
    return null;
  }
}
