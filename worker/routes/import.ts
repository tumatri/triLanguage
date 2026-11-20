import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { createImportSchema } from '../schemas/import';
import { runImport } from '../services/import';
import { getDb } from '../lib/db';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const importRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

importRoutes.post('/notebooks/:notebookId/import', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const contentType = c.req.header('content-type') ?? '';

  let fileContent: string;
  let rawBody: Record<string, unknown> = {};

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData().catch(() => null);
    const file = formData?.get('file') as File | null;
    if (!file) return c.json({ error: 'Missing file' }, 400);
    fileContent = await file.text();
  } else {
    const parsed = await c.req.json().catch(() => null);
    if (!parsed || typeof parsed.content !== 'string') {
      return c.json({ error: 'Invalid request: provide file content or multipart upload' }, 400);
    }
    fileContent = parsed.content as string;
    rawBody = Object.fromEntries(Object.entries(parsed).filter(([k]) => k !== 'content'));
  }

  const parsed = createImportSchema.safeParse({ ...rawBody, notebook_id: notebookId });
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  try {
    const result = await runImport(c.env, user.userId, parsed.data, fileContent);
    return c.json(result);
  } catch (err: unknown) {
    console.error('[import] Error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

importRoutes.get('/jobs', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.query('notebook_id');
  const db = getDb(c.env.DATABASE_URL);

  let sql = `SELECT id, notebook_id, file_name, format, total_rows, inserted_rows, duplicate_rows, error_rows, status, created_at FROM import_jobs WHERE notebook_id IN (SELECT id FROM notebooks WHERE user_id = $1) ORDER BY created_at DESC LIMIT 50`;
  const params: unknown[] = [user.userId];

  if (notebookId) {
    sql = `SELECT id, notebook_id, file_name, format, total_rows, inserted_rows, duplicate_rows, error_rows, status, created_at FROM import_jobs WHERE notebook_id = $1 AND notebook_id IN (SELECT id FROM notebooks WHERE user_id = $2) ORDER BY created_at DESC LIMIT 50`;
    params.unshift(notebookId);
  }

  const result = await db.query(sql, params);
  return c.json({ jobs: result });
});
