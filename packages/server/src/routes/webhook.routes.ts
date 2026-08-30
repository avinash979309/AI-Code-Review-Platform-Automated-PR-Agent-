import { Router } from 'express';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { githubWebhookPayloadSchema } from '@coderev/shared';
import type { ReviewJobData } from '@coderev/shared';
import { verifyWebhookSignature } from '../middleware/webhook-signature.js';
import { enqueueReviewJob } from '../queue/producer.js';
import { config } from '../config.js';

const prisma = new PrismaClient();

export function createWebhookRouter(): ExpressRouter {
  const router: ExpressRouter = Router();

  // Raw body capture for HMAC verification
  router.post(
    '/webhooks/github',
    (req: Request, _res, next) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
      });
      req.on('error', next);
    },
    verifyWebhookSignature(config.GITHUB_WEBHOOK_SECRET),
    async (req: Request, res: Response): Promise<void> => {
      const eventType = (req.headers['x-github-event'] as string | undefined) ?? 'unknown';

      // Only process pull_request events
      if (eventType !== 'pull_request') {
        res.status(200).json({ received: true, processed: false, reason: 'non-pr-event' });
        return;
      }

      const parsed = githubWebhookPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(200).json({ received: true, processed: false, reason: 'schema-mismatch' });
        return;
      }

      const payload = parsed.data;
      const { action, pull_request: pr, repository } = payload;

      // Only process opened / synchronize / reopened
      if (!['opened', 'synchronize', 'reopened'].includes(action)) {
        res.status(200).json({ received: true, processed: false, reason: 'ignored-action' });
        return;
      }

      // Upsert repository
      const repo = await prisma.repository.upsert({
        where: { fullName: repository.full_name },
        update: { defaultBranch: repository.default_branch, language: repository.language },
        create: {
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          language: repository.language,
        },
      });

      // Upsert pull request
      const pullRequest = await prisma.pullRequest.upsert({
        where: { repositoryId_number: { repositoryId: repo.id, number: pr.number } },
        update: { headSha: pr.head.sha, status: pr.state },
        create: {
          number: pr.number,
          title: pr.title,
          authorLogin: pr.user.login,
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          headSha: pr.head.sha,
          status: pr.state,
          repositoryId: repo.id,
        },
      });

      // Persist webhook event
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      const signature = req.headers['x-hub-signature-256'] as string;
      const webhookEvent = await prisma.webhookEvent.create({
        data: {
          eventType,
          action,
          payload: req.body as object,
          signature,
          pullRequestId: pullRequest.id,
        },
      });

      // Enqueue review job
      const jobData: ReviewJobData = {
        webhookEventId: webhookEvent.id,
        repositoryFullName: repository.full_name,
        pullRequestNumber: pr.number,
        headSha: pr.head.sha,
        action,
      };

      const jobId = await enqueueReviewJob(config.REDIS_URL, jobData);

      // Mark webhook event as processed
      await prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true },
      });

      console.log(`[webhook] PR #${pr.number} (${action}) queued as job ${jobId}`);

      res.status(200).json({
        received: true,
        processed: true,
        eventId: webhookEvent.id,
        jobId,
      });

      void rawBody; // used in middleware, suppress lint
    },
  );

  return router;
}
