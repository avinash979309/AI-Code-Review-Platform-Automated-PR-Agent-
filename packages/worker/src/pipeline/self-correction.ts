/**
 * SELF_CORRECTION loop.
 * Runs AI_REVIEW → VALIDATION up to maxAttempts times.
 * On validation failure, feeds errors back into the next attempt's context.
 * On 3 consecutive failures: status = FAILED_VALIDATION, throws.
 * On success: persists Review + ReviewFinding records, returns Review id.
 */
import { PrismaClient } from '@prisma/client';
import type { AIProvider, ASTSummary, SandboxLogs, RetrievedChunk, ValidationError } from '@coderev/shared';
import { AI_REVIEW_DEFAULTS, JobStatus } from '@coderev/shared';
import type { DiffFile } from './fetch-diff.js';
import { runAIReviewStage, buildDiffString } from './ai-review.js';
import { runValidationStage } from './validation.js';

const prisma = new PrismaClient();

export interface SelfCorrectionInput {
  reviewJobId: string;
  provider: AIProvider;
  diffFiles: DiffFile[];
  astSummaries: ASTSummary[];
  sandboxLogs: SandboxLogs;
  retrievedContext: RetrievedChunk[];
}

export interface SelfCorrectionResult {
  reviewId: string;
  findingCount: number;
  attemptCount: number;
}

export async function runSelfCorrectionLoop(
  input: SelfCorrectionInput,
): Promise<SelfCorrectionResult> {
  const { reviewJobId, provider, diffFiles, astSummaries, sandboxLogs, retrievedContext } = input;
  const maxAttempts = AI_REVIEW_DEFAULTS.maxAttempts;
  const diff = buildDiffString(diffFiles);

  let previousErrors: ValidationError[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();

    console.log(`[self-correction] attempt=${attempt}/${maxAttempts}`);

    // AI_REVIEW
    const result = await runAIReviewStage({
      provider,
      diffFiles,
      astSummaries,
      sandboxLogs,
      retrievedContext,
      previousErrors: previousErrors.length > 0 ? previousErrors : undefined,
    });

    const durationMs = Date.now() - attemptStart;

    // VALIDATION
    const { validationResult } = await runValidationStage({
      reviewJobId,
      result,
      diff,
      attemptNumber: attempt,
      durationMs,
    });

    if (validationResult.valid) {
      // ── Persist Review and ReviewFinding records ──────────────────────────
      const review = await prisma.review.create({
        data: {
          reviewJobId,
          provider: result.provider,
          model: result.model,
          totalFindings: result.findings.length,
          summary: result.summary,
          attemptCount: attempt,
          findings: {
            create: result.findings.map((f) => ({
              file: f.file,
              startLine: f.startLine,
              endLine: f.endLine,
              severity: f.severity,
              title: f.title,
              description: f.description,
              suggestion: f.suggestion ?? null,
              suggestedPatch: f.suggestedPatch ?? null,
              confidence: f.confidence,
              validated: true,
            })),
          },
        },
      });

      console.log(
        `[self-correction] SUCCESS attempt=${attempt} reviewId=${review.id} findings=${result.findings.length}`,
      );

      return {
        reviewId: review.id,
        findingCount: result.findings.length,
        attemptCount: attempt,
      };
    }

    // Validation failed — prepare errors for next attempt
    previousErrors = validationResult.errors;
    console.warn(`[self-correction] attempt=${attempt} failed validation, retrying...`);
  }

  // All attempts exhausted
  await prisma.reviewJob.update({
    where: { id: reviewJobId },
    data: {
      status: JobStatus.FAILED_VALIDATION,
      error: `Validation failed after ${maxAttempts} attempts. Last errors: ${previousErrors
        .map((e) => `${e.field}: ${e.message}`)
        .join('; ')}`,
      completedAt: new Date(),
    },
  });

  throw new Error(
    `Review validation failed after ${maxAttempts} attempts. ` +
      `Last errors: ${previousErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
  );
}
