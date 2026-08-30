import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'warning', 'info']);

export const findingSchema = z.object({
  file: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  severity: severitySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  suggestion: z.string().optional(),
  suggestedPatch: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const reviewResultSchema = z.object({
  findings: z.array(findingSchema),
  summary: z.string().min(1),
  model: z.string(),
  provider: z.string(),
});

export type FindingParsed = z.infer<typeof findingSchema>;
export type ReviewResultParsed = z.infer<typeof reviewResultSchema>;
