import { z } from 'zod';

/** Skill names tracked per notebook */
export const SKILL_NAMES = ['reading', 'listening', 'vocabulary', 'grammar'] as const;
export type SkillName = typeof SKILL_NAMES[number];

export const skillProfileSchema = z.object({
  id: z.string().uuid(),
  notebook_id: z.string().uuid(),
  skill: z.enum(SKILL_NAMES),
  estimate: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  sample_count: z.number().int().min(0),
  accuracy_30d: z.number().int().min(0).max(100).nullable(),
  updated_at: z.string()
});

export type SkillProfile = z.infer<typeof skillProfileSchema>;

export interface PlacementRunRecord {
  id: string;
  notebook_id: string;
  started_at: string;
  completed_at: string | null;
  result_json: string | null;
  confidence_json: string | null;
}
