# LEARN.md

## Purpose

Phase-by-phase learning guide for engineering onboarding and codebase mastery. Each section specifies what to learn, why it is used, where it appears in code, concrete implementation details to understand before moving on, and technical interview questions with architectural answers.

---

## Phase 1: Foundation & Infrastructure

### What to Learn

#### pnpm Workspaces
- **Why:** Monorepo package management with isolated dependency trees, symlinked workspace packages, fast zero-copy hard linking, strict dependency resolution preventing phantom dependencies.
- **Where:** `pnpm-workspace.yaml`, root `package.json`, `packages/*/package.json`.
- **Key concepts:** Workspace protocol (`workspace:*`), package hoisting controls (`.npmrc`, `public-hoist-pattern`), shared root `devDependencies`, target package boundary enforcement.
- **Understand:** How `@coderev/shared` is declared as `"dependencies": { "@coderev/shared": "workspace:*" }` inside `packages/server/package.json` and `packages/worker/package.json`. How pnpm creates symlinks in `node_modules/@coderev/shared` pointing to `packages/shared`.

#### TypeScript Project References
- **Why:** Incremental type-checking and build caching across monorepo boundaries without circular dependency risks, enforcing strict package interfaces.
- **Where:** `tsconfig.base.json`, `tsconfig.json` (root), `packages/shared/tsconfig.json`, `packages/server/tsconfig.json`, `packages/worker/tsconfig.json`, `packages/web/tsconfig.json`.
- **Key concepts:** `"composite": true`, `"declaration": true`, `"declarationMap": true`, `"references": [{ "path": "../shared" }]`, root-level `paths` mapping in `tsconfig.base.json` (`@coderev/shared/*`: `["packages/shared/src/*"]`).
- **Understand:** How `tsc -b` (build mode) evaluates dependency graphs, ensures upstream packages (`@coderev/shared`, `@coderev/database`) emit `.d.ts` declarations before downstream packages (`@coderev/server`, `@coderev/worker`) type-check against them.

#### Docker Compose
- **Why:** Declarative local infrastructure orchestration for PostgreSQL (with pgvector extension) and Redis (message broker and queue state) ensuring identical dev/staging environments.
- **Where:** `docker-compose.yml`, `.env.example`.
- **Key concepts:** Service definitions (`postgres`, `redis`), port mappings (`5432:5432`, `6379:6379`), environment variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), named persistent volumes (`postgres_data`, `redis_data`), health checks (`pg_isready -U postgres`, `redis-cli ping`).
- **Understand:** Image `pgvector/pgvector:pg16` installs PostgreSQL 16 compiled with the `vector` extension. Named volumes prevent vector embeddings and job queue state loss across container teardown (`docker compose down`).

#### PostgreSQL + pgvector
- **Why:** Unified relational schema (PRs, reviews, findings, repositories) and semantic vector search within a single storage engine, eliminating distributed transaction overhead between relational and vector databases.
- **Where:** `docker-compose.yml` (`pgvector/pgvector:pg16`), `packages/database/prisma/schema.prisma` (migration SQL: `CREATE EXTENSION IF NOT EXISTS vector;`).
- **Key concepts:** `vector(384)` column data type, Euclidean distance (`<->`), Inner product (`<#>`), Cosine distance (`<=>`), HNSW index (`hnsw (embedding vector_cosine_ops)`).
- **Understand:** Cosine distance `<=>` computes $1 - \cos(\theta)$, where `0.0` is identical orientation. Dimensions (384) match `sentence-transformers/all-MiniLM-L6-v2` dense vector output. Raw SQL queries execution via `prisma.$queryRaw` for vector distance sorting: `SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity FROM "CodeSnippet" ORDER BY embedding <=> $1::vector LIMIT 5`.

#### Prisma ORM
- **Why:** Type-safe database access, schema-driven migrations, declarative relational modeling, auto-generated TypeScript client.
- **Where:** `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/`, `packages/database/src/index.ts`.
- **Key concepts:** Model definitions (`User`, `Repository`, `ReviewJob`, `ReviewFinding`, `CodeSnippet`), attributes (`@id`, `@default(uuid())`, `@unique`, `@relation`, `@db.Text`), enum types (`JobStatus`, `SeverityLevel`, `CategoryType`), migration management (`prisma migrate dev`, `prisma migrate deploy`), custom unsupported types (`Unsupported("vector(384)")`).
- **Understand:** Execution of `npx prisma migrate dev --name init` generates SQL DDL under `prisma/migrations/<timestamp>_init/migration.sql` and triggers `prisma generate` to produce `@prisma/client` types exported from `@coderev/database`.

#### Express.js Basics
- **Why:** Minimalist HTTP server powering the GitHub webhook receiver and REST API endpoints.
- **Where:** `packages/server/src/app.ts`, `packages/server/src/server.ts`, `packages/server/src/routes/`.
- **Key concepts:** Middleware execution order (raw body capture $\to$ HMAC signature verification $\to$ JSON body parser $\to$ routes $\to$ 404 handler $\to$ 4-argument error handler `(err, req, res, next)`), request parameter validation, asynchronous route wrappers.
- **Understand:** Raw body retention via `express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } })` required for cryptographic signature checks before JSON parsing.

### Interview Questions

#### 1. Why a monorepo instead of separate repositories?
- **Answer:**
  - **Atomic Commits:** Changes spanning data contracts (`packages/shared/src/schemas/review.schema.ts`), database models (`packages/database/prisma/schema.prisma`), and consumers (`packages/server`, `packages/worker`, `packages/web`) occur in a single Git commit.
  - **Shared Code Without Publishing Overhead:** Avoids building, versioning, and publishing internal packages to a private npm registry on every contract update.
  - **Unified Tooling & CI/CD:** Single pipeline for linting (`eslint`), formatting (`prettier`), type-checking (`tsc -b`), and testing (`vitest`).
  - **Code Navigation & Refactoring:** Language servers (LSP) resolve references and refactors across packages in real time without stale package cache issues.

#### 2. What does Prisma give you over raw SQL?
- **Answer:**
  - **End-to-End Type Safety:** Schema changes automatically regenerate TypeScript types for model inputs and relation query outputs, preventing runtime errors.
  - **Migration Management:** Declarative schema migrations with historical migration tracking, checksum verification, and rollback detection via the `_prisma_migrations` table.
  - **Relation Handling:** Auto-joins and nested writes/reads without manual complex SQL join syntax (`include: { findings: true }`).
  - **Query Builder Protection:** Parameterized queries by default, neutralizing SQL injection vectors.
  - **Extensibility via Raw SQL:** When specialized operators like pgvector (`<=>`) are needed, `prisma.$queryRaw` provides type-safe parameterized raw SQL execution.

