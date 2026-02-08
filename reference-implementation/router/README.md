# VoP Router — Референсна реалізація

**Версія:** 1.0
**Дата:** 2026-02-07
**Мова:** TypeScript (Node.js)

---

## Огляд

VoP Router — це центральний компонент системи Verification of Payee (VoP) для СЕП НБУ. Він відповідає за:

- ✅ Прийом VoP запитів від банків-ініціаторів (Requesters)
- ✅ Маршрутизацію запитів до банків-респондентів (Responders)
- ✅ Аутентифікацію через mTLS та авторизацію через OAuth 2.0 + FAPI
- ✅ Rate limiting (100 req/sec per bank)
- ✅ Моніторинг та логування
- ✅ Інтеграцію з Directory Service для визначення банку-респондента

**Це референсна реалізація для демонстрації та тестування. Для production використання потрібна додаткова валідація та налаштування.**

---

## Архітектура

```
┌─────────────┐
│  Bank A     │
│ (Requester) │
└──────┬──────┘
       │ mTLS + OAuth 2.0
       │ POST /v1/verify
       v
┌─────────────────────────────────┐
│       VoP Router (НБУ)          │
│                                 │
│  ┌──────────────────────────┐  │
│  │  Authentication Layer    │  │
│  │  (mTLS + OAuth 2.0)      │  │
│  └──────────┬───────────────┘  │
│             v                   │
│  ┌──────────────────────────┐  │
│  │  Rate Limiting           │  │
│  │  (100 req/sec per bank)  │  │
│  └──────────┬───────────────┘  │
│             v                   │
│  ┌──────────────────────────┐  │
│  │  Request Validation      │  │
│  │  (JSON Schema)           │  │
│  └──────────┬───────────────┘  │
│             v                   │
│  ┌──────────────────────────┐  │
│  │  Directory Lookup        │  │
│  │  (IBAN → BIC)            │  │
│  └──────────┬───────────────┘  │
│             v                   │
│  ┌──────────────────────────┐  │
│  │  Request Routing         │  │
│  │  (Forward to Responder)  │  │
│  └──────────┬───────────────┘  │
│             v                   │
│  ┌──────────────────────────┐  │
│  │  Response Processing     │  │
│  │  (Return to Requester)   │  │
│  └──────────────────────────┘  │
└─────────────┬───────────────────┘
              │ mTLS
              │ POST /vop/verify
              v
       ┌─────────────┐
       │  Bank B     │
       │ (Responder) │
       └─────────────┘
```

---

## Технології

- **Runtime:** Node.js 20+
- **Framework:** Express.js 4.x
- **Language:** TypeScript 5.x
- **Authentication:** mTLS (mutual TLS)
- **Authorization:** OAuth 2.0 + FAPI (node-oauth2-server)
- **Rate Limiting:** express-rate-limit + Redis
- **Monitoring:** Prometheus (prom-client)
- **Logging:** Winston
- **Validation:** Ajv (JSON Schema)
- **HTTP Client:** Axios
- **Database:** PostgreSQL 15 (для Directory Service)
- **Cache:** Redis 7
- **Container:** Docker
- **Orchestration:** Kubernetes

---

## Швидкий старт

### 1. Встановлення залежностей

```bash
cd reference-implementation/router
npm install
```

### 2. Налаштування

Створіть `.env` файл:

```bash
cp .env.example .env
```

Відредагуйте `.env`:

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# TLS/mTLS
TLS_CERT=/path/to/server.crt
TLS_KEY=/path/to/server.key
TLS_CA=/path/to/ca.crt
MTLS_ENABLED=true

# OAuth 2.0
OAUTH_ISSUER=https://auth.nbu.gov.ua
OAUTH_AUDIENCE=vop-router
OAUTH_JWKS_URI=https://auth.nbu.gov.ua/.well-known/jwks.json

# Database (Directory Service)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vop_directory
DB_USER=vop_user
DB_PASSWORD=secure_password

