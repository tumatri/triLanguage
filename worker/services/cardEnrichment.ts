/**
 * Card enrichment service — fills missing fields via Agnes AI.
 *
 * Flow:
 * 1. Load card + notebook (verify ownership)
 * 2. Compute cache key from card content
 * 3. Check D1 cache → return cached if hit
 * 4. Throttle check → reject if quota exceeded
 * 5. Build prompt with missing fields only
 * 6. Call Agnes adapter with Zod validation
 * 7. Store result in cache
 * 8. Return enrichment data (not yet saved to card)
 */

import type { Env } from '../types';
import { z } from 'zod';
import { callAgnes, type ChatMessage } from './agnesAdapter';
import { checkThrottle } from './aiThrottle';
import { getCachedResponse, setCachedResponse, computeCacheKey, getCachableTtlMinutes } from './aiCache';
import { cardEnrichmentOutputSchema } from '../schemas/ai';
import * as cardRepo from '../repositories/card';
import * as notebookRepo from '../repositories/notebook';

export interface EnrichmentInput {
  notebookId: string;
  cardId: string;
  /** Which fields are currently empty/null — server computes this automatically if not provided */
  missingFields?: string[];
}

export interface EnrichmentResult {
  success: true;
  data: z.infer<typeof cardEnrichmentOutputSchema>;
  source: 'cache' | 'ai';
}

export interface EnrichmentError {
  success: false;
  error: {
    code: 'unauthorized' | 'not_found' | 'quota_exceeded' | 'ai_error' | 'validation_failed';
    message: string;
    retryable?: boolean;
  };
}

export type EnrichmentOutcome = EnrichmentResult | EnrichmentError;

const PROMPT_VERSION = 'v1';
const SCHEMA_VERSION = 'cardFields.v1';

export async function enrichCard(
  env: Env,
  ownerId: string,
  input: EnrichmentInput
): Promise<EnrichmentOutcome> {
  // 1. Verify ownership
  const notebook = await notebookRepo.getNotebook(env, ownerId, input.notebookId);
  if (!notebook) {
    return { success: false, error: { code: 'not_found', message: 'Notebook not found', retryable: false } };
  }

  const card = await cardRepo.getCard(env, ownerId, input.notebookId, input.cardId);
  if (!card) {
    return { success: false, error: { code: 'not_found', message: 'Card not found', retryable: false } };
  }

  // Parse existing fields_json to determine missing fields
  const existingFields = parseFieldsJson(card.fields_json);
  const missingFields = input.missingFields ?? computeMissingFields(existingFields);

  if (missingFields.length === 0) {
    return { success: false, error: { code: 'validation_failed', message: 'No missing fields to enrich', retryable: false } };
  }

  // 2. Cache lookup
  const contentDigest = computeContentDigest(card.front_text, existingFields);
  const cacheKey = await computeCacheKey(
    'enrich', input.notebookId, notebook.language_variant,
    contentDigest, PROMPT_VERSION, SCHEMA_VERSION,
    env.AGNES_MODEL_FAST
  );
  const cached = await getCachedResponse(env, input.notebookId, cacheKey);
  if (cached) {
    try {
      const parsed = cardEnrichmentOutputSchema.parse(JSON.parse(cached));
      return { success: true, data: parsed, source: 'cache' };
    } catch { /* cache corrupted — fall through to AI */ }
  }

  // 3. Throttle check
  const throttleResult = await checkThrottle(env, input.notebookId, env.AGNES_MODEL_FAST);
  if (!throttleResult.allowed) {
    return {
      success: false,
      error: { code: 'quota_exceeded', message: 'AI tạm hết lượt. Vui lòng thử lại sau.', retryable: true }
    };
  }

  // 4. Build system + user messages
  const systemPrompt = buildEnrichmentSystemPrompt(notebook.language_variant, missingFields);
  const userPrompt = buildEnrichmentUserPrompt(card.front_text, existingFields);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  // 5. Call Agnes
  const result = await callAgnes(env, messages, cardEnrichmentOutputSchema, {
    model: env.AGNES_MODEL_FAST
  });

  if (!result.success) {
    // Map adapter errors to user-friendly codes
    const codeMap: Record<string, EnrichmentError['error']['code']> = {
      timeout: 'ai_error',
      rate_limit: 'quota_exceeded',
      auth: 'ai_error',
      bad_request: 'ai_error',
      server_error: 'ai_error',
      invalid_json: 'ai_error'
    };
    return {
      success: false,
      error: {
        code: codeMap[result.error.code] ?? 'ai_error',
        message: result.error.message,
        retryable: result.error.retryable ?? false
      }
    };
  }

  // 6. Cache the result
  await setCachedResponse(env, {
    notebookId: input.notebookId,
    cacheKey,
    task: 'enrich',
    modelId: env.AGNES_MODEL_FAST || null,
    promptVersion: PROMPT_VERSION,
    responseBody: JSON.stringify(result.data),
    ttlMinutes: getCachableTtlMinutes('enrich')
  });

  return { success: true, data: result.data, source: 'ai' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFieldsJson(fieldsJson: string | null): Record<string, unknown> {
  if (!fieldsJson) return {};
  try {
    return JSON.parse(fieldsJson) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function computeMissingFields(existing: Record<string, unknown>): string[] {
  const allFields = [
    'phonetic', 'word_type', 'meaning_vi',
    'synonyms', 'antonyms', 'collocations',
    'example_sentences', 'example_phonetics', 'example_translations'
  ];
  return allFields.filter(f => {
    const val = existing[f];
    if (val === null || val === undefined) return true;
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'string') return val.trim() === '';
    return false;
  });
}

function computeContentDigest(frontText: string, fields: Record<string, unknown>): string {
  // Simple digest: combine front + sorted field keys that have values
  const entries = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  const combined = `${frontText}|${entries.map(([k, v]) => `${k}:${JSON.stringify(v)}`).join(';')}`;
  return combined.slice(0, 500); // truncate for hash input
}

function buildEnrichmentSystemPrompt(languageVariant: string, missingFields: string[]): string {
  return `Bạn là trợ giảng ngôn ngữ. Ngôn ngữ đích là ${languageVariant}, giải thích bằng tiếng Việt.

Chỉ điền các trường nằm trong danh sách sau: ${missingFields.join(', ')}. Tuyệt đối không sửa nội dung người dùng đã nhập.

Quy tắc:
- Dùng cách nói tự nhiên đúng biến thể vùng (${languageVariant}).
- Mỗi câu ví dụ PHẢI có bản dịch tiếng Việt riêng trong example_translations.
- Không bịa phiên âm; nếu không chắc, trả null và nêu lý do trong phản hồi.
- Trả về JSON khớp schema được cung cấp, không bao gồm markdown hay text bên ngoài.`;
}

function buildEnrichmentUserPrompt(frontText: string, existingFields: Record<string, unknown>): string {
  const existingSummary = Object.entries(existingFields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${JSON.stringify(v).slice(0, 100)}`)
    .join('\n');

  return `Front text: "${frontText}"

Existing fields (do not modify):
${existingSummary || '(none)'}

Please fill in only the missing fields and return valid JSON.`;
}
