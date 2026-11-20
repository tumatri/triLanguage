import { z } from 'zod';

export const importFormatSchema = z.enum(['csv', 'tsv', 'json']);

// Mapping column names → card fields
export const importColumnMappingSchema = z.record(z.string(), z.string());

export const importJobStatusSchema = z.enum(['pending', 'validating', 'previewing', 'importing', 'completed', 'failed', 'cancelled']);

export const createImportSchema = z.object({
  notebook_id: z.string().uuid(),
  format: importFormatSchema,
  file_name: z.string().max(255),
  mapping: importColumnMappingSchema,
  dry_run: z.boolean().default(true)
});

export type CreateImportInput = z.infer<typeof createImportSchema>;
export type ImportFormat = z.infer<typeof importFormatSchema>;
export type ColumnMapping = z.infer<typeof importColumnMappingSchema>;
