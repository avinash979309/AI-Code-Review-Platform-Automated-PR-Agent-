import type { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_SERVER_ERROR';

  console.error(`[${code}] ${err.message}`, {
    stack: err.stack,
    statusCode,
  });

  res.status(statusCode).json({
    error: {
      code,
      message:
        process.env['NODE_ENV'] === 'production'
          ? 'An internal error occurred'
          : err.message,
    },
  });
}
