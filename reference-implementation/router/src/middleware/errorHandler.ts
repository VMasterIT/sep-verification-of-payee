import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from 'express-jwt';
import logger from '../utils/logger';
import { errorsTotal } from '../utils/metrics';

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Record metric
  errorsTotal.inc({ type: 'unhandled', requester_bic: (req as any).user?.bic || 'unknown' });

  // Handle JWT errors
  if (error instanceof UnauthorizedError) {
    res.status(401).json({
      error: 'unauthorized',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'validation_error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle timeout errors
  if (error.name === 'TimeoutError') {
    res.status(504).json({
      error: 'gateway_timeout',
      message: 'Request timeout',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error response
  res.status(500).json({
    error: 'internal_server_error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    error: 'not_found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
}

export default errorHandler;
