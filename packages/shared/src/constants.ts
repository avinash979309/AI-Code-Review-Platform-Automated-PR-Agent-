/**
 * Shared constants used across server, worker, and web packages.
 */

export const QUEUE_NAME = 'review-jobs' as const;
export const SOCKET_NAMESPACE = '/reviews' as const;

export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
} as const;

export const SANDBOX_DEFAULTS = {
  memoryMb: 256,
  cpuLimit: 0.5,
  timeoutMs: 60_000,
  pidsLimit: 100,
  image: 'node:20-alpine',
} as const;

export const VECTOR_DEFAULTS = {
  dimensions: 384,
  topK: 5,
  model: 'sentence-transformers/all-MiniLM-L6-v2',
} as const;

export const AI_REVIEW_DEFAULTS = {
  maxAttempts: 3,
} as const;
