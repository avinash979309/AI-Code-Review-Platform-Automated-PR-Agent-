import { createWorker } from './worker.js';
import { config } from './config.js';

console.log(`[worker] Starting worker process (${config.NODE_ENV})`);
console.log(`[worker] Redis: ${config.REDIS_URL}`);
console.log(`[worker] Concurrency: ${config.WORKER_CONCURRENCY}`);

const worker = createWorker();

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, closing worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received, closing worker...');
  await worker.close();
  process.exit(0);
});
