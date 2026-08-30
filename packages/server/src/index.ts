import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

const server = app.listen(config.SERVER_PORT, () => {
  console.log(`[server] Running on port ${config.SERVER_PORT} (${config.NODE_ENV})`);
  console.log(`[server] Health: http://localhost:${config.SERVER_PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });
});