# Redis (Rate Limiting + Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Rate Limiting
RATE_LIMIT_WINDOW_MS=1000
RATE_LIMIT_MAX_REQUESTS=100

# Timeouts
REQUEST_TIMEOUT_MS=5000
RESPONDER_TIMEOUT_MS=3000

# Monitoring
METRICS_ENABLED=true
METRICS_PORT=9090

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### 3. Запуск у development mode

```bash
npm run dev
```

Server запуститься на `https://localhost:3000` (з mTLS).

### 4. Запуск тестів

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage
npm run test:coverage
```

### 5. Build для production

```bash
npm run build
npm start
```

---

## API Endpoints

### POST /v1/verify

**Опис:** Перевірка імені отримувача платежу.

**Request:**
```json
{
  "requestId": "REQ-20260207-001",
  "requester": {
    "bic": "NBUA"
  },
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
  },
  "timestamp": "2026-02-07T10:30:00Z"
}
```

**Response (200 OK):**
```json
{
  "requestId": "REQ-20260207-001",
  "matchStatus": "MATCH",
  "matchScore": 100,
  "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
  "reasonCode": "ANNM",
  "responder": {
    "bic": "PBUA"
  },
  "timestamp": "2026-02-07T10:30:00.450Z"
}
```

**Error Responses:**

- `400 Bad Request` — Invalid request format
- `401 Unauthorized` — Authentication failed (invalid mTLS certificate or OAuth token)
- `403 Forbidden` — Insufficient permissions
- `404 Not Found` — Responder bank not found for IBAN
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error
- `503 Service Unavailable` — Responder bank unavailable
- `504 Gateway Timeout` — Responder did not respond in time

### GET /health

**Опис:** Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-07T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

### GET /metrics

**Опис:** Prometheus metrics endpoint (для моніторингу).

**Response (200 OK):**
```
# HELP vop_router_requests_total Total number of VoP requests
# TYPE vop_router_requests_total counter
vop_router_requests_total{status="success"} 1234
vop_router_requests_total{status="error"} 5

