import { z } from 'zod';

export const bootstrapSchema = z.object({
  email: z.string().email('Email không hợp lệ').min(3).max(255),
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ').min(3).max(255),
  password: z.string().min(1).max(128)
});

export type BootstrapInput = z.infer<typeof bootstrapSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
