'use client';

import { useEffect, useCallback } from 'react';
import { useReviewStore } from '@/stores/review-store';
import { fetchReview, fetchReviewFindings, fetchReviewFiles } from '@/lib/api';
import { joinReviewRoom, leaveReviewRoom } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

/**
 * Loads a review by ID, fetches findings + files, and joins the Socket.IO room
 * so real-time updates flow in.
 */
export function useReview(reviewId: string) {
  const {
    currentReview,
    currentFindings,
    currentFiles,
    selectedFile,
    setCurrentReview,
    setCurrentFindings,
    setCurrentFiles,
    setSelectedFile,
    setLoading,
    setError,
  } = useReviewStore();

  const { jobStatuses, jobProgress, reviewComplete } = useSocketStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [review, findingsData, filesData] = await Promise.all([
        fetchReview(reviewId),
        fetchReviewFindings(reviewId),
        fetchReviewFiles(reviewId),
      ]);
      setCurrentReview(review);
      setCurrentFindings(findingsData.findings);
      setCurrentFiles(filesData.files);
      if (filesData.files.length > 0) setSelectedFile(filesData.files[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  // Join Socket.IO room using reviewJob.id (which the worker emits to)
  useEffect(() => {
    if (!currentReview) return;
    const jobId = currentReview.reviewJob.id;
    joinReviewRoom(jobId);
    return () => leaveReviewRoom(jobId);
  }, [currentReview]);

  const liveStatus = currentReview
    ? jobStatuses[currentReview.reviewJob.id]
    : null;
  const liveProgress = currentReview
    ? jobProgress[currentReview.reviewJob.id] ?? []
    : [];
  const liveComplete = currentReview
    ? reviewComplete[currentReview.reviewJob.id]
    : null;

  return {
    review: currentReview,
    findings: currentFindings,
    files: currentFiles,
    selectedFile,
    setSelectedFile,
    liveStatus,
    liveProgress,
    liveComplete,
    reload: load,
  };
}
