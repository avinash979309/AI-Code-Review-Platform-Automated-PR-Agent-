# AI Code Review Platform with Multi-Agent Verification

An automated, event-driven CI/CD platform designed to parse, sandbox, and review GitHub Pull Requests in real time. The platform integrates Abstract Syntax Tree (AST) static analysis with isolated Docker execution environments and a LangChain multi-agent verification loop to deliver hallucination-free code reviews directly to developer PRs.

---

## Architecture Overview

```
[GitHub PR Webhook] 
       │
       ▼
[Node.js API Gateway] ──► [Redis + BullMQ Work Queue]
                                   │
                                   ▼
                       [Worker Execution Engine]
                                   │
        ┌──────────────────────────┴──────────────────────────┐
        ▼                                                     ▼
 [Static AST Analysis]                              [Ephemeral Docker Sandbox]
  - Syntax Validation                                - cgroups CPU/Memory Limits
  - Dangerous Call Blocking                          - Network Isolation / Read-Only FS
        │                                                     │
        └──────────────────────────┬──────────────────────────┘
                                   ▼
                     [Multi-Agent Verification Loop]
                      - LangChain Agent Orchestration
                      - Contextual Retrieval via Vector DB
                      - Verification Agent (De-hallucination)
                                   │
                                   ▼
                         [GitHub PR Review Bot]
                          - Inline Line-by-Line Comments
                          - Performance & Security Scores

```

---

## Core Features

* **Event-Driven Ingestion:** Ingests incoming GitHub webhook events asynchronously, buffering high-concurrency PR spikes using **Redis** and **BullMQ** to prevent event-loop blocking.
* **AST Pre-Flight Validation:** Parses source code into Abstract Syntax Trees to inspect structure, detect potential vulnerabilities, and block malicious system calls prior to runtime execution.
* **Ephemeral Container Sandboxing:** Spins up disposable, lightweight **Docker** containers per task with strict Linux `cgroups` (CPU/RAM caps) and severed network interfaces to safely evaluate untrusted scripts without persistent state leakage.
* **Multi-Agent Verification Pipeline:** Employs a multi-stage **LangChain** workflow where distinct LLM agents review logic, detect security vulnerabilities, and critique each other's outputs against code context to minimize hallucinations.
* **Semantic Context Retrieval:** Uses vector embeddings in an integrated **Vector DB** to map PR diffs against repository documentation and internal coding standards.
* **Automated Cleanup & Resource Reclaim:** Executes automated teardown hooks on process completion, failure, or timeout to ensure zero residual container, memory, or disk bloat.

---

## Technical Stack

| Category | Technologies |
| --- | --- |
| **Backend & Ingestion** | Node.js, Express.js, TypeScript, REST APIs |
| **Task Queue & Caching** | Redis, BullMQ |
| **Containerization & Sandbox** | Docker, Linux Namespaces, `cgroups` |
| **AI & Agent Orchestration** | LangChain, OpenAI API, Vector DB (FAISS / Chroma) |
| **Code Analysis** | Babel/TypeScript AST Parsers, ESLint Engine |
| **CI/CD & Integration** | GitHub Webhooks, GitHub REST API, Docker Engine API |

---

## Workflow Lifecycle

1. **Webhook Trigger:** A pull request event (`opened`, `synchronize`) triggers a webhook payload sent to the API gateway.
2. **Task Enqueueing:** The payload is validated and pushed onto a priority queue managed by BullMQ and backed by Redis.
3. **AST Inspection:** Workers retrieve the job, extract the raw patch diffs, and construct an AST to analyze code structure and identify syntax errors.
4. **Sandboxed Dynamic Analysis:** For PRs requiring dynamic evaluation, an isolated Docker container is provisioned with disabled network bridges and strict memory boundaries.
5. **Multi-Agent Evaluation:**
* **Reviewer Agent:** Scans changes for anti-patterns, performance bottlenecks, and style guide violations.
* **Security Agent:** Checks for insecure dependencies, credential leaks, and injection vulnerabilities.
* **Verification Agent:** Cross-references suggestions against the AST representation and context retrieved from the Vector DB to eliminate hallucinated suggestions.


6. **PR Annotation:** Structured feedback, inline recommendations, and markdown summaries are posted back to the GitHub PR thread.
7. **Environment Teardown:** Sandboxes are terminated, temporary volumes removed, and memory buffers released.

---

## Security Model

* **Kernel-Level Resource Caps:** CPU shares and memory ceilings enforced via Docker container configuration.
* **Network Isolation:** Sandboxed containers execute with `--network none` to prevent data exfiltration or reverse shells.
* **Timeout Enforcement:** Hard execution limits kill long-running or runaway infinite loops after a predefined threshold.
* **Ephemeral File Systems:** Sandboxes write to temporary in-memory file systems (`tmpfs`) that are instantly destroyed upon container exit.

---

## Project Status

> **Notice:** This repository is currently in the **active development phase**. Core architectural components, sandboxing modules, and agent orchestration pipelines are undergoing final internal benchmarking. Complete source code, configuration scripts, and deployment templates will be pushed to this repository soon.
