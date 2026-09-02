/**
 * Socket.IO client singleton — connects directly to Express server on port 3001.
 * (Next.js rewrites only work for HTTP, not WebSocket upgrades.)
 */
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@coderev/shared';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';
const NAMESPACE = '/reviews';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(`${SERVER_URL}${NAMESPACE}`, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(): void {
  getSocket().connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export function joinReviewRoom(reviewJobId: string): void {
  getSocket().emit('join-review', { reviewJobId });
}

export function leaveReviewRoom(reviewJobId: string): void {
  getSocket().emit('leave-review', { reviewJobId });
}
