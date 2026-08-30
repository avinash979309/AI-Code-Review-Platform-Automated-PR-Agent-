# Product Requirements Document

## 1. Product Overview
Compact, locally-runnable event-driven GitHub PR code review platform. NOT enterprise. Portfolio/interview demonstration project. Modular monolith with background workers.

## 2. Problem Statement
Manual code review is slow. AI review without validation produces hallucinations. This system combines event-driven processing, sandboxed execution, AST analysis, AI review, deterministic validation, self-correction, vector retrieval, and real-time UI.

## 3. Target Users
Single developer (project author) for portfolio demonstration and interview.

## 4. Core Functional Requirements

### 4.1 Webhook Ingestion
- GitHub webhook endpoint at `POST /api/webhooks/github`.
- HMAC SHA-256 signature verification using `GITHUB_WEBHOOK_SECRET`.
- Persist raw webhook payload to PostgreSQL (`WebhookEvent` table).
- Enqueue review job to BullMQ queue named `review-jobs`.
- Return 200 immediately after enqueue.
- Support PR events: `opened`, `synchronize`, `reopened`.

### 4.2 Job Orchestration
- BullMQ worker processes `review-jobs` queue.
- Worker pipeline stages: `FETCH_DIFF` → `SANDBOX_EXEC` → `AST_ANALYSIS` → `AI_REVIEW` → `VALIDATION` → `PERSIST` → `NOTIFY`.
- Each stage updates `ReviewJob.status` in PostgreSQL.
- Each stage emits Socket.IO event for real-time UI.
- Failed jobs retry up to 2 times (BullMQ-level), then mark `FAILED`.
- Job contains: `repositoryFullName`, `pullRequestNumber`, `installationId`, `commitSha`.

### 4.3 Sandbox Execution
- Dockerode creates ephemeral containers from `node:20-alpine` image.
- Memory limit: 256MB.
- CPU limit: 0.5 CPUs.
- Execution timeout: 60 seconds.
- Network enabled for git clone phase, then code runs with timeout.
- Container runs as non-root user (`node`, uid 1000).
- Repository code mounted read-only where possible.
- Writable `/tmp` inside container for test output/logs.
- Collect stdout/stderr as `SandboxExecution` record.
- Container forcibly removed after execution (`container.remove({ force: true })`).
- Runs: linting (eslint), test discovery, basic test execution if tests exist.
- Exit code captured.

### 4.4 AST Analysis
- Parse changed files using `@babel/parser` with typescript and jsx plugins.
- Extract: functions, classes, imports, exports, complexity indicators.
- Store `ASTSnapshot` records linked to `CodeFile`.
- Count nodes for metrics (must support demonstrating 1000+ nodes on sufficiently sized files).
- Feed AST summary to Reviewer Agent as structured context.

### 4.5 AI Review (Agent A: Reviewer)
- `AIProvider` interface with methods: `generateReview(context) → ReviewResult`.
- Three implementations: `HuggingFaceProvider`, `MockAIProvider`, (future `OpenAIProvider` slot).
- LangChain orchestration: `PromptTemplate` → `LLMChain` → `StructuredOutputParser`.
- Input context: diff, AST summary, sandbox logs, pgvector-retrieved similar code context.
- Output: structured JSON with `findings` array.
- Each finding: `file`, `startLine`, `endLine`, `severity` (`critical`/`warning`/`info`), `title`, `description`, `suggestion`, `confidence`.
- Optional: `suggestedPatch` per finding.

### 4.6 Validation (Agent B: Validator)
- Primarily deterministic — NOT another LLM call.
- Zod schema validation of `ReviewResult`.
- Validate: all required fields present, file paths exist in diff, line ranges within file bounds, severity is valid enum, if `suggestedPatch` provided then validate it's parseable by `@babel/parser`, JSON structure correct.
- Return: `{ valid: boolean, errors: ValidationError[] }`.

### 4.7 Self-Correction Loop
- If Validator returns `valid=false`, feed errors back to Reviewer.
- Reviewer retries with validation errors appended to prompt.
- Maximum 3 total attempts (1 initial + 2 retries).
- After 3 failures: `ReviewJob.status = FAILED_VALIDATION`.
- Each attempt recorded as `ReviewAttempt` with attempt number, raw output, validation result.

### 4.8 Vector Context Retrieval
- Embed code chunks using Hugging Face embedding model (e.g., `sentence-transformers/all-MiniLM-L6-v2` via HF Inference API).
- Store embeddings in PostgreSQL using pgvector (`vector(384)` column).
- On review: embed diff summary → cosine similarity search → top-5 similar code chunks.
- Retrieved context appended to Reviewer prompt.
- Embedding table: `id`, `repositoryId`, `filePath`, `chunkContent`, `chunkType` (function/class/module), `embedding vector(384)`, `metadata JSONB`.

### 4.9 Real-Time Updates
- Socket.IO server mounted on Express.
- Namespace: `/reviews`.
- Events emitted: `job:status`, `job:progress`, `review:complete`, `review:finding`.
- Client joins room by PR identifier.
- Worker emits events at each pipeline stage transition.

### 4.10 Review UI
- Next.js app with App Router.
- Pages: `/` (dashboard), `/reviews/[id]` (review workspace).
- Dashboard: list of recent reviews with status badges.
- Review workspace layout: 3-panel (file tree | Monaco editor | findings panel).
- Monaco Editor: read-only diff view of changed files, inline decorations for findings.
- Findings panel: severity icon, title, description, suggestion, validation status, line link.
- File tree: collapsible, shows changed files with finding count badges.
- Real-time status bar showing pipeline stage.
- Zustand stores: `useReviewStore` (current review data), `useSocketStore` (connection state).
- Dark theme with neutral grays, blue accent for info, amber for warnings, red for critical.

### 4.11 Webhook Simulation
- CLI script: `pnpm run simulate`.
- Sends synthetic webhook payloads to local endpoint.
- Can generate 100+ events for load demonstration.
- Uses sample repository data with realistic diffs.
- Includes proper HMAC signature.

## 5. Non-Functional Requirements
- Local-only deployment via Docker Compose.
- Single `docker compose up` to start all infrastructure (PostgreSQL, Redis).
- Application processes started via `pnpm` scripts.
- Total local resource usage: reasonable for laptop.
- No cloud dependencies except Hugging Face API (optional, `MockAIProvider` works offline).

## 6. Out of Scope
- User authentication/authorization.
- Multi-tenancy.
- GitHub App installation flow.
- Production deployment.
- CI/CD pipeline for the project itself.
- Mobile responsive design.
- GitHub comment posting (future enhancement).

## 7. Success Criteria
- Can run locally with `docker compose up` + `pnpm dev`.
- Can trigger webhook (real or simulated).
- Can observe full pipeline: webhook → queue → worker → sandbox → AST → AI → validation → retry → persist → real-time UI.
- Can demonstrate 100+ webhook events processed.
- Can demonstrate 1000+ AST nodes parsed.
- Can explain every technology choice in interview.
- Resume claims substantiated by actual running code.
