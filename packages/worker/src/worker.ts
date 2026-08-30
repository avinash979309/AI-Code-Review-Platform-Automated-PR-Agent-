import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import type { ReviewJobData } from '@coderev/shared';
import { QUEUE_NAME, JobStatus } from '@coderev/shared';
import { config } from './config.js';
import { runPipeline } from './pipeline/pipeline.js';

const prisma = new PrismaClient();

export function createWorker(): Worker<ReviewJobData> {
  const url = new URL(config.REDIS_URL);

  const worker = new Worker<ReviewJobData>(
    QUEUE_NAME,
    async (job) => {
      const { webhookEventId, repositoryFullName, pullRequestNumber, headSha, action } = job.data;
      console.log(
        `[worker] Job id=${job.id} repo=${repositoryFullName} PR=#${pullRequestNumber} action=${action}`,
      );

      // Look up PullRequest from DB (created by webhook route)
      const webhookEvent = await prisma.webhookEvent.findUnique({
        where: { id: webhookEventId },
        include: { pullRequest: true },
      });

      let pullRequestId: string;

      if (webhookEvent?.pullRequest) {
        pullRequestId = webhookEvent.pullRequest.id;
      } else {
        // Fallback: upsert repo + PR if not found (e.g. simulate script)
        const repo = await prisma.repository.upsert({
          where: { fullName: repositoryFullName },
          update: {},
          create: { fullName: repositoryFullName },
        });
        const pr = await prisma.pullRequest.upsert({
          where: { repositoryId_number: { repositoryId: repo.id, number: pullRequestNumber } },
          update: { headSha },
          create: {
            number: pullRequestNumber,
            title: `PR #${pullRequestNumber}`,
            authorLogin: 'unknown',
            baseBranch: 'main',
            headBranch: 'feature',
            headSha,
            repositoryId: repo.id,
          },
        });
        pullRequestId = pr.id;
      }

      // Create ReviewJob record
      const reviewJob = await prisma.reviewJob.create({
        data: {
          bullJobId: job.id ?? undefined,
          status: JobStatus.QUEUED,
          commitSha: headSha,
          startedAt: new Date(),
          pullRequestId,
        },
      });

      await runPipeline(job, reviewJob.id);
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
      },
      concurrency: config.WORKER_CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[worker] Worker error:', err.message);
  });

  return worker;
}
