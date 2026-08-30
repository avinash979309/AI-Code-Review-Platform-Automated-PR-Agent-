# RESUME_CONTRACT.md

## Purpose

This document defines the exact resume claims this project must substantiate. Each claim is treated as an immutable contract. The implementation must provide concrete evidence — running code, measurable database records, deterministic logs, and reproducible demo scripts — for every claim.

**Authority:** This document has the HIGHEST priority among all governance documents. No architectural, implementation, or dependency decision may contradict the ability to demonstrate and verify these claims.

---

## CLAIM 1

**Resume Text:** "Deployed an event-driven CI/CD code review platform in Node.js, React, and TypeScript, processing 100+ Git webhooks via a decoupled Redis and BullMQ orchestration layer."

### Required Evidence

| Sub-claim | Implementation Requirement | Verification Method |
|-----------|---------------------------|--------------------|
| Event-driven | GitHub webhook endpoint triggers asynchronous processing via BullMQ queue | `POST /api/webhooks/github` enqueues BullMQ job; returns HTTP 202 Accepted |
| CI/CD code review platform | Full review pipeline: webhook ingestion → sandbox clone/exec → AST analysis → multi-agent AI review → validation loop → results dashboard | End-to-end execution from webhook trigger to React UI dashboard view |
| Node.js, React, TypeScript | Express / Fastify backend in `packages/server`, Next.js/React frontend in `packages/web`, shared types in `packages/shared`, all strictly typed TypeScript (`tsconfig.json` strict mode) | Source code inspection across `packages/server`, `packages/worker`, `packages/web`, `packages/shared` |
| 100+ Git webhooks | System processes 100+ concurrent/sequential webhook events with database persistence and queue metrics | Run `scripts/simulate-webhooks.ts`; verify >= 100 `WebhookEvent` rows in DB and >= 100 completed jobs in BullMQ |
| Redis and BullMQ orchestration | Jobs queued in Redis via BullMQ `Queue` instance (`review-jobs`), consumed by dedicated `Worker` instance | BullMQ queue named `review-jobs`, Redis connection on `redis:6379`, worker concurrency and event listeners active |
| Decoupled | Server (producer) and Worker (consumer) are distinct runtime processes communicating strictly via Redis and Postgres | Two separate entry points: `packages/server/src/index.ts` and `packages/worker/src/index.ts`; independent Dockerfile definitions |

### Architecture & Implementation Mapping

- **Producer Endpoint:** `packages/server/src/routes/webhook.routes.ts` (`POST /api/webhooks/github`)
- **Queue Instance:** `packages/server/src/queue/producer.ts` (`new Queue('review-jobs', { connection })`)
- **Consumer Process:** `packages/worker/src/worker.ts` (`new Worker('review-jobs', processor, { connection, concurrency: 2 })`)
- **Database Entity:** `WebhookEvent` (id, eventType, action, payload, signature, processed, pullRequestId, createdAt)
- **Simulation Script:** `scripts/simulate-webhooks.ts` sending HMAC-SHA256 signed payloads

### Interview Questions & Technical Answers

1. **Why event-driven instead of synchronous processing?**
   - *Answer:* Code review workflows (cloning, sandbox execution, AST generation, LLM generation, validation) take 5–45 seconds. GitHub webhook deliveries timeout after 10 seconds (HTTP 504). Decoupling via Redis/BullMQ allows the API server to acknowledge the webhook with HTTP 202 in <50ms, prevent connection exhaustion on the HTTP server, and handle burst traffic with backpressure.

2. **What happens if the worker crashes mid-job?**
   - *Answer:* BullMQ maintains job locks (`lockDuration: 30000ms`, renewed periodically). If a worker process dies, the lock expires. BullMQ's stalled job detection (`stalledInterval`) moves the orphaned job back to the `waiting` state or triggers the configured retry strategy. Sandbox containers are labeled with `review-job-id` allowing cleanup on startup.

