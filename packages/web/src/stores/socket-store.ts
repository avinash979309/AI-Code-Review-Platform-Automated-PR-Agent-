/**
 * Socket store — tracks connection state and incoming events.
 */
'use client';

import { create } from 'zustand';
import type { JobStatusEvent, JobProgressEvent, ReviewCompleteEvent } from '@coderev/shared';

export interface SocketState {
  connected: boolean;
  // keyed by reviewJobId
  jobStatuses: Record<string, JobStatusEvent>;
  jobProgress: Record<string, JobProgressEvent[]>;
  reviewComplete: Record<string, ReviewCompleteEvent>;

  setConnected: (v: boolean) => void;
  handleJobStatus: (ev: JobStatusEvent) => void;
  handleJobProgress: (ev: JobProgressEvent) => void;
  handleReviewComplete: (ev: ReviewCompleteEvent) => void;
  clearJobEvents: (reviewJobId: string) => void;
}

export const useSocketStore = create<SocketState>((set) => ({
  connected: false,
  jobStatuses: {},
  jobProgress: {},
  reviewComplete: {},

  setConnected: (v) => set({ connected: v }),

  handleJobStatus: (ev) =>
    set((s) => ({
      jobStatuses: { ...s.jobStatuses, [ev.jobId]: ev },
    })),

  handleJobProgress: (ev) =>
    set((s) => ({
      jobProgress: {
        ...s.jobProgress,
        [ev.jobId]: [...(s.jobProgress[ev.jobId] ?? []), ev],
      },
    })),

  handleReviewComplete: (ev) =>
    set((s) => ({
      reviewComplete: { ...s.reviewComplete, [ev.jobId]: ev },
    })),

  clearJobEvents: (reviewJobId) =>
    set((s) => {
      const { [reviewJobId]: _s, ...jobStatuses } = s.jobStatuses;
      const { [reviewJobId]: _p, ...jobProgress } = s.jobProgress;
      const { [reviewJobId]: _c, ...reviewComplete } = s.reviewComplete;
      return { jobStatuses, jobProgress, reviewComplete };
    }),
}));
