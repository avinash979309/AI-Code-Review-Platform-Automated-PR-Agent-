/**
 * Main pipeline orchestrator.
 * Runs all stages in sequence, updates ReviewJob status at each transition.
 * Phase 4: vector retrieval, AI review, validation, self-correction fully wired.
 */
import type { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import type { ReviewJobData, ASTSummary, SandboxLogs } from '@coderev/shared';
import { JobStatus } from '@coderev/shared';
import { fetchDiff, persistCodeFiles } from './fetch-diff.js';
import { runSandboxStage } from './sandbox.js';
import { runASTAnalysisStage } from './ast-analysis.js';
import { runVectorRetrievalStage } from './vector-retrieval.js';
import { runSelfCorrectionLoop } from './self-correction.js';
import { MockAIProvider } from '../ai/mock.provider.js';
import { HuggingFaceProvider } from '../ai/huggingface.provider.js';
import type { AIProvider } from '@coderev/shared';
import { config } from '../config.js';
import { buildDiffString } from './ai-review.js';

const prisma = new PrismaClient();

function getProvider(): AIProvider {
  if (config.AI_PROVIDER === 'huggingface' && config.HUGGINGFACE_API_KEY) {
    return new HuggingFaceProvider(config.HUGGINGFACE_API_KEY);
  }
  return new MockAIProvider();
}

async function updateJobStatus(
  reviewJobId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.reviewJob.update({
    where: { id: reviewJobId },
    data: {
      status,
      ...(status === JobStatus.COMPLETED ||
      status === JobStatus.FAILED ||
      status === JobStatus.FAILED_VALIDATION
        ? { completedAt: new Date() }
        : {}),
      ...extra,
    },
  });
}

export async function runPipeline(
  job: Job<ReviewJobData>,
  reviewJobId: string,
  repositoryId: string,
): Promise<void> {
  const { repositoryFullName, pullRequestNumber } = job.data;
  const provider = getProvider();

  console.log(
    `[pipeline] Starting job=${job.id} repo=${repositoryFullName} PR=#${pullRequestNumber} provider=${provider.name}`,
  );

  try {
    // ── Stage 1: FETCH_DIFF ────────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.FETCHING_DIFF);
    const diffFiles = await fetchDiff(repositoryFullName, pullRequestNumber);
    const codeFiles = await persistCodeFiles(reviewJobId, diffFiles);
    console.log(`[pipeline] FETCH_DIFF: ${codeFiles.length} files`);

    // Persist raw diff content
    await prisma.reviewJob.update({
      where: { id: reviewJobId },
      data: {
        diffContent: JSON.stringify(diffFiles.map((f) => ({ path: f.path, patch: f.patch }))),
      },
    });

    // ── Stage 2: SANDBOX_EXEC ──────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.SANDBOX_RUNNING);
    let sandboxLogs: SandboxLogs = {
      stdout: '',
      stderr: '',
      exitCode: null,
      timedOut: false,
      durationMs: 0,
    };

    try {
      const sandboxResult = await runSandboxStage(reviewJobId, diffFiles);
      sandboxLogs = {
        stdout: sandboxResult.stdout,
        stderr: sandboxResult.stderr,
        exitCode: sandboxResult.exitCode,
        timedOut: sandboxResult.timedOut,
        durationMs: sandboxResult.durationMs,
      };
      console.log(
        `[pipeline] SANDBOX_EXEC: exit=${sandboxResult.exitCode} duration=${sandboxResult.durationMs}ms`,
      );
    } catch (err) {
      console.warn(`[pipeline] SANDBOX_EXEC failed (non-fatal): ${(err as Error).message}`);
    }

    // ── Stage 3: AST_ANALYSIS ──────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.ANALYZING_AST);
    const astResult = await runASTAnalysisStage(codeFiles);
    console.log(
      `[pipeline] AST_ANALYSIS: totalNodes=${astResult.totalNodes} files=${astResult.snapshotCount}`,
    );

    // Build ASTSummary[] for AI context from DB snapshots
    const astSnapshots = await prisma.aSTSnapshot.findMany({
      where: { codeFile: { reviewJobId } },
      include: { codeFile: true },
    });

    const astSummaries: ASTSummary[] = astSnapshots.map((s) => ({
      file: s.codeFile.path,
      nodeCount: s.nodeCount,
      functions: s.functions as ASTSummary['functions'],
      classes: s.classes as ASTSummary['classes'],
      imports: s.imports as ASTSummary['imports'],
      exports: s.exports as ASTSummary['exports'],
    }));

    // ── Stage 4: VECTOR_RETRIEVAL ─────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.RETRIEVING_CONTEXT);
    const diff = buildDiffString(diffFiles);
    const vectorResult = await runVectorRetrievalStage(provider, diff, repositoryId);
    console.log(
      `[pipeline] VECTOR_RETRIEVAL: chunks=${vectorResult.retrievedChunks.length} skipped=${vectorResult.skipped}`,
    );

    // ── Stage 5+6+7: AI_REVIEW → VALIDATION → SELF_CORRECTION ─────────────
    await updateJobStatus(reviewJobId, JobStatus.AI_REVIEWING);
    const selfCorrectionResult = await runSelfCorrectionLoop({
      reviewJobId,
      provider,
      diffFiles,
      astSummaries,
      sandboxLogs,
      retrievedContext: vectorResult.retrievedChunks,
    });

    // ── Stage 8: COMPLETE ──────────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.COMPLETED);
    console.log(
      `[pipeline] Completed reviewJobId=${reviewJobId} reviewId=${selfCorrectionResult.reviewId} ` +
        `findings=${selfCorrectionResult.findingCount} attempts=${selfCorrectionResult.attemptCount}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only update to FAILED if not already FAILED_VALIDATION (self-correction sets that)
    const current = await prisma.reviewJob.findUnique({
      where: { id: reviewJobId },
      select: { status: true },
    });
    if (current?.status !== JobStatus.FAILED_VALIDATION) {
      await updateJobStatus(reviewJobId, JobStatus.FAILED, { error: message });
    }
    console.error(`[pipeline] Failed reviewJobId=${reviewJobId}: ${message}`);
    throw err;
  }
}
