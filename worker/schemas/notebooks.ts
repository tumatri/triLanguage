import { z } from 'zod';

export const createNotebookSchema = z.object({
  name: z.string().min(1).max(100),
  language_variant: z.enum(['zh-Hant', 'zh-Hans', 'en-US']),
  timezone: z.string().min(1).max(100).default('Asia/Ho_Chi_Minh')
});

export const updateNotebookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().min(1).max(100).optional()
});

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;
export type UpdateNotebookInput = z.infer<typeof updateNotebookSchema>;
