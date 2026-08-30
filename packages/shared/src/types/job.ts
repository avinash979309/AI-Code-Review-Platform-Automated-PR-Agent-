/**
 * Job types — BullMQ job data shapes and status enums.
 */

export enum JobStatus {
  QUEUED = 'QUEUED',
  FETCHING_DIFF = 'FETCHING_DIFF',
  SANDBOX_RUNNING = 'SANDBOX_RUNNING',
  ANALYZING_AST = 'ANALYZING_AST',
  RETRIEVING_CONTEXT = 'RETRIEVING_CONTEXT',
  AI_REVIEWING = 'AI_REVIEWING',
  VALIDATING = 'VALIDATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  FAILED_VALIDATION = 'FAILED_VALIDATION',
}

export interface ReviewJobData {
  webhookEventId: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  action: string;
}
