/**
 * Embedder — generates vector embeddings for code chunks.
 * Uses the configured AIProvider.generateEmbedding().
 */
import type { AIProvider } from '@coderev/shared';
import { VECTOR_DEFAULTS } from '@coderev/shared';

export interface CodeChunk {
  filePath: string;
  chunkContent: string;
  chunkType: 'function' | 'class' | 'module';
  repositoryId: string;
}

export interface EmbeddedChunk extends CodeChunk {
  embedding: number[];
}

export class Embedder {
  private readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  /**
   * Generate embedding for a single text string.
   * Truncates text to avoid token limits.
   */
  async embed(text: string): Promise<number[]> {
    const truncated = text.slice(0, 2048); // safe truncation
    const embedding = await this.provider.generateEmbedding(truncated);

    if (embedding.length !== VECTOR_DEFAULTS.dimensions) {
      throw new Error(
        `Embedding dimension mismatch: expected ${VECTOR_DEFAULTS.dimensions}, got ${embedding.length}`,
      );
    }

    return embedding;
  }

  /**
   * Embed a batch of code chunks sequentially.
   * Returns chunks with their embeddings attached.
   */
  async embedChunks(chunks: CodeChunk[]): Promise<EmbeddedChunk[]> {
    const results: EmbeddedChunk[] = [];

    for (const chunk of chunks) {
      const text = `// ${chunk.chunkType}: ${chunk.filePath}\n${chunk.chunkContent}`;
      const embedding = await this.embed(text);
      results.push({ ...chunk, embedding });
    }

    return results;
  }

  /**
   * Build a query embedding for a diff summary.
   * Used during retrieval to find similar code.
   */
  async embedDiffSummary(diff: string): Promise<number[]> {
    // Extract added lines as the query representation
    const addedLines = diff
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n')
      .slice(0, 1024);

    return this.embed(addedLines || diff.slice(0, 1024));
  }
}
