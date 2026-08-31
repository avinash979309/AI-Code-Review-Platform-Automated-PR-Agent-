/**
 * VALIDATION pipeline stage.
 * Validates ReviewResult with Zod + deterministic checks.
 * Persists ReviewAttempt record regardless of outcome.
 */
import { PrismaClient } from '@prisma/client';
import type { ReviewResult, ValidationResult } from '@coderev/shared';
import { ReviewValidator } from '../validator/review-validator.js';

const prisma = new PrismaClient();
const validator = new ReviewValidator();

export interface ValidationStageInput {
  reviewJobId: string;
  result: ReviewResult;
  diff: string;
  attemptNumber: number;
  durationMs: number;
}

export interface ValidationStageOutput {
  validationResult: ValidationResult;
  attemptId: string;
}

export async function runValidationStage(
  input: ValidationStageInput,
): Promise<ValidationStageOutput> {
  const { reviewJobId, result, diff, attemptNumber, durationMs } = input;

  // Run validation
  const validationResult = validator.validate(result, diff);

  // Persist ReviewAttempt record
  const attempt = await prisma.reviewAttempt.create({
    data: {
      reviewJobId,
      attemptNumber,
      rawOutput: JSON.stringify(result),
      validationErrors: JSON.parse(
        JSON.stringify(validationResult.valid ? [] : validationResult.errors),
      ),
      valid: validationResult.valid,
      durationMs,
    },
  });

  if (validationResult.valid) {
    console.log(`[validation] attempt=${attemptNumber} VALID`);
  } else {
    console.warn(
      `[validation] attempt=${attemptNumber} INVALID — ` +
        `${validationResult.errors.length} error(s): ` +
        validationResult.errors.map((e) => `${e.field}: ${e.message}`).join(' | '),
    );
  }

  return { validationResult, attemptId: attempt.id };
}
