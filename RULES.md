# RULES.md — Implementation Rules and Constraints

## 1. Technology Lock

Locked technology stack. Replacements prohibited.

| Category | Technology | Locked | Version / Scope |
|----------|-----------|--------|-----------------|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, Monaco Editor (`@monaco-editor/react`), Zustand | YES | Next.js 14+, React 18+, TypeScript 5+, Tailwind CSS 3.4+ |
| Backend | Node.js, TypeScript, Express, Socket.IO | YES | Node.js 20 LTS, Express 4.x, Socket.IO 4.x |
| Database | PostgreSQL, Prisma ORM, pgvector | YES | PostgreSQL 16, Prisma 5.x, pgvector 0.7+ |
| Queue | Redis, BullMQ | YES | Redis 7 Alpine, BullMQ 5.x |
| Sandbox | Docker, Dockerode | YES | Docker Engine API v1.43+, Dockerode 4.x |
| Analysis | @babel/parser, @babel/traverse, ESLint | YES | Babel 7.x, ESLint 8.x programmatic API |
| Validation | Zod | YES | Zod 3.x |
| AI | LangChain (`@langchain/core`, `@langchain/community`), Hugging Face Inference API (`@huggingface/inference`), AIProvider abstraction | YES | Provider abstraction pattern |
| GitHub | GitHub REST API (`@octokit/rest`), webhook HMAC-SHA256 signature verification | YES | Octokit v20+ |
| Infrastructure | Docker Compose v2, pnpm, pnpm workspaces | YES | pnpm 9.x |

---

## 2. Prohibited Technologies

Strictly disallowed across all workspaces and packages:

- **Alternative Databases / Vector Stores**: MongoDB, MySQL, SQLite, Cassandra, Qdrant, Pinecone, Milvus, Weaviate, ChromaDB (PostgreSQL + pgvector only).
- **Alternative Message Brokers / Queues**: Apache Kafka, RabbitMQ, Redis Streams, AWS SQS, NATS (BullMQ + Redis only).
- **Orchestration Engines**: Kubernetes, Nomad, Temporal, Apache Airflow, Camunda.
- **Alternative Frontend Frameworks**: Vue, Svelte, Angular, Remix, Astro, Nuxt.
- **Alternative ORMs / Query Builders**: TypeORM, Drizzle, Sequelize, MikroORM, Knex (Prisma ORM only; raw SQL restricted to pgvector cosine distance operators `<=>`).
- **Alternative Backend Frameworks**: NestJS, Fastify, Koa, Hono, TRPC.
- **Heavyweight Auth Systems**: Keycloak, Auth0, Okta, Firebase Auth, AWS Cognito (JWT + GitHub OAuth token verification only).
- **Microservices Architecture**: Service mesh, gRPC inter-service transport, API gateway proxies (Kong, Traefik).
- **Cloud-Specific Infrastructure**: AWS Lambda, Cloudflare Workers, Google Cloud Run, Terraform, Pulumi.

---

## 3. Architecture Rules

- **Topology**: Modular monolith with decoupled background worker processes. Single Git repository managed via pnpm workspaces.
- **Process Groups**:
  1. `packages/server` (Express REST API + Socket.IO server on port 4000).
  2. `packages/worker` (BullMQ consumer process executing analysis pipelines).
  3. `packages/web` (Next.js App Router client on port 3000).
  4. `docker-compose.yml` (PostgreSQL 16 with pgvector on port 5432, Redis 7 on port 6379).
- **Database Normalization**: Normalized transactional schema for entities (`Repository`, `PullRequest`, `ReviewRun`, `ReviewComment`, `RuleSet`, `RuleViolation`). No over-normalization: JSON metadata fields allowed for dynamic rule configs and raw AST metrics.
- **Premature Abstraction Policy**: Concrete implementations first. Create abstractions only when 2+ distinct implementations exist.
- **Type Rigidity**: No empty interface definitions, no marker interfaces, no generic type parameters deeper than 2 levels (`Result<T, E>`).
- **Feature Scope**: Implement only declared specification features. No speculative settings, no unused extension hooks.
- **AI Abstraction**: `AIProvider` interface defined in `packages/shared/src/types/ai.ts`. Rest of system depends exclusively on `AIProvider.generateReview()` and `AIProvider.validateRule()`. Provider implementations (`HuggingFaceProvider`, `MockAIProvider`) instantiated via factory (`packages/server/src/ai/factory.ts`).
- **Sandbox Boundary**: Untrusted code analysis requiring execution runs in isolated Docker containers via Dockerode. Direct Node.js `eval()`, `child_process.exec()`, or `vm` module execution on untrusted PR code strictly prohibited.
- **Vector Storage**: pgvector extension loaded inside PostgreSQL. Similarity searches executed directly via SQL query matching against `embedding vector(384)`. No external vector store connections.

