/**
 * Agnes AI adapter — OpenAI-compatible chat endpoint.
 *
 * All calls go server-side; API key never leaves the Worker environment.
 * Supports timeout, exponential backoff on 429/5xx, and structured Zod validation.
 */

import type { Env } from '../types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AdapterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  /** Extra headers to include (e.g., for auth) */
  extraHeaders?: Record<string, string>;
}

export interface AdapterResponse<T = unknown> {
  success: true;
  data: T;
  model: string;
  /** Number of tokens used (approximate) */
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface AdapterError {
  success: false;
  error: {
    code: 'timeout' | 'rate_limit' | 'auth' | 'bad_request' | 'server_error' | 'invalid_json' | 'unknown';
    message: string;
    status?: number;
    retryable?: boolean;
  };
}

export type AdapterResult<T> = AdapterResponse<T> | AdapterError;

const DEFAULT_MODEL = 'agnes-1.5-flash';
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2_000;

function jitter(minMs: number, maxMs: number): number {
  return minMs + Math.random() * (maxMs - minMs);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Agnes chat completions endpoint with retry logic.
 * Returns parsed JSON via Zod or an error.
 */
export async function callAgnes<T>(
  env: Env,
  messages: ChatMessage[],
  outputSchema: { parse: (raw: unknown) => T },
  options: AdapterOptions = {}
): Promise<AdapterResult<T>> {
  const model = options.model ?? env.AGNES_MODEL_FAST ?? DEFAULT_MODEL;
  const baseUrl = env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
  const apiKey = env.AGNES_API_KEY;
  const timeoutMs = parseInt(env.AGNES_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10);

  if (!apiKey) {
    return {
      success: false,
      error: { code: 'auth', message: 'AGNES_API_KEY not configured', retryable: false }
    };
  }

  let lastError: AdapterError['error'] | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Check abort signal
    if (options.abortSignal?.aborted) {
      return {
        success: false,
        error: { code: 'unknown', message: 'Request aborted by client', retryable: false }
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...options.extraHeaders
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 2048,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle non-OK status
      if (!response.ok) {
        const status = response.status;
        const isRetryable = [429, 500, 502, 503, 520].includes(status);

        if (status === 401) {
          return {
            success: false,
            error: { code: 'auth', message: 'Agnes authentication failed', retryable: false }
          };
        }
        if (status === 400) {
          return {
            success: false,
            error: { code: 'bad_request', message: `Agnes returned 400: ${await response.text().catch(() => '')}`, retryable: false }
          };
        }

        if (!isRetryable) {
          return {
            success: false,
            error: { code: 'server_error', message: `Agnes HTTP ${status}`, retryable: false }
          };
        }

        // Compute retry delay with exponential backoff + jitter
        const retryAfterHeader = response.headers.get('Retry-After');
        let delayMs: number;
        if (retryAfterHeader) {
          delayMs = parseInt(retryAfterHeader, 10) * 1000;
          if (isNaN(delayMs)) delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        } else {
          delayMs = jitter(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
                           INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) * 2);
        }

        lastError = {
          code: status === 429 ? 'rate_limit' : 'server_error',
          message: `Agnes ${status}`,
          status,
          retryable: true
        };

        if (attempt < MAX_RETRIES) {
          await sleep(delayMs);
          continue;
        }
        break;
      }

      // Parse response
      const text = await response.text();
      let json: { choices?: Array<{ message?: { content?: string } }> } & { usage?: { prompt_tokens: number; completion_tokens: number } };
      try {
        json = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: { code: 'invalid_json', message: `Agnes returned invalid JSON: ${text.slice(0, 200)}`, retryable: false }
        };
      }

      const choice = json.choices?.[0]?.message?.content;
      if (!choice) {
        return {
          success: false,
          error: { code: 'server_error', message: 'Agnes returned empty response', retryable: false }
        };
      }

      // Extract and validate against Zod schema
      try {
        const cleanContent = stripMarkdownCodeFence(choice);
        const parsed = outputSchema.parse(JSON.parse(cleanContent));
        return {
          success: true,
          data: parsed,
          model,
          usage: json.usage
        };
      } catch (parseErr) {
        // JSON parsed but didn't match schema — most LLMs hallucinate slightly
        return {
          success: false,
          error: {
            code: 'invalid_json',
            message: `AI output failed Zod validation: ${(parseErr as Error).message}`,
            retryable: false
          }
        };
      }

    } catch (err: unknown) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      lastError = {
        code: isTimeout ? 'timeout' : 'server_error',
        message: isTimeout ? `Request timed out after ${timeoutMs}ms` : String(err),
        retryable: !isTimeout && attempt < MAX_RETRIES
      };

      if (attempt >= MAX_RETRIES) break;
      await sleep(jitter(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
                         INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt) * 2));
    }
  }

  return {
    success: false,
    error: lastError ?? { code: 'unknown', message: 'Unknown adapter error', retryable: false }
  };
}

/**
 * Strip markdown code fences (```json ... ```) that some LLMs wrap around JSON output.
 * Returns the inner content so JSON.parse can succeed.
 */
function stripMarkdownCodeFence(raw: string): string {
  const trimmed = raw.trim();
  // Match ```lang\n{...}\n``` or just ```\n{...}\n```
  const fenceRegex = /^```(?:[a-z]+)?\s*\n?(.*?)\n?\s*```$/is;
  const match = fenceRegex.exec(trimmed);
  if (match && match[1]) return match[1].trim();
  return trimmed;
}

