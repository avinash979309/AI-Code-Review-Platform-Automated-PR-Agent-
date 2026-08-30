import { Router } from 'express';
import type { Request, Response, Router as ExpressRouter } from 'express';

export const healthRouter: ExpressRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'code-review-platform',
    version: '1.0.0',
  });
});
