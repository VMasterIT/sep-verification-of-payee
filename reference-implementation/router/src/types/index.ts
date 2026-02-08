/**
 * VoP Router Types
 * Verification of Payee for NBU SEP
 */

export interface VopRequest {
  requestId: string;
  requester: {
    bic: string;
  };
  payee: {
    iban: string;
    name: string;
    accountType?: 'PERSONAL' | 'BUSINESS';
  };
  additionalInfo?: {
    paymentAmount?: number;
    paymentCurrency?: string;
    paymentPurpose?: string;
  };
  timestamp: string;
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

export interface DirectoryEntry {
  id: number;
  bic: string;
  bankName: string;
  endpointUrl: string;
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
  certificateFingerprint?: string;
  rateLimitPerSec: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IbanPrefixMapping {
  id: number;
  ibanPrefix: string;
  bic: string;
  createdAt: Date;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: {
    bic: string;
    clientId: string;
    scopes: string[];
  };
  certificate?: {
    subject: string;
    issuer: string;
    fingerprint: string;
    validFrom: Date;
    validTo: Date;
  };
}

export interface RouterConfig {
  server: {
    port: number;
    host: string;
    env: 'development' | 'production' | 'test';
  };
  tls: {
    cert: string;
    key: string;
    ca: string;
    mtlsEnabled: boolean;
  };
  oauth: {
    issuer: string;
    audience: string;
    jwksUri: string;
  };
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    maxConnections: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  timeouts: {
    requestTimeoutMs: number;
    responderTimeoutMs: number;
  };
  monitoring: {
    metricsEnabled: boolean;
    metricsPort: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'simple';
  };
}

export interface VopError {
  error: string;
  message: string;
  requestId?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
  };
}

export interface Metrics {
  requestsTotal: number;
  requestsSuccess: number;
  requestsError: number;
  requestDurationMs: {
    p50: number;
    p95: number;
    p99: number;
  };
  activeRequests: number;
}

export type MatchStatus = 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH' | 'NOT_SUPPORTED' | 'ERROR';

export type ReasonCode =
  | 'ANNM'  // Account Name Match
  | 'MBAM'  // Match But Additional Match
  | 'PANM'  // Partial Name Match
  | 'ACNF'  // Account Not Found
  | 'CLOS'  // Account Closed
  | 'SWCH'  // Account Switched
  | 'TECH'  // Technical Error
  | 'NSUP'; // Not Supported
