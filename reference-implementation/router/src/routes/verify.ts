import { Router, Request, Response } from 'express';
import { routerService } from '../services/router';
import { validateRequest } from '../middleware/validation';
import { combinedAuth, requireScope } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { VopRequest } from '../types';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /v1/verify
 * Main VoP verification endpoint
 */
router.post(
  '/v1/verify',
  combinedAuth,
  requireScope('vop:verify'),
  rateLimitMiddleware,
  validateRequest,
  async (req: Request, res: Response) => {
    const request = req.body as VopRequest;

    try {
      logger.info('Received VoP request', {
        requestId: request.requestId,
        requesterBIC: request.requester.bic,
      });

      const response = await routerService.processRequest(request);

      res.json(response);
    } catch (error) {
      logger.error('Error processing VoP request', {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'internal_server_error',
        message: 'Failed to process VoP request',
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export default router;
