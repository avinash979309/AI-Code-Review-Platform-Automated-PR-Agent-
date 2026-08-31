/**
 * HuggingFaceProvider — calls HF Inference API for review generation and embeddings.
 * Used when AI_PROVIDER=huggingface.
 */
import type {
  AIProvider,
  ReviewContext,
  ReviewResult,
  Finding,
} from '@coderev/shared';
import { VECTOR_DEFAULTS } from '@coderev/shared';

const HF_API_BASE = 'https://api-inference.huggingface.co';

export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface';

  private readonly apiKey: string;
  private readonly embeddingModel: string;

  constructor(apiKey: string, embeddingModel = VECTOR_DEFAULTS.model) {
    this.apiKey = apiKey;
    this.embeddingModel = embeddingModel;
  }

  async generateReview(context: ReviewContext): Promise<ReviewResult> {
    // Build prompt
    const astSection = context.astSummary
      .map(
        (s) =>
          `File: ${s.file}\n` +
          `  Functions: ${s.functions.map((f) => f.name).join(', ') || 'none'}\n` +
          `  Classes: ${s.classes.map((c) => c.name).join(', ') || 'none'}\n` +
          `  Node count: ${s.nodeCount}`,
      )
      .join('\n');

    const contextSection = context.retrievedContext
      .map((c) => `[${c.chunkType}] ${c.filePath} (similarity=${c.similarity.toFixed(3)})\n${c.chunkContent}`)
      .join('\n---\n');

    const retrySection = context.previousErrors?.length
      ? `\nPrevious validation errors (fix these):\n${context.previousErrors.map((e) => `- ${e.field}: ${e.message}`).join('\n')}`
      : '';

    const prompt = `You are an expert code reviewer. Review this pull request diff and return a JSON object.

DIFF:
${context.diff.slice(0, 3000)}

AST ANALYSIS:
${astSection}

SANDBOX OUTPUT:
exit=${context.sandboxLogs.exitCode} stdout=${context.sandboxLogs.stdout.slice(0, 500)}

RETRIEVED CONTEXT:
${contextSection.slice(0, 1000)}
${retrySection}

Return ONLY valid JSON matching this schema:
{
  "findings": [
    {
      "file": "<relative path>",
      "startLine": <number>,
      "endLine": <number>,
      "severity": "critical"|"warning"|"info",
      "title": "<short title>",
      "description": "<detailed description>",
      "suggestion": "<optional fix suggestion>",
      "confidence": <0.0-1.0>
    }
  ],
  "summary": "<overall review summary>"
}`;

    const response = await fetch(`${HF_API_BASE}/models/mistralai/Mistral-7B-Instruct-v0.3`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1024,
          temperature: 0.1,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HuggingFace API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as Array<{ generated_text: string }>;
    const rawText = data[0]?.generated_text ?? '';

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`HuggingFace response contained no JSON: ${rawText.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      findings?: Partial<Finding>[];
      summary?: string;
    };

    const findings: Finding[] = (parsed.findings ?? []).map((f) => ({
      file: String(f.file ?? 'unknown'),
      startLine: Number(f.startLine ?? 1),
      endLine: Number(f.endLine ?? 1),
      severity: (['critical', 'warning', 'info'].includes(f.severity as string)
        ? f.severity
        : 'info') as Finding['severity'],
      title: String(f.title ?? 'Finding'),
      description: String(f.description ?? ''),
      suggestion: f.suggestion ? String(f.suggestion) : undefined,
      suggestedPatch: f.suggestedPatch ? String(f.suggestedPatch) : undefined,
      confidence: Math.min(1, Math.max(0, Number(f.confidence ?? 0.5))),
    }));

    return {
      findings,
      summary: String(parsed.summary ?? 'HuggingFace review complete.'),
      model: 'mistralai/Mistral-7B-Instruct-v0.3',
      provider: 'huggingface',
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(
      `${HF_API_BASE}/pipeline/feature-extraction/${this.embeddingModel}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text.slice(0, 512) }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HuggingFace embedding error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as number[] | number[][];
    // API returns flat array or nested array depending on model
    if (Array.isArray(data[0])) {
      return (data as number[][])[0];
    }
    return data as number[];
  }
}
