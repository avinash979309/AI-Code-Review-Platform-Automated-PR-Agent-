/**
 * Socket.IO event payload types for the /reviews namespace.
 */

import type { JobStatus } from './job.js';
import type { Finding } from './review.js';

export interface JobStatusEvent {
  jobId: string;
  status: JobStatus;
  timestamp: string;
}

export interface JobProgressEvent {
  jobId: string;
  stage: string;
  message: string;
}

export interface ReviewCompleteEvent {
  jobId: string;
  reviewId: string;
  findingCount: number;
}

export interface ReviewFindingEvent {
  jobId: string;
  finding: Finding;
}

// Client → Server events
export interface ClientToServerEvents {
  'join-review': (data: { reviewJobId: string }) => void;
  'leave-review': (data: { reviewJobId: string }) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'job:status': (data: JobStatusEvent) => void;
  'job:progress': (data: JobProgressEvent) => void;
  'review:complete': (data: ReviewCompleteEvent) => void;
  'review:finding': (data: ReviewFindingEvent) => void;
}
