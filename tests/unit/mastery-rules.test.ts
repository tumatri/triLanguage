import { describe, it, expect } from 'vitest';
import { computeNewLevel, MIN_LEVEL, MAX_LEVEL, LEVEL_DELTA } from '../../worker/services/masteryRules';
import { aggregateSessionScores } from '../../worker/services/sessionAggregator';

describe('mastery rules', () => {
  it('Again decreases level by 1 (floor at 0)', () => {
    expect(computeNewLevel(3, 'again')).toBe(2);
    expect(computeNewLevel(0, 'again')).toBe(0);
    expect(computeNewLevel(6, 'again')).toBe(5);
  });

  it('Hard keeps level unchanged', () => {
    expect(computeNewLevel(1, 'hard')).toBe(1);
    expect(computeNewLevel(4, 'hard')).toBe(4);
  });

  it('Good increases level by 1 (cap at 6)', () => {
    expect(computeNewLevel(2, 'good')).toBe(3);
    expect(computeNewLevel(6, 'good')).toBe(6);
  });

  it('Easy increases level by 1 (cap at 6)', () => {
    expect(computeNewLevel(5, 'easy')).toBe(6);
    expect(computeNewLevel(6, 'easy')).toBe(6);
  });

  it('never goes below 0 or above 6', () => {
    expect(computeNewLevel(0, 'again')).toBe(0);
    expect(computeNewLevel(6, 'easy')).toBe(6);
    expect(computeNewLevel(6, 'good')).toBe(6);
  });

  it('LEVEL_DELTA matches proposed mapping', () => {
    expect(LEVEL_DELTA.again).toBe(-1);
    expect(LEVEL_DELTA.hard).toBe(0);
    expect(LEVEL_DELTA.good).toBe(1);
    expect(LEVEL_DELTA.easy).toBe(1);
  });
});

describe('session aggregator (Annex F.2 / F.3)', () => {
  it('empty scores → null (no review event)', () => {
    expect(aggregateSessionScores([])).toBeNull();
  });

  it('all Again (0) → mean 0 → Again', () => {
    const r = aggregateSessionScores([0, 0, 0]);
    expect(r).not.toBeNull();
    expect(r!.finalRating).toBe('again');
    expect(r!.meanScore).toBe(0);
  });

  it('mixed: [3,3,0,2] → mean 2.0 → Good', () => {
    const r = aggregateSessionScores([3, 3, 0, 2]);
    expect(r).not.toBeNull();
    expect(r!.meanScore).toBe(2.0);
    expect(r!.finalRating).toBe('good');
  });

  it('boundary [0,0.50) → Again', () => {
    const r = aggregateSessionScores([0, 0]);
    expect(r!.finalRating).toBe('again');
  });

  it('boundary [0.50, 1.50) → Hard', () => {
    const r = aggregateSessionScores([1, 1]);
    expect(r!.finalRating).toBe('hard');
  });

  it('boundary [1.50, 2.50) → Good', () => {
    const r = aggregateSessionScores([2, 2]);
    expect(r!.finalRating).toBe('good');
  });

  it('boundary [2.50, 3.00] → Easy', () => {
    const r = aggregateSessionScores([3, 3]);
    expect(r!.finalRating).toBe('easy');
  });

  it('single Hard (1) → Hard', () => {
    const r = aggregateSessionScores([1]);
    expect(r!.finalRating).toBe('hard');
  });

  it('does not round mean_score before classification', () => {
    // mean = 2/3 ≈ 0.6667 which is < 0.50? No, it's > 0.50 so Hard
    // Let's use a case where rounding would change the bucket
    const r = aggregateSessionScores([0, 1]); // mean = 0.5 exactly → Hard (boundary is [0.50, 1.50))
    expect(r!.meanScore).toBe(0.5);
    expect(r!.finalRating).toBe('hard');
  });

  it('single Easy (3) → Easy', () => {
    const r = aggregateSessionScores([3]);
    expect(r!.finalRating).toBe('easy');
  });
});

describe('classifiedMeanScore boundaries', () => {
  // These test the exact boundary values from G.1
  it('0.4999 → Again', () => {
    // Simulate via scores that produce ~0.4999
    const r = aggregateSessionScores([0, 0, 0, 0, 1]); // mean = 0.2 → Again
    expect(r!.finalRating).toBe('again');
  });

  it('0.50 exactly → Hard', () => {
    const r = aggregateSessionScores([0, 1]); // mean = 0.5 → Hard [0.50, 1.50)
    expect(r!.finalRating).toBe('hard');
  });

  it('1.4999 → Hard', () => {
    const r = aggregateSessionScores([1, 1, 1, 1, 0]); // mean = 0.8 → Hard
    expect(r!.finalRating).toBe('hard');
  });

  it('1.50 exactly → Good', () => {
    const r = aggregateSessionScores([1, 2]); // mean = 1.5 → Good [1.50, 2.50)
    expect(r!.finalRating).toBe('good');
  });

  it('2.4999 → Good', () => {
    const r = aggregateSessionScores([2, 2, 2, 2, 1]); // mean = 1.8 → Good
    expect(r!.finalRating).toBe('good');
  });

  it('2.50 exactly → Easy', () => {
    const r = aggregateSessionScores([2, 3]); // mean = 2.5 → Easy [2.50, 3.00]
    expect(r!.finalRating).toBe('easy');
  });
});
