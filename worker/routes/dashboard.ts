import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import * as cardProgressRepo from '../repositories/cardProgress';
import { getDb } from '../lib/db';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const dashboardRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

dashboardRoutes.get('/notebooks/:notebookId/dashboard', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const db = getDb(c.env.DATABASE_URL);

  const nbCheck = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, user.userId]
  );
  if (!nbCheck) return c.json({ error: 'Notebook not found' }, 404);

  const stats = await cardProgressRepo.getNotebookStats(c.env, notebookId);
  return c.json({
    total_cards: stats.totalCards,
    due_count: stats.dueCount,
    mastered_count: stats.masteredCount,
    learning_count: stats.learningCount,
    unseen_count: stats.unseenCount
  });
});

dashboardRoutes.get('/notebooks/:notebookId/due-cards', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const db = getDb(c.env.DATABASE_URL);

  const nbCheck = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, user.userId]
  );
  if (!nbCheck) return c.json({ error: 'Notebook not found' }, 404);

  const dueCards = await cardProgressRepo.listDueCards(c.env, notebookId);
  return c.json({ due_cards: dueCards });
});
