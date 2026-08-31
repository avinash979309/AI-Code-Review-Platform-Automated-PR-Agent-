/**
 * MockAIProvider — returns deterministic structured findings for any input.
 * Used when AI_PROVIDER=mock (default).
 */
import type {
  AIProvider,
  ReviewContext,
  ReviewResult,
  Finding,
} from '@coderev/shared';
import { VECTOR_DEFAULTS } from '@coderev/shared';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateReview(context: ReviewContext): Promise<ReviewResult> {
    const diffLines = context.diff.split('\n');
    const findings: Finding[] = [];

    let currentFile = 'unknown.ts';
    let currentLine = 1;

    for (const line of diffLines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) currentFile = match[1];
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        if (match) currentLine = parseInt(match[1], 10);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        const content = line.slice(1);

        if (/console\.(log|error|warn|debug)\s*\(/.test(content)) {
          findings.push({
            file: currentFile,
            startLine: currentLine,
            endLine: currentLine,
            severity: 'info',
            title: 'Console statement in production code',
            description:
              'Console statements should be removed or replaced with a proper logger before merging to main.',
            suggestion: 'Use a structured logger (e.g., pino, winston) instead of console.*.',
            confidence: 0.85,
          });
        }

        if (/:\s*any\b/.test(content)) {
          findings.push({
            file: currentFile,
            startLine: currentLine,
            endLine: currentLine,
            severity: 'warning',
            title: 'Explicit `any` type usage',
            description:
              'Using `any` disables TypeScript type checking. Prefer a more specific type.',
            suggestion:
              'Replace `any` with the correct type or `unknown` if the type is truly unknown.',
            confidence: 0.9,
          });
        }

        if (/TODO|FIXME|HACK|XXX/.test(content)) {
          findings.push({
            file: currentFile,
            startLine: currentLine,
            endLine: currentLine,
            severity: 'info',
            title: 'TODO/FIXME comment left in code',
            description: 'Found a TODO/FIXME comment. Ensure this is tracked in an issue.',
            suggestion: 'Create a GitHub issue and reference it here, or resolve the TODO.',
            confidence: 0.7,
          });
        }

        currentLine++;
      } else if (!line.startsWith('-') && !line.startsWith('---') && !line.startsWith('\\')) {
        currentLine++;
      }
    }

    // Always add at least one structural finding from AST context
    for (const summary of context.astSummary) {
      for (const fn of summary.functions) {
        const span = fn.endLine - fn.startLine;
        if (span > 30) {
          findings.push({
            file: summary.file,
            startLine: fn.startLine,
            endLine: fn.endLine,
            severity: 'warning',
            title: `Function \`${fn.name}\` is too long (${span} lines)`,
            description:
              `Functions longer than 30 lines are harder to test and maintain. ` +
              `Consider extracting sub-functions.`,
            suggestion: `Break \`${fn.name}\` into smaller, single-responsibility functions.`,
            confidence: 0.8,
          });
          break; // one structural finding per file
        }
      }

      // Flag files with many imports (potential coupling issue)
      if (summary.imports.length > 8) {
        findings.push({
          file: summary.file,
          startLine: 1,
          endLine: summary.imports.length,
          severity: 'info',
          title: `High import count (${summary.imports.length} imports)`,
          description:
            `This file imports from ${summary.imports.length} modules. ` +
            `High coupling may indicate this module has too many responsibilities.`,
          suggestion: 'Consider splitting this module or grouping related imports into barrel files.',
          confidence: 0.65,
        });
      }
    }

    // If diff had added lines, flag overall complexity
    const addedLineCount = context.diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .length;

    if (addedLineCount > 20 && context.astSummary.length > 0) {
      const firstFile = context.astSummary[0].file;
      findings.push({
        file: firstFile,
        startLine: 1,
        endLine: Math.min(addedLineCount, 50),
        severity: 'info',
        title: `Large changeset: ${addedLineCount} added lines`,
        description:
          `This PR adds ${addedLineCount} lines. Large PRs are harder to review thoroughly. ` +
          `Consider splitting into smaller PRs if possible.`,
        confidence: 0.6,
      });
    }

    // De-duplicate by file+line+title
    const seen = new Set<string>();
    const unique = findings.filter((f) => {
      const key = `${f.file}:${f.startLine}:${f.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const retryNote =
      context.previousErrors?.length
        ? ` Retry due to: ${context.previousErrors.map((e) => e.message).join('; ')}.`
        : '';

    return {
      findings: unique,
      summary:
        `Mock AI review complete. Analyzed ${context.astSummary.length} file(s), ` +
        `${context.retrievedContext.length} retrieved context chunk(s). ` +
        `Found ${unique.length} finding(s).${retryNote}`,
      model: 'mock-v1',
      provider: 'mock',
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Deterministic pseudo-random 384-dim vector seeded by text content
    const dim = VECTOR_DEFAULTS.dimensions;
    const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 997;
    return Array.from({ length: dim }, (_, i) => {
      const x = Math.sin(seed * (i + 1) + i) * 10000;
      return (x - Math.floor(x)) * 2 - 1;
    });
  }
}
