'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';
import type { SocketState } from '@/stores/socket-store';

/**
 * Mounts the Socket.IO connection once and wires all server→client events
 * into the Zustand socket store. Safe to call from multiple components —
 * only one socket is created.
 */
export function useSocket(): SocketState {
  const { setConnected, handleJobStatus, handleJobProgress, handleReviewComplete } =
    useSocketStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('job:status', handleJobStatus);
    socket.on('job:progress', handleJobProgress);
    socket.on('review:complete', handleReviewComplete);

    connectSocket();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('job:status');
      socket.off('job:progress');
      socket.off('review:complete');
      disconnectSocket();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return useSocketStore();
}
