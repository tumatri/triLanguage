import { Hono } from 'hono';
import type { Env, UserSession } from '../types';
import * as cardRepo from '../repositories/card';
import * as exerciseRepo from '../repositories/exercise';
import * as cardProgressRepo from '../repositories/cardProgress';
import { computeRequiredItemRefs, getUncoveredRefs, getSessionBudget, MAX_EXERCISES_PER_SESSION } from '../services/coverageEngine';
import { validateExerciseRefs } from '../services/exerciseValidator';
import { buildFlashcardTemplate, buildMcqTemplate } from '../services/templateExercises';
import type { FlashcardExercise, McqExercise } from '../schemas/exercises';
import { getDb } from '../lib/db';

function getUser(c: { var: { user?: UserSession }; env: Env }): UserSession | null {
  return c.var?.user ?? null;
}

export const exerciseSessionRoutes = new Hono<{ Bindings: Env; Variables: { user?: UserSession } }>();

exerciseSessionRoutes.get('/notebooks/:notebookId/cards/:cardId/sessions', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  const card = await cardRepo.getCard(c.env, user.userId, notebookId, cardId);
  if (!card) return c.json({ error: 'Card not found' }, 404);

  const db = getDb(c.env.DATABASE_URL);
  const result = await db.query(
    `SELECT id, mode, started_at, completed_at, rating, score, coverage_required_json, coverage_completed_json
     FROM exercise_sessions WHERE notebook_id = $1 AND card_id = $2 ORDER BY started_at DESC LIMIT 20`,
    [notebookId, cardId]
  );
  return c.json({ sessions: result });
});

exerciseSessionRoutes.post('/notebooks/:notebookId/cards/:cardId/sessions', async (c) => {
  const user = getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const notebookId = c.req.param('notebookId');
  const cardId = c.req.param('cardId');

  const card = await cardRepo.getCard(c.env, user.userId, notebookId, cardId);
  if (!card) return c.json({ error: 'Card not found' }, 404);

  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'Invalid request body' }, 400);

  const mode = (raw.mode as string) ?? 'review';
  if (!['learn', 'review', 'test', 'placement'].includes(mode)) {
    return c.json({ error: 'Invalid mode' }, 400);
  }

  const progress = await cardProgressRepo.getCardProgress(c.env, user.userId, notebookId, cardId);
  const masteryLevel = progress?.mastery_level ?? 0;
  const budget = getSessionBudget(masteryLevel);

  const fieldsJson = card.fields_json ? JSON.parse(card.fields_json) : {};
  const allRequiredRefs = computeRequiredItemRefs(fieldsJson);
  const uncoveredRefs = getUncoveredRefs(allRequiredRefs, [], []);

  const coreFirst = uncoveredRefs.filter((r) => r.priority === 'core');
  const secondaryFirst = uncoveredRefs.filter((r) => r.priority === 'secondary');
  const selectedRefs = [...coreFirst, ...secondaryFirst].slice(0, Math.min(budget, MAX_EXERCISES_PER_SESSION));

  if (selectedRefs.length === 0) {
    return c.json({ error: 'No fields with data to exercise', code: 'no_data' }, 400);
  }

  const exercises: Array<FlashcardExercise | McqExercise> = [];
  for (const ref of selectedRefs) {
    const mcq = buildMcqTemplate(card.front_text, fieldsJson, [ref.ref]);
    if (mcq) {
      exercises.push(mcq);
    } else {
      const fc = buildFlashcardTemplate(card.front_text, fieldsJson, [ref.ref]);
      exercises.push(fc);
    }
    if (exercises.length >= Math.min(budget, selectedRefs.length)) break;
  }

  for (const ex of exercises) {
    const declaredRefs = ex.tested_item_refs;
    const validation = validateExerciseRefs(fieldsJson, declaredRefs);
    if (!validation.valid) {
      console.warn('[exercise/session] Unexpected invalid refs in template exercise:', validation.invalidRefs);
    }
  }

  const coverageRequiredJson = JSON.stringify(allRequiredRefs.map((r) => r.ref));
  const result = await exerciseRepo.createExerciseSession(c.env, {
    ownerId: user.userId,
    notebookId,
    cardId,
    mode: mode as 'learn' | 'review' | 'test' | 'placement',
    exercises: exercises as any[],
    coverageRequiredJson,
    coverageCompletedJson: null
  });

  return c.json({
    success: true,
    session_id: result.sessionId,
    mode,
    budget,
    total_exercises: result.exercises.length,
    total_required_refs: allRequiredRefs.length,
    uncovered_refs_count: uncoveredRefs.length,
    exercises: result.exercises.map((e) => ({
      id: e.id,
      type: e.exercise_type,
      tested_item_refs: JSON.parse(e.payload_json).tested_item_refs
    }))
  }, 201);
});