#### 3. Why pgvector instead of Pinecone/Qdrant?
- **Answer:**
  - **Single Source of Truth & ACID Compliance:** Relational metadata (PR IDs, commit SHAs, file paths) and vector embeddings live in the same transaction. Deleting a PR or repository cascades to its vector embeddings automatically without distributed synchronization scripts or dual-write inconsistencies.
  - **Zero Network Latency Between Storage Layers:** Relational joins against vector search results happen inside the PostgreSQL query engine instead of over HTTP/gRPC across multiple cloud services.
  - **Operational & Cost Simplicity:** No separate cluster management, API keys, pricing tiers, or cloud vendor lock-in. Backups via standard `pg_dump` include both relational data and vector indexes.
  - **Scale Fit:** For repositories with millions of snippets, pgvector with HNSW indexing handles search in single-digit milliseconds with minimal memory footprint.

#### 4. What's in docker-compose.yml and why?
- **Answer:**
  - **Services:**
    1. `postgres`: Runs `pgvector/pgvector:pg16` on port `5432`. Provides relational storage + vector indexing. Configured with environment variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, health check `pg_isready`, and mounted named volume `postgres_data:/var/lib/postgresql/data`.
    2. `redis`: Runs `redis:7-alpine` on port `6379`. Provides in-memory storage for BullMQ queue state, job locking, and pub/sub for Socket.IO horizontal scaling. Configured with health check `redis-cli ping` and persistent volume `redis_data:/data`.
  - **Why:** Eliminates "works on my machine" inconsistencies by standardizing database engines and extension versions across Linux, macOS, and CI runner environments.

#### 5. How does TypeScript compilation work across packages?
- **Answer:**
  - Configured via TypeScript Project References (`"composite": true`, `"references": [...]` in `tsconfig.json`).
  - `packages/shared` compiles and emits `.d.ts` declaration files and `.d.ts.map` source maps into `dist/`.
  - When `packages/server` or `packages/worker` compiles with `tsc -b`, TypeScript uses the pre-built declaration files from `packages/shared/dist` instead of re-evaluating all TypeScript source files from scratch.
  - During development, `tsconfig.base.json` defines path aliases (`@coderev/shared/*`: `["packages/shared/src/*"]`) enabling `tsx` and `ts-node` to resolve raw source files without requiring continuous rebuild steps.

---

## Phase 2: Webhook Ingestion & Queue

### What to Learn

#### GitHub Webhooks
- **Why:** Asynchronous event-driven triggers alerting the platform when code changes occur on monitored repositories.
- **Where:** `packages/server/src/routes/webhook.routes.ts`, `packages/server/src/controllers/webhook.controller.ts`.
- **Key concepts:** Headers (`X-GitHub-Event: pull_request`, `X-GitHub-Delivery: <guid>`, `X-Hub-Signature-256: sha256=<hash>`), payload fields (`action`, `pull_request.id`, `pull_request.number`, `pull_request.head.sha`, `pull_request.base.sha`, `pull_request.diff_url`, `repository.full_name`, `repository.clone_url`, `installation.id`).
- **Understand:** Actions requiring review triggers: `opened`, `synchronize` (new commits pushed), and `reopened`. Actions ignored: `closed`, `labeled`, `assigned`.

#### HMAC SHA-256 Signature Verification
- **Why:** Cryptographic proof of origin ensuring the HTTP payload originated from GitHub using a pre-shared secret, preventing webhook spoofing, payload tampering, and replay attacks.
- **Where:** `packages/server/src/middleware/webhook-signature.ts`.
- **Key concepts:** Pre-shared secret (`WEBHOOK_SECRET`), cryptographic hash generation (`crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex')`), timing-safe comparison (`crypto.timingSafeEqual`).
- **Understand:** Standard string equality (`signature === computed`) is vulnerable to timing attacks where execution time leaks character match positions. `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed))` evaluates in constant time regardless of match accuracy.

#### BullMQ (Queue Producer)
- **Why:** Fast ingestion decoupling HTTP endpoint latency from compute-intensive pipeline processing. Enables the webhook receiver to respond `200 OK` / `202 Accepted` in $<20\text{ms}$.
- **Where:** `packages/server/src/queue/producer.ts`, `packages/server/src/queue/review-queue.ts`.
- **Key concepts:** `new Queue('code-review-queue', { connection: redisOptions })`, `queue.add(jobName, payload, options)`, Job ID deduplication (`jobId: \`pr-${repoId}-${prNumber}-${commitSha}\``), retry backoff options (`attempts: 3, backoff: { type: 'exponential', delay: 5000 }`), removal policies (`removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 }`).
- **Understand:** Redis stores job state inside Redis Hashes (`bull:code-review-queue:<jobId>`) and Sorted Sets (`bull:code-review-queue:wait`, `bull:code-review-queue:active`, `bull:code-review-queue:delayed`).

#### BullMQ (Worker Consumer)
- **Why:** Dedicated Node.js worker process pulling jobs from Redis, executing sandboxed AST and AI review pipelines, updating database state, and handling graceful retries.
- **Where:** `packages/worker/src/worker.ts`, `packages/worker/src/processors/review.processor.ts`.
- **Key concepts:** `new Worker('code-review-queue', processorFn, { connection, concurrency: 5, lockDuration: 300000 })`, job lifecycle hooks (`worker.on('completed')`, `worker.on('failed')`, `worker.on('error')`), progress tracking (`job.updateProgress(percent)`).
- **Understand:** How BullMQ uses Redis atomic Lua scripts for job locking; automatic lock renewal via `lockDuration` to prevent other worker processes from stealing long-running AI review jobs; dead letter handling when `job.attemptsMade >= job.opts.attempts`.

#### Event-Driven Architecture
- **Why:** System scalability and fault isolation: web server crashes do not kill worker execution; worker backpressure does not block GitHub webhook delivery.
- **Where:** Webhook Controller $\to$ Redis Queue $\to$ Worker Pipeline $\to$ Prisma DB $\to$ Redis Pub/Sub $\to$ Socket.IO Gateway $\to$ Next.js UI.
- **Key concepts:** Asynchronous processing, producer-consumer pattern, idempotency keys, eventual consistency, backpressure mitigation.
- **Understand:** Eventual consistency guarantees: UI shows "Queued" / "In Progress" until the worker writes the final `ReviewJob` record with status `COMPLETED` or `FAILED`.

