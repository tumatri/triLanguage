import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { explainCard } from '../services/tutorExplanation';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const tutorRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// POST /api/notebooks/:notebookId/cards/:cardId/tutor
tutorRoutes.post('/notebooks/:notebookId/cards/:cardId/tutor', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  const result = await explainCard(c.env, user.userId, { notebookId, cardId });

  if (!result.success) {
    const status = result.error.code === 'quota_exceeded' ? 503 : 404;
    return c.json({ error: result.error.message, code: result.error.code }, status);
  }

  return c.json({
    success: true,
    source: result.source,
    data: result.data
  });
});
