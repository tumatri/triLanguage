/**
 * Tutor explanation service — generates Vietnamese explanation for a card.
 *
 * Flow mirrors enrichment: cache → throttle → call Agnes → return explanation.
 */

import type { Env } from '../types';
import { z } from 'zod';
import { callAgnes, type ChatMessage } from './agnesAdapter';
import { checkThrottle } from './aiThrottle';
import { getCachedResponse, setCachedResponse, computeCacheKey, getCachableTtlMinutes } from './aiCache';
import { tutorExplanationOutputSchema } from '../schemas/ai';
import * as cardRepo from '../repositories/card';
import * as notebookRepo from '../repositories/notebook';

export interface TutorInput {
  notebookId: string;
  cardId: string;
}

export interface TutorResult {
  success: true;
  data: z.infer<typeof tutorExplanationOutputSchema>;
  source: 'cache' | 'ai';
}

export interface TutorError {
  success: false;
  error: {
    code: 'unauthorized' | 'not_found' | 'quota_exceeded' | 'ai_error';
    message: string;
    retryable?: boolean;
  };
}

export type TutorOutcome = TutorResult | TutorError;

const PROMPT_VERSION = 'v1';
const SCHEMA_VERSION = 'tutor.v1';

export async function explainCard(
  env: Env,
  ownerId: string,
  input: TutorInput
): Promise<TutorOutcome> {
  // 1. Verify ownership
  const notebook = await notebookRepo.getNotebook(env, ownerId, input.notebookId);
  if (!notebook) {
    return { success: false, error: { code: 'not_found', message: 'Notebook not found', retryable: false } };
  }

  const card = await cardRepo.getCard(env, ownerId, input.notebookId, input.cardId);
  if (!card) {
    return { success: false, error: { code: 'not_found', message: 'Card not found', retryable: false } };
  }

  // 2. Cache lookup
  const cacheKey = await computeCacheKey(
    'tutor', input.notebookId, notebook.language_variant,
    card.front_text, PROMPT_VERSION, SCHEMA_VERSION,
    env.AGNES_MODEL_FAST
  );
  const cached = await getCachedResponse(env, input.notebookId, cacheKey);
  if (cached) {
    try {
      const parsed = tutorExplanationOutputSchema.parse(JSON.parse(cached));
      return { success: true, data: parsed, source: 'cache' };
    } catch { /* cache corrupted — fall through */ }
  }

  // 3. Throttle check
  const throttleResult = await checkThrottle(env, input.notebookId, env.AGNES_MODEL_FAST);
  if (!throttleResult.allowed) {
    return {
      success: false,
      error: { code: 'quota_exceeded', message: 'AI tạm hết lượt. Vui lòng thử lại sau.', retryable: true }
    };
  }

  // 4. Build prompt
  const systemPrompt = `Bạn là trợ giảng ngôn ngữ. Giải thích thẻ học bằng tiếng Việt.
Ngôn ngữ đích: ${notebook.language_variant}.
Bám sát dữ liệu thẻ; phân biệt điều có trong thẻ với kiến thức bổ sung.
Đưa 1–3 ví dụ ngắn đúng biến thể vùng và bản dịch tiếng Việt.
Nếu không chắc về thông tin gì đó, hãy nói rõ và bỏ qua trường đó.
Trả JSON theo schema, không markdown.`;

  const userPrompt = `Thẻ cần giải thích:
- Từ/Câu: "${card.front_text}"
- Loại thẻ: ${card.card_type}
- Các trường hiện có: ${card.fields_json ?? '(chưa có)'}

Hãy giải thích thẻ này bằng tiếng Việt.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  // 5. Call Agnes
  const result = await callAgnes(env, messages, tutorExplanationOutputSchema, {
    model: env.AGNES_MODEL_FAST
  });

  if (!result.success) {
    const codeMap: Record<string, TutorError['error']['code']> = {
      timeout: 'ai_error', rate_limit: 'quota_exceeded', auth: 'ai_error',
      bad_request: 'ai_error', server_error: 'ai_error', invalid_json: 'ai_error'
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

  // 6. Cache
  await setCachedResponse(env, {
    notebookId: input.notebookId, cacheKey, task: 'tutor',
    modelId: env.AGNES_MODEL_FAST || null, promptVersion: PROMPT_VERSION,
    responseBody: JSON.stringify(result.data),
    ttlMinutes: getCachableTtlMinutes('tutor')
  });

  return { success: true, data: result.data, source: 'ai' };
}
