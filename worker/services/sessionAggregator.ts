/**
 * Session aggregator — combines multiple exercise scores into one final FSRS rating.
 * Implements Annex F.2 / F.3 scoring rules deterministically (no AI involvement).
 */

/**
 * Component score per exercise (F.2 normalization):
 * - Flashcard: Again≥3errors→0, 2errors→1, 1error→2, 0errors→3
 * - MCQ: wrong→0, right→3
 */
export type ComponentScore = 0 | 1 | 2 | 3;

/** Final FSRS rating for a session (F.3 buckets on mean_score). */
export type FsrRating = 'again' | 'hard' | 'good' | 'easy';

const RATING_THRESHOLDS: Array<{ maxExclusive: number; rating: FsrRating }> = [
  { maxExclusive: 0.50, rating: 'again' },
  { maxExclusive: 1.50, rating: 'hard' },
  { maxExclusive: 2.50, rating: 'good' },
  { maxExclusive: Infinity, rating: 'easy' }
];

/**
 * Aggregate completed exercise component scores into a final rating.
 * - Only counts completed exercises; incomplete exercises are ignored entirely.
 * - No rounding before classification (G.1).
 * - Returns null when there are zero completed exercises (session should not create a review event).
 */
export function aggregateSessionScores(
  componentScores: number[]
): { finalRating: FsrRating; meanScore: number; completedCount: number } | null {
  const validScores = componentScores
    .filter((s): s is ComponentScore => s >= 0 && s <= 3);
  if (validScores.length === 0) {
    return null;
  }
  let sum = 0;
  for (const s of validScores) sum += s;
  const meanScore = sum / validScores.length; // unrounded per G.1
  const finalRating = classifyMeanScore(meanScore);
  return { finalRating, meanScore, completedCount: validScores.length };
}

function classifyMeanScore(meanScore: number): FsrRating {
  for (const bucket of RATING_THRESHOLDS) {
    if (meanScore < bucket.maxExclusive) {
      return bucket.rating;
    }
  }
  return 'easy';
}

/**
 * Determine if the session had any completed exercises (needed to decide whether
 * to create a review event at all).
 */
export function hasCompletedExercises(scores: number[]): boolean {
  return scores.some((s) => s >= 0 && s <= 3);
}
