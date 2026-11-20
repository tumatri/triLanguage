import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { z } from 'zod';
import { enrichCard, type EnrichmentInput } from '../services/cardEnrichment';

const enrichRequestSchema = z.object({
  missing_fields: z.array(z.string()).optional()
});

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const enrichmentRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// POST /api/notebooks/:notebookId/cards/:cardId/enrich
enrichmentRoutes.post('/notebooks/:notebookId/cards/:cardId/enrich', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  const raw = await c.req.json().catch(() => null);
  const parsed = enrichRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const input: EnrichmentInput = {
    notebookId,
    cardId,
    missingFields: parsed.data.missing_fields
  };

  const result = await enrichCard(c.env, user.userId, input);

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
