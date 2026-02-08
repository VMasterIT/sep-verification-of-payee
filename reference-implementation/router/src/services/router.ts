import { VopRequest, VopResponse } from '../types';
import { directoryService } from './directory';
import { responderClient } from './responder';
import logger from '../utils/logger';
import {
  requestsTotal,
  requestDuration,
  activeRequests,
  matchStatusDistribution,
  errorsTotal,
} from '../utils/metrics';

class RouterService {
  /**
   * Process VoP request
   */
  async processRequest(request: VopRequest): Promise<VopResponse> {
    const timer = requestDuration.startTimer({
      status: 'unknown',
      requester_bic: request.requester.bic,
      responder_bic: 'unknown',
    });

    activeRequests.inc();

    try {
      logger.info('Processing VoP request', {
        requestId: request.requestId,
        requesterBIC: request.requester.bic,
        iban: request.payee.iban,
      });

      // Step 1: Find responder bank using Directory Service
      const responder = await directoryService.findResponderByIban(request.payee.iban);

      if (!responder) {
        logger.warn('Responder not found for IBAN', {
          requestId: request.requestId,
          iban: request.payee.iban,
        });

        errorsTotal.inc({ type: 'responder_not_found', requester_bic: request.requester.bic });

        const errorResponse: VopResponse = {
          requestId: request.requestId,
          matchStatus: 'NOT_SUPPORTED',
          reasonCode: 'NSUP',
          reasonDescription: 'Responder bank not found for this IBAN',
          responder: {
            bic: 'UNKNOWN',
          },
          timestamp: new Date().toISOString(),
        };

        timer({
          status: 'error',
          requester_bic: request.requester.bic,
          responder_bic: 'unknown',
        });
        activeRequests.dec();
        requestsTotal.inc({
          status: 'error',
          requester_bic: request.requester.bic,
          responder_bic: 'unknown',
        });

        return errorResponse;
      }

      // Check responder status
      if (responder.status !== 'ACTIVE') {
        logger.warn('Responder is not active', {
          requestId: request.requestId,
          responderBIC: responder.bic,
          status: responder.status,
        });

        const errorResponse: VopResponse = {
          requestId: request.requestId,
          matchStatus: 'NOT_SUPPORTED',
          reasonCode: 'NSUP',
          reasonDescription: `Responder bank is currently ${responder.status.toLowerCase()}`,
          responder: {
            bic: responder.bic,
          },
          timestamp: new Date().toISOString(),
        };

        timer({
          status: 'error',
          requester_bic: request.requester.bic,
          responder_bic: responder.bic,
        });
        activeRequests.dec();
        requestsTotal.inc({
          status: 'error',
          requester_bic: request.requester.bic,
          responder_bic: responder.bic,
        });

        return errorResponse;
      }

      logger.info('Responder found', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        bankName: responder.bankName,
      });

      // Step 2: Forward request to responder
      const response = await responderClient.sendRequest(request, responder);

      // Step 3: Record metrics
      timer({
        status: 'success',
        requester_bic: request.requester.bic,
        responder_bic: responder.bic,
      });
      activeRequests.dec();
      requestsTotal.inc({
        status: 'success',
        requester_bic: request.requester.bic,
        responder_bic: responder.bic,
      });

      matchStatusDistribution.inc({
        status: response.matchStatus,
        responder_bic: responder.bic,
      });

      logger.info('VoP request processed successfully', {
        requestId: request.requestId,
        requesterBIC: request.requester.bic,
        responderBIC: responder.bic,
        matchStatus: response.matchStatus,
      });

      return response;
    } catch (error) {
      timer({
        status: 'error',
        requester_bic: request.requester.bic,
        responder_bic: 'unknown',
      });
      activeRequests.dec();
      requestsTotal.inc({
        status: 'error',
        requester_bic: request.requester.bic,
        responder_bic: 'unknown',
      });

      logger.error('Error processing VoP request', {
        requestId: request.requestId,
        requesterBIC: request.requester.bic,
        error: error instanceof Error ? error.message : String(error),
      });

      errorsTotal.inc({ type: 'processing_error', requester_bic: request.requester.bic });

      // Return error response
      return {
        requestId: request.requestId,
        matchStatus: 'ERROR',
        reasonCode: 'TECH',
        reasonDescription: 'Internal processing error',
        responder: {
          bic: 'UNKNOWN',
        },
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const routerService = new RouterService();
export default routerService;
