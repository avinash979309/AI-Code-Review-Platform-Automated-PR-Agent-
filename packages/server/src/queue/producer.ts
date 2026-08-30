import { Queue } from 'bullmq';
import type { ReviewJobData } from '@coderev/shared';
import { QUEUE_NAME, JOB_OPTIONS } from '@coderev/shared';

let _queue: Queue<ReviewJobData> | null = null;

export function getReviewQueue(redisUrl: string): Queue<ReviewJobData> {
  if (!_queue) {
    const url = new URL(redisUrl);
    _queue = new Queue<ReviewJobData>(QUEUE_NAME, {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
      },
      defaultJobOptions: JOB_OPTIONS,
    });

    _queue.on('error', (err) => {
      console.error('[queue] BullMQ Queue error:', err.message);
    });
  }
  return _queue;
}

export async function enqueueReviewJob(
  redisUrl: string,
  data: ReviewJobData,
): Promise<string> {
  const q = getReviewQueue(redisUrl);
  const job = await q.add('review', data);
  return job.id ?? '';
}

export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