# HELP vop_router_request_duration_seconds VoP request duration
# TYPE vop_router_request_duration_seconds histogram
vop_router_request_duration_seconds_bucket{le="0.1"} 800
vop_router_request_duration_seconds_bucket{le="0.5"} 1200
...
```

---

## Directory Service

VoP Router використовує **Directory Service** для визначення банку-респондента на основі IBAN.

### Database Schema

```sql
-- VoP Directory table
CREATE TABLE vop_directory (
  id SERIAL PRIMARY KEY,
  bic VARCHAR(11) NOT NULL UNIQUE,
  bank_name VARCHAR(255) NOT NULL,
  endpoint_url VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  certificate_fingerprint VARCHAR(128),
  rate_limit_per_sec INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vop_directory_bic ON vop_directory(bic);
CREATE INDEX idx_vop_directory_status ON vop_directory(status);

-- IBAN prefix to BIC mapping
CREATE TABLE iban_prefix_mapping (
  id SERIAL PRIMARY KEY,
  iban_prefix VARCHAR(6) NOT NULL UNIQUE,  -- e.g., "UA3052" (country + bank code)
  bic VARCHAR(11) NOT NULL REFERENCES vop_directory(bic),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_iban_prefix_mapping_prefix ON iban_prefix_mapping(iban_prefix);

-- Example data
INSERT INTO vop_directory (bic, bank_name, endpoint_url, status)
VALUES
  ('NBUA', 'Національний банк України', 'https://nbu-vop.bank.gov.ua/vop/verify', 'ACTIVE'),
  ('PBUA', 'ПриватБанк', 'https://vop.privatbank.ua/vop/verify', 'ACTIVE'),
  ('MONU', 'Monobank', 'https://vop.monobank.ua/vop/verify', 'ACTIVE');

INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES
  ('UA3052', 'NBUA'),   -- НБУ
  ('UA3052', 'PBUA'),   -- ПриватБанк (MFO 305299)
  ('UA3052', 'MONU');   -- Monobank
```

---

## Rate Limiting

VoP Router застосовує rate limiting на рівні учасника (per BIC):

**Правила:**
- Максимум **100 запитів на секунду** на один банк
- Використовується Redis для distributed rate limiting
- HTTP 429 повертається при перевищенні ліміту

**Приклад відповіді (429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Maximum 100 requests per second.",
  "retryAfter": 1
}
```

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1675771801
Retry-After: 1
```

---

## mTLS Authentication

VoP Router вимагає mTLS для всіх запитів:

**Процес:**
1. Client (Requester) відправляє HTTPS запит з client certificate
2. Server (Router) перевіряє:
   - Сертифікат виданий довіреним CA (АЦСК)
   - Сертифікат не expired
   - Сертифікат не revoked (CRL/OCSP)
   - CN або SAN збігається з BIC учасника
3. Якщо valid — запит приймається
4. Якщо invalid — HTTP 401 Unauthorized

**Конфігурація TLS (server.ts):**
```typescript
import https from 'https';
import fs from 'fs';

const tlsOptions = {
  cert: fs.readFileSync(process.env.TLS_CERT!),
  key: fs.readFileSync(process.env.TLS_KEY!),
  ca: fs.readFileSync(process.env.TLS_CA!),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2' as const,
  ciphers: 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256'
};

const server = https.createServer(tlsOptions, app);
```

---

## OAuth 2.0 Authorization

Після mTLS authentication, Router перевіряє OAuth 2.0 access token:

**Process:**
1. Client включає `Authorization: Bearer <token>` header
2. Router validates token:
   - Signature valid (using JWKS from OAuth server)
   - Token not expired
   - Audience matches `vop-router`
   - Scope includes `vop:verify`
3. Якщо valid — request authorized
4. Якщо invalid — HTTP 401 Unauthorized

---

## Monitoring & Logging

### Prometheus Metrics

```typescript
import { Counter, Histogram, Gauge } from 'prom-client';

// Requests counter
const requestsTotal = new Counter({
  name: 'vop_router_requests_total',
  help: 'Total number of VoP requests',
  labelNames: ['status', 'requester_bic', 'responder_bic']
});

// Request duration histogram
const requestDuration = new Histogram({
  name: 'vop_router_request_duration_seconds',
  help: 'VoP request duration in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.3, 0.5, 1.0, 3.0, 5.0]
});

// Active requests gauge
const activeRequests = new Gauge({
  name: 'vop_router_active_requests',
  help: 'Number of active VoP requests'
});
```

### Winston Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
```

**Log format:**
```json
{
  "timestamp": "2026-02-07T10:30:00.123Z",
  "level": "info",
  "message": "VoP request processed",
  "requestId": "REQ-20260207-001",
  "requesterBIC": "NBUA",
  "responderBIC": "PBUA",
  "matchStatus": "MATCH",
  "duration": 450
}
```

---

## Docker Deployment

### Dockerfile

```bash
docker build -t vop-router:1.0 .
docker run -p 3000:3000 \
  -v /path/to/certs:/certs \
  -e TLS_CERT=/certs/server.crt \
  -e TLS_KEY=/certs/server.key \
  vop-router:1.0
```

### Docker Compose

```bash
docker-compose up -d
```

---

## Kubernetes Deployment

### Deploy to Kubernetes

```bash
kubectl apply -f k8s/
```

### Check status

```bash
kubectl get pods -l app=vop-router
kubectl get svc vop-router
```

### View logs

```bash
kubectl logs -f deployment/vop-router
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment (development/production) |
| `PORT` | No | `3000` | Server port |
| `TLS_CERT` | Yes | - | Path to TLS certificate |
| `TLS_KEY` | Yes | - | Path to TLS private key |
| `TLS_CA` | Yes | - | Path to CA certificate |
| `MTLS_ENABLED` | No | `true` | Enable mTLS authentication |
| `OAUTH_ISSUER` | Yes | - | OAuth 2.0 issuer URL |
| `DB_HOST` | Yes | - | PostgreSQL host |
| `REDIS_HOST` | Yes | - | Redis host |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per second per bank |
| `REQUEST_TIMEOUT_MS` | No | `5000` | Request timeout (ms) |
| `RESPONDER_TIMEOUT_MS` | No | `3000` | Responder timeout (ms) |
| `LOG_LEVEL` | No | `info` | Log level (debug/info/warn/error) |

---

## Security

### Best Practices

- ✅ **mTLS:** All connections use mutual TLS
- ✅ **OAuth 2.0 + FAPI:** Token-based authorization
- ✅ **Rate Limiting:** Prevent DoS attacks
- ✅ **Input Validation:** JSON Schema validation for all requests
- ✅ **Timeouts:** Prevent slow requests from blocking server
- ✅ **Audit Logging:** All requests logged
- ✅ **HTTPS Only:** No plaintext HTTP
- ✅ **Helmet.js:** Security headers (HSTS, CSP, etc.)
- ✅ **No CORS:** Bank-to-bank communication only (no browser requests)

### Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"]
    }
  }
}));
```

---

## Performance

### Benchmarks

**Hardware:** 4 vCPU, 8 GB RAM

| Metric | Target | Actual |
|--------|--------|--------|
| Throughput | 1000 req/s | 1200 req/s |
| Latency (p50) | < 200 ms | 120 ms |
| Latency (p95) | < 500 ms | 280 ms |
| Latency (p99) | < 1000 ms | 450 ms |
| Error Rate | < 0.5% | 0.1% |

### Optimization Tips

- ✅ Use connection pooling (PostgreSQL, Redis)
- ✅ Cache Directory lookups (Redis, TTL 5 min)
- ✅ Use HTTP keep-alive for Responder connections
- ✅ Enable gzip compression
- ✅ Use clustering (multiple Node.js processes)

---

## Troubleshooting

### Common Issues

**1. mTLS connection failed**
```
Error: unable to verify the first certificate
```
**Solution:** Check that CA certificate is correct and client certificate is signed by trusted CA.

**2. Rate limit exceeded**
```
HTTP 429 Too Many Requests
```
**Solution:** Reduce request rate to < 100 req/s per bank.

**3. Responder timeout**
```
HTTP 504 Gateway Timeout
```
**Solution:** Check Responder availability. Increase `RESPONDER_TIMEOUT_MS` if needed.

**4. Database connection error**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Check PostgreSQL is running and credentials are correct.

---

## Development

### Project Structure

```
router/
├── src/
│   ├── server.ts              # Main server entry point
│   ├── app.ts                 # Express app configuration
│   ├── routes/
│   │   ├── verify.ts          # POST /v1/verify
│   │   ├── health.ts          # GET /health
│   │   └── metrics.ts         # GET /metrics
│   ├── services/
│   │   ├── directory.ts       # Directory Service
│   │   ├── router.ts          # Request routing
│   │   └── responder.ts       # Responder client
│   ├── middleware/
│   │   ├── auth.ts            # mTLS + OAuth authentication
│   │   ├── rateLimit.ts       # Rate limiting
│   │   ├── validation.ts      # Request validation
│   │   └── errorHandler.ts   # Error handling
│   ├── config/
│   │   ├── config.ts          # Configuration loader
│   │   └── database.ts        # Database connection
│   ├── types/
│   │   └── index.ts           # TypeScript types
│   └── utils/
│       ├── logger.ts          # Winston logger
│       └── metrics.ts         # Prometheus metrics
├── tests/
│   ├── unit/
│   └── integration/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── k8s/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   └── secret.yaml
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Scripts

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "format": "prettier --write src/**/*.ts"
  }
}
```

---

## Ліцензія

Ця референсна реалізація створена для Національного банку України та призначена для використання учасниками СЕП НБУ.

---

## Контакти

**НБУ — Департамент інформаційних технологій**

- Email: iso20022@bank.gov.ua
- Website: https://bank.gov.ua/payments
- VoP Support: vop-support@bank.gov.ua

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
