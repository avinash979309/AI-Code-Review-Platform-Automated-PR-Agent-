import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).default('dev-secret'),
  GITHUB_TOKEN: z.string().optional(),
  AI_PROVIDER: z.enum(['mock', 'huggingface']).default('mock'),
  HUGGINGFACE_API_KEY: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
