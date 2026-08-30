# ARCHITECTURE.md

## 1. System Architecture

Modular monolith. Three process groups:
1. **Web Server** (Express + Socket.IO + Next.js) — single process
2. **Worker** (BullMQ worker) — single process
3. **Infrastructure** (PostgreSQL + Redis) — Docker Compose

```text
GitHub Webhook → Express API → Redis/BullMQ Queue
                                      ↓
                              BullMQ Worker
                        ┌───────────────────────┐
                        │ 1. Fetch Diff (GitHub) │
                        │ 2. Sandbox (Docker)    │
                        │ 3. AST Analysis        │
                        │ 4. Vector Retrieval     │
                        │ 5. AI Review            │
                        │ 6. Validation           │
                        │ 7. Self-Correction Loop │
                        │ 8. Persist Results      │
                        │ 9. Notify (Socket.IO)   │
                        └───────────────────────┘
                                      ↓
                              PostgreSQL + pgvector
                                      ↓
                        Socket.IO → Next.js Review UI
```

## 2. Repository Structure

pnpm workspace monorepo:

```text
Code_Review_Platform/
├── package.json                 # root workspace
├── pnpm-workspace.yaml
├── docker-compose.yml
├── .env.example
├── tsconfig.base.json
├── packages/
│   ├── shared/                  # shared types, schemas, constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/
│   │       │   ├── index.ts
│   │       │   ├── review.ts      # ReviewResult, Finding, etc.
│   │       │   ├── webhook.ts     # WebhookPayload, etc.
│   │       │   ├── job.ts         # JobData, JobStatus enum
│   │       │   └── socket.ts      # Socket event types
│   │       ├── schemas/
│   │       │   ├── review.schema.ts  # Zod schemas
│   │       │   └── webhook.schema.ts
│   │       └── constants.ts
│   ├── server/                  # Express + Socket.IO backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts           # entry point
│   │       ├── app.ts             # Express app setup
│   │       ├── config.ts          # env config with defaults
│   │       ├── routes/
│   │       │   ├── webhook.routes.ts
│   │       │   ├── review.routes.ts
│   │       │   └── health.routes.ts
│   │       ├── middleware/
│   │       │   ├── webhook-signature.ts
│   │       │   └── error-handler.ts
│   │       ├── socket/
│   │       │   └── socket.ts      # Socket.IO setup + event emitter
│   │       ├── queue/
│   │       │   └── producer.ts    # BullMQ queue producer
│   │       └── services/
│   │           └── review.service.ts  # DB queries for API
│   ├── worker/                  # BullMQ worker process
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts           # worker entry
│   │       ├── worker.ts          # BullMQ Worker setup
│   │       ├── pipeline/
│   │       │   ├── pipeline.ts    # orchestrates stages
│   │       │   ├── fetch-diff.ts
│   │       │   ├── sandbox.ts
│   │       │   ├── ast-analysis.ts
│   │       │   ├── vector-retrieval.ts
│   │       │   ├── ai-review.ts
│   │       │   ├── validation.ts
│   │       │   └── self-correction.ts
│   │       ├── sandbox/
│   │       │   ├── docker-sandbox.ts   # Dockerode container mgmt
│   │       │   └── sandbox.types.ts
│   │       ├── ast/
│   │       │   ├── parser.ts          # @babel/parser wrapper
│   │       │   └── analyzer.ts        # extract functions, classes, complexity
│   │       ├── ai/
│   │       │   ├── provider.ts         # AIProvider interface
│   │       │   ├── huggingface.provider.ts
│   │       │   ├── mock.provider.ts
│   │       │   └── langchain-reviewer.ts  # LangChain chain
│   │       ├── validator/
│   │       │   └── review-validator.ts   # Zod + deterministic checks
│   │       └── vector/
│   │           ├── embedder.ts          # generate embeddings
│   │           └── retriever.ts         # pgvector similarity search
│   ├── web/                     # Next.js frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx           # dashboard
│   │       │   └── reviews/
│   │       │       └── [id]/
│   │       │           └── page.tsx   # review workspace
│   │       ├── components/
│   │       │   ├── ui/               # shadcn components
│   │       │   ├── dashboard/
│   │       │   │   ├── review-list.tsx
│   │       │   │   └── status-badge.tsx
│   │       │   ├── review/
│   │       │   │   ├── review-workspace.tsx
│   │       │   │   ├── file-tree.tsx
│   │       │   │   ├── code-editor.tsx    # Monaco wrapper
│   │       │   │   ├── findings-panel.tsx
│   │       │   │   ├── finding-card.tsx
│   │       │   │   └── status-bar.tsx
│   │       │   └── layout/
│   │       │       └── header.tsx
│   │       ├── hooks/
│   │       │   ├── use-socket.ts
│   │       │   └── use-review.ts
│   │       ├── stores/
│   │       │   ├── review-store.ts     # Zustand
│   │       │   └── socket-store.ts     # Zustand
│   │       ├── lib/
│   │       │   ├── api.ts              # fetch wrapper
│   │       │   └── socket.ts           # Socket.IO client
│   │       └── styles/
│   │           └── globals.css
│   └── database/                # Prisma schema + migrations
│       ├── package.json
│       ├── tsconfig.json
│       └── prisma/
│           ├── schema.prisma
│           ├── migrations/
│           └── seed.ts
├── scripts/
│   ├── simulate-webhooks.ts      # webhook simulation CLI
│   └── seed-sample-repo.ts       # seed sample data for demo
├── docs/                         # governance docs live at root, but extra docs here
│   └── SECURITY.md
├── PRD.md
├── ARCHITECTURE.md
├── RULES.md
├── PHASES.md
├── DESIGN.md
├── LEARN.md
├── MEMORY.md
└── RESUME_CONTRACT.md
```

