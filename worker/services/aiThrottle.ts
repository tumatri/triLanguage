import type { Env } from '../types';
import { getDb } from '../lib/db';

const DEFAULT_MAX_RPM = 12;
const WINDOW_MS = 60_000;

export interface RateLimitState {
  windowStart: string;
  requestCount: number;
  nextAllowedAt: string | null;
}

export async function checkThrottle(
  env: Env,
  notebookId: string,
  modelId: string
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const db = getDb(env.DATABASE_URL);
  const maxRpm = parseInt(env.AGNES_MAX_RPM ?? String(DEFAULT_MAX_RPM), 10);
  const now = new Date();
  const windowStart = new Date(now.getTime() - (now.getTime() % WINDOW_MS));

  const existing = await db.maybeOne<Record<string, unknown>>(
    `SELECT window_start, request_count, next_allowed_at FROM ai_rate_limits
     WHERE notebook_id = $1 AND provider = 'agnes' AND model_id = $2 AND window_start = $3`,
    [notebookId, modelId, windowStart.toISOString()]
  );

  if (!existing) {
    await db.none(
      `INSERT INTO ai_rate_limits (id, notebook_id, provider, model_id, window_start, request_count, next_allowed_at)
       VALUES ($1,$2,'agnes',$3,$4,1,NULL)`,
      [crypto.randomUUID(), notebookId, modelId, windowStart.toISOString()]
    );
    return { allowed: true };
  }

  const count = (existing.request_count as number) ?? 0;
  const nextAllowedAt = existing.next_allowed_at as string | null;

  if (count >= maxRpm) {
    if (nextAllowedAt) {
      const remaining = new Date(nextAllowedAt).getTime() - now.getTime();
      return { allowed: false, retryAfterMs: Math.max(remaining, 1000) };
    }
    return { allowed: false, retryAfterMs: WINDOW_MS };
  }

  await db.none(
    `UPDATE ai_rate_limits SET request_count = request_count + 1,
     next_allowed_at = CASE WHEN request_count + 1 >= $1 THEN NOW() + interval '1 minute' ELSE NULL END
     WHERE notebook_id = $2 AND provider = 'agnes' AND model_id = $3 AND window_start = $4`,
    [maxRpm, notebookId, modelId, windowStart.toISOString()]
  );

  return { allowed: true };
}
