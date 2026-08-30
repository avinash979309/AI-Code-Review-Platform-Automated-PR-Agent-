/**
 * AST_ANALYSIS pipeline stage.
 * Parses .ts/.js/.tsx/.jsx files using @babel/parser.
 * Extracts functions, classes, imports, exports, complexity.
 * Creates ASTSnapshot records in DB.
 */
import { PrismaClient } from '@prisma/client';
import { parseSource, isSupportedFile } from '../ast/parser.js';
import { analyzeAST } from '../ast/analyzer.js';

const prisma = new PrismaClient();

export interface ASTStageResult {
  totalNodes: number;
  snapshotCount: number;
  snapshots: Array<{
    codeFileId: string;
    filePath: string;
    nodeCount: number;
  }>;
}

export async function runASTAnalysisStage(
  codeFiles: Array<{ id: string; path: string; content: string | null }>,
): Promise<ASTStageResult> {
  const snapshots: ASTStageResult['snapshots'] = [];
  let totalNodes = 0;

  for (const file of codeFiles) {
    if (!isSupportedFile(file.path)) {
      console.log(`[ast] Skipping unsupported file: ${file.path}`);
      continue;
    }

    const source = file.content ?? '';
    if (!source.trim()) {
      console.log(`[ast] Skipping empty file: ${file.path}`);
      continue;
    }

    let analysis;
    try {
      const ast = parseSource(source, file.path);
      analysis = analyzeAST(ast);
    } catch (err) {
      console.warn(`[ast] Parse error for ${file.path}: ${(err as Error).message}`);
      continue;
    }

    // Persist ASTSnapshot
    await prisma.aSTSnapshot.create({
      data: {
        codeFileId: file.id,
        nodeCount: analysis.nodeCount,
        functions: analysis.functions as object[],
        classes: analysis.classes as object[],
        imports: analysis.imports as object[],
        exports: analysis.exports as object[],
        complexity: analysis.complexity as object,
      },
    });

    totalNodes += analysis.nodeCount;
    snapshots.push({ codeFileId: file.id, filePath: file.path, nodeCount: analysis.nodeCount });

    console.log(
      `[ast] ${file.path}: nodes=${analysis.nodeCount} ` +
        `funcs=${analysis.functions.length} classes=${analysis.classes.length} ` +
        `complexity=${analysis.complexity.cyclomaticComplexity}`,
    );
  }

  console.log(`[ast] Total nodes across ${snapshots.length} files: ${totalNodes}`);

  return { totalNodes, snapshotCount: snapshots.length, snapshots };
}
