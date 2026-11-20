import { z } from 'zod';

/**
 * Schema cho AI enrichment: điền các field trống của card từ front_text + language_variant.
 * Mỗi trường missing được điền riêng; existing_fields không bị sửa.
 */
export const cardEnrichmentFieldItemSchema = z.object({
  value: z.string().min(1),
  vi_meaning: z.string().optional(),
  variant: z.string().optional()
});

export const cardEnrichmentOutputSchema = z.object({
  phonetic: z.string().nullable().optional(),
  word_type: z.string().nullable().optional(),
  meaning_vi: z.array(z.string()).nullable().optional(),
  synonyms: z.array(cardEnrichmentFieldItemSchema).nullable().optional(),
  antonyms: z.array(cardEnrichmentFieldItemSchema).nullable().optional(),
  collocations: z.array(cardEnrichmentFieldItemSchema).nullable().optional(),
  example_sentences: z.array(z.string()).nullable().optional(),
  example_phonetics: z.array(z.string()).nullable().optional(),
  example_translations: z.array(z.string()).nullable().optional()
});

export type CardEnrichmentOutput = z.infer<typeof cardEnrichmentOutputSchema>;

/**
 * Schema cho tutor explanation — giải thích thẻ bằng tiếng Việt.
 */
export const tutorExplanationOutputSchema = z.object({
  explanation_vi: z.string().min(10),
  usage_notes: z.array(z.string()).optional(),
  common_mistakes: z.array(z.string()).optional()
});

export type TutorExplanationOutput = z.infer<typeof tutorExplanationOutputSchema>;

/**
 * Schema cho exercise sinh bởi AI (MCQ).
 * Server so sánh đáp án với correct_option_id; AI không quyết định rating.
 */
export const mcqOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1)
});

export const aiExerciseMCOutputSchema = z.object({
  question: z.string().min(1),
  options: z.array(mcqOptionSchema).length(4),
  correct_option_id: z.string().min(1),
  explanation_vi: z.string().min(1),
  tested_field_refs: z.array(z.string()),
  source_field_refs: z.array(z.string())
});

export type AiExerciseMCOuput = z.infer<typeof aiExerciseMCOutputSchema>;

/**
 * Wrapper schema for all AI tasks — maps task name to its output schema.
 */
export const aiTaskSchema = z.enum(['enrich', 'tutor', 'mcq']);
export type AiTask = z.infer<typeof aiTaskSchema>;
