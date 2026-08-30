import express from 'express';
import type { Application } from 'express';
import { healthRouter } from './routes/health.routes.js';
import { createWebhookRouter } from './routes/webhook.routes.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(): Application {
  const app = express();

  // JSON parser for non-webhook routes
  app.use((req, res, next) => {
    if (req.path === '/api/webhooks/github') {
      // Webhook route handles raw body itself for HMAC verification
      next();
    } else {
      express.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: false }));

  // Routes
  app.use('/api', healthRouter);
  app.use('/api', createWebhookRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Error handler must be last
  app.use(errorHandler);

  return app;
}
