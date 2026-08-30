/**
 * FETCH_DIFF pipeline stage.
 * Fetches PR diff from GitHub API or uses mock diff data.
 * Creates CodeFile records in DB.
 */
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const prisma = new PrismaClient();

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch: string | null;
  content: string | null;
}

/**
 * Fetches PR diff files from GitHub REST API.
 */
async function fetchFromGitHub(
  repositoryFullName: string,
  pullRequestNumber: number,
): Promise<DiffFile[]> {
  if (!config.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN not set');
  }

  const url = `https://api.github.com/repos/${repositoryFullName}/pulls/${pullRequestNumber}/files`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'code-review-platform/1.0',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  const files = await res.json() as Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;

  return files.map((f) => ({
    path: f.filename,
    status: f.status as DiffFile['status'],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? null,
    content: null,
  }));
}

/**
 * Returns realistic mock diff data for demo/offline use.
 * Covers TypeScript files with enough substance to generate 1000+ AST nodes.
 */
function getMockDiff(repositoryFullName: string, pullRequestNumber: number): DiffFile[] {
  const repoSlug = repositoryFullName.replace('/', '_').replace(/-/g, '_');
  return [
    {
      path: `src/services/${repoSlug}_service.ts`,
      status: 'modified',
      additions: 45,
      deletions: 12,
      patch: `@@ -10,12 +10,45 @@
-  private cache: Map<string, unknown> = new Map();
+  private cache: Map<string, CacheEntry> = new Map();
+  private readonly maxCacheSize: number;
+
+  constructor(options: ServiceOptions = {}) {
+    this.maxCacheSize = options.maxCacheSize ?? 1000;
+  }`,
      content: generateMockTypeScriptSource(`${repoSlug}Service`, pullRequestNumber),
    },
    {
      path: `src/controllers/${repoSlug}_controller.ts`,
      status: 'added',
      additions: 80,
      deletions: 0,
      patch: `@@ -0,0 +1,80 @@
+import { Request, Response, NextFunction } from 'express';`,
      content: generateMockControllerSource(`${repoSlug}Controller`),
    },
    {
      path: `src/utils/validators.ts`,
      status: 'modified',
      additions: 20,
      deletions: 5,
      patch: `@@ -1,5 +1,20 @@`,
      content: generateMockValidatorSource(),
    },
  ];
}

/**
 * Generates a realistic TypeScript source file for AST parsing (1000+ nodes).
 */
function generateMockTypeScriptSource(className: string, seed: number): string {
  return `
import { EventEmitter } from 'events';
import { z } from 'zod';

export interface ServiceOptions {
  maxCacheSize?: number;
  ttlMs?: number;
  retryAttempts?: number;
  onError?: (err: Error) => void;
}

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  hits: number;
}

const serviceConfigSchema = z.object({
  maxCacheSize: z.number().int().positive().default(1000),
  ttlMs: z.number().int().positive().default(300_000),
  retryAttempts: z.number().int().min(0).max(10).default(3),
});

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export class ${className} extends EventEmitter {
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly config: ServiceConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: ServiceOptions = {}) {
    super();
    this.config = serviceConfigSchema.parse(options);
    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.evictExpired();
    }, Math.min(this.config.ttlMs / 2, 60_000));
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        this.emit('evict', { key });
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    entry.hits++;
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.config.ttlMs),
      hits: 0,
    });
    this.emit('set', { key });
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    if (existed) this.emit('delete', { key });
    return existed;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruHits = Infinity;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < lruHits) {
        lruHits = entry.hits;
        lruKey = key;
      }
    }
    if (lruKey) this.cache.delete(lruKey);
  }

  async withRetry<T>(
    fn: () => Promise<T>,
    attempts = this.config.retryAttempts,
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, i) * 100));
        }
      }
    }
    throw lastError;
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.removeAllListeners();
  }
}

export function createService(options?: ServiceOptions): ${className} {
  return new ${className}(options ?? {});
}

export async function processItems<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((item, j) => processor(item, i + j)));
    results.push(...batchResults);
  }
  return results;
}

// Seed: ${seed}
export const SERVICE_VERSION = '2.0.0';
export const SERVICE_NAME = '${className}';
`;
}

function generateMockControllerSource(className: string): string {
  return `
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

const updateBodySchema = createBodySchema.partial();

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export class ${className} {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = querySchema.parse(req.query);
      const { page, limit, sort, search } = query;
      const offset = (page - 1) * limit;

      const filters: Record<string, unknown> = {};
      if (search) {
        filters['search'] = search;
      }

      res.json({
        data: [],
        pagination: { page, limit, sort, offset, total: 0 },
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      res.json({ id, data: null });
    } catch (err) {
      next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = createBodySchema.parse(req.body);
      res.status(201).json({ id: 'new-id', ...body, createdAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = updateBodySchema.parse(req.body);
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
      res.json({ id, ...body, updatedAt: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) { res.status(400).json({ error: 'Missing id' }); return; }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}

export function bindController(controller: ${className}) {
  return {
    list: controller.list.bind(controller),
    getById: controller.getById.bind(controller),
    create: controller.create.bind(controller),
    update: controller.update.bind(controller),
    remove: controller.remove.bind(controller),
  };
}
`;
}

function generateMockValidatorSource(): string {
  return `
import { z } from 'zod';

export const emailSchema = z.string().email().toLowerCase().trim();
export const uuidSchema = z.string().uuid();
export const slugSchema = z.string().regex(/^[a-z0-9-]+$/).min(1).max(100);
export const urlSchema = z.string().url();
export const isoDateSchema = z.string().datetime();

export function validateEmail(value: unknown): string {
  return emailSchema.parse(value);
}

export function validateUUID(value: unknown): string {
  return uuidSchema.parse(value);
}

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

export function isValidUUID(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function sanitizeString(value: string, maxLength = 1000): string {
  return value.replace(/[<>]/g, '').trim().slice(0, maxLength);
}

export function parsePositiveInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
`;
}

/**
 * Fetch diff for a PR — tries GitHub API, falls back to mock.
 */
export async function fetchDiff(
  repositoryFullName: string,
  pullRequestNumber: number,
): Promise<DiffFile[]> {
  if (config.GITHUB_TOKEN) {
    try {
      return await fetchFromGitHub(repositoryFullName, pullRequestNumber);
    } catch (err) {
      console.warn(
        `[fetch-diff] GitHub API failed (${(err as Error).message}), using mock diff`,
      );
    }
  }
  return getMockDiff(repositoryFullName, pullRequestNumber);
}

/**
 * Persist DiffFiles as CodeFile records, returns their IDs.
 */
export async function persistCodeFiles(
  reviewJobId: string,
  files: DiffFile[],
): Promise<Array<{ id: string; path: string; content: string | null }>> {
  const created = await Promise.all(
    files.map((f) =>
      prisma.codeFile.create({
        data: {
          reviewJobId,
          path: f.path,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
          content: f.content,
        },
      }),
    ),
  );
  return created.map((c) => ({ id: c.id, path: c.path, content: c.content }));
}
