/**
 * Webhook payload types from GitHub pull_request events.
 */

export type PullRequestAction = 'opened' | 'synchronize' | 'reopened' | 'closed';

export interface GitHubRepository {
  id: number;
  full_name: string;
  default_branch: string;
  language: string | null;
}

export interface GitHubUser {
  login: string;
  id: number;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  user: GitHubUser;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  state: string;
}

export interface GitHubWebhookPayload {
  action: PullRequestAction;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}
