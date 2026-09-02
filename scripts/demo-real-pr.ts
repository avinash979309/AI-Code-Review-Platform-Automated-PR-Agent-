#!/usr/bin/env tsx
/**
 * demo-real-pr.ts — End-to-end demo with a real GitHub PR.
 *
 * Uses colinhacks/zod PR #48 "Fixed ZodFunction not extends ZodType"
 * (public repo, no token needed for diff fetch).
 *
 * What this script does:
 *   1. Fires a signed GitHub webhook event to the server (POST /api/webhooks/github)
 *   2. Server enqueues a BullMQ job
 *   3. Worker picks up job, runs full pipeline:
 *      FETCH_DIFF → real GitHub API → zod PR #48 TypeScript files
 *      SANDBOX_EXEC → Docker node:20-alpine, runs the code
 *      AST_ANALYSIS → Babel parses all TypeScript, counts functions/classes/imports
 *      VECTOR_RETRIEVAL → pgvector embedding + similarity search
 *      AI_REVIEW → Gemini/mock reviews the actual diff
 *      VALIDATION → Zod schema validates findings
 *      SELF_CORRECTION → retries if invalid
 *   4. Results persisted in DB, Socket.IO events emitted
 *   5. Script polls DB and prints findings
 *
 * Usage: pnpm --filter @coderev/server exec tsx scripts/demo-real-pr.ts
 */

import crypto from 'crypto';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const SERVER_URL = process.env['SERVER_URL'] ?? 'http://localhost:3001';
const SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? 'dev-secret';
const prisma = new PrismaClient();

// ── Real PR data: colinhacks/zod PR #48 ─────────────────────────────────────
const REAL_PR = {
  repo: {
    id: 245704608,
    full_name: 'colinhacks/zod',
    default_branch: 'master',
    language: 'TypeScript',
  },
  pr: {
    number: 48,
    title: 'Fixed ZodFunction not extends ZodType',
    author: { login: 'tuoxiansp', id: 12345 },
    base_ref: 'master',
    base_sha: 'abc123def456abc123def456abc123def456abc1',
    head_ref: 'fix-zod-function',
    head_sha: 'e4f217515ab9252e8a9c1ef46885b8d1f5913b0d',
  },
};

// ── Build and sign a GitHub webhook payload ──────────────────────────────────
function buildPayload() {
  return {
    action: 'opened',
    pull_request: {
      number: REAL_PR.pr.number,
      title: REAL_PR.pr.title,
      user: REAL_PR.pr.author,
      base: {
        ref: REAL_PR.pr.base_ref,
        sha: REAL_PR.pr.base_sha,
        repo: REAL_PR.repo,
      },
      head: {
        ref: REAL_PR.pr.head_ref,
        sha: REAL_PR.pr.head_sha,
        repo: REAL_PR.repo,
      },
      state: 'open',
      draft: false,
    },
    repository: {
      id: REAL_PR.repo.id,
      full_name: REAL_PR.repo.full_name,
      default_branch: REAL_PR.repo.default_branch,
      language: REAL_PR.repo.language,
    },
    sender: REAL_PR.pr.author,
  };
}

function sign(body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

// ── Fire the webhook ─────────────────────────────────────────────────────────
async function fireWebhook(): Promise<string> {
  const payload = buildPayload();
  const body = JSON.stringify(payload);
  const sig = sign(body);

  console.log('\n🚀 Firing webhook to', `${SERVER_URL}/api/webhooks/github`);
  console.log(`   Repo:  ${REAL_PR.repo.full_name}`);
  console.log(`   PR:    #${REAL_PR.pr.number} — ${REAL_PR.pr.title}`);
  console.log(`   By:    ${REAL_PR.pr.author.login}`);
  console.log(`   Diff:  Will fetch real diff from GitHub API`);

  const res = await fetch(`${SERVER_URL}/api/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': sig,
    },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Webhook failed: ${res.status} ${txt}`);
  }

  const json = await res.json() as { jobId: string; eventId: string };
  const bullJobId = json.jobId;
  const eventId = json.eventId;
  console.log(`\n✅ Webhook accepted.`);
  console.log(`   BullMQ Job:   ${bullJobId}`);
  console.log(`   Event ID:     ${eventId}`);
  return bullJobId;
}

