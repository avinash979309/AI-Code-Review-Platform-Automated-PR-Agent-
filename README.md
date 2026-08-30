# AI Code Review Platform & Automated PR Agent

An automated, intelligent code review platform that integrates directly with GitHub pull requests. It analyzes code changes, runs static analysis in isolated sandboxes, and uses AI to provide contextual, actionable code review feedback.

## Architecture

This project is built as a TypeScript monorepo using `pnpm` workspaces.

### Packages
- **`@coderev/server`**: Express server handling GitHub webhooks, Socket.IO real-time updates, and REST API routes.
- **`@coderev/worker`**: BullMQ background worker executing the code review pipeline (fetching diffs, AST parsing, Docker sandboxing, AI review).
- **`@coderev/database`**: Prisma ORM, PostgreSQL models, and migrations.
- **`@coderev/shared`**: Shared TypeScript types, schemas, and constants.

### Infrastructure
- **PostgreSQL**: Stores webhooks, review jobs, files, AST snapshots, and AI findings.
- **Redis**: Powers BullMQ for reliable background job processing and Socket.IO adapters.
- **Docker**: Used to run ephemeral, secure sandboxes (`node:20-alpine`) for static analysis and linting of PR diffs.

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start infrastructure (Postgres & Redis):**
   ```bash
   docker compose up -d
   ```

3. **Configure environment:**
   Copy `.env.example` to `.env` and fill in your GitHub token and webhook secret.
   ```bash
   cp .env.example .env
   ```

4. **Run migrations:**
   ```bash
   pnpm --filter @coderev/database exec prisma migrate dev
   ```

5. **Build packages:**
   ```bash
   pnpm build
   ```

6. **Start the server and worker:**
   ```bash
   # Terminal 1:
   pnpm --filter @coderev/server dev

   # Terminal 2:
   pnpm --filter @coderev/worker dev
   ```

## Development Pipeline

1. **Webhook Ingestion**: Server receives GitHub `pull_request` webhooks, verifies HMAC signature, and enqueues a `ReviewJob`.
2. **Diff Fetching**: Worker fetches the PR diff and creates database records for modified files.
3. **AST Analysis**: Code is parsed using Babel to extract functions, classes, imports, and calculate cyclomatic complexity.
4. **Sandbox Execution**: Code is analyzed in an isolated Docker container with strict CPU/memory limits.
5. **AI Review**: Code diffs and AST context are sent to the AI provider for review findings.

## License
MIT
