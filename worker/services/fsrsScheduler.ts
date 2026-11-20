/**
 * FSRS-6 scheduler adapter for triLanguage.
 *
 * Wraps ts-fsrs DefaultScheduler (version='FSRS-6') and exposes a deterministic
 * interface that never lets AI decide scheduling. All interval clamping is applied
 * by the Hybrid layer after FSRS returns its raw result.
 */

import type { DefaultScheduler, DefaultSchedulerCard, Rating } from 'ts-fsrs';
import { Rating as FsrsRating, DefaultScheduler as createDefaultScheduler } from 'ts-fsrs';

// Lazy singleton — scheduler instance created on first use to avoid top-level await issues
let _schedulerPromise: Promise<DefaultScheduler<'FSRS-6'>> | null = null;
let _scheduler: DefaultScheduler<'FSRS-6'> | null = null;

export interface FsrsState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
}

export interface ScheduleResult {
  dueAt: Date;
  state: FsrsState;
  fsrsRating: FsrRatingString;
  rawScheduledDays: number;
}

export type FsrRatingString = 'again' | 'hard' | 'good' | 'easy';

const RATING_MAP: Record<FsrRatingString, Rating> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy
};

const REVERSE_RATING_MAP: Record<Exclude<Rating, 0>, FsrRatingString> = {
  [FsrsRating.Again]: 'again',
  [FsrsRating.Hard]: 'hard',
  [FsrsRating.Good]: 'good',
  [FsrsRating.Easy]: 'easy'
};

async function getScheduler(): Promise<DefaultScheduler<'FSRS-6'>> {
  if (_scheduler) return _scheduler;
  if (!_schedulerPromise) {
    _schedulerPromise = createDefaultScheduler({
      version: 'FSRS-6',
      desiredRetention: 0.9,
      enableFuzz: false
    });
  }
  _scheduler = await _schedulerPromise;
  return _scheduler;
}

/**
 * Create a brand-new card (first time being studied).
 */
export async function createNewCard(): Promise<DefaultSchedulerCard<'FSRS-6'>> {
  const s = await getScheduler();
  return s.newCard({ now: new Date() });
}

/**
 * Apply one review to a card and return the updated card state + revlog.
 */
export async function reviewCard(
  card: DefaultSchedulerCard<'FSRS-6'>,
  rating: FsrRatingString,
  now: Date = new Date()
): Promise<{ card: DefaultSchedulerCard<'FSRS-6'>; revlogRating: FsrRatingString }> {
  const s = await getScheduler();
  const grade = RATING_MAP[rating] as Rating & Exclude<Rating, typeof FsrsRating.Manual>;
  const result = await s.review({ card, now, grade });
  const revlogGrade = result.revlog.rating as unknown as Exclude<Rating, 0>;
  const revlogRating = REVERSE_RATING_MAP[revlogGrade];
  return { card: result.card, revlogRating };
}

/**
 * Get the FSRS state snapshot from a card.
 */
export function getFsrsState(card: DefaultSchedulerCard<'FSRS-6'>): FsrsState {
  return {
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays
  };
}

/**
 * Serialize card state to plain object safe for JSON storage.
 */
export function serializeCard(card: DefaultSchedulerCard<'FSRS-6'>): Record<string, unknown> {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    state: card.state
  };
}

/**
 * Deserialize saved FSRS state back into a card input shape suitable for reviewCard.
 */
export function deserializeCard(raw: Record<string, unknown>): DefaultSchedulerCard<'FSRS-6'> {
  return {
    stability: typeof raw.stability === 'number' ? raw.stability : 0,
    difficulty: typeof raw.difficulty === 'number' ? raw.difficulty : 0,
    reps: typeof raw.reps === 'number' ? raw.reps : 0,
    lapses: typeof raw.lapses === 'number' ? raw.lapses : 0,
    scheduledDays: typeof raw.scheduledDays === 'number' ? raw.scheduledDays : 0,
    learningStep: typeof raw.learningStep === 'number' ? raw.learningStep : 0,
    state: typeof raw.state === 'number' ? raw.state : 0,
    scheduleStatus: 'review' as const,
    dueAt: raw.dueAt ? new Date(raw.dueAt as string) : new Date(),
    lastReviewAt: raw.lastReviewAt ? new Date(raw.lastReviewAt as string) : null,
    cardId: typeof raw.cardId === 'string' ? raw.cardId : '',
    id: typeof raw.id === 'string' ? raw.id : ''
  } as DefaultSchedulerCard<'FSRS-6'>;
}
