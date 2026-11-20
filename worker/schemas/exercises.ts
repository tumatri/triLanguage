import { z } from 'zod';

/**
 * Schema cho flashcard exercise.
 * - front_content / back_content: nội dung thẻ (dựng từ card fields)
 * - tested_field_refs[]: các field item được kiểm tra (VD: "synonyms.0.value", "meaning_vi.1")
 * - tested_item_refs[]: cùng danh sách但以 item-level ref
 * - media_refs[]: IDs của media được nhúng
 * - expected_content_refs[]: refs của đáp án đúng (cho đối chiếu)
 */
export const flashcardExerciseSchema = z.object({
  exercise_type: z.literal('flashcard'),
  front_content: z.string().min(1).max(5000),
  back_content: z.string().min(1).max(10000),
  tested_field_refs: z.array(z.string().min(1).max(200)),
  tested_item_refs: z.array(z.string().min(1).max(200)),
  media_refs: z.array(z.string().uuid()).default([]),
  expected_content_refs: z.array(z.string().min(1).max(200)).default([]),
  schema_version: z.string().default('1')
});

/**
 * Schema cho MCQ exercise sinh bởi AI hoặc template.
 * - options[4]: đúng 4 phương án, mỗi cái có id + text
 * - correct_option_id: một trong 4 option IDs
 * - explanation_vi: giải thích bằng tiếng Việt
 * - tested_field_refs[], tested_item_refs[]: refs thực tế được kiểm tra
 */
export const mcqOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1)
});

export const multipleChoiceExerciseSchema = z.object({
  exercise_type: z.literal('multiple_choice'),
  question: z.string().min(1).max(5000),
  options: z.array(mcqOptionSchema).length(4),
  correct_option_id: z.string().min(1),
  explanation_vi: z.string().min(1).max(5000),
  tested_field_refs: z.array(z.string().min(1).max(200)),
  tested_item_refs: z.array(z.string().min(1).max(200)),
  media_refs: z.array(z.string().uuid()).default([]),
  schema_version: z.string().default('1')
}).refine(
  (data) => data.options.some((o) => o.id === data.correct_option_id),
  { message: 'correct_option_id phải trùng với một trong 4 option ids', path: ['correct_option_id'] }
).refine(
  (data) => new Set(data.options.map((o) => o.id)).size === 4,
  { message: '4 option IDs phải duy nhất', path: ['options'] }
).refine(
  (data) => new Set(data.options.map((o) => o.text.toLowerCase())).size === 4,
  { message: '4 option texts phải khác nhau (case-insensitive)', path: ['options'] }
);

// Union type for either exercise format — use z.union instead of discriminatedUnion with side-effects
export const exercisePayloadSchema = z.union([
  flashcardExerciseSchema,
  multipleChoiceExerciseSchema
]);

export type FlashcardExercise = z.infer<typeof flashcardExerciseSchema>;
export type McqExercise = z.infer<typeof multipleChoiceExerciseSchema>;
export type ExercisePayload = z.infer<typeof exercisePayloadSchema>;

// Answer schemas per exercise type
export const flashcardAnswerSchema = z.object({
  self_rating: z.enum(['again', 'hard', 'good', 'easy']),
  self_reported_error_count: z.number().int().min(0).max(10)
});

export const mcqAnswerSchema = z.object({
  selected_option_id: z.string().min(1)
});

export const exerciseAnswerSchema = z.discriminatedUnion('exercise_type', [
  z.object({ exercise_type: z.literal('flashcard') }).merge(flashcardAnswerSchema),
  z.object({ exercise_type: z.literal('multiple_choice') }).merge(mcqAnswerSchema)
]);

export type FlashcardAnswer = z.infer<typeof flashcardAnswerSchema>;
export type McqAnswer = z.infer<typeof mcqAnswerSchema>;
export type ExerciseAnswer = z.infer<typeof exerciseAnswerSchema>;
