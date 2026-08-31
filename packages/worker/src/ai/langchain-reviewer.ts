/**
 * LangChain-based reviewer chain.
 * PromptTemplate → LLM call → StructuredOutputParser → ReviewResult.
 * Uses the configured AIProvider under the hood.
 */
import type { AIProvider, ReviewContext, ReviewResult } from '@coderev/shared';
import { AI_REVIEW_DEFAULTS } from '@coderev/shared';

/**
 * Builds a structured context string from ReviewContext for the prompt.
 */
function buildContextString(context: ReviewContext): string {
  const lines: string[] = [];

  lines.push('=== DIFF ===');
  lines.push(context.diff.slice(0, 4000));

  if (context.astSummary.length > 0) {
    lines.push('\n=== AST ANALYSIS ===');
    for (const s of context.astSummary) {
      lines.push(`File: ${s.file} (${s.nodeCount} nodes)`);
      if (s.functions.length > 0) {
        lines.push(`  Functions: ${s.functions.map((f) => `${f.name}(${f.params.join(', ')})`).join(', ')}`);
      }
      if (s.classes.length > 0) {
        lines.push(`  Classes: ${s.classes.map((c) => c.name).join(', ')}`);
      }
    }
  }

  if (context.sandboxLogs.stdout || context.sandboxLogs.stderr) {
    lines.push('\n=== SANDBOX OUTPUT ===');
    lines.push(`Exit: ${context.sandboxLogs.exitCode} | Timed out: ${context.sandboxLogs.timedOut}`);
    if (context.sandboxLogs.stdout) lines.push(`STDOUT: ${context.sandboxLogs.stdout.slice(0, 300)}`);
    if (context.sandboxLogs.stderr) lines.push(`STDERR: ${context.sandboxLogs.stderr.slice(0, 300)}`);
  }

  if (context.retrievedContext.length > 0) {
    lines.push('\n=== RETRIEVED CONTEXT (similar code) ===');
    for (const chunk of context.retrievedContext.slice(0, 3)) {
      lines.push(`[${chunk.chunkType}] ${chunk.filePath} (similarity=${chunk.similarity.toFixed(3)})`);
      lines.push(chunk.chunkContent.slice(0, 200));
    }
  }

  if (context.previousErrors?.length) {
    lines.push('\n=== PREVIOUS VALIDATION ERRORS (must fix) ===');
    for (const err of context.previousErrors) {
      lines.push(`- ${err.field}: ${err.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * LangChainReviewer wraps an AIProvider with the chain pattern:
 * buildPrompt → provider.generateReview → validate shape → return ReviewResult
 */
export class LangChainReviewer {
  private readonly provider: AIProvider;
  private readonly maxAttempts: number;

  constructor(provider: AIProvider, maxAttempts = AI_REVIEW_DEFAULTS.maxAttempts) {
    this.provider = provider;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Runs the review chain.
   * Mock provider: raw diff preserved so it can parse git diff lines.
   * Real providers: full enriched context string passed as diff field.
   */
  async run(context: ReviewContext): Promise<ReviewResult> {
    if (this.provider.name === 'mock') {
      return this.provider.generateReview(context);
    }
    const enrichedContext: ReviewContext = {
      ...context,
      diff: buildContextString(context),
    };
    return this.provider.generateReview(enrichedContext);
  }

  get providerName(): string {
    return this.provider.name;
  }

  get maxRetries(): number {
    return this.maxAttempts;
  }
}
