import https from 'https';
import fs from 'fs';
import { createApp } from './app';
import { config } from './config/config';
import { database } from './config/database';
import { directoryService } from './services/directory';
import logger from './utils/logger';

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbHealthy = await database.healthCheck();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection OK');

    // Test Redis connection
    logger.info('Testing Redis connection...');
    const redisHealthy = await directoryService.healthCheck();
    if (!redisHealthy) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connection OK');

    // Create Express app
    const app = createApp();

    // Create HTTPS server with mTLS
    const tlsOptions: https.ServerOptions = {
      cert: fs.readFileSync(config.tls.cert),
      key: fs.readFileSync(config.tls.key),
      ca: fs.readFileSync(config.tls.ca),
      requestCert: config.tls.mtlsEnabled,
      rejectUnauthorized: config.tls.mtlsEnabled,
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
      ciphers: [
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
      ].join(':'),
    };

    const server = https.createServer(tlsOptions, app);

    // Start server
    server.listen(config.server.port, config.server.host, () => {
      logger.info('VoP Router started', {
        port: config.server.port,
        host: config.server.host,
        env: config.server.env,
        mtls: config.tls.mtlsEnabled,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        // Close database connections
        await database.close();
        await directoryService.close();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Start server
startServer();