## 3. Database Schema

PostgreSQL with pgvector extension.

Prisma schema entities (provide EXACT Prisma model definitions):

### Repository
```prisma
model Repository {
  id            String   @id @default(uuid())
  fullName      String   @unique  // e.g. "owner/repo"
  defaultBranch String   @default("main")
  language      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  pullRequests  PullRequest[]
  embeddings    Embedding[]
}
```

### PullRequest
```prisma
model PullRequest {
  id           String   @id @default(uuid())
  number       Int
  title        String
  authorLogin  String
  baseBranch   String
  headBranch   String
  headSha      String
  status       String   @default("open")  // open, closed, merged
  repositoryId String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  repository   Repository @relation(fields: [repositoryId], references: [id])
  webhookEvents WebhookEvent[]
  reviewJobs   ReviewJob[]
  
  @@unique([repositoryId, number])
}
```

### WebhookEvent
```prisma
model WebhookEvent {
  id            String   @id @default(uuid())
  eventType     String   // pull_request
  action        String   // opened, synchronize, reopened
  payload       Json
  signature     String
  processed     Boolean  @default(false)
  pullRequestId String?
  createdAt     DateTime @default(now())
  
  pullRequest   PullRequest? @relation(fields: [pullRequestId], references: [id])
}
```

### ReviewJob
```prisma
model ReviewJob {
  id             String   @id @default(uuid())
  bullJobId      String?  @unique
  status         String   @default("QUEUED")  // QUEUED, FETCHING_DIFF, SANDBOX_RUNNING, ANALYZING_AST, RETRIEVING_CONTEXT, AI_REVIEWING, VALIDATING, COMPLETED, FAILED, FAILED_VALIDATION
  pullRequestId  String
  commitSha      String
  diffContent    String?  @db.Text
  error          String?
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  pullRequest    PullRequest @relation(fields: [pullRequestId], references: [id])
  codeFiles      CodeFile[]
  sandboxExecution SandboxExecution?
  review         Review?
  reviewAttempts ReviewAttempt[]
}
```

