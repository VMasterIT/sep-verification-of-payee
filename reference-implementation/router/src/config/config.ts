import dotenv from 'dotenv';
import { RouterConfig } from '../types';

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

export const config: RouterConfig = {
  server: {
    port: getEnvNumber('PORT', 3000),
    host: getEnv('HOST', '0.0.0.0'),
    env: (getEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test'),
  },
  tls: {
    cert: getEnv('TLS_CERT'),
    key: getEnv('TLS_KEY'),
    ca: getEnv('TLS_CA'),
    mtlsEnabled: getEnvBoolean('MTLS_ENABLED', true),
  },
  oauth: {
    issuer: getEnv('OAUTH_ISSUER'),
    audience: getEnv('OAUTH_AUDIENCE', 'vop-router'),
    jwksUri: getEnv('OAUTH_JWKS_URI'),
  },
  database: {
    host: getEnv('DB_HOST'),
    port: getEnvNumber('DB_PORT', 5432),
    database: getEnv('DB_NAME'),
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD'),
    maxConnections: getEnvNumber('DB_MAX_CONNECTIONS', 20),
  },
  redis: {
    host: getEnv('REDIS_HOST'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getEnvNumber('REDIS_DB', 0),
  },
  rateLimit: {
    windowMs: getEnvNumber('RATE_LIMIT_WINDOW_MS', 1000),
    maxRequests: getEnvNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  },
  timeouts: {
    requestTimeoutMs: getEnvNumber('REQUEST_TIMEOUT_MS', 5000),
    responderTimeoutMs: getEnvNumber('RESPONDER_TIMEOUT_MS', 3000),
  },
  monitoring: {
    metricsEnabled: getEnvBoolean('METRICS_ENABLED', true),
    metricsPort: getEnvNumber('METRICS_PORT', 9090),
  },
  logging: {
    level: (getEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error'),
    format: (getEnv('LOG_FORMAT', 'json') as 'json' | 'simple'),
  },
};

export default config;
