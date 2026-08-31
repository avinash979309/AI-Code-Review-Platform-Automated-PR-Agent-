/**
 * AI_REVIEW pipeline stage.
 * Builds ReviewContext from all prior stage outputs and runs the LangChainReviewer.
 * Returns the raw ReviewResult (validation happens in the next stage).
 */
import type { AIProvider, ReviewContext, ReviewResult, ASTSummary, SandboxLogs, RetrievedChunk, ValidationError } from '@coderev/shared';
import type { DiffFile } from './fetch-diff.js';
import { LangChainReviewer } from '../ai/langchain-reviewer.js';

export interface AIReviewInput {
  provider: AIProvider;
  diffFiles: DiffFile[];
  astSummaries: ASTSummary[];
  sandboxLogs: SandboxLogs;
  retrievedContext: RetrievedChunk[];
  previousErrors?: ValidationError[];
}

/**
 * Build unified diff string from DiffFile array.
 */
function buildDiffString(diffFiles: DiffFile[]): string {
  return diffFiles
    .map((f) => {
      const header = [
        `diff --git a/${f.path} b/${f.path}`,
        `--- a/${f.path}`,
        `+++ b/${f.path}`,
      ].join('\n');
      return f.patch ? `${header}\n${f.patch}` : header;
    })
    .join('\n');
}

export async function runAIReviewStage(input: AIReviewInput): Promise<ReviewResult> {
  const diff = buildDiffString(input.diffFiles);

  const context: ReviewContext = {
    diff,
    astSummary: input.astSummaries,
    sandboxLogs: input.sandboxLogs,
    retrievedContext: input.retrievedContext,
    previousErrors: input.previousErrors,
  };

  const reviewer = new LangChainReviewer(input.provider);
  const result = await reviewer.run(context);

  console.log(
    `[ai-review] provider=${result.provider} model=${result.model} findings=${result.findings.length}`,
  );

  return result;
}

/**
 * Re-exported for use in self-correction stage.
 */
export { buildDiffString };
