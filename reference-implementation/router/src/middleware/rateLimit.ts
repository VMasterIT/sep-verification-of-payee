import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { Request, Response } from 'express';
import { config } from '../config/config';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';
import { rateLimitHits } from '../utils/metrics';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
});

/**
 * Rate limiting middleware per BIC
 * Limits requests per participant (bank)
 */
export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-expect-error - RedisStore expects different Redis type
    client: redis,
    prefix: 'rl:',
  }),
  keyGenerator: (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    const bic = authReq.user?.bic || req.ip || 'unknown';
    return `vop:${bic}`;
  },
  handler: (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const bic = authReq.user?.bic || 'unknown';

    logger.warn('Rate limit exceeded', {
      bic,
      ip: req.ip,
      path: req.path,
    });

    rateLimitHits.inc({ requester_bic: bic });

    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: `Rate limit exceeded. Maximum ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs}ms.`,
      retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
      timestamp: new Date().toISOString(),
    });
  },
  skip: (req: Request): boolean => {
    // Skip rate limiting for health checks and metrics
    return req.path === '/health' || req.path === '/metrics';
  },
});

/**
 * Dynamic rate limiting based on participant's limit
 * Each bank can have different rate limit configured in directory
 */
export function dynamicRateLimit(req: Request, res: Response, next: any): void {
  // For now, use static rate limit
  // In production, fetch from directory service based on BIC
  rateLimitMiddleware(req, res, next);
}

export default rateLimitMiddleware;
