/**
 * Status bar — shows current pipeline stage from live Socket.IO events.
 */
'use client';

import type { JobStatusEvent, JobProgressEvent } from '@coderev/shared';
import { cn } from '@/lib/utils';

const STAGE_ORDER = [
  'FETCHING_DIFF',
  'SANDBOX_RUNNING',
  'ANALYZING_AST',
  'RETRIEVING_CONTEXT',
  'AI_REVIEWING',
  'COMPLETED',
];

interface Props {
  liveStatus: JobStatusEvent | null;
  liveProgress: JobProgressEvent[];
  connected: boolean;
}

export function StatusBar({ liveStatus, liveProgress, connected }: Props) {
  const currentStageIdx = liveStatus
    ? STAGE_ORDER.indexOf(liveStatus.status as string)
    : -1;

  const lastProgress = liveProgress[liveProgress.length - 1];

  return (
    <div className="flex items-center gap-3 border-t border-border bg-card/50 px-4 py-2 text-xs">
      {/* Connection indicator */}
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-green-400' : 'bg-red-400',
        )}
      />
      <span className="text-muted-foreground">{connected ? 'Live' : 'Disconnected'}</span>

      {liveStatus && (
        <>
          <span className="text-border">|</span>
          {/* Stage progress dots */}
          <div className="flex items-center gap-1">
            {STAGE_ORDER.filter((s) => s !== 'COMPLETED').map((stage, i) => (
              <span
                key={stage}
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  i < currentStageIdx
                    ? 'bg-green-500'
                    : i === currentStageIdx
                    ? 'bg-primary animate-pulse'
                    : 'bg-border',
                )}
              />
            ))}
          </div>
          <span className="text-foreground/70">
            {liveStatus.status === 'COMPLETED' ? '✓ Complete' : liveStatus.status.replace(/_/g, ' ')}
          </span>
        </>
      )}

      {lastProgress && (
        <>
          <span className="text-border">|</span>
          <span className="truncate max-w-xs text-muted-foreground">{lastProgress.message}</span>
        </>
      )}
    </div>
  );
}
