/**
 * Main pipeline orchestrator.
 * Runs all stages in sequence, updates ReviewJob status at each transition.
 */
import type { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import type { ReviewJobData } from '@coderev/shared';
import { JobStatus } from '@coderev/shared';
import { fetchDiff, persistCodeFiles } from './fetch-diff.js';
import { runSandboxStage } from './sandbox.js';
import { runASTAnalysisStage } from './ast-analysis.js';

const prisma = new PrismaClient();

async function updateJobStatus(
  reviewJobId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.reviewJob.update({
    where: { id: reviewJobId },
    data: {
      status,
      ...(status === JobStatus.COMPLETED || status === JobStatus.FAILED
        ? { completedAt: new Date() }
        : {}),
      ...extra,
    },
  });
}

export async function runPipeline(
  job: Job<ReviewJobData>,
  reviewJobId: string,
): Promise<void> {
  const { repositoryFullName, pullRequestNumber } = job.data;
  console.log(
    `[pipeline] Starting job=${job.id} repo=${repositoryFullName} PR=#${pullRequestNumber}`,
  );

  try {
    // ── Stage 1: FETCH_DIFF ────────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.FETCHING_DIFF);
    const diffFiles = await fetchDiff(repositoryFullName, pullRequestNumber);
    const codeFiles = await persistCodeFiles(reviewJobId, diffFiles);
    console.log(`[pipeline] FETCH_DIFF: ${codeFiles.length} files`);

    // ── Stage 2: SANDBOX_EXEC ──────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.SANDBOX_RUNNING);
    let sandboxResult;
    try {
      sandboxResult = await runSandboxStage(reviewJobId, diffFiles);
      console.log(
        `[pipeline] SANDBOX_EXEC: exit=${sandboxResult.exitCode} ` +
          `duration=${sandboxResult.durationMs}ms timedOut=${sandboxResult.timedOut}`,
      );
    } catch (err) {
      // Sandbox failure is non-fatal — log and continue pipeline
      console.warn(`[pipeline] SANDBOX_EXEC failed (non-fatal): ${(err as Error).message}`);
    }

    // ── Stage 3: AST_ANALYSIS ──────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.ANALYZING_AST);
    const astResult = await runASTAnalysisStage(codeFiles);
    console.log(
      `[pipeline] AST_ANALYSIS: totalNodes=${astResult.totalNodes} files=${astResult.snapshotCount}`,
    );

    // Update diff content on ReviewJob
    await prisma.reviewJob.update({
      where: { id: reviewJobId },
      data: { diffContent: JSON.stringify(diffFiles.map((f) => ({ path: f.path, patch: f.patch }))) },
    });

    // ── Stage 4: VECTOR_RETRIEVAL (stub — Phase 4) ────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.RETRIEVING_CONTEXT);
    console.log(`[pipeline] VECTOR_RETRIEVAL: stub (Phase 4)`);

    // ── Stage 5: AI_REVIEW (stub — Phase 4) ──────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.AI_REVIEWING);
    console.log(`[pipeline] AI_REVIEW: stub (Phase 4)`);

    // ── Stage 6: VALIDATION (stub — Phase 4) ──────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.VALIDATING);
    console.log(`[pipeline] VALIDATION: stub (Phase 4)`);

    // ── Stage 7: COMPLETE ──────────────────────────────────────────────────
    await updateJobStatus(reviewJobId, JobStatus.COMPLETED);
    console.log(`[pipeline] Completed reviewJobId=${reviewJobId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJobStatus(reviewJobId, JobStatus.FAILED, { error: message });
    console.error(`[pipeline] Failed reviewJobId=${reviewJobId}: ${message}`);
    throw err;
  }
}
