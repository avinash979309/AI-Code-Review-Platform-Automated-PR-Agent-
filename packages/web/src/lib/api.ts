/**
 * API client — calls Next.js rewrites → Express server on port 3001.
 */

const API_BASE = '/api';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export interface ReviewListItem {
  id: string;
  provider: string;
  model: string;
  totalFindings: number;
  summary: string | null;
  attemptCount: number;
  createdAt: string;
  reviewJob: {
    id: string;
    status: string;
    commitSha: string;
    startedAt: string | null;
    completedAt: string | null;
    pullRequest: {
      number: number;
      title: string;
      authorLogin: string;
      baseBranch: string;
      headBranch: string;
      repository: { fullName: string };
    };
  };
}

export interface Finding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
  title: string;
  description: string;
  suggestion: string | null;
  suggestedPatch: string | null;
  confidence: number;
  validated: boolean;
  createdAt: string;
}

export interface ReviewDetail extends ReviewListItem {
  findings: Finding[];
}

export interface CodeFile {
  id: string;
  path: string;
  content: string | null;
  patch: string | null;
  language: string | null;
  linesAdded: number;
  linesRemoved: number;
}

export function fetchReviews(page = 1, pageSize = 20) {
  return apiFetch<{ reviews: ReviewListItem[]; total: number; page: number; pageSize: number }>(
    `/reviews?page=${page}&pageSize=${pageSize}`,
  );
}

export function fetchReview(id: string) {
  return apiFetch<ReviewDetail>(`/reviews/${id}`);
}

export function fetchReviewFindings(id: string) {
  return apiFetch<{ findings: Finding[] }>(`/reviews/${id}/findings`);
}

export function fetchReviewFiles(id: string) {
  return apiFetch<{ files: CodeFile[] }>(`/reviews/${id}/files`);
}

export interface PushPayload {
  acceptedFiles: { fileId: string; content: string }[];
}

export interface PushResult {
  success: boolean;
  message: string;
}

export function pushChanges(reviewId: string, payload: PushPayload) {
  return apiPost<PushResult>(`/reviews/${reviewId}/push`, payload);
}
