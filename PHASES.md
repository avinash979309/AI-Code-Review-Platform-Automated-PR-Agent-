# Implementation Phases

## Phase 1: Foundation & Infrastructure

**Objective:** Set up monorepo, Docker Compose, database, shared types, basic server.
**Estimated Scope:** 1 week

**Files to create:**
- `package.json` (root workspace)
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `docker-compose.yml`
- `.env.example`
- `.gitignore`
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/types/review.ts`
- `packages/shared/src/types/webhook.ts`
- `packages/shared/src/types/job.ts`
- `packages/shared/src/types/socket.ts`
- `packages/shared/src/schemas/review.schema.ts`
- `packages/shared/src/schemas/webhook.schema.ts`
- `packages/shared/src/constants.ts`
- `packages/database/package.json`
- `packages/database/tsconfig.json`
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/seed.ts`
- `packages/server/package.json`
- `packages/server/tsconfig.json`
- `packages/server/src/index.ts`
- `packages/server/src/app.ts`
- `packages/server/src/config.ts`
- `packages/server/src/routes/health.routes.ts`
- `packages/server/src/middleware/error-handler.ts`

**Acceptance Criteria:**
- `docker compose up` starts PostgreSQL (pgvector image) and Redis.
- `pnpm install` succeeds across workspace.
- Prisma schema compiles and migrations run.
- Express server starts on port 3001.
- `GET /api/health` returns 200.
- TypeScript compiles with no errors across all packages.
- Shared types importable from `@coderev/shared`.

---

## Phase 2: Webhook Ingestion & Queue

**Objective:** GitHub webhook endpoint, signature verification, BullMQ queue, basic worker skeleton.
**Estimated Scope:** 1 week

**Files to create:**
- `packages/server/src/routes/webhook.routes.ts`
- `packages/server/src/middleware/webhook-signature.ts`
- `packages/server/src/queue/producer.ts`
- `packages/worker/package.json`
- `packages/worker/tsconfig.json`
- `packages/worker/src/index.ts`
- `packages/worker/src/worker.ts`
- `packages/worker/src/pipeline/pipeline.ts` (skeleton)
- `scripts/simulate-webhooks.ts`

**Acceptance Criteria:**
- `POST /api/webhooks/github` with valid signature: persists WebhookEvent, enqueues job, returns 200.
- `POST` with invalid signature: returns 401.
- `POST` with non-PR event: returns 200 (ignored).
- Worker starts, connects to Redis, picks up job from queue.
- Worker logs job receipt and pipeline skeleton runs (stub stages).
- `simulate-webhooks.ts` sends 100+ events with valid signatures.
- WebhookEvent records visible in database.
- BullMQ dashboard (optional) or logs show jobs queued/processed.

---

## Phase 3: Sandbox Execution & AST Analysis

**Objective:** Docker sandbox, AST parsing, code file processing.
**Estimated Scope:** 2 weeks

**Files to create:**
- `packages/worker/src/pipeline/fetch-diff.ts`
- `packages/worker/src/pipeline/sandbox.ts`
- `packages/worker/src/pipeline/ast-analysis.ts`
- `packages/worker/src/sandbox/docker-sandbox.ts`
- `packages/worker/src/sandbox/sandbox.types.ts`
- `packages/worker/src/ast/parser.ts`
- `packages/worker/src/ast/analyzer.ts`

**Acceptance Criteria:**
- Fetch diff stage: fetches diff from GitHub API (or mock diff data), creates CodeFile records.
- Sandbox stage: creates Docker container via Dockerode with memory/CPU limits, runs code analysis inside container, collects stdout/stderr, removes container, creates SandboxExecution record.
- AST stage: parses changed .ts/.js/.tsx/.jsx files with @babel/parser, extracts functions/classes/imports/exports, counts nodes (demonstrate 1000+ on sample files), creates ASTSnapshot records.
- Container removed even on failure/timeout.
- SandboxExecution.timedOut = true if timeout exceeded.
- All records persisted to PostgreSQL.

---

## Phase 4: AI Review, Validation & Self-Correction

**Objective:** AIProvider, LangChain reviewer, deterministic validator, retry loop, pgvector retrieval.
**Estimated Scope:** 2 weeks

