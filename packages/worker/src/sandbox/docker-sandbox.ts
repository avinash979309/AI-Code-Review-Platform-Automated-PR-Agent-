/**
 * Docker sandbox lifecycle manager using Dockerode.
 * Creates ephemeral containers with strict resource limits.
 * Guarantees container removal in all code paths.
 */
import Docker from 'dockerode';
import type { SandboxOptions, SandboxResult } from './sandbox.types.js';

const docker = new Docker();

const LABEL_MANAGED_BY = 'managed-by';
const LABEL_VALUE = 'code-review-platform';

export async function runSandbox(opts: SandboxOptions): Promise<SandboxResult> {
  const {
    image,
    memoryLimitMb,
    cpuLimit,
    timeoutMs,
    pidsLimit,
    command,
    workingDir,
    binds = [],
  } = opts;

  const memoryBytes = memoryLimitMb * 1024 * 1024;
  const nanoCpus = Math.round(cpuLimit * 1e9);

  let container: Docker.Container | null = null;
  const startedAt = Date.now();

  try {
    container = await docker.createContainer({
      Image: image,
      Cmd: command,
      WorkingDir: workingDir,
      Labels: {
        [LABEL_MANAGED_BY]: LABEL_VALUE,
        'created-at': String(startedAt),
      },
      HostConfig: {
        Memory: memoryBytes,
        MemorySwap: memoryBytes,       // no swap
        NanoCpus: nanoCpus,
        PidsLimit: pidsLimit,
        NetworkMode: 'none',           // no network during analysis
        Binds: binds,
        ReadonlyRootfs: false,         // node:20-alpine needs writable for npm
        AutoRemove: false,             // we remove manually in finally
      },
      // Allow container to run as default user (node 1000 in node:20-alpine)
      User: '1000:1000',
    });

    await container.start();

    // Collect stdout/stderr streams
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let oomKilled = false;

    // Set up timeout
    const timeoutHandle = setTimeout(async () => {
      timedOut = true;
      try {
        await container!.kill();
      } catch {
        // container may have already exited
      }
    }, timeoutMs);

    // Collect log output
    await new Promise<void>((resolve) => {
      // Dockerode multiplexes stdout/stderr in a single stream with 8-byte headers
      const chunks: Buffer[] = [];

      (logStream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      (logStream as NodeJS.ReadableStream).on('end', () => {
        clearTimeout(timeoutHandle);
        // Demultiplex docker stream format: [stream_type(1), 0,0,0, size(4), ...data]
        const buf = Buffer.concat(chunks);
        let offset = 0;
        while (offset < buf.length) {
          if (offset + 8 > buf.length) break;
          const streamType = buf[offset];
          const size = buf.readUInt32BE(offset + 4);
          const data = buf.slice(offset + 8, offset + 8 + size).toString('utf8');
          if (streamType === 1) stdout += data;
          else if (streamType === 2) stderr += data;
          offset += 8 + size;
        }
        resolve();
      });

      (logStream as NodeJS.ReadableStream).on('error', () => {
        clearTimeout(timeoutHandle);
        resolve();
      });
    });

    // Wait for container exit
    const waitResult = await container.wait();
    const exitCode = waitResult.StatusCode ?? -1;
    const durationMs = Date.now() - startedAt;

    // Check OOM
    try {
      const info = await container.inspect();
      oomKilled = info.State?.OOMKilled ?? false;
    } catch {
      // ignore inspect errors
    }

    return {
      containerId: container.id,
      exitCode,
      stdout: stdout.slice(0, 50_000),  // cap at 50KB
      stderr: stderr.slice(0, 50_000),
      durationMs,
      timedOut,
      oomKilled,
    };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // ignore — container may not exist
      }
    }
  }
}

/**
 * Cleanup stale managed containers older than maxAgeMs on startup.
 */
export async function cleanupStaleContainers(maxAgeMs = 5 * 60 * 1000): Promise<void> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [`${LABEL_MANAGED_BY}=${LABEL_VALUE}`] }),
    });

    const now = Date.now();
    for (const info of containers) {
      const createdAt = parseInt(info.Labels?.['created-at'] ?? '0', 10);
      if (now - createdAt > maxAgeMs) {
        try {
          const c = docker.getContainer(info.Id);
          await c.remove({ force: true });
          console.log(`[sandbox] Removed stale container ${info.Id.slice(0, 12)}`);
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('[sandbox] Could not list containers for cleanup:', (err as Error).message);
  }
}
