import { Counter, Histogram, Gauge, register } from 'prom-client';

// Requests counter
export const requestsTotal = new Counter({
  name: 'vop_router_requests_total',
  help: 'Total number of VoP requests',
  labelNames: ['status', 'requester_bic', 'responder_bic'],
});

// Request duration histogram
export const requestDuration = new Histogram({
  name: 'vop_router_request_duration_seconds',
  help: 'VoP request duration in seconds',
  labelNames: ['status', 'requester_bic', 'responder_bic'],
  buckets: [0.1, 0.3, 0.5, 1.0, 3.0, 5.0, 10.0],
});

// Active requests gauge
export const activeRequests = new Gauge({
  name: 'vop_router_active_requests',
  help: 'Number of active VoP requests',
});

// Responder latency histogram
export const responderLatency = new Histogram({
  name: 'vop_router_responder_latency_seconds',
  help: 'Responder response time in seconds',
  labelNames: ['responder_bic', 'status'],
  buckets: [0.1, 0.3, 0.5, 1.0, 2.0, 3.0, 5.0],
});

// Directory lookup duration
export const directoryLookupDuration = new Histogram({
  name: 'vop_router_directory_lookup_duration_seconds',
  help: 'Directory lookup duration in seconds',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
});

// Rate limit hits counter
export const rateLimitHits = new Counter({
  name: 'vop_router_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['requester_bic'],
});

// Errors counter
export const errorsTotal = new Counter({
  name: 'vop_router_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'requester_bic'],
});

// Match status distribution
export const matchStatusDistribution = new Counter({
  name: 'vop_router_match_status_total',
  help: 'Distribution of match statuses',
  labelNames: ['status', 'responder_bic'],
});

// Database query duration
export const dbQueryDuration = new Histogram({
  name: 'vop_router_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
});

// Redis operation duration
export const redisOpDuration = new Histogram({
  name: 'vop_router_redis_op_duration_seconds',
  help: 'Redis operation duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
});

export { register };
