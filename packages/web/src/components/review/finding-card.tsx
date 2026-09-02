/**
 * FindingCard — single finding with severity, title, description, suggestion, and Accept button.
 */
import type { Finding } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, CheckCircle, XCircle, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useReviewStore } from '@/stores/review-store';

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  critical: {
    bg: 'bg-red-950/40',
    text: 'text-red-300',
    border: 'border-red-800/50',
    label: '🔴 Critical',
  },
  error: {
    bg: 'bg-red-950/30',
    text: 'text-red-400',
    border: 'border-red-800/30',
    label: '🟠 Error',
  },
  warning: {
    bg: 'bg-yellow-950/30',
    text: 'text-yellow-300',
    border: 'border-yellow-800/30',
    label: '🟡 Warning',
  },
  info: {
    bg: 'bg-blue-950/30',
    text: 'text-blue-300',
    border: 'border-blue-800/30',
    label: '🔵 Info',
  },
};

interface Props {
  finding: Finding;
  isActive?: boolean;
  onClick?: () => void;
}

export function FindingCard({ finding, isActive, onClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const style = SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info;
  const { acceptedFindings, acceptFinding } = useReviewStore();
  const isAccepted = acceptedFindings.has(finding.id);

  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-xs transition-colors cursor-pointer',
        style.bg,
        style.border,
        isActive && 'ring-1 ring-primary',
        isAccepted && 'ring-1 ring-green-500/60 border-green-700/40',
      )}
      onClick={() => {
        setExpanded((v) => !v);
        onClick?.();
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <span className={cn('shrink-0 font-semibold', style.text)}>{style.label}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground/90 leading-snug">{finding.title}</p>
          <p className="text-muted-foreground font-mono mt-0.5">
            {finding.file}:{finding.startLine}–{finding.endLine}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {isAccepted && (
            <CheckCheck className="h-3.5 w-3.5 text-green-400" aria-label="Accepted" />
          )}
          {finding.validated ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
          <p className="text-foreground/80 leading-relaxed">{finding.description}</p>
          {finding.suggestion && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">Suggestion</p>
              <p className="text-foreground/70 leading-relaxed">{finding.suggestion}</p>
            </div>
          )}
          {finding.suggestedPatch && (
            <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[11px] text-green-300 font-mono">
              {finding.suggestedPatch}
            </pre>
          )}
          <div className="flex items-center justify-between gap-3 text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>Confidence: {Math.round(finding.confidence * 100)}%</span>
              <span>·</span>
              <span>{finding.validated ? 'Validated' : 'Not validated'}</span>
            </div>
            {isAccepted ? (
              <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors bg-green-900/40 text-green-300">
                <CheckCheck className="h-3 w-3" />
                ✓ Accepted
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  acceptFinding(finding.id);
                }}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors bg-primary/10 text-primary hover:bg-primary/20"
              >
                <CheckCheck className="h-3 w-3" />
                Accept
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
