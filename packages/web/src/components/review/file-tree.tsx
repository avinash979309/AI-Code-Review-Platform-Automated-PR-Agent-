/**
 * FileTree — list of changed files with finding count per file.
 */
'use client';

import type { CodeFile, Finding } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FileCode, CheckCircle2 } from 'lucide-react';

interface Props {
  files: CodeFile[];
  findings: Finding[];
  selectedFile: CodeFile | null;
  onSelect: (f: CodeFile) => void;
  acceptedFiles?: Set<string>;
}


function fileLanguageColor(lang: string | null) {
  switch (lang) {
    case 'typescript':
    case 'tsx':
      return 'text-blue-400';
    case 'javascript':
    case 'jsx':
      return 'text-yellow-400';
    case 'python':
      return 'text-green-400';
    default:
      return 'text-muted-foreground';
  }
}

export function FileTree({ files, findings, selectedFile, onSelect, acceptedFiles }: Props) {
  const findingsByFile = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.file] = (acc[f.file] ?? 0) + 1;
    return acc;
  }, {});

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs">
        <FileCode className="h-8 w-8 mb-2 opacity-50" />
        No files
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {files.map((f) => {
        const count = findingsByFile[f.path] ?? 0;
        const selected = selectedFile?.id === f.id;
        const accepted = acceptedFiles?.has(f.id) ?? false;
        const parts = f.path.split('/');
        const name = parts[parts.length - 1];
        const dir = parts.slice(0, -1).join('/');

        return (
          <button
            key={f.id}
            onClick={() => onSelect(f)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
              'hover:bg-accent/50',
              selected ? 'bg-accent/80 text-foreground' : 'text-muted-foreground',
            )}
          >
            <FileCode className={cn('h-3.5 w-3.5 shrink-0', fileLanguageColor(f.language))} />
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground/90">{name}</span>
              {dir && <span className="block truncate text-[10px] text-muted-foreground">{dir}</span>}
            </div>
            <div className="shrink-0 flex items-center gap-1.5 text-[10px]">
              {accepted && (
                <span title="Changes accepted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                </span>
              )}
              <span className="text-green-400">+{f.linesAdded}</span>
              <span className="text-red-400">-{f.linesRemoved}</span>
              {count > 0 && (
                <span className="rounded-full bg-orange-500/20 px-1.5 text-orange-300 font-semibold">
                  {count}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
