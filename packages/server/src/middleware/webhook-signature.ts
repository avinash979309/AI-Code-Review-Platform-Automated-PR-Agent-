import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Verifies GitHub webhook HMAC-SHA256 signature.
 * Must use raw body — parse JSON AFTER this middleware.
 * Attaches parsed body to req.body on success.
 */
export function verifyWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (!signature) {
      res.status(401).json({
        error: { code: 'MISSING_SIGNATURE', message: 'Missing X-Hub-Signature-256 header' },
      });
      return;
    }

    // rawBody set by express.raw() middleware in app.ts on webhook route
    const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    let valid = false;
    try {
      valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      valid = false;
    }

    if (!valid) {
      res.status(401).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
      });
      return;
    }

    // Parse JSON body now that signature is verified
    try {
      req.body = JSON.parse(rawBody.toString('utf-8')) as unknown;
    } catch {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
      });
      return;
    }

    next();
  };
}
