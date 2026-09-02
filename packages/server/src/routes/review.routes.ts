/**
 * Review REST API routes.
 * GET /api/reviews          — paginated list
 * GET /api/reviews/:id      — review detail with findings
 * GET /api/reviews/:id/files    — code files for a review job
 * GET /api/reviews/:id/findings — findings for a review
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  listReviews,
  getReview,
  getReviewFindings,
  getReviewFiles,
  getReviewByJobId,
} from '../services/review.service.js';

export function createReviewRouter(): Router {
  const router = Router();

  // GET /api/reviews?page=1&pageSize=20
  router.get('/reviews', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
      const result = await listReviews(page, pageSize);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/reviews/:id — review detail (by Review.id or ReviewJob.id)
  router.get('/reviews/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Try review ID first, then job ID
      let review = await getReview(req.params.id);
      if (!review) review = await getReviewByJobId(req.params.id);
      if (!review) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }
      res.json(review);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/reviews/:id/files
  router.get('/reviews/:id/files', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Accept either Review.id or ReviewJob.id
      const review = await getReview(req.params.id);
      const jobId = review?.reviewJob.id ?? req.params.id;
      const files = await getReviewFiles(jobId);
      res.json({ files });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/reviews/:id/findings
  router.get('/reviews/:id/findings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const findings = await getReviewFindings(req.params.id);
      res.json({ findings });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/reviews/:id/push — commit accepted AI suggestions to the PR branch via GitHub API
  router.post('/reviews/:id/push', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { acceptedFiles } = req.body as { acceptedFiles: { fileId: string; content: string }[] };

      if (!acceptedFiles || acceptedFiles.length === 0) {
        res.status(400).json({ error: { code: 'NO_FILES', message: 'No files to push' } });
        return;
      }

      // Load the review to get repo + PR branch info
      let review = await getReview(req.params.id);
      if (!review) review = await getReviewByJobId(req.params.id);
      if (!review) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Review not found' } });
        return;
      }

      const { GITHUB_TOKEN } = process.env;
      if (!GITHUB_TOKEN) {
        res.status(500).json({ error: { code: 'NO_TOKEN', message: 'GITHUB_TOKEN not configured' } });
        return;
      }

      const pr = review.reviewJob.pullRequest;
      const repoFullName = pr.repository.fullName;        // e.g. "owner/repo"
      const branch = pr.headBranch;                        // e.g. "fix/my-branch"

      const headers: Record<string, string> = {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'CodeRevPlatform/1.0',
      };

      const results: { path: string; sha: string; status: string }[] = [];

      // Load file path mapping from the review files
      const codeFiles = await getReviewFiles(review.reviewJob.id);

      for (const { fileId, content } of acceptedFiles) {
        const codeFile = codeFiles.find((f: { id: string }) => f.id === fileId);
        if (!codeFile) {
          console.warn(`[push] file ${fileId} not found in review files, skipping`);
          continue;
        }

        const filePath = (codeFile as { path: string }).path;

        // Step 1: Get current file SHA from GitHub (required for update)
        const getUrl = `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
        const getResp = await fetch(getUrl, { headers });

        let currentSha: string | undefined;
        if (getResp.ok) {
          const fileData = await getResp.json() as { sha: string };
          currentSha = fileData.sha;
        } else if (getResp.status !== 404) {
          const err = await getResp.text();
          console.error(`[push] failed to get ${filePath}: ${getResp.status} ${err}`);
          continue;
        }

        // Step 2: Commit the updated content
        const contentB64 = Buffer.from(content, 'utf-8').toString('base64');
        const putBody: Record<string, string> = {
          message: `fix: apply AI code review suggestions to ${filePath}`,
          content: contentB64,
          branch,
        };
        if (currentSha) putBody.sha = currentSha;

        const putUrl = `https://api.github.com/repos/${repoFullName}/contents/${filePath}`;
        const putResp = await fetch(putUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify(putBody),
        });

        if (putResp.ok) {
          const putData = await putResp.json() as { content: { sha: string } };
          results.push({ path: filePath, sha: putData.content.sha, status: 'committed' });
          console.log(`[push] committed ${filePath} → ${branch}`);
        } else {
          const err = await putResp.text();
          console.error(`[push] failed to commit ${filePath}: ${putResp.status} ${err}`);
          results.push({ path: filePath, sha: '', status: `error: ${putResp.status}` });
        }
      }

      const committed = results.filter((r) => r.status === 'committed').length;
      const failed = results.length - committed;

      res.json({
        success: committed > 0,
        message: failed === 0
          ? `✅ Pushed ${committed} file(s) to branch \`${branch}\` on ${repoFullName}`
          : `⚠️ Pushed ${committed} file(s), ${failed} failed. Check server logs.`,
        results,
        branch,
        repository: repoFullName,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
