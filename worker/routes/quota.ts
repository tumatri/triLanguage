import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { getQuotaMetrics } from '../services/quotaDashboard';
import { getDb } from '../lib/db';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const quotaRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

quotaRoutes.get('/:notebookId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const db = getDb(c.env.DATABASE_URL);

  const nb = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [notebookId, user.userId]
  );
  if (!nb) return c.json({ error: 'Notebook not found' }, 404);

  const metrics = await getQuotaMetrics(c.env, notebookId);
  return c.json(metrics);
});
