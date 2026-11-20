/**
 * Interval bands per mastery level (proposed, pending owner approval).
 * These are PRODUCT POLICY bounds applied AFTER FSRS computes the raw interval.
 * Level governs the frame; FSRS tunes within that frame.
 *
 * TODO: Replace with finalized table after owner approves.
 */

export interface LevelIntervalBand {
  minDays: number;
  maxDays: number;
}

/**
 * Proposed interval bands per level (Architecture section 7.3).
 * Level 0 uses short learning steps handled separately by FSRS.
 */
export const LEVEL_INTERVAL_BANDS: Record<number, LevelIntervalBand> = {
  0: { minDays: 0, maxDays: 1 },          // learning steps; FSRS handles minutes internally
  1: { minDays: 0, maxDays: 2 },          // 10 phút – 2 ngày ≈ 0–2 days
  2: { minDays: 1, maxDays: 4 },
  3: { minDays: 2, maxDays: 10 },
  4: { minDays: 4, maxDays: 21 },
  5: { minDays: 7, maxDays: 45 },
  6: { minDays: 14, maxDays: 90 }
};

/**
 * Clamp an FSRS-computed interval (in days) into the band for the given level.
 * Returns { rawDays, clampedDays, wasClamped }.
 */
export function clampIntervalToLevel(
  level: number,
  rawDays: number
): { rawDays: number; clampedDays: number; wasClamped: boolean } {
  if (level < 0 || level > 6) {
    throw new Error(`Invalid mastery_level ${level}; must be 0–6`);
  }
  const band = LEVEL_INTERVAL_BANDS[level];
  const clamped = Math.max(band.minDays, Math.min(band.maxDays, rawDays));
  return {
    rawDays,
    clampedDays: clamped,
    wasClamped: clamped !== rawDays
  };
}

/**
 * Compute effective_due_at from now + clamped interval.
 */
export function computeEffectiveDueAt(clampedDays: number, now: Date = new Date()): Date {
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + Math.round(clampedDays));
  return due;
}
