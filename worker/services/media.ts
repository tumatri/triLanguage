import type { Env } from '../types';
import { generateId, nowISO } from '../lib/crypto';
import { getDb } from '../lib/db';
import { uploadMediaFile, getSupabaseClient, deleteMediaFile } from './mediaStorage';
import type { UploadMediaInput } from '../schemas/media';
import { validateMimeType, validateSize } from '../schemas/media';

export interface MediaRecord {
  id: string;
  notebook_id: string;
  card_id: string;
  field_path: string | null;
  media_type: 'image' | 'audio';
  mime: string;
  byte_size: number;
  sha256: string;
  blob_url: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
}

export async function uploadMedia(
  env: Env,
  ownerId: string,
  input: UploadMediaInput,
  fileBuffer: ArrayBuffer,
  options: { width?: number; height?: number; durationMs?: number } = {}
): Promise<{ media: MediaRecord; error?: string }> {
  const db = getDb(env.DATABASE_URL);

  // 1. Verify notebook ownership
  const notebook = await db.maybeOne<{ id: string }>(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.notebook_id, ownerId]
  );
  if (!notebook) return { media: null as any, error: 'Notebook not found' };

  // 2. Verify card belongs to same notebook
  const card = await db.maybeOne<{ id: string }>(
    `SELECT id FROM cards WHERE id = $1 AND notebook_id = $2 LIMIT 1`,
    [input.card_id, input.notebook_id]
  );
  if (!card) return { media: null as any, error: 'Card not found in notebook' };

  // 3. Validate MIME type
  const mime = input.media_type === 'image' ? guessMimeFromBuffer(fileBuffer) : 'audio/mpeg';
  const mimeCheck = validateMimeType(mime, input.media_type);
  if (!mimeCheck.valid) return { media: null as any, error: mimeCheck.reason };

  // 4. Validate size
  const sizeBytes = fileBuffer.byteLength;
  const sizeValidation = validateSize(sizeBytes, input.media_type);
  if (!sizeValidation.valid) return { media: null as any, error: sizeValidation.reason };

  // 5. Compute SHA-256 checksum
  const sha256 = await computeSha256(fileBuffer);

  // 6. Check total media budget (from DB stored sizes)
  const totalUsed = await getNotebookTotalMediaBytes(env, input.notebook_id);
  if (totalUsed + sizeBytes > 250 * 1024 * 1024) {
    return { media: null as any, error: 'Tổng dung lượng media vượt quá giới hạn 250 MB' };
  }

  // 7. Upload to Supabase Storage and get URL
  const fileName = `${generateId()}.${mime.split('/')[1] ?? 'bin'}`;
  const supabase = getSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { url: blobUrl } = await uploadMediaFile(supabase, input.notebook_id, input.card_id, fileBuffer, mime, fileName);

  // 8. Insert metadata into PostgreSQL
  const id = generateId();
  const createdAt = nowISO();

  await db.none(
    `INSERT INTO media (id, notebook_id, card_id, field_path, media_type, mime, byte_size, sha256, blob_url, width, height, duration_ms, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, input.notebook_id, input.card_id, input.field_path ?? null,
      input.media_type, mime, sizeBytes, sha256, blobUrl,
      options.width ?? null, options.height ?? null, options.durationMs ?? null,
      createdAt
    ]
  );

  return {
    media: {
      id, notebook_id: input.notebook_id, card_id: input.card_id,
      field_path: input.field_path ?? null, media_type: input.media_type,
      mime, byte_size: sizeBytes, sha256, blob_url: blobUrl,
      width: options.width ?? null, height: options.height ?? null,
      duration_ms: options.durationMs ?? null, created_at: createdAt
    }
  };
}

export async function getMedia(env: Env, notebookId: string, mediaId: string): Promise<MediaRecord | null> {
  const db = getDb(env.DATABASE_URL);
  return db.maybeOne<MediaRecord>(
    `SELECT id, notebook_id, card_id, field_path, media_type, mime, byte_size, sha256, blob_url, width, height, duration_ms, created_at
     FROM media WHERE id = $1 AND notebook_id = $2 LIMIT 1`,
    [mediaId, notebookId]
  );
}

export async function deleteMedia(env: Env, notebookId: string, mediaId: string): Promise<boolean> {
  const db = getDb(env.DATABASE_URL);
  const row = await db.maybeOne<MediaRecord>(
    `SELECT id, blob_url FROM media WHERE id = $1 AND notebook_id = $2 LIMIT 1`,
    [mediaId, notebookId]
  );
  if (!row) return false;

  // Delete file from Supabase Storage if URL exists
  if (row.blob_url) {
    try {
      const client = await import('./mediaStorage');
      const supabase = client.getSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      const path = row.blob_url.split('/storage/v1/object/public/media/')[1];
      if (path) await deleteMediaFile(supabase, path);
    } catch { /* ignore storage deletion errors */ }
  }

  await db.none(`DELETE FROM media WHERE id = $1 AND notebook_id = $2`, [mediaId, notebookId]);
  return true;
}

export async function getNotebookTotalMediaBytes(env: Env, notebookId: string): Promise<number> {
  const db = getDb(env.DATABASE_URL);
  const result = await db.one<{ total: number }>(
    `SELECT COALESCE(SUM(byte_size), 0) as total FROM media WHERE notebook_id = $1`,
    [notebookId]
  );
  return result.total;
}

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Buffer.from(hashBuffer).toString('hex');
}

function guessMimeFromBuffer(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer.slice(0, 16));
  const bytes = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join('');
  if (bytes.startsWith('ffd8ff')) return 'image/jpeg';
  if (bytes.startsWith('89504e47')) return 'image/png';
  if (bytes.startsWith('47494638')) return 'image/gif';
  if (bytes.startsWith('52494646') && bytes.substring(8, 12) === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}
