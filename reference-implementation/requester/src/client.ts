/**
 * VoP Requester Client
 * Client library for sending VoP verification requests
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import fs from 'fs';

export interface RequesterOptions {
  routerUrl: string;
  requesterBIC: string;
  tlsCert: string;
  tlsKey: string;
  tlsCA: string;
  oauthTokenUrl: string;
  oauthClientId: string;
  oauthClientSecret: string;
  timeout?: number;
}

export interface VerifyParams {
  iban: string;
  name: string;
  accountType?: 'PERSONAL' | 'BUSINESS';
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentPurpose?: string;
}

export interface VopResponse {
  requestId: string;
  matchStatus: 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH' | 'NOT_SUPPORTED' | 'ERROR';
  matchScore?: number;
  verifiedName?: string;
  accountName?: string;
  accountType?: 'PERSONAL' | 'BUSINESS';
  accountStatus?: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'BLOCKED';
  reasonCode: string;
  reasonDescription?: string;
  responder: {
    bic: string;
  };
  timestamp: string;
}

export class VopError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'VopError';
  }
}

export class VopTimeoutError extends VopError {
  constructor(message: string = 'VoP request timeout') {
    super('TIMEOUT', message, 504);
    this.name = 'VopTimeoutError';
  }
}

export class VopRequesterClient {
  private httpClient: AxiosInstance;
  private options: RequesterOptions;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(options: RequesterOptions) {
    this.options = {
      timeout: 5000,
      ...options,
    };

    // Create HTTPS agent with mTLS
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync(this.options.tlsCert),
      key: fs.readFileSync(this.options.tlsKey),
      ca: fs.readFileSync(this.options.tlsCA),
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    });

    this.httpClient = axios.create({
      baseURL: this.options.routerUrl,
      httpsAgent,
      timeout: this.options.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VoP-Requester/1.0',
      },
    });
  }

  /**
   * Verify recipient details
   */
  async verify(params: VerifyParams): Promise<VopResponse> {
    try {
      // Ensure we have valid access token
      await this.ensureValidToken();

      // Generate request ID
      const requestId = this.generateRequestId();

      // Build VoP request
      const request = {
        requestId,
        requester: {
          bic: this.options.requesterBIC,
        },
        payee: {
          iban: params.iban,
          name: params.name,
          accountType: params.accountType,
        },
        additionalInfo: params.paymentAmount
          ? {
              paymentAmount: params.paymentAmount,
              paymentCurrency: params.paymentCurrency || 'UAH',
              paymentPurpose: params.paymentPurpose,
            }
          : undefined,
        timestamp: new Date().toISOString(),
      };

      // Send request
      const response = await this.httpClient.post<VopResponse>(
        '/v1/verify',
        request,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new VopTimeoutError();
        }

        if (error.response) {
          throw new VopError(
            error.response.data?.error || 'UNKNOWN',
            error.response.data?.message || error.message,
            error.response.status
          );
        }

        throw new VopError('NETWORK_ERROR', error.message);
      }

      throw error;
    }
  }

  /**
   * Ensure we have a valid OAuth access token
   */
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();

    // If token is still valid (with 60 sec buffer), reuse it
    if (this.accessToken && now < this.tokenExpiry - 60000) {
      return;
    }

    // Fetch new token
    try {
      const response = await axios.post(
        this.options.oauthTokenUrl,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.options.oauthClientId,
          client_secret: this.options.oauthClientSecret,
          scope: 'vop:verify',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600; // default 1 hour
      this.tokenExpiry = now + expiresIn * 1000;
    } catch (error) {
      throw new VopError(
        'AUTH_ERROR',
        'Failed to obtain OAuth access token',
        401
      );
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .substring(0, 14);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `REQ-${timestamp}-${random}`;
  }
}

export default VopRequesterClient;
