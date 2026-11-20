import { describe, it, expect } from 'vitest';
import { computePlacementFromAnswers } from '../../worker/services/placementTest';
import type { SkillName } from '../../worker/schemas/placement';

describe('placement test scoring', () => {
  it('returns neutral score with no answers', () => {
    const result = computePlacementFromAnswers([]);
    expect(result.totalQuestions).toBe(0);
    expect(result.completed).toBe(true);
    for (const skill of ['reading', 'listening', 'vocabulary', 'grammar'] as SkillName[]) {
      expect(result.estimates[skill]).toBe(50);
      expect(result.confidences[skill]).toBe(0);
    }
  });

  it('computes estimate from accuracy when all same difficulty', () => {
    const answers = Array.from({ length: 10 }, () => ({
      skill: 'vocabulary' as SkillName,
      difficulty: 3,
      correct: true
    }));
    const result = computePlacementFromAnswers(answers);
    expect(result.estimates['vocabulary']).toBeGreaterThan(50);
    expect(result.confidences['vocabulary']).toBeGreaterThan(0);
  });

  it('low accuracy produces low estimate', () => {
    const answers = Array.from({ length: 10 }, () => ({
      skill: 'reading' as SkillName,
      difficulty: 4,
      correct: false
    }));
    const result = computePlacementFromAnswers(answers);
    expect(result.estimates['reading']).toBeLessThan(50);
  });

  it('confidence scales with sample count', () => {
    const few = computePlacementFromAnswers([
      { skill: 'listening' as SkillName, difficulty: 3, correct: true }
    ]);
    const many = computePlacementFromAnswers(
      Array.from({ length: 20 }, () => ({
        skill: 'listening' as SkillName,
        difficulty: 3,
        correct: true
      }))
    );
    expect(many.confidences['listening']).toBeGreaterThan(few.confidences['listening']);
  });

  it('high difficulty + high accuracy yields higher estimate than low difficulty', () => {
    const easy = computePlacementFromAnswers(
      Array.from({ length: 10 }, () => ({
        skill: 'grammar' as SkillName, difficulty: 1, correct: true
      }))
    );
    const hard = computePlacementFromAnswers(
      Array.from({ length: 10 }, () => ({
        skill: 'grammar' as SkillName, difficulty: 6, correct: true
      }))
    );
    expect(hard.estimates['grammar']).toBeGreaterThan(easy.estimates['grammar']);
  });

  it('perfect performance caps estimate at 100 and confidence scales with volume', () => {
    // 20 perfect answers → estimate=100, confidence should be > 0
    const result = computePlacementFromAnswers(
      Array.from({ length: 20 }, () => ({
        skill: 'vocabulary' as SkillName, difficulty: 6, correct: true
      }))
    );
    expect(result.estimates['vocabulary']).toBe(100);
    // 20 samples falls in medium range (10-29), confidence ≈ 50
    expect(result.confidences['vocabulary']).toBeGreaterThanOrEqual(33);
  });

  it('very large sample set reaches high confidence (>=30 → high)', () => {
    const result = computePlacementFromAnswers(
      Array.from({ length: 35 }, () => ({
        skill: 'vocabulary' as SkillName, difficulty: 5, correct: true
      }))
    );
    // >=30 samples → confidence in high range (formula: 67 + ((35-30)/40)*33 ≈ 71)
    expect(result.confidences['vocabulary']).toBeGreaterThanOrEqual(67);
  });
});
