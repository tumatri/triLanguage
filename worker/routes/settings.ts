import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { z } from 'zod';

const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';

/**
 * Zod schema for user-submitted Agnes configuration.
 * Validated server-side before accepting any change.
 */
export const agnesConfigSchema = z.object({
  api_key: z.string().min(10).max(512).describe('Agnes API key (sk-...)'),
  base_url: z.string().url().refine(
    (url) => {
      const parsed = new URL(url);
      // Only allow known Agnes domains to prevent open redirect / SSRF
      return parsed.hostname.endsWith('agnes-ai.com') ||
             parsed.hostname === 'localhost' ||
             parsed.hostname === '127.0.0.1';
    },
    { message: 'Chỉ cho phép tên miền agnes-ai.com hoặc localhost' }
  ),
  model_fast: z.string().min(1).max(100).default('agnes-2.5-flash'),
  timeout_ms: z.number().int().min(5000).max(120000).default(45000),
  max_rpm: z.number().int().min(1).max(100).default(12)
});

export type AgnesConfigInput = z.infer<typeof agnesConfigSchema>;

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// GET /api/settings/agnes — trả về cấu hình hiện tại (không expose key)
settingsRoutes.get('/agnes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  return c.json({
    base_url: c.env.AGNES_BASE_URL || AGNES_BASE_URL,
    model_fast: c.env.AGNES_MODEL_FAST || 'agnes-2.5-flash',
    timeout_ms: parseInt(c.env.AGNES_TIMEOUT_MS || '45000', 10),
    max_rpm: parseInt(c.env.AGNES_MAX_RPM || '12', 10),
    key_present: !!c.env.AGNES_API_KEY,
    // Explicitly do NOT return the key
    key_masked: maskApiKey(c.env.AGNES_API_KEY)
  });
});

// PATCH /api/settings/agnes — cập nhật cấu hình (chỉ accepts runtime override)
// NOTE: This changes runtime behavior via env var simulation using a session-scoped cache.
// In production Wrangler, env vars are immutable per-deploy. The UI flow below stores config
// client-side and passes it as headers to each AI call instead.
settingsRoutes.patch('/agnes', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 401);

  const parsed = agnesConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  // Validate key format (must start with sk- for Agnes)
  if (!parsed.data.api_key.startsWith('sk-')) {
    return c.json({ error: 'API key phải bắt đầu bằng sk-' }, 400);
  }

  // In this architecture, the client passes its own config per-request via headers.
  // Server-side we store nothing — config lives in the user's browser localStorage.
  // We return 200 with ack only after validation passes.
  return c.json({ success: true, message: 'Cấu hình đã được xác nhận hợp lệ' });
});

// POST /api/settings/agnes/test — test kết nối với Agnes mà không lưu
settingsRoutes.post('/agnes/test', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const parsed = agnesConfigSchema.omit({ max_rpm: true }).safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const { api_key, base_url, model_fast, timeout_ms } = parsed.data;

  // Call Agnes with the submitted key to verify it works
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

    const resp = await fetch(`${base_url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({
        model: model_fast,
        messages: [{ role: 'user', content: 'Reply with {"ok":true}' }],
        max_tokens: 32
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const text = await resp.text();
      return c.json({
        success: false,
        error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
        status: resp.status
      }, 400);
    }

    await resp.json(); // consume body to avoid connection leak

    return c.json({ success: true, message: 'Kết nối thành công', model: model_fast });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('AbortError')) {
      return c.json({ success: false, error: 'Request timeout' }, 408);
    }
    return c.json({ success: false, error: msg }, 500);
  }
});

function maskApiKey(key: string): string {
  if (!key || key.length < 6) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
