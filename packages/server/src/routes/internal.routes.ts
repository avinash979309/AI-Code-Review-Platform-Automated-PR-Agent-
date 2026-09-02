/**
 * Internal emit routes — called by the worker to relay Socket.IO events.
 * Not exposed publicly; server-to-server only.
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  emitJobStatus,
  emitJobProgress,
  emitReviewComplete,
} from '../socket/socket.js';

export function createInternalRouter(): Router {
  const router = Router();

  router.post('/internal/emit/job-status', (req: Request, res: Response) => {
    const { reviewJobId, jobId, status } = req.body as {
      reviewJobId: string;
      jobId: string;
      status: string;
    };
    emitJobStatus(reviewJobId, jobId, status);
    res.json({ ok: true });
  });

  router.post('/internal/emit/job-progress', (req: Request, res: Response) => {
    const { reviewJobId, jobId, stage, message } = req.body as {
      reviewJobId: string;
      jobId: string;
      stage: string;
      message: string;
    };
    emitJobProgress(reviewJobId, jobId, stage, message);
    res.json({ ok: true });
  });

  router.post('/internal/emit/review-complete', (req: Request, res: Response) => {
    const { reviewJobId, jobId, reviewId, findingCount } = req.body as {
      reviewJobId: string;
      jobId: string;
      reviewId: string;
      findingCount: number;
    };
    emitReviewComplete(reviewJobId, jobId, reviewId, findingCount);
    res.json({ ok: true });
  });

  return router;
}
