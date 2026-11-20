/**
 * Placement test service — adaptive difficulty assessment for new notebooks.
 *
 * Scoring is fully deterministic (no AI). The test adapts by adjusting difficulty
 * level based on previous answers, producing an internal score 0–100 per skill
 * with confidence derived from sample count.
 */

import type { SkillName } from '../schemas/placement';
import { upsertSkillProfile } from '../repositories/skillProfile';
import type { Env } from '../types';

/**
 * Run a simulated placement test and return estimated scores + confidence.
 * In production this would present questions to the user and collect answers.
 * Here we simulate the adaptive logic for testing.
 */
export interface PlacementResult {
  estimates: Record<SkillName, number>;
  confidences: Record<SkillName, number>;
  totalQuestions: number;
  completed: boolean;
}

/**
 * Simulate the placement algorithm deterministically.
 * This function is designed to be called during backend processing after
 * real user responses are collected via the frontend placement flow.
 */
export function computePlacementFromAnswers(
  answers: Array<{ skill: SkillName; difficulty: number; correct: boolean }>
): PlacementResult {
  const skills = ['reading', 'listening', 'vocabulary', 'grammar'] as SkillName[];
  const estimates: Record<SkillName, number> = {} as Record<SkillName, number>;
  const confidences: Record<SkillName, number> = {} as Record<SkillName, number>;

  for (const skill of skills) {
    const skillAnswers = answers.filter((a) => a.skill === skill);
    if (skillAnswers.length === 0) {
      estimates[skill] = 50; // neutral default
      confidences[skill] = 0; // no data
      continue;
    }

    // Compute accuracy-weighted score
    const correctCount = skillAnswers.filter((a) => a.correct).length;
    const total = skillAnswers.length;
    const accuracy = correctCount / total;

    // Map accuracy to estimate (0–100), factoring in difficulty weight
    let difficultyWeight = 0;
    for (const a of skillAnswers) {
      difficultyWeight += a.difficulty;
    }
    const avgDifficulty = difficultyWeight / total;
    // Higher difficulty answered correctly → higher estimate
    const baseScore = accuracy * 60; // max 60 from raw accuracy
    const difficultyBonus = (avgDifficulty / 6) * 40; // up to 40 from difficulty
    const estimate = Math.round(Math.min(100, Math.max(0, baseScore + difficultyBonus)));

    // Confidence based on sample count (Architecture §6 proposal: <10 low, 10–29 medium, >=30 high)
    let confidence: number;
    if (total < 10) {
      confidence = Math.round((total / 10) * 33); // 0–33
    } else if (total < 30) {
      confidence = 33 + Math.round(((total - 10) / 20) * 34); // 33–67
    } else {
      confidence = 67 + Math.round(((total - 30) / 40) * 33); // 67–100, capped
    }
    confidence = Math.min(100, confidence);

    estimates[skill] = estimate;
    confidences[skill] = confidence;
  }

  return {
    estimates,
    confidences,
    totalQuestions: answers.length,
    completed: true
  };
}

/**
 * Persist placement results into skill_profiles table.
 * Called after the user completes the placement test UI flow.
 */
export async function persistPlacementResults(
  env: Env,
  ownerId: string,
  notebookId: string,
  answers: Array<{ skill: SkillName; difficulty: number; correct: boolean }>
): Promise<PlacementResult> {
  const result = computePlacementFromAnswers(answers);

  for (const skill of Object.keys(result.estimates) as SkillName[]) {
    await upsertSkillProfile(
      env,
      notebookId,
      skill,
      result.estimates[skill],
      result.confidences[skill],
      answers.filter((a) => a.skill === skill).length,
      null // accuracy_30d computed later from review history
    );
  }

  return result;
}
