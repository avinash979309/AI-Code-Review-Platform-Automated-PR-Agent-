/**
 * Socket.IO server setup.
 * Namespace: /reviews
 * Exposes an emitter function used by the worker pipeline to push events.
 */
import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { ClientToServerEvents, ServerToClientEvents } from '@coderev/shared';
import { SOCKET_NAMESPACE } from '@coderev/shared';

// Singleton reference so pipeline stages can emit without re-importing server
let _io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function createSocketServer(
  httpServer: HttpServer,
  clientOrigin = '*',
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
    },
  });

  const reviewsNs = io.of(SOCKET_NAMESPACE);

  reviewsNs.on('connection', (socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    socket.on('join-review', ({ reviewJobId }) => {
      void socket.join(`review:${reviewJobId}`);
      console.log(`[socket] ${socket.id} joined room review:${reviewJobId}`);
    });

    socket.on('leave-review', ({ reviewJobId }) => {
      void socket.leave(`review:${reviewJobId}`);
      console.log(`[socket] ${socket.id} left room review:${reviewJobId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  _io = io;
  console.log(`[socket] Socket.IO ready on namespace ${SOCKET_NAMESPACE}`);
  return io;
}

/**
 * Emit a job:status event to all clients watching a specific review job.
 */
export function emitJobStatus(
  reviewJobId: string,
  jobId: string,
  status: string,
): void {
  if (!_io) return;
  _io.of(SOCKET_NAMESPACE)
    .to(`review:${reviewJobId}`)
    .emit('job:status', {
      jobId,
      status: status as Parameters<ServerToClientEvents['job:status']>[0]['status'],
      timestamp: new Date().toISOString(),
    });
}

/**
 * Emit a job:progress event (within a stage).
 */
export function emitJobProgress(
  reviewJobId: string,
  jobId: string,
  stage: string,
  message: string,
): void {
  if (!_io) return;
  _io.of(SOCKET_NAMESPACE)
    .to(`review:${reviewJobId}`)
    .emit('job:progress', { jobId, stage, message });
}

/**
 * Emit review:complete when the full pipeline finishes.
 */
export function emitReviewComplete(
  reviewJobId: string,
  jobId: string,
  reviewId: string,
  findingCount: number,
): void {
  if (!_io) return;
  _io.of(SOCKET_NAMESPACE)
    .to(`review:${reviewJobId}`)
    .emit('review:complete', { jobId, reviewId, findingCount });
}

/**
 * Emit review:finding for each individual finding as they are validated.
 */
export function emitReviewFinding(
  reviewJobId: string,
  jobId: string,
  finding: Parameters<ServerToClientEvents['review:finding']>[0]['finding'],
): void {
  if (!_io) return;
  _io.of(SOCKET_NAMESPACE)
    .to(`review:${reviewJobId}`)
    .emit('review:finding', { jobId, finding });
}

export function getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null {
  return _io;
}
