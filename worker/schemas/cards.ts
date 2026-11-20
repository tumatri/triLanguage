import { z } from 'zod';

export const cardTypeSchema = z.enum(['vocab', 'sentence']);

export const knowledgeTypeSchema = z.enum(['vocab', 'phrase', 'collocation', 'idiom', 'grammar']).optional();

export const cardSourceSchema = z.enum(['manual', 'ai', 'import']);

export const frontTextSchema = z.string().min(1).max(2000);

// fields_json structure: each field has an optional value and optional media_id ref
// Schema versioned as 'cardFields.v1'
export const cardFieldItemSchema = z.object({
  value: z.string(),
  vi_meaning: z.string().optional(),
  variant: z.string().optional()
});

export const cardFieldsV1Schema = z.object({
  phonetic: z.string().nullable().optional(),
  word_type: z.string().nullable().optional(),
  meaning_vi: z.array(z.string()).nullable().optional(),
  synonyms: z.array(cardFieldItemSchema).nullable().optional(),
  antonyms: z.array(cardFieldItemSchema).nullable().optional(),
  collocations: z.array(cardFieldItemSchema).nullable().optional(),
  example_sentences: z.array(z.string()).nullable().optional(),
  example_phonetics: z.array(z.string()).nullable().optional(),
  example_translations: z.array(z.string()).nullable().optional(),
  media: z.record(z.string(), z.union([z.string(), z.number()])).nullable().optional()
});

export const createCardSchema = z.object({
  notebook_id: z.string().uuid(),
  card_type: cardTypeSchema.default('vocab'),
  source: cardSourceSchema.default('manual'),
  front_text: frontTextSchema,
  fields_json: cardFieldsV1Schema.nullable().default(null)
});

export const updateCardSchema = z.object({
  front_text: frontTextSchema.optional(),
  fields_json: cardFieldsV1Schema.nullable().optional(),
  archived_at: z.string().nullable().optional()
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type CardFieldsV1 = z.infer<typeof cardFieldsV1Schema>;
