/**
 * GeminiProvider — uses Google Gemini API for code review and embeddings.
 * Review model: gemini-2.0-flash (primary), fallback to 2.5-flash-lite, 1.5-flash
 * Embedding model: text-embedding-004 (768-dim, reduced to 384-dim via outputDimensionality)
 */
import type {
  AIProvider,
  ReviewContext,
  ReviewResult,
  Finding,
} from '@coderev/shared';
import { VECTOR_DEFAULTS } from '@coderev/shared';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function buildReviewPrompt(context: ReviewContext): string {
  const astSection = context.astSummary
    .map(
      (s) =>
        `File: ${s.file} (${s.nodeCount} nodes)\n` +
        `  Functions: ${s.functions.map((f) => `${f.name}(lines ${f.startLine}-${f.endLine})`).join(', ') || 'none'}\n` +
        `  Classes: ${s.classes.map((c) => c.name).join(', ') || 'none'}`,
    )
    .join('\n');

  const contextSection = context.retrievedContext
    .map(
      (c) =>
        `[${c.chunkType}] ${c.filePath} (similarity=${c.similarity.toFixed(3)})\n${c.chunkContent.slice(0, 300)}`,
    )
    .join('\n---\n');

  const sandboxSection =
    `Exit code: ${context.sandboxLogs.exitCode}\n` +
    (context.sandboxLogs.stdout ? `stdout: ${context.sandboxLogs.stdout.slice(0, 400)}\n` : '') +
    (context.sandboxLogs.stderr ? `stderr: ${context.sandboxLogs.stderr.slice(0, 400)}` : '');

  const retrySection = context.previousErrors?.length
    ? `\n⚠️  PREVIOUS VALIDATION ERRORS (you MUST fix these in your response):\n${context.previousErrors
        .map((e) => `  - ${e.field}: ${e.message}`)
        .join('\n')}`
    : '';

  return `You are an expert TypeScript/JavaScript code reviewer. Analyze this pull request and return a JSON code review.

## DIFF
\`\`\`diff
${context.diff.slice(0, 4000)}
\`\`\`

## AST ANALYSIS
${astSection}

## SANDBOX EXECUTION
${sandboxSection}

## SIMILAR CODE CONTEXT
${contextSection.slice(0, 800) || 'None available'}
${retrySection}

## INSTRUCTIONS
Return ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "findings": [
    {
      "file": "<relative file path from diff — must exactly match a path shown in the diff>",
      "startLine": <positive integer>,
      "endLine": <positive integer — must be >= startLine>,
      "severity": "critical" | "warning" | "info",
      "title": "<concise title under 100 chars>",
      "description": "<detailed explanation>",
      "suggestion": "<optional fix suggestion>",
      "confidence": <float 0.0-1.0>
    }
  ],
  "summary": "<overall review summary paragraph>"
}

Rules:
- Only report issues in files shown in the diff
- startLine and endLine must be positive integers
- endLine >= startLine always
- Include 3-8 findings for meaningful reviews
- Focus on: bugs, security issues, code quality, TypeScript type safety, missing error handling`;
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private readonly apiKey: string;
  private readonly reviewModel: string;
  private readonly embeddingModel: string;

  constructor(
    apiKey: string,
    reviewModel = 'gemini-flash-latest',
    embeddingModel = 'gemini-embedding-001',
  ) {
    this.apiKey = apiKey;
    this.reviewModel = reviewModel;
    this.embeddingModel = embeddingModel;
  }

  async generateReview(context: ReviewContext): Promise<ReviewResult> {
    const prompt = buildReviewPrompt(context);

    // Try primary model, retry on 503/429 with backoff, then try fallback models
    const models = [this.reviewModel, 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
    let lastError = '';

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this.apiKey}`;
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 90_000); // 90s hard timeout

        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
              },
            }),
          });
        } catch (fetchErr) {
          clearTimeout(fetchTimeout);
          const msg = (fetchErr as Error).message;
          lastError = `Gemini fetch error (model=${model}): ${msg}`;
          console.warn(`[gemini] ${lastError}`);
          // Treat as retriable (network hiccup / abort)
          const delayMs = Math.pow(2, attempt) * 2000;
          await new Promise((r) => setTimeout(r, delayMs));
          if (attempt === 2) break;
          continue;
        }
        clearTimeout(fetchTimeout);

        if (response.ok) {
          console.log(`[gemini] model=${model} attempt=${attempt + 1} success`);
          const data = (await response.json()) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };

          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (!rawText) {
            throw new Error('Gemini returned empty response');
          }

          // Parse JSON
          let parsed: { findings?: Partial<Finding>[]; summary?: string };
          try {
            parsed = JSON.parse(rawText);
          } catch {
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw new Error(`No JSON in Gemini response: ${rawText.slice(0, 200)}`);
            parsed = JSON.parse(match[0]);
          }

          const findings: Finding[] = (parsed.findings ?? []).map((f) => ({
            file: String(f.file ?? 'unknown'),
            startLine: Math.max(1, Math.round(Number(f.startLine ?? 1))),
            endLine: Math.max(1, Math.round(Number(f.endLine ?? f.startLine ?? 1))),
            severity: (['critical', 'warning', 'info'].includes(f.severity as string)
              ? f.severity
              : 'info') as Finding['severity'],
            title: String(f.title ?? 'Finding').slice(0, 200),
            description: String(f.description ?? ''),
            suggestion: f.suggestion ? String(f.suggestion) : undefined,
            suggestedPatch: f.suggestedPatch ? String(f.suggestedPatch) : undefined,
            confidence: Math.min(1, Math.max(0, Number(f.confidence ?? 0.7))),
          }));

          for (const f of findings) {
            if (f.endLine < f.startLine) f.endLine = f.startLine;
          }

          return {
            findings,
            summary: String(parsed.summary ?? 'Gemini review complete.'),
            model,
            provider: 'gemini',
          };
        }

        const errorText = await response.text();
        lastError = `Gemini API error ${response.status} (model=${model}): ${errorText.slice(0, 300)}`;
        console.warn(`[gemini] ${lastError}`);

        if (response.status === 503 || response.status === 429) {
          // Overloaded or rate limited — backoff then try next model
          const delayMs = Math.pow(2, attempt) * 2000;
          console.log(`[gemini] Backing off ${delayMs}ms before retry...`);
          await new Promise((r) => setTimeout(r, delayMs));
          if (attempt === 2) break; // exhausted retries for this model, try next
          continue;
        }
        // Non-retriable error (404, 400) — skip to next model immediately
        break;
      }
    }

    throw new Error(lastError || 'All Gemini models failed');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const url = `${GEMINI_API_BASE}/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text: text.slice(0, 2048) }] },
        // Reduce to 384-dim to match existing pgvector schema
        outputDimensionality: VECTOR_DEFAULTS.dimensions,
      }),
    });
    clearTimeout(fetchTimeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini embedding error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      embedding?: { values?: number[] };
    };

    const values = data.embedding?.values;
    if (!values || values.length === 0) {
      throw new Error('Gemini embedding returned empty values');
    }

    return values;
  }
}
