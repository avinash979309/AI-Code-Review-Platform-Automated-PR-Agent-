/**
 * ReviewService — DB queries for the REST API.
 * Handles paginated review listing and detail fetching.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      repository: {
        fullName: string;
      };
    };
  };
}

export interface ReviewDetail extends ReviewListItem {
  findings: Array<{
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
  }>;
}

const reviewWithJobInclude = {
  reviewJob: {
    include: {
      pullRequest: {
        include: { repository: true },
      },
    },
  },
} as const;

export async function listReviews(
  page = 1,
  pageSize = 20,
): Promise<{ reviews: ReviewListItem[]; total: number; page: number; pageSize: number }> {
  const skip = (page - 1) * pageSize;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: reviewWithJobInclude,
    }),
    prisma.review.count(),
  ]);

  return {
    reviews: reviews.map(formatReview),
    total,
    page,
    pageSize,
  };
}

export async function getReview(id: string): Promise<ReviewDetail | null> {
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      ...reviewWithJobInclude,
      findings: { orderBy: [{ severity: 'asc' }, { file: 'asc' }, { startLine: 'asc' }] },
    },
  });

  if (!review) return null;

  return {
    ...formatReview(review),
    findings: review.findings.map((f) => ({
      id: f.id,
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      severity: f.severity,
      title: f.title,
      description: f.description,
      suggestion: f.suggestion,
      suggestedPatch: f.suggestedPatch,
      confidence: f.confidence,
      validated: f.validated,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

export async function getReviewFindings(reviewId: string) {
  return prisma.reviewFinding.findMany({
    where: { reviewId },
    orderBy: [{ severity: 'asc' }, { file: 'asc' }, { startLine: 'asc' }],
  });
}

export async function getReviewFiles(reviewJobId: string) {
  return prisma.codeFile.findMany({
    where: { reviewJobId },
    include: { astSnapshot: true },
    orderBy: { path: 'asc' },
  });
}

export async function getReviewByJobId(reviewJobId: string): Promise<ReviewDetail | null> {
  const review = await prisma.review.findUnique({
    where: { reviewJobId },
    include: {
      ...reviewWithJobInclude,
      findings: { orderBy: [{ severity: 'asc' }, { file: 'asc' }, { startLine: 'asc' }] },
    },
  });

  if (!review) return null;
  return {
    ...formatReview(review),
    findings: review.findings.map((f) => ({
      id: f.id,
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      severity: f.severity,
      title: f.title,
      description: f.description,
      suggestion: f.suggestion,
      suggestedPatch: f.suggestedPatch,
      confidence: f.confidence,
      validated: f.validated,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatReview(
  review: Awaited<ReturnType<typeof prisma.review.findUnique>> & {
    reviewJob: {
      id: string;
      status: string;
      commitSha: string;
      startedAt: Date | null;
      completedAt: Date | null;
      pullRequest: {
        number: number;
        title: string;
        authorLogin: string;
        baseBranch: string;
        headBranch: string;
        repository: { fullName: string };
      };
    };
  },
): ReviewListItem {
  if (!review) throw new Error('review is null');
  return {
    id: review.id,
    provider: review.provider,
    model: review.model,
    totalFindings: review.totalFindings,
    summary: review.summary,
    attemptCount: review.attemptCount,
    createdAt: review.createdAt.toISOString(),
    reviewJob: {
      id: review.reviewJob.id,
      status: review.reviewJob.status,
      commitSha: review.reviewJob.commitSha,
      startedAt: review.reviewJob.startedAt?.toISOString() ?? null,
      completedAt: review.reviewJob.completedAt?.toISOString() ?? null,
      pullRequest: {
        number: review.reviewJob.pullRequest.number,
        title: review.reviewJob.pullRequest.title,
        authorLogin: review.reviewJob.pullRequest.authorLogin,
        baseBranch: review.reviewJob.pullRequest.baseBranch,
        headBranch: review.reviewJob.pullRequest.headBranch,
        repository: {
          fullName: review.reviewJob.pullRequest.repository.fullName,
        },
      },
    },
  };
}