3. **How does BullMQ handle retries?**
   - *Answer:* Jobs are configured with exponential backoff retry policies:
     ```typescript
     {
       attempts: 3,
       backoff: {
         type: 'exponential',
         delay: 2000
       },
       removeOnComplete: false,
       removeOnFail: false
     }
     ```
     Failed jobs are moved to the `failed` set with failure reasons recorded in the database `review_jobs.error_message`.

4. **What is the flow from webhook receipt to job completion?**
   - *Answer:*
     1. GitHub sends `POST /api/webhooks/github` with `X-Hub-Signature-256`.
     2. Server verifies HMAC signature using raw request buffer and webhook secret.
     3. Server inserts record into `webhook_events` (status: `PENDING`).
     4. Server enqueues job into BullMQ `review-jobs` queue with payload metadata.
     5. Server returns HTTP 202 Accepted with `{ eventId, jobId }`.
     6. Worker picks up job, updates `webhook_events.processed = true` and `review_jobs.status = 'IN_PROGRESS'`.
     7. Worker runs sandbox execution, AST extraction, LangChain review, and validation loop.
     8. Worker writes final `ReviewResult` and `ReviewComment` entities to PostgreSQL and publishes completion event via Redis Pub/Sub for WebSocket push to React UI.

5. **How would you scale this to handle more webhooks?**
   - *Answer:*
     - **Horizontal Worker Scaling:** Deploy additional worker containers consuming from the same BullMQ Redis queue without server-side changes.
     - **Redis Clustering:** Utilize Redis Cluster or Sentinel for high-availability queue storage.
     - **Database Connection Pooling:** Use PgBouncer in front of PostgreSQL to prevent connection saturation.
     - **Rate Limiting & Partitioning:** Partition queues by repository tier (e.g., high-priority vs standard queues) or rate limit per GitHub installation ID.

6. **What is the signature verification protecting against?**
   - *Answer:* Prevents Webhook Spoofing and Replay/Tampering attacks. Uses `crypto.timingSafeEqual` over HMAC-SHA256 digest of the raw payload body to ensure requests originate exclusively from GitHub and haven't been altered in transit.

---

## CLAIM 2

**Resume Text:** "Executed untrusted pull-request code inside ephemeral Docker containers with resource isolation, AST validation, and automated cleanup, preventing persistent state leakage during CI evaluation."

### Required Evidence

| Sub-claim | Implementation Requirement | Verification Method |
|-----------|---------------------------|--------------------|
| Untrusted PR code | Code from target PR is fetched and isolated inside a non-root sandbox container; never executed in host Node.js runtime | Source code inspection of `packages/worker/src/sandbox/dockerRunner.ts`; verify `dockerode.createContainer` call with non-root user |
| Ephemeral Docker containers | Container created specifically for the job execution lifecycle and removed immediately after | `container.remove({ force: true })` called in `finally` block; `SandboxExecution.containerId` recorded in DB; verified with `docker ps -a` post-run |
| Resource isolation | Hard memory limit (256MB), CPU quota (0.5 cores / 50,000 quota), network isolation toggle, execution timeout (60s) | Inspect `HostConfig` in `dockerRunner.ts`: `Memory: 268435456`, `NanoCPUs: 500000000`, `NetworkMode: 'none'` (or restricted bridge) |
| AST validation | Changed files parsed deterministically using `@babel/parser` / `@typescript-eslint/parser`; AST nodes, function declarations, complexity metrics extracted | `ASTSnapshot` records generated with `nodeCount`, `functionCount`, `classCount`, `cyclomaticComplexity`; verified in DB |
| Automated cleanup | Container destroyed, temporary directories unlinked, no orphaned containers or volumes | Test suite checks `docker ps -a --filter "label=sandbox=true"` count is 0 after test completion |
| Preventing state leakage | Read-only container rootfs where applicable, tmpfs mounts for ephemeral workspace, explicit volume unlinking | Inspect `HostConfig.Tmpfs` and absence of persistent host volume binds |

### Architecture & Implementation Mapping

