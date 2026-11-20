import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import { z } from 'zod';
import * as cardRepo from '../repositories/card';
import * as cardProgressRepo from '../repositories/cardProgress';
import * as reviewLogRepo from '../repositories/reviewLog';
import { processReview } from '../services/hybridScheduler';

/**
 * Zod schema for completing an exercise session on a single card.
 * Component scores: 0=Again, 1=Hard, 2=Good, 3=Easy per flashcard self-assessment.
 * For MCQ: 0=wrong(Again), 3=right(Easy).
 */
const completeExerciseSchema = z.object({
  notebook_id: z.string().uuid(),
  card_id: z.string().uuid(),
  component_scores: z.array(z.number().int().min(0).max(3)).min(1).max(10),
  duration_ms: z.number().int().min(0).optional(),
  hint_count: z.number().int().min(0).default(0)
});

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const exerciseRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

// POST /api/notebooks/:notebookId/cards/:cardId/exercises/complete
exerciseRoutes.post('/notebooks/:notebookId/cards/:cardId/exercises/complete', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  // Verify card ownership before processing
  const card = await cardRepo.getCard(c.env, user.userId, notebookId, cardId);
  if (!card) return c.json({ error: 'Card not found' }, 404);

  const raw = await c.req.json().catch(() => null);
  const parsed = completeExerciseSchema.safeParse({ ...raw, notebook_id: notebookId, card_id: cardId });
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.errors }, 400);
  }

  const input = parsed.data;

  // Get current progress
  const progress = await cardProgressRepo.getCardProgress(c.env, user.userId, notebookId, cardId);
  const levelBefore = progress?.mastery_level ?? 0;
  const fsrsStateRaw = progress?.fsrs_state_json
    ? JSON.parse(progress.fsrs_state_json)
    : { stability: 0, difficulty: 0, reps: 0, lapses: 0, scheduledDays: 0 };

  // Save due_before for audit
  const dueBefore = progress?.next_review_at ?? null;

  // Process through hybrid scheduler
  const result = await processReview({
    notebookId,
    cardId,
    componentScores: input.component_scores as number[],
    fsrsState: fsrsStateRaw,
    levelBefore,
    now: new Date()
  });

  if (!result) {
    // No completed exercises — still record the attempt but skip FSRS update
    return c.json({
      message: 'No completed exercises in session; no review event created',
      levelBefore,
      levelAfter: levelBefore,
      hasCompletedExercises: false
    }, 200);
  }

  // Upsert card_progress with new level + FSRS state
  const updatedProgress = await cardProgressRepo.upsertCardProgress(c.env, {
    notebookId,
    cardId,
    masteryLevel: result.levelAfter,
    fsrsState: result.fsrsStateAfter,
    lastSessionScore: Math.round(result.meanScore * 100), // store as centi-points for precision
    levelBefore: result.levelBefore,
    levelAfter: result.levelAfter,
    effectiveDueAt: result.effectiveDueAt,
    rawIntervalDays: result.fsrsClampedIntervalDays,
    fsrsVersion: 'FSRS-6'
  });

  // Insert review log
  await reviewLogRepo.insertReviewLog(c.env, {
    notebookId,
    cardId,
    exerciseSessionId: null, // Phase 5 will populate this
    levelBefore: result.levelBefore,
    levelAfter: result.levelAfter,
    dueBefore,
    dueAfter: result.effectiveDueAt.toISOString(),
    sessionScore: Math.round(result.meanScore * 100),
    fsrsRating: result.finalRating,
    durationMs: input.duration_ms ?? null
  });

  return c.json({
    success: true,
    levelBefore: result.levelBefore,
    levelAfter: result.levelAfter,
    finalRating: result.finalRating,
    meanScore: result.meanScore,
    completedCount: result.completedCount,
    fsrsRawIntervalDays: result.fsrsRawIntervalDays,
    fsrsClampedIntervalDays: result.fsrsClampedIntervalDays,
    wasIntervalClamped: result.wasIntervalClamped,
    effectiveDueAt: result.effectiveDueAt.toISOString(),
    nextReviewAt: updatedProgress.next_review_at,
    masteryLevel: updatedProgress.mastery_level,
    consecutivePasses: updatedProgress.consecutive_passes,
    consecutiveFailures: updatedProgress.consecutive_failures
  }, 200);
});

// GET /api/notebooks/:notebookId/cards/:cardId/progress
exerciseRoutes.get('/notebooks/:notebookId/cards/:cardId/progress', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  const progress = await cardProgressRepo.getCardProgress(c.env, user.userId, notebookId, cardId);
  if (!progress) {
    return c.json({ error: 'Progress not found' }, 404);
  }

  return c.json({ progress });
});

// GET /api/notebooks/:notebookId/cards/:cardId/reviews — recent review logs
exerciseRoutes.get('/notebooks/:notebookId/cards/:cardId/reviews', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

  const logs = await reviewLogRepo.listReviewLogs(c.env, notebookId, cardId, limit);
  return c.json({ reviews: logs });
});
