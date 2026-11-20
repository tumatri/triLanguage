import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { z } from 'zod';
import { getDb } from '../lib/db';

const outboxSyncItemSchema = z.object({
  id: z.string().uuid(),
  notebook_id: z.string().uuid(),
  operation: z.enum(['review_log', 'card_progress', 'exercise_session']),
  payload_json: z.string(),
  created_at: z.string(),
  synced_at: z.string().nullable(),
  attempt_count: z.number().int().min(0)
});

const outboxSyncRequestSchema = z.object({
  items: z.array(outboxSyncItemSchema)
});

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const syncRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

syncRoutes.post('/outbox', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  const parsed = outboxSyncRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const { items } = parsed.data;
  const db = getDb(c.env.DATABASE_URL);
  const processed: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const item of items) {
    const nbCheck = await db.maybeOne<{ id: string }>(
      `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [item.notebook_id, user.userId]
    );
    if (!nbCheck) {
      processed.push({ id: item.id, ok: false, error: 'Notebook not found' });
      continue;
    }

    try {
      const payload = JSON.parse(item.payload_json) as Record<string, unknown>;

      if (item.operation === 'review_log') {
        await db.none(
          `INSERT INTO review_logs (id, notebook_id, card_id, exercise_session_id, level_before, level_after, due_before, due_after, session_score, hint_count, reviewed_at, duration_ms, fsrs_rating)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(payload.id), String(payload.notebook_id), String(payload.card_id),
            payload.exercise_session_id ?? null,
            payload.level_before ?? null, payload.level_after ?? null,
            payload.due_before ?? null, payload.due_after ?? null,
            payload.session_score ?? null,
            payload.reviewed_at ?? new Date().toISOString(),
            payload.duration_ms ?? null, payload.fsrs_rating ?? null
          ]
        );
      } else if (item.operation === 'card_progress') {
        await db.none(
          `INSERT INTO card_progress (id, notebook_id, card_id, mastery_level, first_studied_at, last_review_at, next_review_at, last_session_score, consecutive_passes, consecutive_failures, fsrs_state_json, raw_interval_days, level_policy_version, fsrs_version, schedule_policy_version, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (notebook_id, card_id) DO UPDATE SET
             mastery_level = EXCLUDED.mastery_level,
             last_review_at = EXCLUDED.last_review_at,
             next_review_at = EXCLUDED.next_review_at,
             last_session_score = EXCLUDED.last_session_score,
             consecutive_passes = EXCLUDED.consecutive_passes,
             consecutive_failures = EXCLUDED.consecutive_failures,
             fsrs_state_json = EXCLUDED.fsrs_state_json,
             raw_interval_days = EXCLUDED.raw_interval_days,
             level_policy_version = EXCLUDED.level_policy_version,
             updated_at = EXCLUDED.updated_at`,
          [
            String(payload.id), String(payload.notebook_id), String(payload.card_id),
            payload.mastery_level ?? 0,
            payload.first_studied_at ?? null, payload.last_review_at ?? null,
            payload.next_review_at ?? null, payload.last_session_score ?? null,
            payload.consecutive_passes ?? 0, payload.consecutive_failures ?? 0,
            payload.fsrs_state_json ?? null, payload.raw_interval_days ?? null,
            payload.level_policy_version ?? null, payload.fsrs_version ?? 'FSRS-6',
            payload.schedule_policy_version ?? '1', new Date().toISOString()
          ]
        );
      } else if (item.operation === 'exercise_session') {
        await db.none(
          `INSERT INTO exercise_sessions (id, notebook_id, card_id, mode, started_at, completed_at, coverage_required_json, coverage_completed_json, rating, error_count, score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            String(payload.id), String(payload.notebook_id), String(payload.card_id),
            String(payload.mode ?? 'review'),
            String(payload.started_at ?? new Date().toISOString()),
            payload.completed_at ?? null,
            payload.coverage_required_json ?? null, payload.coverage_completed_json ?? null,
            payload.rating ?? null, payload.error_count ?? null, payload.score ?? null
          ]
        );
      }

      processed.push({ id: item.id, ok: true });
    } catch (err: unknown) {
      processed.push({ id: item.id, ok: false, error: String(err) });
    }
  }

  return c.json({ processed });
});
