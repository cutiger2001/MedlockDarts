import app from './app';
import config from './config';
import { getPool, closePool } from './config/database';
import { logger } from './middleware/logger';
import os from 'os';

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function start(): Promise<void> {
  try {
    await getPool();
    const host = config.server.nodeEnv === 'production' ? '0.0.0.0' : 'localhost';
    app.listen(config.server.port, host, () => {
      const localIP = getLocalIP();
      logger.info(`Server running on port ${config.server.port} [${config.server.nodeEnv}]`);
      if (config.server.nodeEnv === 'production') {
        console.log('');
        console.log('='.repeat(55));
        console.log('  Medlock Bridge Darts League');
        console.log('='.repeat(55));
        console.log(`  Local:   http://localhost:${config.server.port}`);
        console.log(`  Network: http://${localIP}:${config.server.port}`);
        console.log('');
        console.log('  Open the Network URL on your tablet/phone browser');
        console.log('  Press Ctrl+C to stop the server');
        console.log('='.repeat(55));
      }
    });
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

start();
