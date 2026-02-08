import { Router, Request, Response } from 'express';
import { database } from '../config/database';
import { directoryService } from '../services/directory';
import { HealthCheck } from '../types';

const router = Router();

const startTime = Date.now();
const version = '1.0.0';

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', async (req: Request, res: Response) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  try {
    // Check database
    const dbHealthy = await database.healthCheck();

    // Check Redis (via directory service)
    const redisHealthy = await directoryService.healthCheck();

    const allHealthy = dbHealthy && redisHealthy;

    const health: HealthCheck = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime,
      version,
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
      },
    };

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime,
      version,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await database.healthCheck();
    const redisHealthy = await directoryService.healthCheck();

    if (dbHealthy && redisHealthy) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false });
    }
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

/**
 * GET /live
 * Kubernetes liveness probe
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ live: true });
});

export default router;