---

## 4. Code Style Rules

- **Simplicity**: Explicit, procedural flow preferred over complex object hierarchies.
- **Module Sizing**: Maximum 250 lines per source file. Single responsibility per module.
- **Type Safety**:
  - `any` prohibited. Use `unknown` with Zod parsing or type guards.
  - Strict null checks enabled (`strict: true` in base `tsconfig.json`).
  - Public functions require explicit return types.
- **Error Handling**:
  - No empty `catch` blocks.
  - Custom domain error classes extending `AppError` (`packages/shared/src/errors/AppError.ts`) with HTTP status codes and machine-readable error codes.
  - Worker jobs must log failures to BullMQ job record with serialized stack traces.
- **Shared Code Location**: All shared types, validation schemas, and constants reside in `packages/shared`. Zero duplication between `packages/server`, `packages/worker`, and `packages/web`.
- **Data Boundary Validation**:
  - GitHub Webhook payloads parsed with `githubWebhookSchema` (`packages/shared/src/schemas/webhook.ts`).
  - LLM completion JSON outputs parsed with `aiReviewOutputSchema` (`packages/shared/src/schemas/review.ts`).
  - API request bodies parsed with Zod middleware before hitting Express route handlers.
- **Module Exports**:
  - Named exports exclusively across `packages/shared`, `packages/server`, `packages/worker`.
  - Default exports permitted only for Next.js routing files (`app/**/page.tsx`, `app/**/layout.tsx`).
- **Environment Configuration**: Centralized `config.ts` per package validated via Zod (`envSchema.parse(process.env)`). Direct references to `process.env` outside `config.ts` prohibited.

---

## 5. Documentation Rules

- **Metric Veracity**: Zero fabricated metrics. All performance, throughput, and latency figures must originate from measurable scripts (`scripts/benchmark-*.ts`, `scripts/simulate-webhooks.ts`).
- **Security Posture Transparency**: Explicitly document sandbox constraints: CPU limits (0.5 vCPU), memory ceilings (256MB), network isolation (`NetworkDisabled: true`), non-root execution (`User: "1000:1000"`), temporary root filesystem (`ReadonlyRootfs: true`).
- **Behavior Classification**: Documentation must categorize technical claims into:
  - *Implemented*: Functional in codebase, passing automated tests.
  - *Measured*: Validated via executable benchmark script with logged output.
  - *Architectural*: Structural capability supported by current design.
- **State Tracking**: `MEMORY.md` records current progress, resolved items, and phase status. Does not override `RULES.md` or `ARCHITECTURE.md`.
- **Architectural Change Protocol**: Major structural changes (schema shifts, protocol replacements, new dependencies) must be logged under `## Pending Architectural Decisions` in `MEMORY.md` and approved before code changes.

---

## 6. Phase Discipline

- **Phase Initiation**: Read `SPEC.md`, `ARCHITECTURE.md`, and `RULES.md` before writing code in any phase.
- **Scope Boundary**: Execute only objectives listed under the active phase. No implementing forward phase features early.
- **Phase Completion Checklist**:
  1. Unit tests passing (`pnpm test:unit`).
  2. Integration tests passing (`pnpm test:integration`).
  3. Linter clean with zero warnings (`pnpm lint`).
  4. TypeScript check clean with zero errors across all workspaces (`pnpm typecheck`).
  5. Acceptance criteria verified.
- **State Synchronization**: Update `MEMORY.md` (task checklists, current state) and `LEARN.md` (architectural insights, patterns, edge cases) upon completing every phase.
- **Execution Halt**: Stop execution immediately after completing a phase and verifying criteria. Never auto-proceed to the next phase without explicit trigger.

---

## 7. Dependency Rules

- **Package Minimization**: Every package in `package.json` must be justified by an architectural requirement.
- **Duplicate Prevention**: No overlapping utilities (e.g., choose `date-fns` or native `Intl`, do not install both `moment` and `dayjs`).
- **Workspace Hierarchy**:
  - `packages/shared`: Zero internal package dependencies. Exports types, schemas, utilities.
  - `packages/server`: Depends on `packages/shared`. Does NOT import from `packages/worker` or `packages/web`.
  - `packages/worker`: Depends on `packages/shared`. Does NOT import from `packages/server` or `packages/web`.
  - `packages/web`: Depends on `packages/shared`. Does NOT import from `packages/server` or `packages/worker`.
