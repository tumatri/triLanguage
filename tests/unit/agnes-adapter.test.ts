import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callAgnes } from '../../worker/services/agnesAdapter';
import { cardEnrichmentOutputSchema } from '../../worker/schemas/ai';

// Mock setTimeout to avoid real delays in tests
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

vi.stubGlobal('setTimeout', (fn: () => void, ms: number) => realSetTimeout(fn, 0));
vi.stubGlobal('clearTimeout', realClearTimeout);

describe('Agnes adapter — error handling & retry', () => {
  const mockEnv = {
    AGNES_API_KEY: 'test-key-do-not-log',
    AGNES_BASE_URL: 'https://api.test.example.com/v1',
    AGNES_MODEL_FAST: 'agnes-test',
    AGNES_TIMEOUT_MS: '5000',
    AGNES_MAX_RPM: '12'
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth error when API key is missing', async () => {
    const env = { ...mockEnv, AGNES_API_KEY: '' };
    const result = await callAgnes(env, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('auth');
  });

  it('parses valid JSON response and validates against Zod schema', async () => {
    const validResponse = JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ phonetic: '/ˈæp.l/', word_type: 'noun' }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, headers: new Headers(), text: async () => validResponse
    });

    const result = await callAgnes(mockEnv, [{ role: 'user', content: ' enrich apple' }], cardEnrichmentOutputSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phonetic).toBe('/ˈæp.l/');
      expect(result.data.word_type).toBe('noun');
    }
  });

  it('rejects JSON that fails Zod validation', async () => {
    // Return clearly invalid structure — array instead of object
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify(['not an object']) } }]
      })
    });

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('invalid_json');
  });

  it('returns rate_limit error on HTTP 429', async () => {
    // Mock returns 429 for all attempts (exhaust retries)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429, headers: new Headers(), text: async () => 'Rate limited'
    });

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('rate_limit');
    }
  });

  it('returns server_error on HTTP 500 after exhausting retries', async () => {
    // Mock returns 500 for all attempts (exhaust retries)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500, headers: new Headers(), text: async () => 'Internal error'
    });

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('server_error');
    }
  });

  it('returns auth error on HTTP 401 (no retry)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 401, headers: new Headers(), text: async () => 'Unauthorized'
    });

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('auth');
      expect(result.error.retryable).toBe(false);
    }
    // Should NOT retry on 401
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not include API key in error messages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 500, headers: new Headers(), text: async () => 'Server error'
    });

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain('test-key');
    }
  });

  it('aborts and returns error when AbortSignal is triggered before fetch', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema, { abortSignal: controller.signal });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('unknown');
  });

  it('retries on 500 then succeeds on second attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers(), text: async () => 'err' })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ phonetic: null, word_type: null }) } }]
        })
      });
    (globalThis as any).fetch = fetchMock;

    const result = await callAgnes(mockEnv, [], cardEnrichmentOutputSchema);
    expect(result.success).toBe(true);
    // Should have called fetch twice (1 fail + 1 success)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('Zod schema validation — AI output contracts', () => {
  it('accepts valid enrichment payload', () => {
    const valid = {
      phonetic: '/ˈæp.l/',
      word_type: 'noun',
      meaning_vi: ['quả táo'],
      example_sentences: ['I eat an apple.'],
      example_translations: ['Tôi ăn một quả táo.']
    };
    const result = cardEnrichmentOutputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects enrichment with wrong type for string field', () => {
    const invalid = { phonetic: 123 as unknown as string };
    const result = cardEnrichmentOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = cardEnrichmentOutputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null values for optional fields', () => {
    const result = cardEnrichmentOutputSchema.safeParse({ phonetic: null, word_type: null });
    expect(result.success).toBe(true);
  });
});