// ── Poll DB for pipeline completion ─────────────────────────────────────────
// bullJobId = BullMQ job ID stored in ReviewJob.bullJobId (unique)
async function waitForCompletion(bullJobId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  let lastStatus = '';

  console.log('\n⏳ Waiting for pipeline...\n');
  console.log(`   Polling by bullJobId=${bullJobId}`);

  while (Date.now() - start < timeoutMs) {
    const job = await prisma.reviewJob.findFirst({
      where: { bullJobId },
      include: {
        review: {
          include: {
            findings: {
              orderBy: [{ severity: 'asc' }, { startLine: 'asc' }],
            },
          },
        },
        codeFiles: true,
      },
    });

    if (!job) {
      await sleep(1000);
      continue;
    }

    if (job.status !== lastStatus) {
      const ts = new Date().toLocaleTimeString();
      const icon = stageIcon(job.status);
      console.log(`   [${ts}] ${icon} ${job.status}`);
      lastStatus = job.status;
    }

    if (job.status === 'COMPLETED') {
      console.log('\n' + '═'.repeat(60));
      console.log('✅  PIPELINE COMPLETE');
      console.log('═'.repeat(60));
      console.log(`\n📁 Files reviewed: ${job.codeFiles.length}`);
      for (const f of job.codeFiles) {
        console.log(`   • ${f.path} (+${f.additions}/-${f.deletions})`);
      }

      if (job.review) {
        const r = job.review;
        console.log(`\n🤖 AI Review`);
        console.log(`   Provider:  ${r.provider}`);
        console.log(`   Model:     ${r.model}`);
        console.log(`   Attempts:  ${r.attemptCount}`);
        console.log(`   Findings:  ${r.findings.length}`);

        if (r.findings.length > 0) {
          console.log('\n🔍 Findings:\n');
          for (const f of r.findings) {
            const sev = severityEmoji(f.severity);
            console.log(`   ${sev} [${f.severity.toUpperCase()}] ${f.title}`);
            console.log(`      📄 ${f.file}:${f.startLine}–${f.endLine}`);
            console.log(`      ${f.description.slice(0, 120)}${f.description.length > 120 ? '…' : ''}`);
            if (f.suggestion) {
              console.log(`      💡 ${f.suggestion.slice(0, 100)}${f.suggestion.length > 100 ? '…' : ''}`);
            }
            console.log(`      Confidence: ${Math.round(f.confidence * 100)}% | Validated: ${f.validated}`);
            console.log();
          }
        }

        console.log(`\n🌐 View in UI:`);
        console.log(`   http://localhost:3000/reviews/${r.id}`);
      }
      return;
    }

    if (job.status === 'FAILED' || job.status === 'FAILED_VALIDATION') {
      const jobWithError = job as { error?: string } & typeof job;
      console.log(`\n❌ Pipeline failed: ${(jobWithError as { error?: string }).error ?? 'unknown'}`);
      return;
    }

    await sleep(1500);
  }

  console.log('\n⏰ Timeout — check DB manually');
}

function stageIcon(status: string): string {
  const icons: Record<string, string> = {
    PENDING: '⏳',
    FETCHING_DIFF: '📥',
    SANDBOX_RUNNING: '🐳',
    ANALYZING_AST: '🔬',
    RETRIEVING_CONTEXT: '🔍',
    AI_REVIEWING: '🤖',
    COMPLETED: '✅',
    FAILED: '❌',
    FAILED_VALIDATION: '⚠️',
  };
  return icons[status] ?? '•';
}

function severityEmoji(severity: string): string {
  return { critical: '🔴', error: '🟠', warning: '🟡', info: '🔵' }[severity] ?? '⚪';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(60));
  console.log('  AI CODE REVIEW PLATFORM — Real PR Demo');
  console.log('═'.repeat(60));
  console.log('\n📌 Target: colinhacks/zod PR #48');
  console.log('   "Fixed ZodFunction not extends ZodType"');
  console.log('   Real TypeScript diff from GitHub API');

  try {
    const reviewJobId = await fireWebhook();
    await waitForCompletion(reviewJobId);
  } catch (err) {
    console.error('\n❌ Error:', (err as Error).message);
    console.error('\nMake sure:');
    console.error('  • Server is running: pnpm --filter @coderev/server exec tsx src/index.ts');
    console.error('  • Worker is running: pnpm --filter @coderev/worker exec tsx src/index.ts');
    console.error('  • DB containers up:  docker ps | grep coderev');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
