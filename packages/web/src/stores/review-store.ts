/**
 * Review store — caches fetched reviews, findings, and files.
 * Also tracks which files have had AI suggestions accepted.
 */
'use client';

import { create } from 'zustand';
import type { ReviewListItem, ReviewDetail, Finding, CodeFile } from '@/lib/api';
import { buildModifiedContent } from '@/components/review/diff-editor';

interface ReviewState {
  reviews: ReviewListItem[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;

  // Current review detail
  currentReview: ReviewDetail | null;
  currentFindings: Finding[];
  currentFiles: CodeFile[];
  selectedFile: CodeFile | null;

  // Accept-changes state
  acceptedFiles: Set<string>; // Set of file IDs
  acceptedFindings: Set<string>; // Set of finding IDs accepted individually
  toggleAcceptFile: (fileId: string) => void;
  acceptFinding: (findingId: string) => void;
  acceptAllFindings: (findingIds: string[]) => void;
  acceptAllFiles: () => void;
  clearAccepted: () => void;
  /** Returns the right-side (modified) content for a file, or null if not found. */
  getAcceptedContent: (fileId: string, files: CodeFile[], findings: Finding[]) => string | null;

  setReviews: (data: { reviews: ReviewListItem[]; total: number; page: number }) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
  setCurrentReview: (r: ReviewDetail | null) => void;
  setCurrentFindings: (f: Finding[]) => void;
  setCurrentFiles: (f: CodeFile[]) => void;
  setSelectedFile: (f: CodeFile | null) => void;
}

export const useReviewStore = create<ReviewState>((set, _get) => ({
  reviews: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,
  currentReview: null,
  currentFindings: [],
  currentFiles: [],
  selectedFile: null,
  acceptedFiles: new Set<string>(),
  acceptedFindings: new Set<string>(),

  setReviews: ({ reviews, total, page }) => set({ reviews, total, page }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setCurrentReview: (currentReview) => set({ currentReview }),
  setCurrentFindings: (currentFindings) => set({ currentFindings }),
  setCurrentFiles: (currentFiles) => set({ currentFiles }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),

  toggleAcceptFile: (fileId) =>
    set((state) => {
      const next = new Set(state.acceptedFiles);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return { acceptedFiles: next };
    }),

  acceptFinding: (findingId) =>
    set((state) => {
      const next = new Set(state.acceptedFindings);
      next.add(findingId);
      return { acceptedFindings: next };
    }),

  acceptAllFindings: (findingIds) =>
    set((state) => {
      const next = new Set(state.acceptedFindings);
      findingIds.forEach((id) => next.add(id));
      return { acceptedFindings: next };
    }),

  acceptAllFiles: () =>
    set((state) => ({
      acceptedFiles: new Set(state.currentFiles.map((f) => f.id)),
    })),

  clearAccepted: () => set({ acceptedFiles: new Set<string>() }),

  getAcceptedContent: (fileId, files, findings) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return null;
    return buildModifiedContent(file, findings).content;
  },
}));
