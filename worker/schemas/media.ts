import { z } from 'zod';

export const mediaTypeSchema = z.enum(['image', 'audio']);

export const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500 KB
export const MAX_AUDIO_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB
export const TOTAL_MEDIA_CLOUD_WARNING_BYTES = 200 * 1024 * 1024; // 200 MB warning
export const TOTAL_MEDIA_CLOUD_LIMIT_BYTES = 250 * 1024 * 1024; // 250 MB hard cap

const ALLOWED_IMAGE_MIMES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'
];
const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a'
];

export function validateMimeType(rawMime: string, expectedType: 'image' | 'audio'): { valid: boolean; reason?: string } {
  const mime = rawMime.toLowerCase().trim();
  const allowed = expectedType === 'image' ? ALLOWED_IMAGE_MIMES : ALLOWED_AUDIO_MIMES;
  if (!allowed.includes(mime)) {
    return { valid: false, reason: `MIME '${rawMime}' không được phép cho ${expectedType}` };
  }
  return { valid: true };
}

export function validateSize(byteSize: number, mediaType: 'image' | 'audio'): { valid: boolean; reason?: string } {
  const limit = mediaType === 'image' ? MAX_IMAGE_SIZE_BYTES : MAX_AUDIO_SIZE_BYTES;
  if (byteSize > limit) {
    const limitMB = (limit / 1024 / 1024).toFixed(1);
    return { valid: false, reason: `Kích thước ${(byteSize / 1024).toFixed(1)} KB vượt quá giới hạn ${limitMB} MB` };
  }
  return { valid: true };
}

// Upload input for client to send FormData
export const uploadMediaSchema = z.object({
  notebook_id: z.string().uuid(),
  card_id: z.string().uuid(),
  field_path: z.string().max(200).optional(),
  media_type: mediaTypeSchema
});

export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;
export type MediaLimits = {
  maxImageBytes: number;
  maxAudioBytes: number;
  totalWarningBytes: number;
  totalLimitBytes: number;
};

export const MEDIA_LIMITS: MediaLimits = {
  maxImageBytes: MAX_IMAGE_SIZE_BYTES,
  maxAudioBytes: MAX_AUDIO_SIZE_BYTES,
  totalWarningBytes: TOTAL_MEDIA_CLOUD_WARNING_BYTES,
  totalLimitBytes: TOTAL_MEDIA_CLOUD_LIMIT_BYTES
};
