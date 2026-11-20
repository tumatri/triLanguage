import type { Env } from '../types';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';

export interface FsrsStateRaw {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
}

export interface CardProgressRecord {
  id: string;
  notebook_id: string;
  card_id: string;
  mastery_level: number;
  first_studied_at: string | null;
  last_review_at: string | null;
  next_review_at: string | null;
  last_session_score: number | null;
  consecutive_passes: number;
  consecutive_failures: number;
  schedule_policy_version: string;
  updated_at: string;
  fsrs_state_json: string | null;
  raw_interval_days: number | null;
  level_policy_version: string | null;
  fsrs_version: string | null;
}

async function verifyCardOwnership(
  env: Env, ownerId: string, notebookId: string, cardId: string
): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const row = await db.maybeOne<{ '1': number }>(
    `SELECT 1 FROM cards c JOIN notebooks n ON c.notebook_id = n.id
     WHERE c.id = $1 AND n.id = $2 AND n.user_id = $3 LIMIT 1`,
    [cardId, notebookId, ownerId]
  );
  return !!row;
}

export async function getCardProgress(
  env: Env, ownerId: string, notebookId: string, cardId: string
): Promise<CardProgressRecord | null> {
  const exists = await verifyCardOwnership(env, ownerId, notebookId, cardId);
  if (!exists) return null;

  const db = getDb(env.DATABASE_URL);
  return db.maybeOne<CardProgressRecord>(
    `SELECT * FROM card_progress WHERE notebook_id = $1 AND card_id = $2 LIMIT 1`,
    [notebookId, cardId]
  );
}

