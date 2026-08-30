import { z } from 'zod';

export const githubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
});

export const githubRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  default_branch: z.string(),
  language: z.string().nullable(),
});

export const githubRefSchema = z.object({
  ref: z.string(),
  sha: z.string(),
});

export const githubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  user: githubUserSchema,
  base: githubRefSchema,
  head: githubRefSchema,
  state: z.string(),
});

export const githubWebhookPayloadSchema = z.object({
  action: z.enum(['opened', 'synchronize', 'reopened', 'closed']),
  pull_request: githubPullRequestSchema,
  repository: githubRepositorySchema,
  sender: githubUserSchema,
});

export type GitHubWebhookPayloadParsed = z.infer<typeof githubWebhookPayloadSchema>;
