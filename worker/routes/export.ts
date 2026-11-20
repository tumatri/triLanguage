import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import * as notebookRepo from '../repositories/notebook';

const EXPORT_VERSION = '1.0.0';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const exportRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// GET /api/export/notebooks
exportRoutes.get('/notebooks', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebooks = await notebookRepo.listNotebooks(c.env, user.userId);
  const exportData = {
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    notebooks: notebooks.map((n) => ({
      id: n.id,
      name: n.name,
      language_variant: n.language_variant,
      timezone: n.timezone,
      created_at: n.created_at,
      updated_at: n.updated_at
    }))
  };
  return c.json(exportData);
});

// GET /api/export/backup
exportRoutes.get('/backup', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebooks = await notebookRepo.listNotebooks(c.env, user.userId);
  const exportData = {
    app: 'triLanguage',
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    owner_id: user.userId,
    notebooks_count: notebooks.length,
    notebooks: notebooks.map((n) => ({
      id: n.id,
      name: n.name,
      language_variant: n.language_variant,
      timezone: n.timezone,
      created_at: n.created_at,
      updated_at: n.updated_at
    }))
  };
  return c.json(exportData);
});