### Interview Questions

#### 1. Walk me through what happens when GitHub sends a webhook.
- **Answer:**
  1. GitHub sends an HTTP `POST /api/webhooks/github` with headers `X-GitHub-Event: pull_request`, `X-Hub-Signature-256`, and JSON payload.
  2. Express raw-body middleware captures the raw Buffer.
  3. `webhook-signature.ts` middleware calculates `crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex')` and validates with `crypto.timingSafeEqual`. Returns `401 Unauthorized` if invalid.
  4. Webhook controller checks if the action is `opened`, `synchronize`, or `reopened`.
  5. Controller writes a new `ReviewJob` record in PostgreSQL with status `QUEUED`.
  6. Producer pushes a job to BullMQ queue `code-review-queue` with payload `{ jobId, repoUrl, prNumber, commitSha, baseSha, diffUrl }`.
  7. Express immediately responds with `202 Accepted` (`{ received: true, jobId }`).
  8. BullMQ worker picks up the job via Redis sorted set lock, transitioning job status to `PROCESSING` in PostgreSQL and emitting a Socket.IO event.

#### 2. Why HMAC instead of just checking the source IP?
- **Answer:**
  - **IP Spoofing & Proxying:** IP addresses can be spoofed or altered via intermediate proxies, CDNs, or misconfigured reverse proxies (`X-Forwarded-For`).
  - **Dynamic IP Ranges:** GitHub's webhook IP ranges change frequently (requiring continuous scraping of `https://api.github.com/meta`), introducing network maintenance overhead.
  - **Payload Integrity:** Source IP verification only checks the sender's origin—it does not verify if the payload was tampered with in transit (Man-in-the-Middle). HMAC SHA-256 cryptographically validates both authenticity (origin) and integrity (payload was not modified by 1 byte).

#### 3. What happens if the worker is down when a webhook arrives?
- **Answer:**
  - The Express server continues operating normally. It receives the webhook, verifies the HMAC signature, inserts the `ReviewJob` record with status `QUEUED` into PostgreSQL, and enqueues the job onto Redis via BullMQ.
  - The job resides safely in the Redis `bull:code-review-queue:wait` sorted set with data persisted to disk via Redis AOF/RDB.
  - Once the worker process restarts or scales up, it instantly reads pending jobs from Redis and resumes processing without any dropped webhooks or data loss.

#### 4. How does BullMQ retry failed jobs?
- **Answer:**
  - Configured with `attempts: 3` and `backoff: { type: 'exponential', delay: 5000 }`.
  - When the worker processor throws an unhandled exception:
    1. BullMQ captures the error stack trace, increments `job.attemptsMade`, and moves the job from `active` to the `delayed` set.
    2. Redis calculates delay: $\text{delay} = 5000 \times 2^{(\text{attemptsMade} - 1)}$ ($5\text{s}$, $10\text{s}$, $20\text{s}$).
    3. When the delay timer expires, Redis moves the job back to `wait`.
    4. If `attemptsMade >= attempts`, the job moves to `failed` and triggers the `worker.on('failed')` listener to mark the database record as `FAILED`.

#### 5. Why not process the webhook synchronously in the Express handler?
- **Answer:**
  - **GitHub Webhook Timeout (10 seconds):** GitHub drops webhook connections and flags the webhook endpoint as unhealthy if a response is not returned within 10 seconds.
  - **Pipeline Duration (30s - 120s):** Full review involves cloning repository diffs, running AST parsing, generating pgvector embeddings, querying vector indexes, calling LLMs with multiple self-correction loops, and writing database findings.
  - **Server Thread Starvation:** Synchronous CPU/network-heavy execution ties up Express event loop handles and worker threads, causing HTTP connection drops for concurrent incoming webhooks.

#### 6. What is eventual consistency and how does it apply here?
- **Answer:**
  - **Definition:** A consistency model in distributed systems where storage updates replicate asynchronously; the system is not immediately consistent across all components, but will become consistent after a finite duration.
  - **Application:** When a PR webhook arrives, the user's dashboard initially shows the review status as `QUEUED`. The database, LLM output, and UI state synchronize over time through worker queue execution and Socket.IO real-time event broadcasts. The client UI does not expect immediate findings on HTTP POST completion.

---

## Phase 3: Sandbox Execution & AST Analysis

### What to Learn

#### Dockerode
- **Why:** Programmatic Docker daemon management via Node.js over `/var/run/docker.sock` to spin up ephemeral, secure containers for sandboxed operations.
- **Where:** `packages/worker/src/sandbox/docker-sandbox.ts`.
- **Key concepts:** Docker socket connection (`new Docker({ socketPath: '/var/run/docker.sock' })`), container creation (`docker.createContainer()`), stream management (`container.attach()`, `demuxStream()`), status awaiting (`container.wait()`), lifecycle cleanup (`container.remove({ force: true })`).
- **Understand:** Creating ephemeral execution environments with specific image overlays (e.g., `node:20-alpine`), mounting read-only git patches, capturing `stdout` and `stderr` streams separately, ensuring container removal in `finally` blocks.

#### Container Resource Isolation
- **Why:** Mitigate arbitrary code execution risks, denial of service (DoS), fork bombs, memory exhaustion, and host network access when processing untrusted codebases.
- **Where:** `packages/worker/src/sandbox/docker-sandbox.ts` (`HostConfig`).
- **Key concepts:**
  - Memory: `Memory: 512 * 1024 * 1024` (512MB hard limit), `MemorySwap: 512 * 1024 * 1024` (disables swap to prevent host disk thrashing).
  - CPU: `NanoCpus: 500000000` ($0.5$ CPU core via Linux Completely Fair Scheduler `cgroups`).
  - Processes: `PidsLimit: 50` (prevents fork bombs like `:(){ :|:& };:`).
  - Networking: `NetworkMode: 'none'` (completely disables inbound/outbound networking).
  - Filesystem: `ReadonlyRootfs: true`, `Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=64m' }`.
- **Understand:** Linux `cgroups` enforce limits at kernel level. Exceeding memory triggers the Linux kernel OOM Killer (`exit code 137`). Exceeding execution timeout triggers `SIGKILL` from Dockerode.

