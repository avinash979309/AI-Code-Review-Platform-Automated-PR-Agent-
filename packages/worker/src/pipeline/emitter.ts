/**
 * Pipeline event emitter — posts to server's internal emit endpoint.
 * Server relays to Socket.IO clients in the review room.
 * Fire-and-forget: failures are logged but never throw (pipeline must not fail due to emit errors).
 */


const INTERNAL_BASE = `${process.env.SERVER_URL ?? 'http://localhost:3001'}/api/internal`;

async function post(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${INTERNAL_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`[emitter] ${path} returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[emitter] ${path} failed (non-fatal): ${(err as Error).message}`);
  }
}

export function emitJobStatus(reviewJobId: string, jobId: string, status: string): void {
  void post('/emit/job-status', { reviewJobId, jobId, status });
}

export function emitJobProgress(
  reviewJobId: string,
  jobId: string,
  stage: string,
  message: string,
): void {
  void post('/emit/job-progress', { reviewJobId, jobId, stage, message });
}

export function emitReviewComplete(
  reviewJobId: string,
  jobId: string,
  reviewId: string,
  findingCount: number,
): void {
  void post('/emit/review-complete', { reviewJobId, jobId, reviewId, findingCount });
}
