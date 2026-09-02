'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { ReviewListItem } from '@/lib/api';
import { StatusBadge } from './status-badge';
import { cn } from '@/lib/utils';

interface Props {
  reviews: ReviewListItem[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
}

function severityDot(count: number) {
  if (count === 0) return null;
  return (
    <span className="ml-1 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
      {count}
    </span>
  );
}

export function ReviewList({ reviews, total, page, onPageChange }: Props) {
  const totalPages = Math.ceil(total / 20);

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <p className="text-lg font-medium">No reviews yet</p>
        <p className="mt-1 text-sm">Trigger a GitHub webhook to start a review.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {reviews.map((r) => (
        <Link
          key={r.id}
          href={`/reviews/${r.id}`}
          className={cn(
            'group flex flex-col gap-2 rounded-lg border border-border bg-card p-4',
            'hover:border-primary/50 hover:bg-card/80 transition-colors',
          )}
        >
          {/* Top row */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {r.reviewJob.pullRequest.repository.fullName} #{r.reviewJob.pullRequest.number}
              </p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {r.reviewJob.pullRequest.title}
              </p>
            </div>
            <StatusBadge status={r.reviewJob.status} className="shrink-0" />
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-mono text-foreground/70">{r.reviewJob.commitSha.slice(0, 7)}</span>
            </span>
            <span>
              {r.reviewJob.pullRequest.baseBranch} ← {r.reviewJob.pullRequest.headBranch}
            </span>
            <span>by {r.reviewJob.pullRequest.authorLogin}</span>
            <span className="ml-auto">{formatDistanceToNow(new Date(r.createdAt))} ago</span>
          </div>

          {/* Findings row */}
          {r.reviewJob.status === 'COMPLETED' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Findings:</span>
              {severityDot(r.totalFindings)}
              <span className="text-muted-foreground">{r.totalFindings} total</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">via {r.provider}/{r.model}</span>
            </div>
          )}
        </Link>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
