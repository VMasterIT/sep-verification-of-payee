import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import fs from 'fs';
import { VopRequest, VopResponse, DirectoryEntry } from '../types';
import logger from '../utils/logger';
import { responderLatency, errorsTotal } from '../utils/metrics';
import { config } from '../config/config';

class ResponderClient {
  private httpClient: AxiosInstance;

  constructor() {
    // Create HTTPS agent with mTLS
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync(config.tls.cert),
      key: fs.readFileSync(config.tls.key),
      ca: fs.readFileSync(config.tls.ca),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });

    this.httpClient = axios.create({
      httpsAgent,
      timeout: config.timeouts.responderTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VoP-Router/1.0',
      },
    });
  }

  /**
   * Send VoP request to responder bank
   */
  async sendRequest(
    request: VopRequest,
    responder: DirectoryEntry
  ): Promise<VopResponse> {
    const timer = responderLatency.startTimer({
      responder_bic: responder.bic,
      status: 'unknown',
    });

    try {
      logger.info('Sending request to responder', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        endpoint: responder.endpointUrl,
      });

      const response = await this.httpClient.post<VopResponse>(
        responder.endpointUrl,
        request
      );

      timer({ status: 'success' });

      logger.info('Received response from responder', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        matchStatus: response.data.matchStatus,
      });

      // Validate response
      this.validateResponse(response.data);

      return response.data;
    } catch (error) {
      timer({ status: 'error' });

      if (axios.isAxiosError(error)) {
        return this.handleAxiosError(error, request, responder);
      }

      logger.error('Unexpected error sending request to responder', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        error: error instanceof Error ? error.message : String(error),
      });

      errorsTotal.inc({ type: 'unexpected', requester_bic: request.requester.bic });

      return this.createErrorResponse(request, responder.bic, 'TECH', 'Unexpected error');
    }
  }

  /**
   * Handle Axios errors
   */
  private handleAxiosError(
    error: AxiosError,
    request: VopRequest,
    responder: DirectoryEntry
  ): VopResponse {
    const requesterBIC = request.requester.bic;

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      logger.error('Responder timeout', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        timeout: config.timeouts.responderTimeoutMs,
      });

      errorsTotal.inc({ type: 'timeout', requester_bic: requesterBIC });

      return this.createErrorResponse(
        request,
        responder.bic,
        'TECH',
        `Responder timeout (${config.timeouts.responderTimeoutMs}ms)`
      );
    }

    if (error.response) {
      // Responder returned error response
      logger.error('Responder returned error', {
        requestId: request.requestId,
        responderBIC: responder.bic,
        status: error.response.status,
        data: error.response.data,
      });

      errorsTotal.inc({ type: 'responder_error', requester_bic: requesterBIC });

      if (error.response.status === 503) {
        return this.createErrorResponse(
          request,
          responder.bic,
          'NSUP',
          'Responder service unavailable'
        );
      }

      return this.createErrorResponse(
        request,
        responder.bic,
        'TECH',
        `Responder error: ${error.response.status}`
      );
    }

    if (error.request) {
      // Request sent but no response
      logger.error('No response from responder', {
        requestId: request.requestId,
        responderBIC: responder.bic,
      });

      errorsTotal.inc({ type: 'no_response', requester_bic: requesterBIC });

      return this.createErrorResponse(
        request,
        responder.bic,
        'TECH',
        'No response from responder'
      );
    }

    // Request setup error
    logger.error('Request setup error', {
      requestId: request.requestId,
      error: error.message,
    });

    errorsTotal.inc({ type: 'request_setup', requester_bic: requesterBIC });

    return this.createErrorResponse(request, responder.bic, 'TECH', error.message);
  }

  /**
   * Validate VoP response
   */
  private validateResponse(response: VopResponse): void {
    if (!response.requestId) {
      throw new Error('Missing requestId in response');
    }
    if (!response.matchStatus) {
      throw new Error('Missing matchStatus in response');
    }
    if (!response.reasonCode) {
      throw new Error('Missing reasonCode in response');
    }
    if (!response.responder?.bic) {
      throw new Error('Missing responder.bic in response');
    }

    const validStatuses = ['MATCH', 'CLOSE_MATCH', 'NO_MATCH', 'NOT_SUPPORTED', 'ERROR'];
    if (!validStatuses.includes(response.matchStatus)) {
      throw new Error(`Invalid matchStatus: ${response.matchStatus}`);
    }
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    request: VopRequest,
    responderBIC: string,
    reasonCode: string,
    reasonDescription: string
  ): VopResponse {
    return {
      requestId: request.requestId,
      matchStatus: 'ERROR',
      reasonCode,
      reasonDescription,
      responder: {
        bic: responderBIC,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const responderClient = new ResponderClient();
export default responderClient;