### CodeFile
```prisma
model CodeFile {
  id          String   @id @default(uuid())
  path        String
  content     String?  @db.Text
  patch       String?  @db.Text  // git diff patch for this file
  status      String   // added, modified, deleted, renamed
  additions   Int      @default(0)
  deletions   Int      @default(0)
  reviewJobId String
  createdAt   DateTime @default(now())
  
  reviewJob   ReviewJob @relation(fields: [reviewJobId], references: [id])
  astSnapshot ASTSnapshot?
}
```

### ASTSnapshot
```prisma
model ASTSnapshot {
  id          String   @id @default(uuid())
  codeFileId  String   @unique
  nodeCount   Int
  functions   Json     // [{name, startLine, endLine, params}]
  classes     Json     // [{name, startLine, endLine, methods}]
  imports     Json     // [{source, specifiers}]
  exports     Json     // [{name, type}]
  complexity  Json     // {cyclomaticComplexity, depth, etc.}
  createdAt   DateTime @default(now())
  
  codeFile    CodeFile @relation(fields: [codeFileId], references: [id])
}
```

### SandboxExecution
```prisma
model SandboxExecution {
  id            String   @id @default(uuid())
  reviewJobId   String   @unique
  containerId   String?
  image         String   @default("node:20-alpine")
  exitCode      Int?
  stdout        String?  @db.Text
  stderr        String?  @db.Text
  durationMs    Int?
  memoryLimitMb Int      @default(256)
  cpuLimit      Float    @default(0.5)
  timedOut      Boolean  @default(false)
  createdAt     DateTime @default(now())
  
  reviewJob     ReviewJob @relation(fields: [reviewJobId], references: [id])
}
```

### Review
```prisma
model Review {
  id            String   @id @default(uuid())
  reviewJobId   String   @unique
  provider      String   // huggingface, mock, openai
  model         String   // model name used
  totalFindings Int      @default(0)
  summary       String?  @db.Text
  attemptCount  Int      @default(1)
  createdAt     DateTime @default(now())
  
  reviewJob     ReviewJob @relation(fields: [reviewJobId], references: [id])
  findings      ReviewFinding[]
}
```

### ReviewFinding
```prisma
model ReviewFinding {
  id             String   @id @default(uuid())
  reviewId       String
  file           String
  startLine      Int
  endLine        Int
  severity       String   // critical, warning, info
  title          String
  description    String   @db.Text
  suggestion     String?  @db.Text
  suggestedPatch String?  @db.Text
  confidence     Float    @default(0.5)
  validated      Boolean  @default(false)
  createdAt      DateTime @default(now())
  
  review         Review @relation(fields: [reviewId], references: [id])
}
```

### ReviewAttempt
```prisma
model ReviewAttempt {
  id              String   @id @default(uuid())
  reviewJobId     String
  attemptNumber   Int
  rawOutput       String?  @db.Text
  validationErrors Json?   // [{field, message}]
  valid           Boolean  @default(false)
  durationMs      Int?
  createdAt       DateTime @default(now())
  
  reviewJob       ReviewJob @relation(fields: [reviewJobId], references: [id])
  
  @@unique([reviewJobId, attemptNumber])
}
```

### Embedding (pgvector)
```prisma
model Embedding {
  id            String   @id @default(uuid())
  repositoryId  String
  filePath      String
  chunkContent  String   @db.Text
  chunkType     String   // function, class, module
  // vector column added via raw SQL migration: vector(384)
  metadata      Json?    @default("{}")
  createdAt     DateTime @default(now())
  
  repository    Repository @relation(fields: [repositoryId], references: [id])
  
  @@index([repositoryId])
}
```

Note: pgvector column `embedding vector(384)` added via raw SQL in migration since Prisma doesn't natively support vector type. Use `Unsupported("vector(384)")` or raw migration.

## 4. API Routes