#### Abstract Syntax Trees (AST)
- **Why:** Structural, semantic code inspection converting unstructured source code text into a deterministic hierarchical tree representation.
- **Where:** `packages/worker/src/ast/parser.ts`, `packages/worker/src/ast/analyzer.ts`.
- **Key concepts:** Lexical analysis (tokens) $\to$ syntactic analysis (AST), Node types (`FunctionDeclaration`, `ArrowFunctionExpression`, `ClassDeclaration`, `ImportDeclaration`, `TryStatement`, `CallExpression`), Visitor pattern (`traverse`), cyclomatic complexity calculation.
- **Understand:** Why AST outperforms regex: Regex cannot handle nested scopes, matching parenthesis depth, comments containing code snippets, multiline type declarations, or semantic identifier renames. AST extracts exact parameter counts, imported dependencies, exported symbols, function complexity, and line numbers deterministically.

#### @babel/parser
- **Why:** High-performance, spec-compliant JavaScript/TypeScript parser supporting modern ECMAScript features, JSX, and TS type annotations.
- **Where:** `packages/worker/src/ast/parser.ts`.
- **Key concepts:** `babelParser.parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx', 'decorators-legacy'] })`, `@babel/traverse`, AST node counters, error boundaries for syntax errors.
- **Understand:** How to handle syntax errors gracefully when analyzing diffs of invalid intermediate code commits; calculating function metrics (cyclomatic complexity via `IfStatement`, `ForStatement`, `WhileStatement`, `ConditionalExpression`, `LogicalExpression` counters).

### Interview Questions

#### 1. Why Docker containers instead of child processes or VMs?
- **Answer:**
  - **Child Processes (`child_process.spawn`):** Share the host OS kernel, file system, environment variables, and network stack. A malicious PR containing `process.env` inspection or `rm -rf /` can compromise the host machine.
  - **Virtual Machines (VMs):** Provide full hardware virtualization with high security isolation, but take 10-30 seconds to boot and consume gigabytes of memory per instance—untenable for fast PR review pipelines.
  - **Docker Containers:** Provide microsecond startup times, lightweight namespace and `cgroup` isolation, zero host network access (`NetworkMode: 'none'`), read-only root filesystems, and strict CPU/memory caps with minimal overhead.

#### 2. What resource limits do you set and what happens when they're exceeded?
- **Answer:**
  - `Memory: 536870912` (512MB) + `MemorySwap: 536870912`: Linux kernel OOM killer terminates the container immediately with exit status `137` (`128 + SIGKILL (9)`). Dockerode captures status code `137` and maps it to error `SANDBOX_OOM_KILLED`.
  - `NanoCpus: 500000000` ($0.5$ vCPU): Linux CFS scheduler throttles container CPU cycles to $50\%$ of one core. Execution slows down without crashing host CPU.
  - `PidsLimit: 50`: Fork operations fail with `EAGAIN (Resource temporarily unavailable)` when process tree exceeds 50 PIDs.
  - `TimeoutMs: 30000` (30 seconds): Node.js `setTimeout` triggers `container.kill('SIGKILL')` followed by `container.remove({ force: true })`, throwing `SANDBOX_TIMEOUT_EXCEEDED`.

#### 3. What is an AST and why use it for code analysis?
- **Answer:**
  - An Abstract Syntax Tree is a tree representation of the abstract syntactic structure of source code. Each node denotes a construct occurring in the source code (e.g., variable declarations, binary expressions, return statements).
  - **Why AST over Regular Expressions:**
    1. **Context Awareness:** AST knows if a string like `"function calculate()"` is inside a comment, a string literal, or an actual executable function declaration.
    2. **Structural Traversal:** Enables querying complex relationships, e.g., "Find all async functions lacking a `try/catch` block containing database query calls".
    3. **Reliable Metrics:** Accurately computes cyclomatic complexity, parameter counts, and depth of nesting regardless of code formatting, indentation, or minification.

#### 4. How do you ensure container cleanup even on failures?
- **Answer:**
  - Implementation uses `try ... catch ... finally` blocks wrapping the container lifecycle.
  - The container reference is initialized outside the `try` block.
  - The `finally` block executes unconditionally:
    ```typescript
    try {
      container = await docker.createContainer({ ... });
      await container.start();
      // await execution and logs
    } catch (err) {
      logger.error('Sandbox execution error', err);
      throw err;
    } finally {
      if (container) {
        try {
          await container.stop({ t: 2 });
        } catch (_) {}
        try {
          await container.remove({ force: true, v: true }); // removes anonymous volumes
        } catch (cleanupErr) {
          logger.error('Failed to force remove container', cleanupErr);
        }
      }
    }
    ```
  - Background periodic garbage-collector cron sweeps orphan containers labeled with `created_by=coderev-sandbox` older than 5 minutes.

#### 5. What security limitations exist in your sandbox approach?
- **Answer:**
  - **Shared Linux Kernel:** Container breakout vulnerabilities (e.g., Dirty COW, CVE-2024-21626) could allow privilege escalation if the host kernel is unpatched.
  - **Mitigations implemented:**
    - Non-root user inside container (`User: '1000:1000'`).
    - Drop all capabilities (`CapDrop: ['ALL']`).
    - Disable setuid/setgid privilege escalation (`SecurityOpt: ['no-new-privileges:true']`).
    - Network isolation (`NetworkMode: 'none'`).
    - Read-only root filesystem (`ReadonlyRootfs: true`).
  - **Production Enhancement:** In enterprise environments, replace Dockerode with microVM virtualization (e.g., AWS Firecracker or gVisor sandbox runtime `runsc`).

#### 6. How do you count 1000+ AST nodes?
- **Answer:**
  - Uses `@babel/traverse` with single-pass Visitor pattern.
  - Instead of recursively traversing the tree multiple times for different node types, a unified visitor map increments node-specific counters in $O(N)$ linear time where $N$ is the number of AST nodes:
    ```typescript
    let totalNodes = 0;
    const typeCounts: Record<string, number> = {};
    traverse(ast, {
      enter(path) {
        totalNodes++;
        typeCounts[path.node.type] = (typeCounts[path.node.type] || 0) + 1;
      }
    });
    ```
  - Traversal completes within 2–10 milliseconds for source files containing thousands of AST nodes.

---

## Phase 4: AI Review, Validation & Self-Correction

### What to Learn

#### Provider Pattern (AIProvider Interface)
- **Why:** Abstraction layer decoupling the review pipeline from proprietary LLM vendor APIs (Hugging Face, OpenAI, Anthropic, Ollama, Mock Provider).
- **Where:** `packages/worker/src/ai/provider.interface.ts`, `packages/worker/src/ai/providers/`.
- **Key concepts:**
  ```typescript
  export interface AIProvider {
    readonly name: string;
    generateReview(prompt: string, options?: ProviderOptions): Promise<string>;
    generateEmbedding(text: string): Promise<number[]>;
  }
  ```
