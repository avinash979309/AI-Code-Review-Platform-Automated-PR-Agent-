'use client';

import { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { CodeFile, Finding } from '@/lib/api';
import type { editor as MonacoEditorType } from 'monaco-editor';

// Monaco must be loaded client-side only
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      Loading editor…
    </div>
  ),
});

interface Props {
  file: CodeFile | null;
  findings?: Finding[];
}

function guessLanguage(file: CodeFile): string {
  if (file.language) return file.language;
  const ext = file.path.split('.').pop() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    html: 'html',
  };
  return map[ext] ?? 'plaintext';
}

/** Severity → highlight CSS class */
const SEVERITY_CLASS: Record<string, string> = {
  critical: 'findingHighlightCritical',
  error:    'findingHighlightError',
  warning:  'findingHighlightWarning',
  info:     'findingHighlightInfo',
};

export function CodeEditor({ file, findings = [] }: Props) {
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  // Re-apply decorations whenever file or findings change
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !file) return;

    const fileFindings = findings.filter((f) => f.file === file.path);

    const newDecorations: MonacoEditorType.IModelDeltaDecoration[] = fileFindings.map((f) => ({
      range: {
        startLineNumber: f.startLine,
        startColumn: 1,
        endLineNumber: f.endLine,
        endColumn: Number.MAX_SAFE_INTEGER,
      },
      options: {
        isWholeLine: true,
        className: SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.info,
        glyphMarginClassName: `findingGlyph findingGlyph--${f.severity}`,
        hoverMessage: { value: `**${f.title}** (${f.severity})\n\n${f.description}` },
        overviewRuler: {
          color: f.severity === 'critical' ? '#ef4444' : f.severity === 'warning' ? '#eab308' : '#3b82f6',
          position: 4, // Right
        },
      },
    }));

    decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, newDecorations);
  }, [file, findings]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Select a file to view
      </div>
    );
  }

  return (
    <MonacoEditor
      height="100%"
      value={file.content ?? (file.patch ? `// Diff patch:\n${file.patch}` : '// No content available')}
      language={file.content ? guessLanguage(file) : 'diff'}
      theme="vs-dark"
      options={{
        readOnly: true,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        wordWrap: 'off',
        folding: true,
        glyphMargin: true,
        automaticLayout: true,
        renderLineHighlight: 'line',
      }}
      onMount={(editor, monaco) => {
        editorRef.current = editor;

        // Register transparent highlight CSS for finding decorations
        monaco.editor.defineTheme('vs-dark-findings', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {},
        });

        // Inject highlight styles into the document
        const styleId = 'finding-highlight-styles';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            .findingHighlightCritical { background: rgba(239,68,68,0.15) !important; border-left: 3px solid rgba(239,68,68,0.7); }
            .findingHighlightError    { background: rgba(239,68,68,0.10) !important; border-left: 3px solid rgba(239,68,68,0.5); }
            .findingHighlightWarning  { background: rgba(234,179,8,0.12) !important;  border-left: 3px solid rgba(234,179,8,0.6); }
            .findingHighlightInfo     { background: rgba(59,130,246,0.12) !important; border-left: 3px solid rgba(59,130,246,0.5); }
            .findingGlyph { width: 5px !important; border-radius: 2px; margin-left: 3px; }
            .findingGlyph--critical { background: #ef4444; }
            .findingGlyph--error    { background: #f97316; }
            .findingGlyph--warning  { background: #eab308; }
            .findingGlyph--info     { background: #3b82f6; }
          `;
          document.head.appendChild(style);
        }

        // Apply initial decorations
        if (file) {
          const fileFindings = findings.filter((f) => f.file === file.path);
          const decorations: MonacoEditorType.IModelDeltaDecoration[] = fileFindings.map((f) => ({
            range: {
              startLineNumber: f.startLine,
              startColumn: 1,
              endLineNumber: f.endLine,
              endColumn: Number.MAX_SAFE_INTEGER,
            },
            options: {
              isWholeLine: true,
              className: SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.info,
              glyphMarginClassName: `findingGlyph findingGlyph--${f.severity}`,
              hoverMessage: { value: `**${f.title}** (${f.severity})\n\n${f.description}` },
              overviewRuler: {
                color: f.severity === 'critical' ? '#ef4444' : f.severity === 'warning' ? '#eab308' : '#3b82f6',
                position: 4,
              },
            },
          }));
          decorationIdsRef.current = editor.deltaDecorations([], decorations);
        }
      }}
    />
  );
}
