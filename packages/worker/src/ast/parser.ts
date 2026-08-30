/**
 * AST parser wrapper using @babel/parser.
 * Supports TypeScript, JSX, TSX.
 */
import { parse } from '@babel/parser';
import type { ParserPlugin, File } from '@babel/parser';
import type { Node } from '@babel/types';

export type SupportedExtension = 'ts' | 'tsx' | 'js' | 'jsx';

const SUPPORTED_EXTENSIONS: SupportedExtension[] = ['ts', 'tsx', 'js', 'jsx'];

export function isSupportedFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return (SUPPORTED_EXTENSIONS as string[]).includes(ext);
}

export function getFileExtension(filePath: string): SupportedExtension | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if ((SUPPORTED_EXTENSIONS as string[]).includes(ext)) {
    return ext as SupportedExtension;
  }
  return null;
}

export function parseSource(source: string, filePath: string): File {
  const ext = getFileExtension(filePath);
  const isTypeScript = ext === 'ts' || ext === 'tsx';
  const isJsx = ext === 'tsx' || ext === 'jsx';

  const plugins: ParserPlugin[] = [
    'decorators-legacy',
    'exportDefaultFrom',
  ];

  if (isTypeScript) plugins.push('typescript');
  if (isJsx) plugins.push('jsx');

  return parse(source, {
    sourceType: 'module',
    strictMode: false,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins,
  });
}

/**
 * Count all AST nodes via recursive traversal.
 */
export function countNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const obj = node as Record<string, unknown>;
  if (!obj['type']) return 0;

  let count = 1;
  for (const key of Object.keys(obj)) {
    if (key === 'type' || key === 'loc' || key === 'start' || key === 'end' || key === 'extra') {
      continue;
    }
    const child = obj[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        count += countNodes(item);
      }
    } else if (child && typeof child === 'object') {
      count += countNodes(child);
    }
  }
  return count;
}

export type { File, Node };
