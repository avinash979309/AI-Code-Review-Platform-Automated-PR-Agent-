'use client';

/**
 * DiffEditor — Monaco split diff view.
 * Left (original): file.content from GitHub.
 * Right (modified): content with AI-suggested replacements inlined.
 *   - If finding has suggestedPatch, it replaces the lines.
 *   - Otherwise, the finding suggestion text is injected as a comment block.
 * Blue highlight decorations mark affected lines on both sides.
 */

import { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CodeFile, Finding } from '@/lib/api';
import type { editor as MonacoEditorNS } from 'monaco-editor';

const MonacoDiffEditor = dynamic(
  () => import('@monaco-editor/react').then((m) => m.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Loading diff editor…
      </div>
    ),
  },
);

interface Props {
  file: CodeFile | null;
  findings: Finding[];
  acceptedFindings: Set<string>;
}

function guessLanguage(file: CodeFile): string {
  if (file.language) return file.language;
  const ext = file.path.split('.').pop() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'go', rs: 'rust',
    java: 'java', json: 'json',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', css: 'css', html: 'html',
  };
  return map[ext] ?? 'plaintext';
}
function buildSuggestedContent(file: CodeFile, findings: Finding[]): string {
  const lines = (file.content ?? '').split('\n');
  const cp = file.path.endsWith('.py') ? '#' : '//';
  
  // Sort descending by startLine to splice without offset issues
  const fileFindings = findings
    .filter(f => f.file === file.path)
    .sort((a, b) => b.startLine - a.startLine);
  
  for (const f of fileFindings) {
    const s = Math.max(0, f.startLine - 1); // 0-indexed
    const e = Math.min(lines.length - 1, f.endLine - 1);
    
    if (f.suggestedPatch) {
      lines.splice(s, e - s + 1, ...f.suggestedPatch.split('\n'));
    } else {
      // Extract longest backtick code from suggestion
      const matches = [...(f.suggestion ?? '').matchAll(/`([^`]+)`/g)];
      const code = matches.map(m => m[1]).filter(s => s.length > 8).reduce((a, b) => a.length > b.length ? a : b, '');
      
      if (code && f.startLine === f.endLine) {
        // Single-line: replace the line preserving indentation
        const indent = (lines[s] ?? '').match(/^(\s*)/)?.[1] ?? '';
        lines.splice(s, 1, `${indent}${code};`);
      } else {
        // Multi-line or no code: prepend suggestion comment, keep original lines
        const wrapped = `${cp} 🔧 [${f.severity.toUpperCase()}] ${f.title}: ${f.suggestion ?? ''}`;
        lines.splice(s, 0, wrapped);
      }
    }
  }
  return lines.join('\n');
}

export function buildModifiedContent(file: CodeFile, findings: Finding[]): { content: string; highlightLines: number[] } {
  return { content: buildSuggestedContent(file, findings), highlightLines: [] };
}

/** Inject shared CSS for finding decorations (idempotent) */
function injectFindingStyles() {
  const id = 'finding-highlight-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .findingPending { background: rgba(59,130,246,0.12) !important; border-left: 3px solid #3b82f6; }
    .findingHighlightCritical { background: rgba(239,68,68,0.18) !important; border-left: 3px solid rgba(239,68,68,0.8); }
    .findingHighlightError    { background: rgba(239,68,68,0.13) !important; border-left: 3px solid rgba(239,68,68,0.6); }
    .findingHighlightWarning  { background: rgba(234,179,8,0.15) !important;  border-left: 3px solid rgba(234,179,8,0.7); }
    .findingHighlightInfo     { background: rgba(59,130,246,0.18) !important; border-left: 3px solid rgba(59,130,246,0.7); }
    .findingHighlightSuggestion { background: rgba(59,130,246,0.12) !important; border-left: 3px solid rgba(99,179,246,0.6); }
    .findingGlyph { width: 5px !important; border-radius: 2px; margin-left: 3px; }
    .findingGlyph--critical { background: #ef4444; }
    .findingGlyph--error    { background: #f97316; }
    .findingGlyph--warning  { background: #eab308; }
    .findingGlyph--info     { background: #3b82f6; }
  `;
  document.head.appendChild(style);
}



export function DiffEditor({ file, findings, acceptedFindings }: Props) {
  const decorOrigRef = useRef<string[]>([]);
  const origEditorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!origEditorRef.current || !file) return;
    const fileFindings = findings.filter((f) => f.file === file.path);
    
    const origDecorations: MonacoEditorNS.IModelDeltaDecoration[] = fileFindings
      .filter((f) => !acceptedFindings.has(f.id))
      .map((f) => ({
        range: {
          startLineNumber: f.startLine,
          startColumn: 1,
          endLineNumber: f.endLine,
          endColumn: Number.MAX_SAFE_INTEGER,
        },
        options: {
          isWholeLine: true,
          className: 'findingPending',
          hoverMessage: { value: `**${f.title}** (${f.severity})\n\n${f.description}` },
        },
      }));
      
    decorOrigRef.current = origEditorRef.current.deltaDecorations(decorOrigRef.current, origDecorations);
  }, [acceptedFindings, file, findings]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select a file to view diff
      </div>
    );
  }

  const original = file.content ?? (file.patch ? `// Diff patch:\n${file.patch}` : '// No content available');
  const { content: modified } = buildModifiedContent(file, findings);
  const language = file.content ? guessLanguage(file) : 'diff';
  const hasChanges = original !== modified;
  const fileFindings = findings.filter((f) => f.file === file.path);

  return (
    <div className="flex h-full flex-col">
      {/* Column labels */}
      <div className="flex shrink-0 border-b border-border text-[11px] font-medium text-muted-foreground">
        <div className="flex-1 px-4 py-1.5 border-r border-border">Original</div>
        <div className="flex-1 px-4 py-1.5 flex items-center gap-2">
          Suggested
          {!hasChanges && (
            <span className="text-[10px] text-yellow-500/80 italic">
              (no suggestions for this file)
            </span>
          )}
          {hasChanges && (
            <span className="text-[10px] text-blue-400/80 italic">
              ({fileFindings.length} AI suggestion{fileFindings.length !== 1 ? 's' : ''} applied)
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <MonacoDiffEditor
          height="100%"
          original={original}
          modified={modified}
          language={language}
          theme="vs-dark"
          options={{
            readOnly: false,
            originalEditable: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'off',
            folding: true,
            automaticLayout: true,
            renderSideBySide: true,
            enableSplitViewResizing: true,
            glyphMargin: true,
          }}
          onMount={(diffEditor) => {
            injectFindingStyles();
            origEditorRef.current = diffEditor.getOriginalEditor() as MonacoEditorNS.IStandaloneCodeEditor;
            
            const origDecorations: MonacoEditorNS.IModelDeltaDecoration[] = fileFindings
              .filter((f) => !acceptedFindings.has(f.id))
              .map((f) => ({
                range: {
                  startLineNumber: f.startLine,
                  startColumn: 1,
                  endLineNumber: f.endLine,
                  endColumn: Number.MAX_SAFE_INTEGER,
                },
                options: {
                  isWholeLine: true,
                  className: 'findingPending',
                  hoverMessage: { value: `**${f.title}** (${f.severity})\n\n${f.description}` },
                },
              }));
            decorOrigRef.current = origEditorRef.current.deltaDecorations([], origDecorations);
          }}
        />
      </div>
    </div>
  );
}