- **Understand:** Dependency injection via factory pattern `AIProviderFactory.getProvider(process.env.AI_PROVIDER)`. Enables unit testing pipeline logic with deterministic mock providers without network calls or API costs.

#### LangChain
- **Why:** Orchestration framework for prompt template composition, schema-guided structured output parsing, and model chain execution.
- **Where:** `packages/worker/src/ai/langchain-reviewer.ts`.
- **Key concepts:** `PromptTemplate`, `StructuredOutputParser`, `RunnableSequence`, format instructions injection, JSON repair callbacks.
- **Understand:** How `StructuredOutputParser.fromZodSchema(ReviewOutputSchema)` automatically injects JSON formatting instructions into the prompt template and enforces type-safe parsing on the LLM response string.

#### Hugging Face Inference API
- **Why:** Access to open-weights models (e.g., `Qwen/Qwen2.5-Coder-32B-Instruct`, `meta-llama/Llama-3.3-70B-Instruct`) and embedding models (`sentence-transformers/all-MiniLM-L6-v2`) via managed API without high proprietary API costs.
- **Where:** `packages/worker/src/ai/providers/huggingface.provider.ts`.
- **Key concepts:** `@huggingface/inference` client, endpoint tasks (`textGeneration`, `featureExtraction`), bearer token authentication, token limit handling, rate limiting with retry headers.
- **Understand:** Generating 384-dimensional dense vectors using `featureExtraction` with `all-MiniLM-L6-v2`. Handling parameter configurations (`max_new_tokens: 4096`, `temperature: 0.1`, `top_p: 0.95`) for deterministic, code-focused generation.

#### Zod Schema Validation
- **Why:** Runtime boundary schema validation verifying that raw string outputs from LLMs conform strictly to TypeScript type contracts.
- **Where:** `packages/shared/src/schemas/review.schema.ts`, `packages/worker/src/validator/review-validator.ts`.
- **Key concepts:**
  ```typescript
  export const FindingSchema = z.object({
    filePath: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
    category: z.enum(['SECURITY', 'BUG', 'PERFORMANCE', 'STYLE', 'BEST_PRACTICE']),
    title: z.string().max(200),
    description: z.string(),
    suggestion: z.string().optional(),
    suggestedPatch: z.string().optional(),
  });

  export const ReviewOutputSchema = z.object({
    summary: z.string(),
    score: z.number().min(0).max(100),
    findings: z.array(FindingSchema),
  });
  ```
- **Understand:** `safeParse()` returns `{ success: true, data }` or `{ success: false, error: ZodError }`. Zod errors format into line-by-line violation messages for the self-correction engine.

#### Deterministic Validation
- **Why:** Catch AI hallucinations (invented files, impossible line numbers, invalid syntax in suggested patches) using zero-cost, deterministic code checks without invoking another non-deterministic LLM call.
- **Where:** `packages/worker/src/validator/review-validator.ts`.
- **Key concepts:**
  1. **File Existence Validation:** Verifies `finding.filePath` exists in the PR diff's changed file list.
  2. **Line Range Bounds Validation:** Verifies `finding.lineStart` and `lineEnd` fall within the actual modified hunk lines of the diff. `lineStart <= lineEnd`.
  3. **Patch Parseability Validation:** If `suggestedPatch` is provided, runs `@babel/parser` on the applied patch to guarantee no syntax errors are introduced.
- **Understand:** Eliminates false-positive LLM hallucinations before findings are written to the database or posted to GitHub.

#### Self-Correction Loop
- **Why:** Recovers from malformed LLM responses or hallucinated line numbers by feeding specific validation error logs back into the LLM context for iterative self-correction.
- **Where:** `packages/worker/src/pipeline/self-correction.ts`.
- **Key concepts:** Maximum retry limit (`MAX_ATTEMPTS = 3`), attempt counter, feedback prompt formatting, fallback handling (`JobStatus.FAILED_VALIDATION`).
- **Understand:**
  ```mermaid
  graph TD
      A["Prompt + PR Diff"] --> B["LLM Generation"]
      B --> C["Zod & Deterministic Validator"]
      C -->|Valid| D["Save Findings & Complete"]
      C -->|Invalid & Attempt < 3| E["Format Errors into Feedback Prompt"]
      E --> B
      C -->|Invalid & Attempt >= 3| F["Mark Job FAILED_VALIDATION"]
  ```

#### pgvector Similarity Search
- **Why:** Retrieval-Augmented Generation (RAG) providing relevant architectural context, historical bug patterns, and repository code snippets to the LLM prompt.
- **Where:** `packages/worker/src/vector/embedder.ts`, `packages/worker/src/vector/retriever.ts`.
- **Key concepts:** Dense vector embedding, cosine similarity calculation (`1 - (embedding <=> queryVector)`), top-$K$ retrieval ($K=5$), snippet contextualization.
- **Understand:**
  ```sql
  SELECT
    id,
    "filePath",
    content,
    1 - (embedding <=> $1::vector) AS similarity
  FROM "CodeSnippet"
  WHERE "repositoryId" = $2
    AND 1 - (embedding <=> $1::vector) > 0.75
  ORDER BY embedding <=> $1::vector ASC
  LIMIT 5;
  ```

### Interview Questions

#### 1. Why an AIProvider interface instead of calling OpenAI directly?
- **Answer:**
  - **Vendor Lock-in Mitigation:** Allows seamless switching between OpenAI (GPT-4o), Anthropic (Claude 3.5 Sonnet), Hugging Face open-weights models, or local Ollama instances by changing `AI_PROVIDER=huggingface` in `.env`.
  - **Cost & SLA Optimization:** Route non-critical repositories to lower-cost open models, and high-security enterprise repositories to specialized code review models.
  - **Hermetic Testing:** Enables unit and integration testing of worker pipelines using a `MockAIProvider` that returns deterministic fixtures without incurring API costs or requiring internet connectivity.

#### 2. What does the Validator check and why is it deterministic?
- **Answer:**
  - **Checks:**
    1. Schema compliance (Zod): Validates presence and types of fields, enum values for `severity` and `category`, score bounds ($0 \le \text{score} \le 100$).
    2. File existence: Ensures every finding references a file actually present in the PR diff.
    3. Range validity: Confirms `lineStart <= lineEnd` and lines correspond to modified hunks in the diff.
    4. Patch validity: Validates that `suggestedPatch` parses as valid code via `@babel/parser`.
  - **Why Deterministic:** Using another LLM as a judge introduces latency (additional seconds), financial cost, and its own hallucinations. Deterministic AST/diff checks execute in $<5\text{ms}$ with $100\%$ precision.

