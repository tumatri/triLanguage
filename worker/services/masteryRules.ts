/**
 * Mastery rule engine — deterministic rating → level change mapping.
 *
 * These rules are PROPOSED and pending owner approval per Architecture Appendix E.
 * Once approved, replace these constants with the finalized mapping.
 */

export type FsrRating = 'again' | 'hard' | 'good' | 'easy';

export const MIN_LEVEL = 0;
export const MAX_LEVEL = 6;

/**
 * Proposed level delta per final session rating.
 * - Again: decrease by 1 (floor at 0)
 * - Hard: keep same level
 * - Good: increase by 1 (cap at 6)
 * - Easy: increase by 1 (cap at 6)
 *
 * TODO: Replace after owner approves the finalized mapping.
 */
export const LEVEL_DELTA: Record<FsrRating, number> = {
  again: -1,
  hard: 0,
  good: 1,
  easy: 1
};

/**
 * Maximum level increase per session (Appendix G.2).
 */
export const MAX_LEVEL_INCREMENT_PER_SESSION = 1;

/**
 * Apply rating to compute the new mastery level.
 * Respects min/max bounds AND the one-level-per-session cap.
 */
export function computeNewLevel(
  currentLevel: number,
  finalRating: FsrRating
): number {
  const delta = LEVEL_DELTA[finalRating];
  // Apply proposed delta
  let proposed = currentLevel + delta;
  // Clamp to [MIN_LEVEL, MAX_LEVEL]
  proposed = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, proposed));
  // Enforce max +1 per session (G.2) — only applies when delta is positive
  if (delta > 0 && proposed > currentLevel + MAX_LEVEL_INCREMENT_PER_SESSION) {
    proposed = currentLevel + MAX_LEVEL_INCREMENT_PER_SESSION;
  }
  return proposed;
}