**Files to create:**
- `packages/worker/src/ai/provider.ts`
- `packages/worker/src/ai/mock.provider.ts`
- `packages/worker/src/ai/huggingface.provider.ts`
- `packages/worker/src/ai/langchain-reviewer.ts`
- `packages/worker/src/validator/review-validator.ts`
- `packages/worker/src/pipeline/vector-retrieval.ts`
- `packages/worker/src/pipeline/ai-review.ts`
- `packages/worker/src/pipeline/validation.ts`
- `packages/worker/src/pipeline/self-correction.ts`
- `packages/worker/src/vector/embedder.ts`
- `packages/worker/src/vector/retriever.ts`

**Acceptance Criteria:**
- MockAIProvider returns structured review findings for any input.
- HuggingFaceProvider calls HF Inference API.
- LangChain chain: PromptTemplate → LLMChain → StructuredOutputParser produces ReviewResult.
- Validator validates review output with Zod + deterministic checks (file paths in diff, line ranges valid, patch parseable).
- Self-correction: invalid review triggers retry with errors in prompt, max 3 attempts.
- After 3 failures: status = FAILED_VALIDATION, ReviewAttempt records show each attempt.
- Embedder generates embeddings (mock: random 384-dim vector, HF: real embedding).
- Retriever queries pgvector with cosine similarity, returns top-5 chunks.
- Embedding records created and queryable.
- Review and ReviewFinding records persisted.
- Full pipeline runs end-to-end with MockAIProvider.

---

## Phase 5: Real-Time Updates & API

**Objective:** Socket.IO integration, REST API for review data, connect worker notifications.
**Estimated Scope:** 1 week

**Files to create:**
- `packages/server/src/socket/socket.ts`
- `packages/server/src/routes/review.routes.ts`
- `packages/server/src/services/review.service.ts`

**Files to modify:**
- `packages/server/src/index.ts` (mount Socket.IO)
- `packages/server/src/app.ts` (add review routes)
- `packages/worker/src/pipeline/pipeline.ts` (emit Socket.IO events at each stage)

**Acceptance Criteria:**
- Socket.IO server runs on Express server.
- Client can connect to `/reviews` namespace.
- Client can join/leave review room.
- Worker emits `job:status` events at each pipeline stage transition.
- Worker emits `review:complete` when done.
- `GET /api/reviews` returns paginated list of reviews.
- `GET /api/reviews/:id` returns review with findings.
- `GET /api/reviews/:id/files` returns code files.
- Socket.IO events receivable from a test client.

---

## Phase 6: Frontend Review UI

**Objective:** Next.js dashboard and review workspace.
**Estimated Scope:** 2 weeks

**Files to create:**
- `packages/web/package.json`
- `packages/web/tsconfig.json`
- `packages/web/next.config.js`
- `packages/web/tailwind.config.ts`
- `packages/web/postcss.config.js`
- `packages/web/src/app/layout.tsx`
- `packages/web/src/app/page.tsx`
- `packages/web/src/app/reviews/[id]/page.tsx`
- `packages/web/src/components/ui/` (shadcn setup)
- `packages/web/src/components/dashboard/review-list.tsx`
- `packages/web/src/components/dashboard/status-badge.tsx`
- `packages/web/src/components/review/review-workspace.tsx`
- `packages/web/src/components/review/file-tree.tsx`
- `packages/web/src/components/review/code-editor.tsx`
- `packages/web/src/components/review/findings-panel.tsx`
- `packages/web/src/components/review/finding-card.tsx`
- `packages/web/src/components/review/status-bar.tsx`
- `packages/web/src/components/layout/header.tsx`
- `packages/web/src/hooks/use-socket.ts`
- `packages/web/src/hooks/use-review.ts`
- `packages/web/src/stores/review-store.ts`
- `packages/web/src/stores/socket-store.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/socket.ts`
- `packages/web/src/styles/globals.css`

**Acceptance Criteria:**
- Next.js starts on port 3000.
- Dashboard shows list of reviews with status badges.
- Clicking review navigates to review workspace.
- Review workspace: 3-panel layout (file tree | Monaco editor | findings panel).
- Monaco shows diff/code for selected file.
- Findings panel shows severity, title, description, suggestion, validation status.
- File tree shows changed files with finding count.
- Status bar shows current pipeline stage.
- Socket.IO connection established, real-time updates work.
- Dark theme with professional aesthetic.
- Zustand stores manage review data and socket state.
- Full end-to-end demo: simulate webhook → observe real-time updates → view findings in UI.