#### 3. How does the self-correction loop work? What gets fed back to the LLM?
- **Answer:**
  - When the validator fails, it generates a structured error report containing specific Zod paths and deterministic rule failures:
    ```
    Validation Failed on Attempt 1:
    - findings[0].filePath: File "src/missing-file.ts" does not exist in this PR.
    - findings[2].lineStart (45) is greater than lineEnd (40).
    - findings[3].suggestedPatch: SyntaxError: Unexpected token (3:10)
    Please regenerate the complete JSON response, correcting the specific errors above.
    ```
  - The worker appends this feedback along with the initial prompt and invalid output back into the conversation context and invokes `provider.generateReview(feedbackPrompt)`.

#### 4. What happens after 3 failed validation attempts?
- **Answer:**
  - The worker aborts the retry loop to prevent infinite token consumption and billing runaway.
  - The `ReviewJob` record in PostgreSQL is updated to `status: 'FAILED_VALIDATION'`.
  - An error log is recorded with the raw LLM output and the validation failure array.
  - A Socket.IO event `job:failed` is emitted to notify the UI.
  - The job completes in BullMQ without throwing an unhandled exception to avoid pointless BullMQ-level queue retries of an unparseable LLM output.

#### 5. How does pgvector similarity search work?
- **Answer:**
  - **Embedding:** Code snippets from the repository are converted into 384-dimensional dense float vectors using `all-MiniLM-L6-v2`.
  - **Storage:** Stored in the `CodeSnippet` table in PostgreSQL in a `vector(384)` column indexed with an HNSW (Hierarchical Navigable Small World) index.
  - **Query:** When a PR is reviewed, the PR diff description and modified symbols are embedded into a query vector.
  - **Distance Operator:** PostgreSQL runs `ORDER BY embedding <=> $1::vector` using cosine distance ($1 - \cos(\mathbf{u}, \mathbf{v})$). The top $K$ nearest snippets are retrieved and injected into the LLM review prompt as contextual reference.

#### 6. What LangChain components do you use and why?
- **Answer:**
  - `PromptTemplate`: For parameter interpolation (`{diff}`, `{astSummary}`, `{vectorContext}`, `{format_instructions}`) preventing template injection vulnerabilities.
  - `StructuredOutputParser`: Auto-generates JSON schema format instructions and extracts JSON from markdown-fenced code blocks (` ```json ... ``` `).
  - `RunnableSequence`: Composes prompt formatting, LLM invocation, and output parsing into an observable, traceable execution graph.

#### 7. How would you add a new LLM provider?
- **Answer:**
  1. Create `packages/worker/src/ai/providers/newprovider.provider.ts`.
  2. Implement the `AIProvider` interface:
     ```typescript
     export class NewProvider implements AIProvider {
       readonly name = 'newprovider';
       constructor(private apiKey: string) {}
       async generateReview(prompt: string): Promise<string> { ... }
       async generateEmbedding(text: string): Promise<number[]> { ... }
     }
     ```
  3. Register `newprovider` inside `packages/worker/src/ai/provider.factory.ts` matching `case 'newprovider': return new NewProvider(process.env.NEWPROVIDER_API_KEY)`.
  4. Add environment variable validation in `packages/worker/src/config.ts`.

#### 8. Why Zod for validation instead of just TypeScript types?
- **Answer:**
  - TypeScript types only exist at compile time and are completely erased during JavaScript execution.
  - AI generation produces an untrusted, unstructured string at runtime over the network.
  - Zod provides runtime schema enforcement: it parses, inspects, validates, coerces, and throws actionable structured errors when runtime JSON data deviates from expected types.

---

## Phase 5: Real-Time Updates & API

### What to Learn

#### Socket.IO
- **Why:** Real-time, low-latency bidirectional communication pushing pipeline progress, AST milestones, self-correction attempts, and completed findings to the browser without client polling.
- **Where:** `packages/server/src/socket/socket.ts`, `packages/server/src/socket/emitter.ts`, `packages/web/src/lib/socket.ts`.
- **Key concepts:** Namespaces (`/reviews`), Rooms (`socket.join(\`review:${jobId}\`)`), Typed Events (`job:status`, `job:progress`, `job:finding_discovered`, `job:completed`, `job:failed`), Redis Pub/Sub adapter (`@socket.io/redis-adapter`) for multi-server horizontal scaling.
- **Understand:** When the worker progresses through stages (SANDBOX $\to$ AST $\to$ EMBEDDINGS $\to$ AI_GENERATION $\to$ VALIDATION $\to$ COMPLETE), it publishes events via Redis. The Socket.IO server broadcasts to clients subscribed to the specific `review:${jobId}` room.

#### REST API Design
- **Why:** Standardized HTTP API for querying historical reviews, paginated findings, repository statistics, and triggering manual re-reviews.
- **Where:** `packages/server/src/routes/review.routes.ts`, `packages/server/src/controllers/review.controller.ts`, `packages/server/src/services/review.service.ts`.
- **Key concepts:**
  - Routes: `GET /api/reviews`, `GET /api/reviews/:id`, `GET /api/reviews/:id/findings`, `POST /api/reviews/:id/rerun`.
  - Relation inclusion: `prisma.reviewJob.findUnique({ where: { id }, include: { findings: true, repository: true } })`.
  - Pagination: Cursor-based or `take` / `skip` offset pagination with query parameters `?page=1&limit=20&severity=CRITICAL`.
  - HTTP Status Codes: `200 OK`, `201 Created`, `202 Accepted`, `400 Bad Request`, `404 Not Found`, `500 Internal Server Error`.
- **Understand:** Clean controller-service-repository separation: controllers handle HTTP request/response parsing and status codes; services execute business logic and Prisma database operations.

### Interview Questions

#### 1. Why Socket.IO instead of polling?
- **Answer:**
  - **Bandwidth & Server Load:** Polling requires clients to send HTTP requests every $1\text{s}$–$2\text{s}$, incurring continuous TCP/TLS handshake overhead, HTTP header parsing, and database queries for static data ($95\%$ of polls return no change).
  - **Latency:** Polling introduces up to the polling interval (e.g., $2000\text{ms}$) in latency before the user sees an update. Socket.IO pushes events instantly ($\approx 5\text{ms}$).
  - **Battery & Client Efficiency:** Long-lived WebSocket connections maintain a lightweight TCP keepalive frame, minimizing client battery and CPU consumption.

