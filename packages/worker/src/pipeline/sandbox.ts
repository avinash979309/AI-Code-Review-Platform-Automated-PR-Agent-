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
 * Write the real analysis script — runs inside node:20-alpine.
 * Steps: npm install tsc+eslint → tsc --noEmit → eslint → emit structured JSON.
 */
async function prepareAnalysisScript(tmpDir: string): Promise<void> {
  // Minimal package.json needed for npm install
  await fs.writeFile(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'sandbox-analysis', version: '1.0.0', private: true }),
    'utf8',
  );

  // tsconfig for the analysed code
  const tsconfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'CommonJS',
      moduleResolution: 'node',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: true,
      noEmit: true,
    },
    include: ['/workspace/**/*.ts', '/workspace/**/*.tsx', '/workspace/**/*.js'],
    exclude: ['/workspace/node_modules'],
  };
  await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');

  // eslint config
  const eslintConfig = {
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    plugins: ['@typescript-eslint'],
    rules: {
      'no-eval': 'error',
      'eqeqeq': ['warn', 'always'],
      'no-console': 'warn',
      'prefer-const': 'warn',
      'no-var': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  };
  await fs.writeFile(path.join(tmpDir, '.eslintrc.json'), JSON.stringify(eslintConfig, null, 2), 'utf8');

  // Main analysis script — runs inside the container via `node analyze.mjs`
  const script = `
import { execSync } from 'child_process';
import { writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const log = (obj) => { process.stdout.write(JSON.stringify(obj) + '\\n'); };

// 1. Install tools
try {
  log({ type: 'install_start' });
  execSync(
    'npm install --quiet --no-fund --no-audit --prefer-offline ' +
    'typescript@5 eslint@8 @typescript-eslint/parser@6 @typescript-eslint/eslint-plugin@6',
    { cwd: '/workspace', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  log({ type: 'install_done' });
} catch (e) {
  const msg = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  log({ type: 'install_error', error: msg.slice(0, 500) });
  process.exit(1);
}

// 2. Run tsc
try {
  execSync(
    './node_modules/.bin/tsc --noEmit --pretty false --project /workspace/tsconfig.json',
    { cwd: '/workspace', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  log({ type: 'tsc', errorCount: 0, errors: [] });
} catch (e) {
  const output = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
  const lines = output.split('\\n').filter(Boolean);
  const errors = lines
    .filter(l => l.includes(': error TS'))
    .map(l => l.trim())
    .slice(0, 50);
  const others = lines
    .filter(l => !l.includes(': error TS') && l.trim())
    .map(l => l.trim())
    .slice(0, 20);
  log({ type: 'tsc', errorCount: errors.length, errors, other: others });
}

// 3. Collect source files for eslint
function listFiles(dir, acc = []) {
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory()) listFiles(full, acc);
        else if (/\\.(ts|tsx|js|jsx)$/.test(entry)) acc.push(full);
      } catch {}
    }
  } catch {}
  return acc;
}
const sourceFiles = listFiles('/workspace').filter(f => !f.includes('analyze.mjs'));

// 4. Run eslint
try {
  const out = execSync(
    './node_modules/.bin/eslint --format json ' +
    '--no-eslintrc --config /workspace/.eslintrc.json ' +
    '--ext .ts,.tsx,.js,.jsx ' +
    sourceFiles.join(' '),
    { cwd: '/workspace', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const results = JSON.parse(out.toString() || '[]');
  const findings = results.flatMap(r =>
    r.messages.map(m => ({
      file: r.filePath.replace('/workspace/', ''),
      line: m.line,
      col: m.column,
      severity: m.severity === 2 ? 'error' : 'warning',
      rule: m.ruleId || 'unknown',
      message: m.message,
    }))
  ).slice(0, 100);
  log({ type: 'eslint', findingCount: findings.length, findings });
} catch (e) {
  try {
    const output = e.stdout?.toString() || '';
    const results = JSON.parse(output || '[]');
    const findings = results.flatMap(r =>
      r.messages.map(m => ({
        file: r.filePath.replace('/workspace/', ''),
        line: m.line,
        col: m.column,
        severity: m.severity === 2 ? 'error' : 'warning',
        rule: m.ruleId || 'unknown',
        message: m.message,
      }))
    ).slice(0, 100);
    log({ type: 'eslint', findingCount: findings.length, findings });
  } catch {
    log({ type: 'eslint', error: (e.message || '').slice(0, 300) });
  }
}

log({ type: 'complete', fileCount: sourceFiles.length });
`.trim();

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
      pidsLimit: 250,                            // npm spawns many subprocesses
      command: ['node', '/workspace/analyze.mjs'],
      workingDir: '/workspace',
      binds: [`${tmpDir}:/workspace:rw`],        // rw so npm can write node_modules
      networkMode: 'bridge',                     // needed for npm install
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
