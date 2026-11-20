import type { Env } from '../types';
import { getDb } from '../lib/db';

export interface QuotaMetrics {
  notebookId: string;
  totalCardCount: number;
  totalMediaBytes: number;
  totalSessions: number;
  totalReviewLogs: number;
  warningThresholdBytes: number;
  hardLimitBytes: number;
  warnings: string[];
}

export async function getQuotaMetrics(env: Env, notebookId: string): Promise<QuotaMetrics> {
  const db = getDb(env.DATABASE_URL);
  const MEDIA_WARNING_BYTES = 200 * 1024 * 1024;
  const MEDIA_HARD_LIMIT_BYTES = 250 * 1024 * 1024;

  const cardCount = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM cards WHERE notebook_id = $1 AND archived_at IS NULL`, [notebookId]
  );
  const mediaResult = await db.one<{ total: number }>(
    `SELECT COALESCE(SUM(byte_size), 0) as total FROM media WHERE notebook_id = $1`, [notebookId]
  );
  const sessionsResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM exercise_sessions WHERE notebook_id = $1`, [notebookId]
  );
  const reviewsResult = await db.one<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM review_logs WHERE notebook_id = $1`, [notebookId]
  );

  const mediaBytes = mediaResult.total;
  const warnings: string[] = [];
  if (mediaBytes >= MEDIA_HARD_LIMIT_BYTES) {
    warnings.push('Tổng dung lượng media đã đạt trần 250 MB — upload mới bị chặn.');
  } else if (mediaBytes >= MEDIA_WARNING_BYTES) {
    warnings.push(`Dung lượng media ${(mediaBytes / 1024 / 1024).toFixed(1)} MB — đang逼近 giới hạn 250 MB.`);
  }

  return {
    notebookId,
    totalCardCount: cardCount.cnt,
    totalMediaBytes: mediaBytes,
    totalSessions: sessionsResult.cnt,
    totalReviewLogs: reviewsResult.cnt,
    warningThresholdBytes: MEDIA_WARNING_BYTES,
    hardLimitBytes: MEDIA_HARD_LIMIT_BYTES,
    warnings
  };
}
