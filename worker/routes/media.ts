import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { uploadMedia, getMedia, deleteMedia, getNotebookTotalMediaBytes } from '../services/media';
import { MEDIA_LIMITS, mediaTypeSchema } from '../schemas/media';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const mediaRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// GET /api/notebooks/:notebookId/media/total-bytes — kiểm tra tổng dung lượng media
mediaRoutes.get('/notebooks/:notebookId/media/total-bytes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const totalBytes = await getNotebookTotalMediaBytes(c.env, notebookId);
  return c.json({ total_bytes: totalBytes, limits: MEDIA_LIMITS });
});

// POST /api/notebooks/:notebookId/cards/:cardId/media — upload media BLOB
mediaRoutes.post('/notebooks/:notebookId/cards/:cardId/media', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  // Parse FormData
  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const file = formData.get('file') as File | null;
  const fieldPath = formData.get('field_path') as string | null;
  const mediaTypeRaw = formData.get('media_type') as string | null;

  if (!file) {
    return c.json({ error: 'Missing file' }, 400);
  }

  const mediaTypeResult = mediaTypeSchema.safeParse(mediaTypeRaw);
  if (!mediaTypeResult.success) {
    return c.json({ error: 'Invalid media_type' }, 400);
  }

  const buffer = await file.arrayBuffer();

  const result = await uploadMedia(c.env, user.userId, {
    notebook_id: notebookId,
    card_id: cardId,
    field_path: fieldPath ?? undefined,
    media_type: mediaTypeResult.data
  }, buffer);

  if (result.error) {
    const status = result.error.includes('not found') ? 404 : 400;
    return c.json({ error: result.error }, status);
  }

  return c.json({ media: result.media }, 201);
});

// GET /api/notebooks/:notebookId/media/:mediaId
mediaRoutes.get('/notebooks/:notebookId/media/:mediaId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const mediaId = c.req.param('mediaId');
  const media = await getMedia(c.env, notebookId, mediaId);

  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  // Return metadata only (not blob) — blob served via Supabase Storage URL
  const mediaMetadata = { ...media };
  delete (mediaMetadata as any).blob_data;
  return c.json({ media: mediaMetadata });
});

// DELETE /api/notebooks/:notebookId/media/:mediaId
mediaRoutes.delete('/notebooks/:notebookId/media/:mediaId', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const mediaId = c.req.param('mediaId');
  const success = await deleteMedia(c.env, notebookId, mediaId);

  if (!success) {
    return c.json({ error: 'Media not found' }, 404);
  }

  return c.json({ message: 'Media deleted' });
});