- **Sandbox Engine:** `packages/worker/src/sandbox/dockerRunner.ts` (using `dockerode` package)
- **Sandbox Image:** `docker/sandbox/Dockerfile` (minimal Alpine Node.js / Python runner with unprivileged user `sandboxuser`)
- **AST Analyzer:** `packages/worker/src/analysis/astParser.ts` (using `@babel/parser`, `@babel/traverse`, `@typescript-eslint/typescript-estree`)
- **Database Entities:** 
  - `SandboxExecution` (`id`, `reviewJobId`, `containerId`, `exitCode`, `stdout`, `stderr`, `durationMs`, `status`, `createdAt`)
  - `ASTSnapshot` (`id`, `reviewJobId`, `filePath`, `nodeCount`, `functions`, `classes`, `imports`, `metricsJson`, `createdAt`)

### Interview Questions & Technical Answers

1. **Why not just run code in a Node.js child process or `vm2`?**
   - *Answer:* Node.js `child_process.exec` runs with full host privileges and filesystem access. Node's `vm` module explicitly states "The vm module is not a security mechanism. Do not use it to run untrusted code." Even `vm2` had critical prototype pollution and sandbox escape CVEs. OS-level containerization with cgroups, namespaces, and seccomp provides true process and memory isolation.

2. **What resource limits are set and why those numbers?**
   - *Answer:*
     - `Memory: 256MB` (`268435456` bytes): Sufficient for AST parsing and linting typical PR diffs (10–50 files); prevents Fork Bomb / Memory Exhaustion (OOM) attacks from crashing host.
     - `NanoCPUs: 500000000` (0.5 CPU cores): Prevents infinite loops or crypto-mining scripts from consuming 100% of host CPU.
     - `Timeout: 60,000ms`: Kills runaway compilation or build scripts.
     - `PIDs Limit: 64`: Restricts process creation to eliminate fork bomb vectors.

3. **What happens if the container exceeds the memory limit?**
   - *Answer:* The Linux kernel OOM killer terminates the container process. `dockerode` stream captures exit code 137 (128 + SIGKILL 9). The sandbox manager catches the OOM condition via container inspection (`State.OOMKilled === true`), records `SandboxExecution.status = 'OOM_KILLED'`, and triggers graceful job failure without bringing down the worker.

4. **How do you ensure cleanup even if the container crashes or worker dies?**
   - *Answer:*
     - In-process: Container creation and execution are wrapped in `try/finally` blocks ensuring `container.remove({ force: true })` and `fs.rm(tempDir, { recursive: true })` execute on error/cancellation.
     - Out-of-process: Containers are labeled with `managed-by=code-review-platform` and `created-at=<timestamp>`. Worker startup routine runs a sweep script `cleanupStaleContainers()` removing any orphaned containers older than 5 minutes.

5. **What are the security limitations of this approach?**
   - *Honest Disclosure:* Detailed in the section below. Suitable for portfolio demonstration; in enterprise production, requires microVMs (AWS Firecracker / Kata Containers / gVisor) or rootless container engines.

6. **What does the AST analysis actually extract and why is it useful?**
   - *Answer:* AST parser extracts syntax trees from modified files:
     - Function and class definitions (start line, end line, parameters, return types).
     - Cyclomatic complexity and nesting depth.
     - Imported modules and API usage.
     - It provides structural ground-truth to the AI review prompt (allowing targeted analysis of changed AST nodes rather than raw strings) and enables the validator to verify that AI-suggested line ranges and symbol names exist in the actual AST.

### Honest Security Disclosure
This sandbox provides container-level isolation suitable for architectural verification and portfolio demonstration. It is NOT an enterprise-grade multi-tenant security boundary.
- **Docker Daemon:** Runs as `root` on the host machine; communication occurs via `/var/run/docker.sock`.
- **Runtime:** Standard `runc` runtime (not gVisor/Kata microVMs).
- **Network Access:** Configurable per execution (`none` for pure static analysis, restricted bridge if dependency fetching is required).
- **Kernel Sharing:** Shares the host Linux kernel (vulnerable to kernel privilege escalation CVEs).
- **Filesystem Isolation:** Uses `tmpfs` mounts and Docker layer copy-on-write; root filesystem is marked read-only where possible.

