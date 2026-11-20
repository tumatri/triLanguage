/**
 * Supabase Storage service for media upload/download.
 * Replaces D1 BLOB column in media table — URLs stored instead of raw binary.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'media';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(url: string, anonKey: string): SupabaseClient {
  if (!_client) {
    _client = createClient(url, anonKey);
  }
  return _client;
}

export async function uploadMediaFile(
  client: SupabaseClient,
  notebookId: string,
  cardId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<{ url: string; path: string }> {
  const path = `${notebookId}/${cardId}/${fileName}`;
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(path, new Blob([fileBuffer], { type: mimeType }), {
      cacheControl: '3600',
      upsert: false
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: urlData } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl, path: data.path };
}

export async function deleteMediaFile(
  client: SupabaseClient,
  path: string
): Promise<void> {
  const { error } = await client.storage.from(STORAGE_BUCKET).remove([path]);
  if (error && error.statusCode !== '404') {
    console.warn('Delete media warning:', error.message);
  }
}

export async function getMediaUrl(
  client: SupabaseClient,
  path: string
): Promise<string> {
  const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? '';
}
