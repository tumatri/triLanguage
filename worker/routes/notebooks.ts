import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { createNotebookSchema, updateNotebookSchema } from '../schemas/notebooks';
import * as notebookRepo from '../repositories/notebook';

// Helper to extract user from context
function getUser(c: { var: { user?: UserSession }; env: Env }): { user: UserSession; env: Env } | null {
  const user = c.var?.user;
  if (!user) return null;
  return { user, env: c.env };
}

export const notebookRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// GET /api/notebooks
notebookRoutes.get('/', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const notebooks = await notebookRepo.listNotebooks(c.env, ctx.user.userId);
  return c.json({ notebooks });
});

// POST /api/notebooks
notebookRoutes.post('/', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const parsed = createNotebookSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const notebook = await notebookRepo.createNotebook(c.env, ctx.user.userId, parsed.data);
    return c.json({ notebook }, 201);
  } catch (err) {
    console.error('[notebooks/create] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/notebooks/:id
notebookRoutes.get('/:id', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('id');
  const notebook = await notebookRepo.getNotebook(c.env, ctx.user.userId, notebookId);

  if (!notebook) {
    return c.json({ error: 'Notebook not found' }, 404);
  }

  return c.json({ notebook });
});

// PUT /api/notebooks/:id
notebookRoutes.put('/:id', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('id');
  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const parsed = updateNotebookSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const notebook = await notebookRepo.updateNotebook(c.env, ctx.user.userId, notebookId, parsed.data);
  if (!notebook) {
    return c.json({ error: 'Notebook not found' }, 404);
  }

  return c.json({ notebook });
});

// DELETE /api/notebooks/:id — soft delete with confirmation
notebookRoutes.delete('/:id', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('id');
  const confirm = c.req.query('confirm');

  // Require explicit confirmation param
  if (confirm !== notebookId) {
    return c.json({ error: 'Confirmation required: pass ?confirm=<notebook-id>' }, 400);
  }

  const success = await notebookRepo.deleteNotebook(c.env, ctx.user.userId, notebookId);
  if (!success) {
    return c.json({ error: 'Notebook not found or already deleted' }, 404);
  }

  return c.json({ message: 'Notebook deleted', id: notebookId });
});

// DELETE /api/notebooks/:id/permanent — hard delete
notebookRoutes.delete('/:id/permanent', async (c) => {
  const ctx = getUser(c);
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('id');
  const stats = await notebookRepo.deleteNotebookPermanently(c.env, ctx.user.userId, notebookId);

  if (stats.cardsDeleted === 0 && stats.mediaDeleted === 0) {
    return c.json({ error: 'Notebook not found' }, 404);
  }

  return c.json({ message: 'Notebook permanently deleted', stats });
});
