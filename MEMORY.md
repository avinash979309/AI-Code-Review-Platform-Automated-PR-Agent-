# MEMORY.md

## Current State

**Current Phase:** Phase 3 COMPLETE — Ready for Phase 4
**Last Updated:** 2026-08-30

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation & Infrastructure | ✅ COMPLETE | All acceptance criteria met |
| Phase 2: Webhook Ingestion & Queue | ✅ COMPLETE | All acceptance criteria met |
| Phase 3: Sandbox Execution & AST Analysis | ✅ COMPLETE | All acceptance criteria met |
| Phase 4: AI Review, Validation & Self-Correction | NOT STARTED | |
| Phase 5: Real-Time Updates & API | NOT STARTED | |
| Phase 6: Frontend Review UI | NOT STARTED | |

## Phase 1 — Completed Files

- `package.json` (root workspace), `pnpm-workspace.yaml`, `tsconfig.base.json`
- `docker-compose.yml`, `.env.example`, `.gitignore`
- `packages/shared/` — all types, schemas, constants
- `packages/database/` — Prisma schema + migration
- `packages/server/src/` — index.ts, app.ts, config.ts, routes/health.routes.ts, middleware/error-handler.ts

## Phase 2 — Completed Files

- `packages/server/src/middleware/webhook-signature.ts` — HMAC-SHA256 verifier using crypto.timingSafeEqual
- `packages/server/src/queue/producer.ts` — BullMQ Queue singleton, enqueueReviewJob()
- `packages/server/src/routes/webhook.routes.ts` — POST /api/webhooks/github full implementation
- `packages/server/src/app.ts` — updated to mount webhook router (raw body handling)
- `packages/worker/package.json` + `packages/worker/tsconfig.json`
- `packages/worker/src/config.ts` — Zod-validated env config
- `packages/worker/src/worker.ts` — BullMQ Worker with DB lookup and fallback upsert
- `packages/worker/src/index.ts` — worker entry point with graceful shutdown
- `packages/worker/src/pipeline/pipeline.ts` — stub pipeline (all 7 stages)
- `scripts/simulate-webhooks.ts` — sends N HMAC-signed events with concurrency

## Phase 2 — Verified Acceptance Criteria

- ✅ POST /api/webhooks/github with valid signature → 200, WebhookEvent persisted, job enqueued
- ✅ POST with invalid signature → 401 INVALID_SIGNATURE
- ✅ POST with non-PR event (push) → 200 {processed: false, reason: non-pr-event}
- ✅ Worker starts, connects to Redis, picks up jobs, runs pipeline skeleton
- ✅ simulate-webhooks.ts: 105 events → 105 succeeded in 1.6s (0 failures)
- ✅ DB verified: 106 WebhookEvent (processed=true), 106 ReviewJob, 4 Repository, 106 PullRequest

## Phase 3 — Completed Files

- `packages/worker/src/pipeline/fetch-diff.ts` — GitHub API fetch + realistic mock diff (3 TS files)
- `packages/worker/src/pipeline/sandbox.ts` — Docker container stage, temp workspace, DB persist
- `packages/worker/src/pipeline/ast-analysis.ts` — Babel AST parse + ASTSnapshot DB persist
- `packages/worker/src/sandbox/docker-sandbox.ts` — Dockerode container lifecycle, guaranteed cleanup
- `packages/worker/src/sandbox/sandbox.types.ts` — SandboxOptions/SandboxResult types
- `packages/worker/src/ast/parser.ts` — @babel/parser wrapper (ts/tsx/js/jsx)
- `packages/worker/src/ast/analyzer.ts` — @babel/traverse: functions, classes, imports, exports, complexity

## Phase 3 — Verified Acceptance Criteria

- ✅ FETCH_DIFF: fetches mock diff (GitHub token absent → graceful fallback), creates 3 CodeFile records
- ✅ SANDBOX_EXEC: node:20-alpine container, exit=0, ~600ms, container removed, SandboxExecution persisted
- ✅ AST_ANALYSIS: 3 TS files parsed, 1649 total nodes (>1000), 3 ASTSnapshot records persisted
- ✅ Container removed even on failure (finally block in docker-sandbox.ts)
- ✅ timedOut=false on normal runs; timedOut=true path tested in code
- ✅ ReviewJob status = COMPLETED, all records in DB

## Important Implementation Decisions

1. **pgvector deferred to Phase 4**: postgres:16-alpine used. embedding vector(384) added via raw SQL in Phase 4.
2. **Ports shifted**: postgres 5433, redis 6380 (5432/6379 held by marketplace containers).
3. **Prisma migrate deploy** used (non-interactive).
4. **Raw body capture**: Webhook route captures raw body via stream before HMAC verification; JSON.parse called after signature passes.
5. **Worker DB lookup**: Worker finds PullRequest via webhookEventId → WebhookEvent → pullRequest relation; fallback upsert for simulate-script flow.
6. **shared package build required**: @coderev/shared must be built (pnpm exec tsc in packages/shared) before typecheck on server/worker.

## Environment Notes

- OS: Linux (Ubuntu 24.04)
- Node.js: v24.19.0 | Docker: 29.1 / Compose 2.40 | pnpm: 9.15.9
- Postgres: coderev-postgres:5433 | Redis: coderev-redis:6380
- DATABASE_URL: postgresql://postgres:postgres@localhost:5433/code_review
- REDIS_URL: redis://localhost:6380

## Pending Architectural Decisions

None — architecture frozen.

## Metrics Collected

| Metric | Value | Date |
|--------|-------|------|
| Simulate webhooks processed | 105/105 (0 failures) | 2026-08-30 |
| Simulate duration | 1.6s for 105 events | 2026-08-30 |
| DB WebhookEvent (processed=true) | 106 | 2026-08-30 |
| DB ReviewJob records | 106 | 2026-08-30 |
| Phase 3 AST total nodes | 1649 (3 files) | 2026-08-30 |
| Phase 3 sandbox duration | ~617ms exit=0 | 2026-08-30 |
