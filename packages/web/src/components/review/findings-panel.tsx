'use client';

import type { Finding, CodeFile } from '@/lib/api';
import { FindingCard } from './finding-card';
import { AlertTriangle } from 'lucide-react';

interface Props {
  findings: Finding[];
  selectedFile: CodeFile | null;
  onFindingClick?: (f: Finding) => void;
}

const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info'];

export function FindingsPanel({ findings, selectedFile, onFindingClick }: Props) {
  // Filter to selected file or show all
  const filtered = selectedFile
    ? findings.filter((f) => f.file === selectedFile.path)
    : findings;

  const sorted = [...filtered].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-orange-400" />
        <span className="text-sm font-medium text-foreground">Findings</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {sorted.length}{selectedFile ? ` in ${selectedFile.path.split('/').pop()}` : ' total'}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs">
            <AlertTriangle className="h-6 w-6 mb-2 opacity-40" />
            {selectedFile ? 'No findings in this file' : 'No findings'}
          </div>
        ) : (
          sorted.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              onClick={() => onFindingClick?.(f)}
            />
          ))
        )}
      </div>
    </div>
  );
}