### Server (Express) — Port 3001

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/webhooks/github | Receive GitHub webhooks |
| GET | /api/health | Health check |
| GET | /api/reviews | List reviews (paginated) |
| GET | /api/reviews/:id | Get review detail with findings |
| GET | /api/reviews/:id/files | Get code files for review |
| GET | /api/reviews/:id/findings | Get findings for review |

### Web (Next.js) — Port 3000

| Path | Purpose |
|------|--------|
| / | Dashboard — recent reviews |
| /reviews/[id] | Review workspace |

## 5. Queue Architecture

Redis connection: localhost:6379

Queue name: `review-jobs`

Job data shape:
```typescript
interface ReviewJobData {
  webhookEventId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  action: string;
}
```

Worker concurrency: 2 (configurable)

Job options:
- attempts: 3 (BullMQ level retries for infrastructure failures)
- backoff: { type: 'exponential', delay: 5000 }
- removeOnComplete: 100 (keep last 100)
- removeOnFail: 50

## 6. Socket.IO Events

Namespace: `/reviews`

| Event | Direction | Payload | When |
|-------|-----------|---------|------|
| join-review | client→server | { reviewJobId } | Client opens review page |
| leave-review | client→server | { reviewJobId } | Client leaves review page |
| job:status | server→client | { jobId, status, timestamp } | Pipeline stage change |
| job:progress | server→client | { jobId, stage, message } | Progress within stage |
| review:complete | server→client | { jobId, reviewId, findingCount } | Review finished |
| review:finding | server→client | { jobId, finding } | Individual finding available |

## 7. AIProvider Interface

```typescript
interface AIProvider {
  name: string;
  generateReview(context: ReviewContext): Promise<ReviewResult>;
  generateEmbedding(text: string): Promise<number[]>;
}

interface ReviewContext {
  diff: string;
  astSummary: ASTSummary[];
  sandboxLogs: SandboxLogs;
  retrievedContext: RetrievedChunk[];
  previousErrors?: ValidationError[];  // for retry
}

interface ReviewResult {
  findings: Finding[];
  summary: string;
  model: string;
  provider: string;
}
```

Provider selection: AI_PROVIDER env var. Values: 'huggingface', 'mock'. Default: 'mock'.

## 8. Sandbox Architecture

Dockerode connects to local Docker daemon.

Container lifecycle:
1. Create container from node:20-alpine
2. Copy/mount code (read-only bind mount of temp directory)
3. Execute analysis commands (lint, test discovery)
4. Stream stdout/stderr
5. Wait for completion or timeout (60s)
6. Collect exit code + logs
7. Remove container (force)
8. Clean temp directory

Resource limits:
- Memory: 256MB (HostConfig.Memory)
- CPU: 0.5 (HostConfig.NanoCpus = 500000000)
- No swap (HostConfig.MemorySwap = 256MB same as memory)
- PidsLimit: 100

## 9. Vector Retrieval Architecture

Embedding model: sentence-transformers/all-MiniLM-L6-v2 via HF Inference API
Vector dimension: 384
Similarity metric: cosine distance (pgvector `<=>` operator)
Top-K: 5

Flow:
1. When repository code is indexed, chunk by function/class/module
2. Generate embedding via HF Inference API (or mock 384-dim random vector)
3. Store in Embedding table with pgvector column
4. On review: embed diff summary → query pgvector → return top-5 chunks
5. Chunks appended to ReviewContext for AI reviewer

## 10. Docker Compose Services

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: code_review
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

Application processes NOT in Docker Compose — run via pnpm scripts for development simplicity.

## 11. Environment Variables

```text
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/code_review

# Redis
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-pat  # for API calls to fetch diff

# AI Provider
AI_PROVIDER=mock  # mock | huggingface
HUGGINGFACE_API_KEY=your-hf-key  # optional

# Server
SERVER_PORT=3001
NODE_ENV=development

# Worker
WORKER_CONCURRENCY=2
SANDBOX_TIMEOUT_MS=60000
SANDBOX_MEMORY_MB=256

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```
