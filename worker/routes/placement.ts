import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { z } from 'zod';
import * as placementSvc from '../services/placementTest';
import * as skillProfileRepo from '../repositories/skillProfile';
import { getDb } from '../lib/db';

const ANSWER_SCHEMA = z.object({
  skill: z.enum(['reading', 'listening', 'vocabulary', 'grammar']),
  difficulty: z.number().int().min(1).max(6),
  correct: z.boolean()
});

const placementRequestSchema = z.object({
  notebook_id: z.string().uuid(),
  answers: z.array(ANSWER_SCHEMA).min(1).max(30)
});

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const placementRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

placementRoutes.post('/', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  const parsed = placementRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const { notebook_id, answers } = parsed.data;

  try {
    const result = await placementSvc.persistPlacementResults(c.env, user.userId, notebook_id, answers);
    return c.json({ success: true, estimates: result.estimates, confidences: result.confidences, total_questions: result.totalQuestions });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Notebook not found') {
      return c.json({ error: 'Notebook not found' }, 404);
    }
    console.error('[placement] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

placementRoutes.get('/profiles/:notebookId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const db = getDb(c.env.DATABASE_URL);

  const nb = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, user.userId]
  );
  if (!nb) return c.json({ error: 'Notebook not found' }, 404);

  const profiles = await skillProfileRepo.getSkillProfiles(c.env, notebookId);
  return c.json({ profiles });
});