export async function upsertCardProgress(
  env: Env,
  input: {
    notebookId: string;
    cardId: string;
    masteryLevel: number;
    fsrsState: FsrsStateRaw;
    lastSessionScore: number | null;
    levelBefore: number;
    levelAfter: number;
    effectiveDueAt: Date;
    rawIntervalDays: number;
    fsrsVersion?: string;
  }
): Promise<CardProgressRecord> {
  const db = getDb(env.DATABASE_URL);
  const now = nowISO();
  const fsrsStateJson = JSON.stringify(input.fsrsState);
  const levelPolicyVersion = `${input.levelBefore}-${input.masteryLevel}`;

  const existing = await db.maybeOne<{
    id: string;
    ml: number;
    first_studied_at: string | null;
    consecutive_passes: number;
    consecutive_failures: number;
  }>(
    `SELECT id, mastery_level AS ml, first_studied_at, consecutive_passes, consecutive_failures
     FROM card_progress WHERE notebook_id = $1 AND card_id = $2 LIMIT 1`,
    [input.notebookId, input.cardId]
  );

  if (existing) {
    const newPasses = input.masteryLevel > existing.ml
      ? existing.consecutive_passes + 1
      : input.masteryLevel < existing.ml ? 0 : existing.consecutive_passes;
    const newFailures = input.masteryLevel > existing.ml
      ? 0
      : input.masteryLevel < existing.ml
        ? existing.consecutive_failures + 1
        : existing.consecutive_failures;

    await db.none(
      `UPDATE card_progress SET mastery_level = $1, last_review_at = $2, next_review_at = $3,
       last_session_score = $4, consecutive_passes = $5, consecutive_failures = $6,
       fsrs_state_json = $7, raw_interval_days = $8, level_policy_version = $9,
       fsrs_version = $10, updated_at = $11
       WHERE notebook_id = $12 AND card_id = $13`,
      [
        input.masteryLevel, now, input.effectiveDueAt.toISOString(),
        input.lastSessionScore, newPasses, newFailures,
        fsrsStateJson, input.rawIntervalDays, levelPolicyVersion,
        input.fsrsVersion ?? 'FSRS-6', now,
        input.notebookId, input.cardId
      ]
    );

    return {
      id: existing.id,
      notebook_id: input.notebookId, card_id: input.cardId,
      mastery_level: input.masteryLevel,
      first_studied_at: existing.first_studied_at,
      last_review_at: now, next_review_at: input.effectiveDueAt.toISOString(),
      last_session_score: input.lastSessionScore,
      consecutive_passes: newPasses, consecutive_failures: newFailures,
      schedule_policy_version: '1', updated_at: now,
      fsrs_state_json: fsrsStateJson,
      raw_interval_days: input.rawIntervalDays,
      level_policy_version: levelPolicyVersion,
      fsrs_version: input.fsrsVersion ?? 'FSRS-6'
    };
  } else {
    const id = generateId();
    const firstStudiedAt = now;
    const initPasses = input.masteryLevel > 0 ? 1 : 0;
    const initFailures = input.masteryLevel === 0 ? 1 : 0;

    await db.none(
      `INSERT INTO card_progress
       (id, notebook_id, card_id, mastery_level, first_studied_at, last_review_at, next_review_at,
        last_session_score, consecutive_passes, consecutive_failures,
        fsrs_state_json, raw_interval_days, level_policy_version, fsrs_version, schedule_policy_version, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, input.notebookId, input.cardId, input.masteryLevel,
        firstStudiedAt, now, input.effectiveDueAt.toISOString(),
        input.lastSessionScore, initPasses, initFailures,
        fsrsStateJson, input.rawIntervalDays,
        levelPolicyVersion, input.fsrsVersion ?? 'FSRS-6', '1', now
      ]
    );

    return {
      id, notebook_id: input.notebookId, card_id: input.cardId,
      mastery_level: input.masteryLevel,
      first_studied_at: firstStudiedAt, last_review_at: now,
      next_review_at: input.effectiveDueAt.toISOString(),
      last_session_score: input.lastSessionScore,
      consecutive_passes: initPasses, consecutive_failures: initFailures,
      schedule_policy_version: '1', updated_at: now,
      fsrs_state_json: fsrsStateJson,
      raw_interval_days: input.rawIntervalDays,
      level_policy_version: levelPolicyVersion,
      fsrs_version: input.fsrsVersion ?? 'FSRS-6'
    };
  }
}

export async function listDueCards(
  env: Env, notebookId: string, now: Date = new Date()
): Promise<Array<{ card_id: string; mastery_level: number; next_review_at: string | null }>> {
  const db = getDb(env.DATABASE_URL);
  return db.query(
    `SELECT card_id, mastery_level, next_review_at FROM card_progress
     WHERE notebook_id = $1 AND next_review_at IS NOT NULL
       AND next_review_at <= $2
       AND mastery_level < 6
     ORDER BY next_review_at ASC, mastery_level ASC`,
    [notebookId, now.toISOString()]
  );
}

export interface NotebookStats {
  totalCards: number;
  dueCount: number;
  masteredCount: number;
  learningCount: number;
  unseenCount: number;
}

export async function getNotebookStats(env: Env, notebookId: string): Promise<NotebookStats> {
  const db = getDb(env.DATABASE_URL);
  const totalResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM card_progress WHERE notebook_id = $1`, [notebookId]
  );
  const dueResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM card_progress WHERE notebook_id = $1 AND next_review_at <= $2 AND mastery_level < 6`,
    [notebookId, new Date().toISOString()]
  );
  const masteredResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM card_progress WHERE notebook_id = $1 AND mastery_level = 6`,
    [notebookId]
  );
  const unseenResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM cards c LEFT JOIN card_progress cp ON c.id = cp.card_id AND cp.notebook_id = $1
     WHERE c.notebook_id = $2 AND cp.id IS NULL AND c.archived_at IS NULL`,
    [notebookId, notebookId]
  );

  const totalCards = totalResult.cnt;
  const unseenCount = unseenResult.cnt;
  const masteredCount = masteredResult.cnt;
  const dueCount = dueResult.cnt;
  const learningCount = totalCards - unseenCount - masteredCount;

  return { totalCards, dueCount, masteredCount, learningCount, unseenCount };
}
