/**
 * StatusBadge — colored pill for ReviewJob status values.
 */
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  FETCHING_DIFF: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
  SANDBOX_RUNNING: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
  ANALYZING_AST: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
  RETRIEVING_CONTEXT: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
  AI_REVIEWING: 'bg-orange-900/40 text-orange-300 border border-orange-700/50',
  COMPLETED: 'bg-green-900/40 text-green-300 border border-green-700/50',
  FAILED: 'bg-red-900/40 text-red-300 border border-red-700/50',
  FAILED_VALIDATION: 'bg-red-900/40 text-red-300 border border-red-700/50',
};

const STATUS_LABELS: Record<string, string> = {
  FETCHING_DIFF: 'Fetching Diff',
  SANDBOX_RUNNING: 'Sandbox',
  ANALYZING_AST: 'AST Analysis',
  RETRIEVING_CONTEXT: 'Vector Retrieval',
  AI_REVIEWING: 'AI Reviewing',
  FAILED_VALIDATION: 'Validation Failed',
};

interface Props {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        style,
        className,
      )}
    >
      {status === 'COMPLETED' && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
      )}
      {(status === 'FAILED' || status === 'FAILED_VALIDATION') && (
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
      )}
      {!['COMPLETED', 'FAILED', 'FAILED_VALIDATION', 'PENDING'].includes(status) && (
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
