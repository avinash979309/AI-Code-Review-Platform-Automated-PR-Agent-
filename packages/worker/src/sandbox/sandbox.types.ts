/**
 * Types for Docker sandbox execution.
 */

export interface SandboxOptions {
  image: string;
  memoryLimitMb: number;
  cpuLimit: number;         // e.g. 0.5
  timeoutMs: number;
  pidsLimit: number;
  command: string[];
  workingDir: string;
  binds?: string[];         // host:container[:ro] volume binds
}

export interface SandboxResult {
  containerId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  oomKilled: boolean;
}

export interface SandboxError extends Error {
  code: 'TIMEOUT' | 'OOM' | 'DOCKER_ERROR' | 'CONTAINER_ERROR';
  containerId?: string;
}
