'use client';

import { useState } from 'react';
import { useReview } from '@/hooks/use-review';
import { useSocketStore } from '@/stores/socket-store';
import { useReviewStore } from '@/stores/review-store';
import { pushChanges } from '@/lib/api';
import { FileTree } from './file-tree';
import { CodeEditor } from './code-editor';
import { DiffEditor } from './diff-editor';
import { FindingsPanel } from './findings-panel';
import { StatusBar } from './status-bar';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  GitBranch,
  GitCommit,
  User,
  RefreshCw,
  GitPullRequestArrow,
  Loader2,
  CheckCircle2,
  CheckCheck,
} from 'lucide-react';

interface Props {
  reviewId: string;
}

type EditorMode = 'diff' | 'source';

export function ReviewWorkspace({ reviewId }: Props) {
  const {
    review,
    findings,
    files,
    selectedFile,
    setSelectedFile,
    liveStatus,
    liveProgress,
    reload,
  } = useReview(reviewId);

  const { connected } = useSocketStore();
  const {
    acceptedFiles,
    getAcceptedContent,
    currentFiles,
    currentFindings,
    acceptedFindings,
    acceptAllFindings,
  } = useReviewStore();

  const [editorMode, setEditorMode] = useState<EditorMode>('diff');
  const [pushing, setPushing] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  if (!review) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading review…
      </div>
    );
  }

  const pr = review.reviewJob.pullRequest;

  // Gate push on accepted findings, not acceptedFiles (new flow)
  const acceptedFindingCount = acceptedFindings.size;

  // Group accepted findings by file to build push payload
  async function handlePush() {
    if (acceptedFindingCount === 0) return;
    setPushing(true);
    setPushMessage(null);
    setPushError(null);
    try {
      // Get unique files that have at least one accepted finding
      const affectedFileIds = new Set<string>();
      for (const f of currentFindings) {
        if (acceptedFindings.has(f.id)) {
          const file = currentFiles.find((cf) => cf.path === f.file);
          if (file) affectedFileIds.add(file.id);
        }
      }
      const payload = {
        acceptedFiles: Array.from(affectedFileIds).map((fileId) => ({
          fileId,
          content: getAcceptedContent(fileId, currentFiles, currentFindings) ?? '',
        })),
      };
      const result = await pushChanges(review!.id, payload);
      setPushMessage(result.message);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Review header */}
      <div className="border-b border-border bg-card/50 px-4 py-3">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {pr.repository.fullName} #{pr.number}
              </span>
              <StatusBadge
                status={liveStatus ? String(liveStatus.status) : review.reviewJob.status}
              />
              <button
                onClick={reload}
                className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>

              {/* Push Changes button */}
              <button
                onClick={handlePush}
                disabled={acceptedFindingCount === 0 || pushing}
                title={acceptedFindingCount === 0 ? 'Accept at least one finding to enable push' : `Push ${acceptedFindingCount} accepted fix(es) to PR branch`}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  acceptedFindingCount > 0 && !pushing
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50',
                )}
              >
                {pushing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitPullRequestArrow className="h-3.5 w-3.5" />
                )}
                {pushing ? 'Pushing…' : `Push Changes${acceptedFindingCount > 0 ? ` (${acceptedFindingCount})` : ''}`}
              </button>
            </div>

            <p className="mt-0.5 text-sm text-muted-foreground truncate">{pr.title}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" /> {pr.authorLogin}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" /> {pr.baseBranch} ← {pr.headBranch}
              </span>
              <span className="flex items-center gap-1">
                <GitCommit className="h-3 w-3" />
                <span className="font-mono">{review.reviewJob.commitSha.slice(0, 7)}</span>
              </span>
              <span>{formatDistanceToNow(new Date(review.createdAt))} ago</span>
              <span className="text-foreground/50">
                {findings.length} findings · {review.provider}/{review.model}
              </span>
            </div>

            {/* Push status toasts */}
            {pushMessage && (
              <div className="mt-2 flex items-center gap-2 rounded bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {pushMessage}
              </div>
            )}
            {pushError && (
              <div className="mt-2 rounded bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs text-red-400">
                Error: {pushError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3-panel workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: file tree */}
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
            Files ({files.length})
          </div>
          <FileTree
            files={files}
            findings={findings}
            selectedFile={selectedFile}
            onSelect={setSelectedFile}
            acceptedFiles={acceptedFiles}
          />
        </div>

        {/* Center: editor panel */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Editor toolbar */}
          <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/30">
            {/* Source | Diff toggle */}
            <div className="flex rounded overflow-hidden border border-border text-xs font-medium">
              <button
                onClick={() => setEditorMode('source')}
                className={cn(
                  'px-3 py-1 transition-colors',
                  editorMode === 'source'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/30',
                )}
              >
                Source
              </button>
              <button
                onClick={() => setEditorMode('diff')}
                className={cn(
                  'px-3 py-1 transition-colors border-l border-border',
                  editorMode === 'diff'
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/30',
                )}
              >
                Diff
              </button>
            </div>

            <div className="flex-1" />

            {/* Accept Changes for current file */}
            {selectedFile && (() => {
              const fileFindings = findings.filter((f) => f.file === selectedFile.path);
              const allAccepted = fileFindings.length > 0 && fileFindings.every((f) => acceptedFindings.has(f.id));
              return (
                <button
                  onClick={() => acceptAllFindings(fileFindings.map(f => f.id))}
                  disabled={allAccepted || fileFindings.length === 0}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    allAccepted
                      ? 'bg-green-600/20 border border-green-600/50 text-green-400 cursor-not-allowed'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {allAccepted ? 'Accepted' : 'Accept Changes'}
                </button>
              );
            })()}

            {/* Accept All */}
            {(() => {
              const allAccepted = findings.length > 0 && findings.every((f) => acceptedFindings.has(f.id));
              return (
                <button
                  onClick={() => acceptAllFindings(findings.map(f => f.id))}
                  disabled={allAccepted || findings.length === 0}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    allAccepted
                      ? 'bg-green-600/20 border border-green-600/50 text-green-400 cursor-not-allowed'
                      : findings.length > 0
                        ? 'bg-muted text-muted-foreground hover:text-foreground hover:bg-accent'
                        : 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Accept All
                </button>
              );
            })()}
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            {editorMode === 'diff' ? (
              <DiffEditor file={selectedFile} findings={findings} acceptedFindings={acceptedFindings} />
            ) : (
              <CodeEditor file={selectedFile} findings={findings} />
            )}
          </div>
        </div>

        {/* Right: findings panel */}
        <div className="w-80 shrink-0 border-l border-border overflow-hidden flex flex-col">
          <FindingsPanel findings={findings} selectedFile={selectedFile} />
        </div>
      </div>

      {/* Bottom: status bar */}
      <StatusBar
        liveStatus={liveStatus}
        liveProgress={liveProgress}
        connected={connected}
      />
    </div>
  );
}
