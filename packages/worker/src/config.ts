import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  SANDBOX_MEMORY_MB: z.coerce.number().int().positive().default(256),
  AI_PROVIDER: z.enum(['mock', 'huggingface']).default('mock'),
  HUGGINGFACE_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
