/**
 * Hybrid scheduler — composes mastery level rules with FSRS-6 interval computation.
 *
 * Flow (per Architecture §9.1):
 * 1. Aggregate session scores → final_rating
 * 2. Apply mastery rule: level_before → level_after
 * 3. Run FSRS-6 with final_rating → raw scheduledDays
 * 4. Clamp raw interval to [level_after_min, level_after_max]
 * 5. Compute effective_due_at from clamped days
 * 6. Store both raw and effective values for auditability
 */

import {
  computeNewLevel,
  MAX_LEVEL_INCREMENT_PER_SESSION,
  MIN_LEVEL,
  MAX_LEVEL
} from './masteryRules';
import { aggregateSessionScores, type FsrRating } from './sessionAggregator';
import {
  reviewCard,
  deserializeCard,
  getFsrsState,
  type FsrsState
} from './fsrsScheduler';
import { clampIntervalToLevel, computeEffectiveDueAt } from './intervalBands';

export interface ReviewInput {
  notebookId: string;
  cardId: string;
  componentScores: number[];
  fsrsState: FsrsState;
  levelBefore: number;
  now?: Date;
}

export interface ReviewResult {
  levelBefore: number;
  levelAfter: number;
  finalRating: FsrRating;
  meanScore: number;
  completedCount: number;
  fsrsRawIntervalDays: number;
  fsrsClampedIntervalDays: number;
  wasIntervalClamped: boolean;
  effectiveDueAt: Date;
  fsrsStateAfter: FsrsState;
  /** true if no exercises were completed → no review event should be written */
  hasCompletedExercises: boolean;
}

/**
 * Process a completed exercise session for one card and return all derived values.
 * Returns null if there are no completed exercises (no review event to write).
 */
export async function processReview(
  input: ReviewInput
): Promise<ReviewResult | null> {
  const aggregation = aggregateSessionScores(input.componentScores);
  if (!aggregation) {
    // No completed exercises → skip review event creation per F.1
    return {
      levelBefore: input.levelBefore,
      levelAfter: input.levelBefore,
      finalRating: 'again' as FsrRating,
      meanScore: 0,
      completedCount: 0,
      fsrsRawIntervalDays: 0,
      fsrsClampedIntervalDays: 0,
      wasIntervalClamped: false,
      effectiveDueAt: new Date(),
      fsrsStateAfter: input.fsrsState,
      hasCompletedExercises: false
    };
  }

  const { finalRating, meanScore, completedCount } = aggregation;

  // Step 2: determine level_after
  const levelAfter = computeNewLevel(input.levelBefore, finalRating);

  // Validate: max +1 per session (G.2)
  if (levelAfter > input.levelBefore + MAX_LEVEL_INCREMENT_PER_SESSION) {
    throw new Error(
      `Level increased by more than 1 in one session: ${input.levelBefore}→${levelAfter}. ` +
      `This violates Appendix G.2.`
    );
  }
  if (levelAfter < MIN_LEVEL || levelAfter > MAX_LEVEL) {
    throw new Error(`Computed level_after ${levelAfter} out of bounds [0,6]`);
  }

  // Step 3 & 4: FSRS-6 review then clamp
  const cardInput = deserializeCard(serializeCardState(input.fsrsState));
  const { card: updatedCard } = await reviewCard(cardInput, finalRating, input.now);
  const stateAfter = getFsrsState(updatedCard);

  const rawIntervalDays = updatedCard.scheduledDays ?? 0;
  const { clampedDays, wasClamped } = clampIntervalToLevel(levelAfter, rawIntervalDays);
  const effectiveDueAt = computeEffectiveDueAt(clampedDays, input.now);

  return {
    levelBefore: input.levelBefore,
    levelAfter,
    finalRating,
    meanScore,
    completedCount,
    fsrsRawIntervalDays: rawIntervalDays,
    fsrsClampedIntervalDays: clampedDays,
    wasIntervalClamped: wasClamped,
    effectiveDueAt,
    fsrsStateAfter: stateAfter,
    hasCompletedExercises: true
  };
}

/**
 * Convert FsrsState to a plain object that can be passed back into reviewCard.
 * Uses the same shape as serialized card state.
 */
function serializeCardState(state: FsrsState): Record<string, unknown> {
  return {
    stability: state.stability,
    difficulty: state.difficulty,
    reps: state.reps,
    lapses: state.lapses,
    scheduledDays: state.scheduledDays,
    learningStep: 0,
    state: 1, // review state (not new/learning)
    scheduleStatus: 'review',
    dueAt: new Date().toISOString(),
    lastReviewAt: new Date().toISOString()
  };
}
