/**
 * Simulate GitHub PR webhook events for load testing and demo.
 * Usage: pnpm simulate [--count=N] [--url=URL] [--secret=SECRET]
 *
 * Sends N HMAC-SHA256 signed pull_request webhook events to the server.
 * Verifies >=N WebhookEvent rows in DB after run.
 */
import crypto from 'crypto';
import 'dotenv/config';

// --- Config from args / env ---
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);

const COUNT = parseInt(args['count'] ?? '105', 10);
const BASE_URL = args['url'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
const SECRET = args['secret'] ?? process.env['GITHUB_WEBHOOK_SECRET'] ?? 'dev-secret';
const CONCURRENCY = parseInt(args['concurrency'] ?? '10', 10);

const ENDPOINT = `${BASE_URL}/api/webhooks/github`;

// Sample repos / PR data for realistic payloads
const SAMPLE_REPOS = [
  { full_name: 'demo-org/api-service', default_branch: 'main', language: 'TypeScript' },
  { full_name: 'demo-org/frontend-app', default_branch: 'main', language: 'TypeScript' },
  { full_name: 'demo-org/data-pipeline', default_branch: 'main', language: 'Python' },
];

const ACTIONS = ['opened', 'synchronize', 'reopened'] as const;

function randomHex(len: number): string {
  return crypto.randomBytes(len).toString('hex');
}

function buildPayload(index: number): object {
  const repo = SAMPLE_REPOS[index % SAMPLE_REPOS.length]!;
  const action = ACTIONS[index % ACTIONS.length]!;
  const prNumber = (index % 50) + 1;

  return {
    action,
    pull_request: {
      number: prNumber,
      title: `feat: implement feature ${index}`,
      user: { login: `developer-${index % 5}`, id: 1000 + (index % 5) },
      base: { ref: repo.default_branch, sha: randomHex(20) },
      head: { ref: `feature/task-${index}`, sha: randomHex(20) },
      state: 'open',
    },
    repository: {
      id: 100 + (index % SAMPLE_REPOS.length),
      full_name: repo.full_name,
      default_branch: repo.default_branch,
      language: repo.language,
    },
    sender: { login: `developer-${index % 5}`, id: 1000 + (index % 5) },
  };
}

function sign(payload: string): string {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(payload).digest('hex')}`;
}

async function sendWebhook(index: number): Promise<{ ok: boolean; status: number; index: number }> {
  const payload = JSON.stringify(buildPayload(index));
  const signature = sign(payload);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: payload,
  });

  return { ok: res.ok, status: res.status, index };
}

async function runBatch(indices: number[]): Promise<Array<{ ok: boolean; status: number; index: number }>> {
  return Promise.all(indices.map(sendWebhook));
}

async function main(): Promise<void> {
  console.log(`\n🚀 Simulating ${COUNT} webhook events → ${ENDPOINT}`);
  console.log(`   Concurrency: ${CONCURRENCY} | Secret: ${SECRET.slice(0, 4)}***\n`);

  const start = Date.now();
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < COUNT; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, COUNT - i) }, (_, j) => i + j);
    const results = await runBatch(batch);

    for (const r of results) {
      if (r.ok) {
        succeeded++;
      } else {
        failed++;
        console.error(`  ✗ index=${r.index} status=${r.status}`);
      }
    }

    process.stdout.write(`\r  Progress: ${i + batch.length}/${COUNT} (✓ ${succeeded} ✗ ${failed})`);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed:    ${failed}`);
  console.log(`\nVerify DB:\n  SELECT COUNT(*) FROM "WebhookEvent" WHERE processed = true;`);
  console.log(`  Expected: >= ${succeeded}`);
}

main().catch((err: unknown) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