#### 2. How do rooms work in Socket.IO?
- **Answer:**
  - Rooms are server-side channel abstractions allowing targeted broadcasts to a subset of connected sockets without sending messages to unrelated clients.
  - When a user navigates to `/reviews/job-123` in Next.js, the client emits `join_room` with payload `{ reviewJobId: 'job-123' }`.
  - The server executes `socket.join('review:job-123')`.
  - When the worker generates a finding, the server executes:
    `io.of('/reviews').to('review:job-123').emit('job:finding_discovered', finding)`.
  - Sockets viewing other reviews receive zero network traffic.

#### 3. How does the worker notify the frontend of progress?
- **Answer:**
  1. The worker process updates job progress via BullMQ `job.updateProgress(stagePercentage)`.
  2. The worker publishes a message to a Redis Pub/Sub channel `channel:review-events` with payload `{ jobId, event: 'job:progress', data: { stage: 'AST_ANALYSIS', percent: 35 } }`.
  3. The Express Socket.IO server (subscribed to Redis Pub/Sub via `@socket.io/redis-adapter` or direct Redis client) receives the message.
  4. The Socket.IO server broadcasts the event to the room `review:${jobId}`.
  5. The Next.js frontend `useSocket` hook receives the event and updates the Zustand store, triggering a reactive UI progress bar update.

#### 4. What happens if the Socket.IO connection drops?
- **Answer:**
  - **Automatic Reconnection:** Socket.IO client automatically initiates exponential backoff reconnection (`reconnectionAttempts: Infinity`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`).
  - **Re-joining Rooms:** On the `connect` event listener, the frontend re-emits `join_room` for the active `reviewJobId`.
  - **State Reconciliation:** Upon reconnection, the client performs a single REST query `GET /api/reviews/:id` to fetch the authoritative database state, catching up on any events missed during disconnection.

---

## Phase 6: Frontend Review UI

### What to Learn

#### Next.js App Router
- **Why:** React framework utilizing React Server Components (RSC) for initial page renders, streaming SSR, and file-system based routing.
- **Where:** `packages/web/src/app/`, `packages/web/src/app/reviews/[id]/page.tsx`, `packages/web/src/app/layout.tsx`.
- **Key concepts:** Server Components (default, zero client bundle for static shells), Client Components (`'use client'` for interactive Monaco editor and Socket.IO hooks), Dynamic Segments (`[id]`), Layout nesting, Suspense loading boundaries (`loading.tsx`).
- **Understand:** When to place `'use client'` at leaf component boundaries (e.g., `ReviewFindingCard.tsx`, `MonacoDiffEditor.tsx`) while keeping parent layouts and data wrappers as Server Components.

#### Monaco Editor Integration
- **Why:** Industrial-grade code editor (the engine behind VS Code) embedded in the browser to render source code, diff comparisons, syntax highlighting, and inline finding decorations.
- **Where:** `packages/web/src/components/review/monaco-viewer.tsx`, `packages/web/src/components/review/diff-editor.tsx`.
- **Key concepts:** `@monaco-editor/react`, dynamic loading (`next/dynamic` with `ssr: false`), Monaco model manipulation, `editor.deltaDecorations()` for inline severity highlighting, glyph margins for finding markers.
- **Understand:** Monaco accesses the browser `window` and `document` DOM APIs; importing it directly in Server Components causes SSR hydration failures. Using `dynamic(() => import('./monaco-viewer'), { ssr: false })` ensures it only mounts on the client.

#### Zustand
- **Why:** Minimalist, hook-based state management without Redux boilerplate, context re-render cascades, or provider wrapping.
- **Where:** `packages/web/src/stores/review.store.ts`, `packages/web/src/stores/socket.store.ts`.
- **Key concepts:** `create<ReviewState>()((set, get) => ({ ... }))`, atomic selectors (`const findings = useReviewStore(state => state.findings)`), state mutations via immutable updates, action creators.
- **Understand:** How atomic selectors prevent unnecessary component re-renders: selecting `state.findings` will not trigger re-renders when `state.progressPercent` changes.

#### Tailwind CSS + shadcn/ui
- **Why:** Accessible, customizable, themeable UI components built with Radix UI primitives and Tailwind CSS utility classes.
- **Where:** `packages/web/tailwind.config.ts`, `packages/web/src/components/ui/`.
- **Key concepts:** CSS variables (`hsl(var(--primary))`), dark mode class switching (`class="dark"`), Radix UI primitives (Dialog, Tabs, Accordion, Tooltip), component copy-paste ownership (components live inside `src/components/ui/`, not locked inside `node_modules`).
- **Understand:** Customizing finding severity badges with dynamic Tailwind variants (`bg-red-500/10 text-red-500 border-red-500/20` for `CRITICAL`).

#### Socket.IO Client
- **Why:** Real-time client-side hook connecting to the server WebSocket namespace, maintaining connection state, and updating Zustand stores.
- **Where:** `packages/web/src/hooks/use-review-socket.ts`, `packages/web/src/lib/socket.ts`.
- **Key concepts:** Singleton socket connection, `useEffect` subscription lifecycle, event listener cleanup (`socket.off()`), room departure on component unmount.
- **Understand:**
  ```typescript
  export function useReviewSocket(jobId: string) {
    const updateJob = useReviewStore((s) => s.updateJob);
    const addFinding = useReviewStore((s) => s.addFinding);

    useEffect(() => {
      const socket = getSocket();
      socket.emit('join_room', { reviewJobId: jobId });

      socket.on('job:progress', (data) => updateJob(data));
      socket.on('job:finding_discovered', (finding) => addFinding(finding));

      return () => {
        socket.emit('leave_room', { reviewJobId: jobId });
        socket.off('job:progress');
        socket.off('job:finding_discovered');
      };
    }, [jobId]);
  }
  ```

### Interview Questions

#### 1. Why Next.js instead of plain React (Vite/CRA)?
- **Answer:**
  - **Hybrid Rendering:** Initial dashboard shell renders on the server (RSC) for fast First Contentful Paint (FCP) and SEO, while interactive review tools hydrate on the client.
  - **Integrated Routing & API:** File-based routing with nested layouts (`/reviews/[id]`), error boundaries (`error.tsx`), and loading skeletons (`loading.tsx`) without external routing libraries.
  - **Optimization Tooling:** Built-in font optimization (`next/font`), image optimization (`next/image`), and code splitting per route segment.

#### 2. Why Zustand instead of Redux or Context?
- **Answer:**
  - **Zero Boilerplate:** No reducers, action types, dispatchers, or provider tree wrapping required.
  - **Performance (No Context Re-renders):** React Context triggers re-renders on all consuming components whenever any value in the context changes. Zustand allows granular selector subscriptions (`useReviewStore(s => s.selectedFindingId)`), re-rendering only the specific component subscribing to that exact slice.
  - **Non-React Access:** Zustand stores can be read and mutated outside React components (e.g., inside Socket.IO callbacks or API utility functions via `useReviewStore.getState()` and `useReviewStore.setState()`).

#### 3. How does Monaco Editor integration work?
- **Answer:**
  - Monaco requires a browser environment (`window`, DOM APIs, Web Workers for syntax tokenization).
  - It is loaded dynamically via `next/dynamic` with SSR disabled (`{ ssr: false }`).
  - When the user selects a finding from the review sidebar:
    1. The editor scrolls to the finding line using `editor.revealLineInCenter(finding.lineStart)`.
    2. Inline highlights are applied via `editor.deltaDecorations([], [{ range: new monaco.Range(finding.lineStart, 1, finding.lineEnd, 1), options: { isWholeLine: true, className: 'finding-highlight-critical' } }])`.
    3. Suggested patches are displayed using Monaco's side-by-side Diff Editor component (`<DiffEditor original={originalCode} modified={patchedCode} />`).

#### 4. How do real-time updates flow from worker to UI?
- **Answer:**
  1. Worker executes pipeline step and publishes event to Redis Pub/Sub.
  2. Server socket layer receives Redis message and emits Socket.IO event to room `review:${jobId}`.
  3. Browser WebSocket client receives event in `useReviewSocket` hook.
  4. Hook triggers Zustand store action (`addFinding`, `updateProgress`).
  5. Zustand updates internal immutable state.
  6. Subscribed React components (`ProgressBar`, `FindingList`, `MonacoViewer`) re-render with fresh data without page reload.

#### 5. What is the `'use client'` directive and when do you need it?
- **Answer:**
  - In Next.js App Router, all components in the `app/` directory are React Server Components (RSC) by default.
  - `'use client'` marks the boundary between the server-rendered component tree and the client-hydrated component tree.
  - Required whenever a component uses:
    - React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`).
    - Custom hooks (`useReviewSocket`, `useReviewStore`).
    - Browser APIs (`window`, `localStorage`, WebSocket).
    - Event listeners (`onClick`, `onChange`).
    - Third-party libraries relying on DOM APIs (Monaco Editor).

