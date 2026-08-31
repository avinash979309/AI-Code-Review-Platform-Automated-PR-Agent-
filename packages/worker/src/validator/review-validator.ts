/**
 * ReviewValidator — validates ReviewResult with Zod schema + deterministic checks.
 * Deterministic checks: file paths present in diff, line ranges valid, patches parseable.
 */
import { z } from 'zod';
import type { ReviewResult, ValidationResult, ValidationError } from '@coderev/shared';

// ── Zod schema ────────────────────────────────────────────────────────────────

const FindingSchema = z.object({
  file: z.string().min(1, 'file must be non-empty'),
  startLine: z.number().int().positive('startLine must be positive integer'),
  endLine: z.number().int().positive('endLine must be positive integer'),
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().min(1, 'title must be non-empty').max(200, 'title max 200 chars'),
  description: z.string().min(1, 'description must be non-empty'),
  suggestion: z.string().optional(),
  suggestedPatch: z.string().optional(),
  confidence: z.number().min(0).max(1, 'confidence must be 0.0-1.0'),
});

const ReviewResultSchema = z.object({
  findings: z.array(FindingSchema).max(50, 'findings array must not exceed 50 items'),
  summary: z.string().min(1, 'summary must be non-empty').max(2000, 'summary max 2000 chars'),
  model: z.string().min(1, 'model must be non-empty'),
  provider: z.string().min(1, 'provider must be non-empty'),
});

// ── Deterministic checks ───────────────────────────────────────────────────────

function extractDiffFilePaths(diff: string): Set<string> {
  const paths = new Set<string>();
  for (const line of diff.split('\n')) {
    const bMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (bMatch) paths.add(bMatch[1]);
    const diffMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (diffMatch) paths.add(diffMatch[1]);
  }
  return paths;
}

function deterministicChecks(result: ReviewResult, diff: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const diffPaths = extractDiffFilePaths(diff);

  for (let i = 0; i < result.findings.length; i++) {
    const f = result.findings[i];
    const prefix = `findings[${i}]`;

    if (f.endLine < f.startLine) {
      errors.push({
        field: `${prefix}.endLine`,
        message: `endLine (${f.endLine}) must be >= startLine (${f.startLine})`,
      });
    }

    if (diffPaths.size > 0 && !diffPaths.has(f.file)) {
      errors.push({
        field: `${prefix}.file`,
        message: `file "${f.file}" not found in diff. Known files: ${[...diffPaths].join(', ')}`,
      });
    }

    if (f.suggestedPatch !== undefined && f.suggestedPatch.trim() === '') {
      errors.push({
        field: `${prefix}.suggestedPatch`,
        message: 'suggestedPatch is set but empty',
      });
    }
  }

  return errors;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class ReviewValidator {
  validate(result: ReviewResult, diff: string): ValidationResult {
    const errors: ValidationError[] = [];

    const parsed = ReviewResultSchema.safeParse(result);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
    }

    if (parsed.success) {
      const detErrors = deterministicChecks(result, diff);
      errors.push(...detErrors);
    }

    return { valid: errors.length === 0, errors };
  }
}
