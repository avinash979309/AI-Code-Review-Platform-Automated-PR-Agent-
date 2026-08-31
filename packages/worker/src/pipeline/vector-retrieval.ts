/**
 * VECTOR_RETRIEVAL pipeline stage.
 * Generates a query embedding from the diff and retrieves top-K similar chunks.
 * If pgvector not available or embeddings table empty, returns empty context gracefully.
 */
import type { AIProvider, RetrievedChunk } from '@coderev/shared';
import { Embedder } from '../vector/embedder.js';
import { retrieveSimilarChunks, isPgvectorAvailable } from '../vector/retriever.js';

export interface VectorRetrievalResult {
  retrievedChunks: RetrievedChunk[];
  skipped: boolean;
  skipReason?: string;
}

export async function runVectorRetrievalStage(
  provider: AIProvider,
  diff: string,
  repositoryId: string,
): Promise<VectorRetrievalResult> {
  // Check pgvector availability
  const available = await isPgvectorAvailable();
  if (!available) {
    console.warn('[vector-retrieval] pgvector not available — skipping retrieval');
    return { retrievedChunks: [], skipped: true, skipReason: 'pgvector unavailable' };
  }

  try {
    const embedder = new Embedder(provider);
    const queryEmbedding = await embedder.embedDiffSummary(diff);

    const chunks = await retrieveSimilarChunks(queryEmbedding, repositoryId);
    console.log(`[vector-retrieval] Retrieved ${chunks.length} similar chunks for repositoryId=${repositoryId}`);

    return { retrievedChunks: chunks, skipped: false };
  } catch (err) {
    // Non-fatal — continue without context
    console.warn(`[vector-retrieval] Retrieval failed (non-fatal): ${(err as Error).message}`);
    return {
      retrievedChunks: [],
      skipped: true,
      skipReason: (err as Error).message,
    };
  }
}
