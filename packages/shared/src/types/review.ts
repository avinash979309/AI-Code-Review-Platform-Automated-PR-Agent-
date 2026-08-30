/**
 * Review types — AI reviewer outputs, findings, validation errors.
 */

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
  description: string;
  suggestion?: string;
  suggestedPatch?: string;
  confidence: number;
}

export interface ReviewResult {
  findings: Finding[];
  summary: string;
  model: string;
  provider: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ASTSummary {
  file: string;
  nodeCount: number;
  functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    params: string[];
  }>;
  classes: Array<{
    name: string;
    startLine: number;
    endLine: number;
    methods: string[];
  }>;
  imports: Array<{ source: string; specifiers: string[] }>;
  exports: Array<{ name: string; type: string }>;
}

export interface SandboxLogs {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface RetrievedChunk {
  filePath: string;
  chunkContent: string;
  chunkType: string;
  similarity: number;
}

export interface ReviewContext {
  diff: string;
  astSummary: ASTSummary[];
  sandboxLogs: SandboxLogs;
  retrievedContext: RetrievedChunk[];
  previousErrors?: ValidationError[];
}

export interface AIProvider {
  readonly name: string;
  generateReview(context: ReviewContext): Promise<ReviewResult>;
  generateEmbedding(text: string): Promise<number[]>;
}
