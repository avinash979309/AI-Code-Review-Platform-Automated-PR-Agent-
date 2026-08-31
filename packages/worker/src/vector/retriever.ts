/**
 * Retriever — queries pgvector for similar code chunks using cosine distance.
 * Stores new embeddings and retrieves top-K similar chunks.
 */
import { PrismaClient } from '@prisma/client';
import type { RetrievedChunk } from '@coderev/shared';
import { VECTOR_DEFAULTS } from '@coderev/shared';
import type { EmbeddedChunk } from './embedder.js';

const prisma = new PrismaClient();

/**
 * Persist an embedded chunk to the Embedding table.
 * The vector column is written via raw SQL since Prisma doesn't natively support pgvector.
 */
export async function storeEmbedding(chunk: EmbeddedChunk): Promise<string> {
  const vectorLiteral = `[${chunk.embedding.join(',')}]`;

  // Insert via raw SQL to handle the vector(384) column
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Embedding" (
      "id", "repositoryId", "filePath", "chunkContent", "chunkType", "metadata", "createdAt",
      "embedding"
    )
    VALUES (
      gen_random_uuid(),
      ${chunk.repositoryId}::text,
      ${chunk.filePath}::text,
      ${chunk.chunkContent}::text,
      ${chunk.chunkType}::text,
      '{}'::jsonb,
      NOW(),
      ${vectorLiteral}::vector
    )
    ON CONFLICT DO NOTHING
    RETURNING "id"
  `;

  return result[0]?.id ?? '';
}

/**
 * Retrieve top-K most similar chunks to the query embedding using cosine distance.
 * Uses pgvector <=> operator.
 */
export async function retrieveSimilarChunks(
  queryEmbedding: number[],
  repositoryId: string,
  topK = VECTOR_DEFAULTS.topK,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = await prisma.$queryRaw<
    Array<{
      filePath: string;
      chunkContent: string;
      chunkType: string;
      similarity: number;
    }>
  >`
    SELECT
      "filePath",
      "chunkContent",
      "chunkType",
      1 - ("embedding" <=> ${vectorLiteral}::vector) AS similarity
    FROM "Embedding"
    WHERE "repositoryId" = ${repositoryId}::text
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `;

  return rows.map((r) => ({
    filePath: r.filePath,
    chunkContent: r.chunkContent,
    chunkType: r.chunkType,
    similarity: Number(r.similarity),
  }));
}

/**
 * Check if pgvector extension and vector column exist.
 * Returns true if retrieval can be used; false if pgvector not set up yet.
 */
export async function isPgvectorAvailable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Embedding" LIMIT 0`;
    return true;
  } catch {
    return false;
  }
}
