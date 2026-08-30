/**
 * SANDBOX_EXEC pipeline stage.
 * Runs lint/static analysis in an ephemeral Docker container.
 * Creates SandboxExecution record in DB.
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { PrismaClient } from '@prisma/client';
import { runSandbox } from '../sandbox/docker-sandbox.js';
import { config } from '../config.js';
import type { DiffFile } from './fetch-diff.js';

const prisma = new PrismaClient();

export interface SandboxStageResult {
  sandboxExecutionId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Write diff files to a temp directory for mounting into the container.
 */
async function writeTempWorkspace(files: DiffFile[]): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coderev-'));

  for (const f of files) {
    if (!f.content) continue;
    const filePath = path.join(tmpDir, f.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, f.content, 'utf8');
  }

  return tmpDir;
}

/**
 * Build a minimal package.json and the analysis script in the workspace.
 */
async function prepareAnalysisScript(tmpDir: string): Promise<void> {
  // Minimal package.json
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'sandbox-analysis', version: '1.0.0', type: 'module' }),
    'utf8',
  );

  // Analysis script — runs inside node:20-alpine
  const script = `
import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';

async function listFiles(dir, files = []) {
  try {
    const entries = await readdir(dir);
    for (const e of entries) {
      if (e === 'node_modules' || e === '.git' || e === 'package.json' || e === 'analyze.mjs') continue;
      const full = path.join(dir, e);
      const s = await stat(full);
      if (s.isDirectory()) {
        await listFiles(full, files);
      } else {
        files.push({ path: full, size: s.size });
      }
    }
  } catch {}
  return files;
}

const files = await listFiles('/workspace');
const stats = {
  fileCount: files.length,
  totalBytes: files.reduce((s, f) => s + f.size, 0),
  files: files.map(f => ({ path: f.path.replace('/workspace/', ''), size: f.size })),
};

console.log(JSON.stringify({ type: 'analysis', ...stats }));

// Check for obvious issues in each file
for (const f of files) {
  try {
    const content = await readFile(f.path, 'utf8');
    const issues = [];
    const lines = content.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('console.log') && !f.path.includes('test')) {
        issues.push({ line: i + 1, type: 'warning', message: 'console.log in non-test file' });
      }
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        issues.push({ line: i + 1, type: 'info', message: 'TODO/FIXME/HACK comment found' });
      }
      if (line.length > 120) {
        issues.push({ line: i + 1, type: 'warning', message: 'Line exceeds 120 characters' });
      }
    }
    if (issues.length > 0) {
      console.log(JSON.stringify({ type: 'lint', file: f.path.replace('/workspace/', ''), issues }));
    }
  } catch {}
}

console.log(JSON.stringify({ type: 'complete', fileCount: files.length }));
`;

  await fs.writeFile(path.join(tmpDir, 'analyze.mjs'), script, 'utf8');
}

export async function runSandboxStage(
  reviewJobId: string,
  diffFiles: DiffFile[],
): Promise<SandboxStageResult> {
  let tmpDir: string | null = null;

  try {
    // Prepare workspace
    tmpDir = await writeTempWorkspace(diffFiles);
    await prepareAnalysisScript(tmpDir);

    const result = await runSandbox({
      image: 'node:20-alpine',
      memoryLimitMb: config.SANDBOX_MEMORY_MB,
      cpuLimit: 0.5,
      timeoutMs: config.SANDBOX_TIMEOUT_MS,
      pidsLimit: 100,
      command: ['node', '/workspace/analyze.mjs'],
      workingDir: '/workspace',
      binds: [`${tmpDir}:/workspace:ro`],
    });

    // Persist to DB
    const record = await prisma.sandboxExecution.create({
      data: {
        reviewJobId,
        containerId: result.containerId,
        image: 'node:20-alpine',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        memoryLimitMb: config.SANDBOX_MEMORY_MB,
        cpuLimit: 0.5,
        timedOut: result.timedOut,
      },
    });

    console.log(
      `[sandbox] containerId=${result.containerId.slice(0, 12)} exit=${result.exitCode} ` +
        `duration=${result.durationMs}ms timedOut=${result.timedOut}`,
    );

    return {
      sandboxExecutionId: record.id,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    };
  } finally {
    // Always clean up temp directory
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
