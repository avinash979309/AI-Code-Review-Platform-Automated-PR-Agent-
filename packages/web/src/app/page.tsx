'use client';

import { useEffect, useState } from 'react';
import { useReviewStore } from '@/stores/review-store';
import { fetchReviews } from '@/lib/api';
import { ReviewList } from '@/components/dashboard/review-list';
import { useSocket } from '@/hooks/use-socket';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function DashboardPage() {
  const { reviews, total, loading, error, setReviews, setLoading, setError } = useReviewStore();
  const [currentPage, setCurrentPage] = useState(1);
  const { connected } = useSocket();

  const load = async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviews(p);
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(currentPage);
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reviews</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} review{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Live indicator */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {connected ? (
              <Wifi className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-red-400" />
            )}
            {connected ? 'Live' : 'Disconnected'}
          </span>
          <button
            onClick={() => void load(currentPage)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && reviews.length === 0 ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ReviewList
          reviews={reviews}
          total={total}
          page={currentPage}
          onPageChange={(p) => {
            setCurrentPage(p);
          }}
        />
      )}
    </div>
  );
}