---

## CLAIM 3

**Resume Text:** "Orchestrated a distributed multi-agent workflow via LangChain and OpenAI, utilizing a Vector DB to parse 1,000+ AST nodes and run an automated verification loop to eliminate hallucinations."

### Required Evidence

| Sub-claim | Implementation Requirement | Verification Method |
|-----------|---------------------------|--------------------|
| Multi-agent workflow | Dedicated Agent A (Code Reviewer) for initial generation and Agent B (Deterministic Validator & Formatter) as distinct modular components | Source code: `packages/worker/src/agents/reviewerAgent.ts` and `packages/worker/src/agents/validatorAgent.ts` |
| LangChain | LangChain prompt templates, structured output parsers, and runnable sequences orchestration | Imports from `@langchain/core` (`PromptTemplate`, `RunnableSequence`, `StructuredOutputParser`) in `reviewerAgent.ts` |
| AI provider | Pluggable `AIProvider` interface supporting OpenAI, HuggingFace (`HuggingFaceInference`), and deterministic `MockAIProvider` | `packages/worker/src/providers/provider.ts`, `openaiProvider.ts`, `huggingfaceProvider.ts`, `mockProvider.ts` |
| Vector DB | PostgreSQL with `pgvector` extension for storing AST node embeddings and context retrieval | Database schema table `code_embeddings` with column `embedding vector(384)`; cosine similarity SQL queries (`<=>`) |
| 1,000+ AST nodes | Full repository / sample PR AST parsing extracts >= 1000 AST nodes with stored snapshot metadata | Execute parser over sample fixture repo (`fixtures/sample-repo`); verify `SUM(nodeCount) >= 1000` in `ast_snapshots` |
| Automated verification loop | Validator evaluates AI suggestions against actual file contents and AST boundaries; triggers self-correction loop up to 3 attempts on validation failure | Execution logs in `packages/worker/src/agents/selfCorrectionLoop.ts`; inspect `review_attempts` records showing attempt numbers 1, 2, 3 |
| Eliminate hallucinations | Deterministic schema validation (Zod) + AST range verification + file path verification eliminates non-existent files, invalid line numbers, and invalid syntax suggestions | Unit tests in `packages/worker/src/agents/__tests__/validator.test.ts` asserting rejection of hallucinated line numbers |

### Implementation Note on "OpenAI"

The codebase implements a pluggable `AIProvider` abstraction:
- **Interface:** `AIProvider` defined in `packages/worker/src/providers/provider.ts` with method `generateReview(prompt: string): Promise<string>`.
- **Implementations:**
  1. `OpenAIProvider`: Production provider using `@langchain/openai` or `openai` SDK (`gpt-4o` / `gpt-4o-mini`).
  2. `HuggingFaceProvider`: Open-source inference provider via `@huggingface/inference`.
  3. `MockAIProvider`: Deterministic, offline provider for local test execution and CI without API keys.
- **Interview Response:** *"The architecture uses an AI provider abstraction layer. During development and local demonstration, I leverage the mock and Hugging Face providers for deterministic, zero-cost CI testing, while the production config routes directly to OpenAI models using the identical LangChain orchestration pipeline."*

### Architecture & Implementation Mapping

- **Reviewer Agent:** `packages/worker/src/agents/reviewerAgent.ts`
- **Validator Agent:** `packages/worker/src/agents/validatorAgent.ts`
- **Self-Correction Orchestrator:** `packages/worker/src/agents/selfCorrectionLoop.ts`
- **Vector DB Repository:** `packages/worker/src/storage/vectorStore.ts` (using `pgvector`)
- **Embedding Model:** 384-dimensional dense embeddings (`sentence-transformers/all-MiniLM-L6-v2` via HuggingFace or `@xenova/transformers` / local ONNX pipeline)
- **Database Entities:**
  - `CodeEmbedding` (`id`, `repository`, `filePath`, `nodeType`, `content`, `embedding vector(384)`, `metadataJson`, `createdAt`)
  - `ReviewAttempt` (`id`, `reviewJobId`, `attemptNumber`, `prompt`, `rawOutput`, `isValid`, `validationErrorsJson`, `createdAt`)
  - `ReviewComment` (`id`, `reviewJobId`, `filePath`, `lineNumber`, `endLineNumber`, `severity`, `title`, `body`, `suggestionCode`, `isValidated`)