---

## Cross-Cutting Concepts

### Event-Driven Architecture
- **Complete Pipeline Lifecycle Flow:**
  ```
  GitHub Webhook (POST /api/webhooks/github)
     │
     ▼ (HMAC Verification)
  Express Server
     │
     ▼ (Job Producer)
  Redis Queue (BullMQ)
     │
     ▼ (Worker Consumer)
  Worker Pipeline
     ├── 1. Dockerode Sandbox (Clone & Patch)
     ├── 2. AST Parser & Analyzer (@babel/parser)
     ├── 3. pgvector RAG Retriever (all-MiniLM-L6-v2)
     ├── 4. LLM Generation (LangChain / HuggingFace)
     ├── 5. Deterministic & Zod Validation
     └── 6. Self-Correction Loop (if validation fails, max 3)
     │
     ▼ (Persist Findings & Job Status)
  PostgreSQL Database (Prisma)
     │
     ▼ (Publish Events)
  Redis Pub/Sub
     │
     ▼ (Room Broadcast)
  Socket.IO Server (/reviews)
     │
     ▼ (WebSocket Push)
  Next.js Frontend (Zustand Store ──> Monaco Editor UI)
  ```
- **Architectural Tenets:**
  - **Decoupling:** Each subsystem (Web Ingestion, Background Worker, Database, Real-Time Gateway, UI) operates independently.
  - **Asynchronous Execution:** Compute-intensive AST analysis and AI generation never block API responsiveness.
  - **Observability:** Granular job progress events enable full end-to-end telemetry and user transparency.
  - **Resilience:** Redis queue persistence prevents job loss; exponential backoff handles transient network/LLM provider failures.

### Error Handling Strategy
- **Express Server Layer:**
  - Global 4-argument error-handling middleware `(err: Error, req: Request, res: Response, next: NextFunction)` catches all unhandled route errors.
  - Zod validation middleware validates incoming request bodies and returns structured `400 Bad Request` with field-level issues.
  - Webhook signature failures return immediate `401 Unauthorized` without leaking internal stack traces.
- **Worker Pipeline Layer:**
  - Explicit `try / catch` blocks around each pipeline stage (Sandbox, AST, Vector Retrieval, AI Generation, Validation).
  - Failed stages update the `ReviewJob` record in PostgreSQL with explicit error messages and terminal status (`FAILED_SANDBOX`, `FAILED_AST`, `FAILED_VALIDATION`, `FAILED_AI`).
- **Sandbox Execution Layer:**
  - Container lifecycle wrapped in `try ... finally` ensuring `container.stop()` and `container.remove({ force: true })` execute even on abnormal worker process interruption.
  - Hard timeouts (`setTimeout` $\to$ `SIGKILL`) prevent infinite loops or hangs in untrusted code.
- **AI & Validation Layer:**
  - LLM output parsing protected by Zod `safeParse()`.
  - Deterministic validator catches hallucinations (non-existent files, out-of-bounds lines, invalid patch syntax).
  - Self-correction loop retries with error feedback up to 3 times before failing gracefully.
- **Frontend Layer:**
  - React Error Boundaries wrap Monaco Editor and dynamic panels to prevent full-page crashes on rendering exceptions.
  - Socket.IO automatic reconnection with exponential backoff and REST state reconciliation on reconnect.

### Type Safety End-to-End
- **Unified Contract Monorepo Architecture:**
  - `@coderev/shared`: Single source of truth for all data contracts, Zod schemas (`ReviewOutputSchema`, `FindingSchema`), and shared TypeScript interfaces.
  - `@coderev/database`: Prisma schema (`schema.prisma`) generates strictly-typed TypeScript database clients reflecting table structures, enums, and relation payloads.
  - `@coderev/server`: Validates incoming webhook payloads and REST query parameters against shared Zod schemas.
  - `@coderev/worker`: Enforces Zod schemas on LLM outputs and validates database operations using Prisma types.
  - `@coderev/web`: Consumes shared schemas and types for Zustand stores, React components, and Socket.IO event payloads.
  - **TypeScript Strict Mode:** `"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true` enabled across all workspace packages via `tsconfig.base.json`.
