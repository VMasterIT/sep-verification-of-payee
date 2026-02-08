import express, { Express } from 'express';
import helmet from 'helmet';
import { config } from './config/config';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import verifyRoutes from './routes/verify';
import healthRoutes from './routes/health';
import metricsRoutes from './routes/metrics';

export function createApp(): Express {
  const app = express();

  // Security headers
  app.use(
    helmet({
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      frameguard: {
        action: 'deny',
      },
    })
  );

  // Body parser
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  });

  // Register routes
  app.use('/', verifyRoutes);
  app.use('/', healthRoutes);
  if (config.monitoring.metricsEnabled) {
    app.use('/', metricsRoutes);
  }

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

export default createApp;
