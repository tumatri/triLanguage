import type { Env } from '../types';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

export interface ReviewLogRecord {
  id: string;
  notebook_id: string;
  card_id: string;
  exercise_session_id: string | null;
  level_before: number;
  level_after: number;
  due_before: string | null;
  due_after: string | null;
  session_score: number | null;
  field_scores_json: string | null;
  hint_count: number;
  reviewed_at: string;
  duration_ms: number | null;
  policy_version: string | null;
  fsrs_rating: string | null;
}

export async function insertReviewLog(
  env: Env,
  input: {
    notebookId: string;
    cardId: string;
    exerciseSessionId: string | null;
    levelBefore: number;
    levelAfter: number;
    dueBefore: string | null;
    dueAfter: string | null;
    sessionScore: number | null;
    fsrsRating: string | null;
    durationMs: number | null;
  }
): Promise<string> {
  const db = getDb(env.DATABASE_URL);
  const id = generateId();
  const reviewedAt = nowISO();

  await db.none(
    `INSERT INTO review_logs
     (id, notebook_id, card_id, exercise_session_id, level_before, level_after,
      due_before, due_after, session_score, hint_count, reviewed_at, duration_ms, fsrs_rating)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12)`,
    [
      id, input.notebookId, input.cardId, input.exerciseSessionId,
      input.levelBefore, input.levelAfter,
      input.dueBefore, input.dueAfter,
      input.sessionScore,
      reviewedAt, input.durationMs, input.fsrsRating
    ]
  );

  return id;
}

export async function listReviewLogs(
  env: Env, notebookId: string, cardId: string, limit = 50
): Promise<ReviewLogRecord[]> {
  const db = getDb(env.DATABASE_URL);
  return db.query<ReviewLogRecord>(
    `SELECT * FROM review_logs WHERE notebook_id = $1 AND card_id = $2 ORDER BY reviewed_at DESC LIMIT $3`,
    [notebookId, cardId, limit]
  );
}
