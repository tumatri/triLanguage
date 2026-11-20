import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { createCardSchema, updateCardSchema } from '../schemas/cards';
import * as cardRepo from '../repositories/card';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const cardRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// GET /api/notebooks/:notebookId/cards — danh sách thẻ trong sổ
cardRoutes.get('/notebooks/:notebookId/cards', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cards = await cardRepo.listCards(c.env, notebookId);
  return c.json({ cards });
});

// POST /api/notebooks/:notebookId/cards — tạo thẻ mới
cardRoutes.post('/notebooks/:notebookId/cards', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const parsed = createCardSchema.safeParse({ ...raw, notebook_id: notebookId });
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const result = await cardRepo.createCard(c.env, user.userId, notebookId, parsed.data);
    const status = result.isDuplicate ? 200 : 201;
    return c.json({ card: result.card, isDuplicate: result.isDuplicate }, status);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Notebook not found or access denied') {
      return c.json({ error: 'Notebook not found' }, 404);
    }
    console.error('[cards/create] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/notebooks/:notebookId/cards/:cardId
cardRoutes.get('/notebooks/:notebookId/cards/:cardId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');
  const card = await cardRepo.getCard(c.env, user.userId, notebookId, cardId);

  if (!card) {
    return c.json({ error: 'Card not found' }, 404);
  }

  return c.json({ card });
});

// PUT /api/notebooks/:notebookId/cards/:cardId
cardRoutes.put('/notebooks/:notebookId/cards/:cardId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const parsed = updateCardSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const card = await cardRepo.updateCard(c.env, user.userId, notebookId, cardId, parsed.data);
  if (!card) {
    return c.json({ error: 'Card not found' }, 404);
  }

  return c.json({ card });
});

// DELETE /api/notebooks/:notebookId/cards/:cardId
cardRoutes.delete('/notebooks/:notebookId/cards/:cardId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');
  const success = await cardRepo.deleteCard(c.env, user.userId, notebookId, cardId);

  if (!success) {
    return c.json({ error: 'Card not found' }, 404);
  }

  return c.json({ message: 'Card deleted', id: cardId });
});