### Interview Questions & Technical Answers

1. **Why two agents instead of one?**
   - *Answer:* Separation of concerns. Generative LLMs excel at semantic code understanding, identifying logic flaws, and suggesting improvements, but frequently hallucinate exact line numbers, syntax ranges, or non-existent import paths. A separate deterministic Validator agent acts as a strict guardrail, ensuring every suggestion is mathematically verified against the AST and filesystem before presenting results to developers.

2. **What does the Validator actually check? Why deterministic instead of another LLM?**
   - *Answer:* The Validator performs deterministic checks:
     1. **Schema Check:** Strict JSON validation via Zod schema (severity enum, required fields).
     2. **File Existence:** Ensures `filePath` exists in the PR diff.
     3. **Line Range Validity:** Ensures `lineNumber` and `endLineNumber` are within the modified file bounds and correspond to actual modified chunks.
     4. **AST Boundary Alignment:** Verifies that replacement code corresponds to valid AST node boundaries (e.g., doesn't split a statement in half).
     5. **Syntax Check:** Parses the suggested replacement code through `@babel/parser` to ensure no syntax errors are introduced.
     *Deterministic code is used because AST boundary checking and line range checks require exact boolean guarantees, not probabilistic text generation.*

3. **How does the retry / self-correction loop work?**
   - *Answer:*
     1. Agent A generates `ReviewOutput_1`.
     2. Agent B validates `ReviewOutput_1`. If valid, pipeline finishes.
     3. If invalid, Agent B compiles explicit `validationErrors` (e.g., `"File src/auth.ts only has 142 lines, but suggestion references lines 180-195"`).
     4. Self-correction loop constructs a repair prompt including the original code, the flawed output, and the specific validation error list.
     5. Agent A generates `ReviewOutput_2` targeted at fixing the errors.
     6. Process repeats up to `MAX_ATTEMPTS = 3`.

4. **What happens after 3 failed validations?**
   - *Answer:* The job falls back to a graceful degradation state: comments that passed validation are preserved, comments that failed validation are stripped or flagged with `isValidated: false` in `review_comments`, and a warning is appended to `ReviewResult.summary` (`"Review completed with 1 unverified suggestion omitted"`). The review job completes with status `COMPLETED_WITH_WARNINGS`.

5. **How are embeddings generated and stored?**
   - *Answer:* Changed AST nodes and surrounding context (function blocks, interface definitions) are extracted. Text representations are passed to an embedding pipeline generating 384-dimension float vectors. Embeddings are stored in PostgreSQL using `pgvector` with an `HNSW` (Hierarchical Navigable Small World) or `IVFFlat` cosine index (`vector_cosine_ops`).

6. **How does pgvector similarity search work (cosine distance)?**
   - *Answer:* Query AST context is vectorized and queried using the cosine distance operator `<=>`:
     ```sql
     SELECT id, file_path, content, 1 - (embedding <=> $1) AS similarity
     FROM code_embeddings
     WHERE repository = $2
     ORDER BY embedding <=> $1
     LIMIT 5;
     ```
     Cosine distance measures the angle between normalized vector representations, capturing semantic similarity regardless of identifier naming variations.

7. **Why 384-dimension vectors?**
   - *Answer:* Standard dimensionality for lightweight, high-performance embedding models such as `all-MiniLM-L6-v2`. It provides an optimal balance between semantic retrieval accuracy, low embedding generation latency (<20ms per chunk), and minimal memory/storage footprint in PostgreSQL.

8. **What LangChain abstractions are used and why?**
   - *Answer:*
     - `ChatPromptTemplate` / `PromptTemplate`: For parameterizing AST context, diff hunks, and error feedback during self-correction.
     - `StructuredOutputParser` (with Zod): For enforcing strict typed JSON schemas on LLM outputs.
     - `RunnableSequence` (`pipe` operator): For composing prompt formatting, model invocation, and parsing into a deterministic pipeline.

9. **How would you swap to a different LLM provider?**
   - *Answer:* The worker uses the `AIProvider` factory. Swapping providers requires setting the environment variable `AI_PROVIDER=openai|huggingface|anthropic|mock` and providing the corresponding API key. No worker orchestration or validator code requires modification.

---

## Metrics Integrity

### Rules

1. **NEVER Fabricate Metrics:** All reported numbers must originate from real database records, Redis counters, or test execution logs.
2. **Measured Value vs. Architectural Capability:** Documentation and interview discussions must clearly distinguish between *measured test execution values* (e.g., "127 webhooks processed in benchmark") and *theoretical system bounds* (e.g., "Worker pool concurrency supports 50 jobs/sec").
3. **Exact Reporting:** If a test run measures 127 webhooks, report 127 — never round down to "100+" or up to "approx 130".
4. **Clean Baseline:** Benchmark runs must begin with a cleared test database and empty Redis queue to ensure metric purity.

### Measurable Metrics

| Metric | SQL / Verification Query | Minimum for Claim Verification |
|--------|--------------------------|--------------------------------|
| Webhook count | `SELECT COUNT(*) FROM webhook_events WHERE processed = true;` | `>= 100` |
| AST node count | `SELECT SUM(node_count) FROM ast_snapshots WHERE review_job_id = '<JOB_ID>';` | `>= 1000` |
| Validation attempts | `SELECT MAX(attempt_number) FROM review_attempts WHERE review_job_id = '<FAILED_JOB_ID>';` | `3` (demonstrating retry execution) |
| Container cleanup | `docker ps -a --filter "label=managed-by=code-review-platform" -q \| wc -l` | `0` (zero leaked containers) |
| Review latency | `SELECT AVG(duration_ms) FROM sandbox_executions;` | Recorded exact average in ms |
| Queue completion | BullMQ `queue.getCompletedCount()` | `>= 100` |

---

## Demo Script Checklist

Execute the following verification sequence prior to any demonstration or technical interview:

1. **Start Infrastructure:**
   ```bash
   docker compose up -d postgres redis
   ```
2. **Run Migrations & Seed Schema:**
   ```bash
   pnpm run db:migrate
   ```
3. **Start Application Services:**
   ```bash
   pnpm run dev # Starts server (port 3001), worker, and web dashboard (port 3000)
   ```
4. **Execute Webhook Simulation Benchmark (100+ Events):**
   ```bash
   pnpm run simulate --count=105
   ```
5. **Verify Database Records:**
   ```sql
   -- Webhook Verification
   SELECT COUNT(*) AS processed_webhooks FROM webhook_events WHERE processed = true;
   -- Expected: >= 105

   -- AST Node Count Verification
   SELECT review_job_id, SUM(node_count) AS total_ast_nodes 
   FROM ast_snapshots 
   GROUP BY review_job_id 
   HAVING SUM(node_count) >= 1000 
   LIMIT 1;

   -- Validation Loop & Self-Correction Verification
   SELECT review_job_id, attempt_number, is_valid, validation_errors_json 
   FROM review_attempts 
   ORDER BY review_job_id, attempt_number;
   ```
6. **Verify Ephemeral Container Cleanup:**
   ```bash
   docker ps -a --filter "label=managed-by=code-review-platform"
   # Output must be empty (0 containers remaining)
   ```
7. **Inspect Web Dashboard:**
   - Open `http://localhost:3000/reviews`
   - Verify review listing shows completed jobs.
   - Click into a review to display 3-panel workspace: Diff View, AST Metadata Panel, and Validated AI Comments.