- **Database Layer**: All database interactions execute via `PrismaClient` exported from `packages/server/src/db/client.ts` or `packages/worker/src/db/client.ts`. Raw SQL restricted to vector operations:
  ```sql
  SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
  FROM "CodeSnippet"
  WHERE 1 - (embedding <=> $1::vector) > $2
  ORDER BY similarity DESC LIMIT $3;
  ```

---

## 8. Testing Rules

- **Test Framework**: Vitest (`vitest.config.ts`) configured across all workspace packages.
- **File Placement**: Test files co-located with implementation: `[filename].test.ts` or `[filename].spec.ts`.
- **Unit Testing Coverage Targets**:
  - Zod parsing schemas: `packages/shared/src/schemas/*.test.ts`.
  - AST parsing & visitor rules: `packages/worker/src/analyzer/ast/*.test.ts`.
  - Rule validation engine: `packages/worker/src/validator/*.test.ts`.
  - Mock AI provider outputs: `packages/server/src/ai/providers/mock.test.ts`.
- **Integration Testing Coverage Targets**:
  - GitHub webhook signature validation & ingestion: `packages/server/src/routes/webhooks.test.ts`.
  - BullMQ job enqueueing, worker processing, and state updates: `packages/worker/src/pipeline.integration.test.ts`.
  - Database Prisma repository operations: `packages/server/src/db/*.integration.test.ts`.
- **E2E Strategy**: Automated E2E testing framework (Cypress/Playwright) is optional. Manual verification via Next.js web interface and simulated webhook events is standard.

---

## 9. Git Rules

- **Commit Message Convention**: Strictly adhere to Conventional Commits format:
  - `feat(<package>): description` (e.g., `feat(worker): add ast complexity visitor`)
  - `fix(<package>): description` (e.g., `fix(server): verify webhook sha256 signature`)
  - `docs: description` (e.g., `docs: update architecture diagram`)
  - `refactor(<package>): description` (e.g., `refactor(shared): extract review types`)
  - `test(<package>): description` (e.g., `test(worker): add zod schema validation tests`)
  - `chore: description` (e.g., `chore: bump pnpm workspace lockfile`)
- **Atomic Commits**: Exactly one logical change per commit. Do not combine refactoring with feature additions.
- **Secret Protection**: Never commit `.env`, `.env.local`, `.env.production`, private keys, GitHub App private keys (`*.pem`), or API tokens.
- **Git Ignore**: Root `.gitignore` must enforce exclusion of:
  - `node_modules/`
  - `.env*` (except `.env.example`)
  - `dist/`, `build/`, `.next/`, `out/`
  - `*.log`, `npm-debug.log*`, `pnpm-debug.log*`
  - `coverage/`, `.turbo/`
  - `docker/data/postgres/`, `docker/data/redis/`
  - `*.pem`, `*.key`

---

## 10. Resume Integrity Rules

Every technical claim on a resume or portfolio summary must correspond to functional, measurable, inspectable code within this repository:

1. **"100+ webhooks processed under load"**:
   - Implementation: `scripts/simulate-webhooks.ts` sending 100+ signed HTTP POST requests with concurrent worker queueing.
   - Verification: Output log displaying event count, success rate, Redis BullMQ throughput, and database insertion latency.

2. **"1,000+ AST nodes parsed & analyzed"**:
   - Implementation: `@babel/parser` + `@babel/traverse` in `packages/worker/src/analyzer/ast/parser.ts`.
   - Verification: `scripts/benchmark-ast.ts` executing against complex sample files in `fixtures/`, measuring node traversal count and execution time in ms.

3. **"Multi-Agent Review Pipeline"**:
   - Implementation: Distinct `ReviewerAgent` (`packages/worker/src/agents/reviewer.ts`) generating diff comments and `ValidatorAgent` (`packages/worker/src/agents/validator.ts`) cross-checking comments against AST facts and project rule sets.
   - Verification: Unit and integration tests verifying validator rejection of hallucinated line numbers and invalid AST claims.

4. **"Secure Docker Sandboxing"**:
   - Implementation: Dockerode container lifecycle manager (`packages/worker/src/sandbox/docker.ts`) applying strict cgroups, memory limits, read-only rootfs, and dropped network access.
   - Verification: Integration test verifying container timeout (e.g., 5-second kill on infinite loops) and memory termination (OOM kill).

5. **"Vector Search with pgvector"**:
   - Implementation: Hugging Face embedding model generating embeddings stored in PostgreSQL `vector(384)` column with IVFFlat or HNSW indexing.
   - Verification: Integration test executing cosine distance similarity queries (`<=>`) returning semantically similar code snippets or past review guidelines.

6. **Demonstration Protocol**: If any feature cannot be executed, measured, and verified locally via script or test suite, it must not be claimed as an operational capability.
