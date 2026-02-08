# VoP Requester — Референсна реалізація

**Версія:** 1.0
**Дата:** 2026-02-07
**Мова:** TypeScript (Node.js)

---

## Огляд

VoP Requester — це client library для відправки Verification of Payee (VoP) запитів до VoP Router.

**Використовується банками-ініціаторами** для:
- ✅ Відправки VoP запитів перед ініціацією платежу
- ✅ Інтеграції з mobile/web banking додатками
- ✅ Інтеграції з Core Banking Systems
- ✅ Автоматизації VoP перевірок

---

## Швидкий старт

### Встановлення

```bash
npm install @vop/requester
```

### Базове використання

```typescript
import { VopRequesterClient } from '@vop/requester';

const client = new VopRequesterClient({
  routerUrl: 'https://vop-router.nbu.gov.ua',
  requesterBIC: 'PBUA',
  tlsCert: '/path/to/client.crt',
  tlsKey: '/path/to/client.key',
  tlsCA: '/path/to/ca.crt',
  oauthTokenUrl: 'https://auth.nbu.gov.ua/token',
  oauthClientId: 'vop-client-pbua',
  oauthClientSecret: 'secret',
});

// Send VoP request
const response = await client.verify({
  iban: 'UA213052990000026007233566001',
  name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
  accountType: 'PERSONAL',
});

console.log(response);
// {
//   requestId: "REQ-20260207-001",
//   matchStatus: "MATCH",
//   matchScore: 100,
//   verifiedName: "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
//   reasonCode: "ANNM"
// }
```

---

## API Reference

### VopRequesterClient

#### Constructor

```typescript
new VopRequesterClient(options: RequesterOptions)
```

**Options:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `routerUrl` | string | Yes | VoP Router URL |
| `requesterBIC` | string | Yes | Your bank's BIC |
| `tlsCert` | string | Yes | Path to mTLS client certificate |
| `tlsKey` | string | Yes | Path to mTLS private key |
| `tlsCA` | string | Yes | Path to CA certificate |
| `oauthTokenUrl` | string | Yes | OAuth token endpoint |
| `oauthClientId` | string | Yes | OAuth client ID |
| `oauthClientSecret` | string | Yes | OAuth client secret |
| `timeout` | number | No | Request timeout (default: 5000ms) |

#### Methods

##### verify(params)

Send VoP verification request.

```typescript
async verify(params: VerifyParams): Promise<VopResponse>
```

**Parameters:**

```typescript
interface VerifyParams {
  iban: string;
  name: string;
  accountType?: 'PERSONAL' | 'BUSINESS';
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentPurpose?: string;
}
```

**Returns:**

```typescript
interface VopResponse {
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
```

---

## Приклади використання

### Приклад 1: Mobile Banking Integration

```typescript
import { VopRequesterClient } from '@vop/requester';

// Initialize client
const vopClient = new VopRequesterClient({ ... });

// User enters recipient details in mobile app
async function onRecipientEntered(iban: string, name: string) {
  try {
    const result = await vopClient.verify({ iban, name });

    switch (result.matchStatus) {
      case 'MATCH':
        // ✅ Show green checkmark "Name matches!"
        showSuccess(`Verified: ${result.verifiedName}`);
        break;

      case 'CLOSE_MATCH':
        // ⚠️ Show warning "Name partially matches"
        showWarning(`Expected: ${result.verifiedName}, You entered: ${name}`);
        askUserConfirmation();
        break;

      case 'NO_MATCH':
        // ❌ Show error "Name does not match"
        showError(`Account holder: ${result.verifiedName}`);
        break;

      case 'NOT_SUPPORTED':
        // ℹ️ Show info "VoP not available for this bank"
        showInfo('Verification not available, proceed with caution');
        break;
    }
  } catch (error) {
    console.error('VoP error:', error);
    // Handle error gracefully, allow payment to proceed
  }
}
```

### Приклад 2: Batch Verification

```typescript
async function verifyMultipleRecipients(recipients: Array<{iban: string, name: string}>) {
  const results = await Promise.allSettled(
    recipients.map(r => vopClient.verify(r))
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`Recipient ${index + 1}: ${result.value.matchStatus}`);
    } else {
      console.error(`Recipient ${index + 1}: Error - ${result.reason}`);
    }
  });
}
```

### Приклад 3: Integration with Core Banking System

```typescript
// Oracle FLEXCUBE integration example
import { VopRequesterClient } from '@vop/requester';

class PaymentService {
  private vopClient: VopRequesterClient;

  constructor() {
    this.vopClient = new VopRequesterClient({ ... });
  }

  async initiatePayment(payment: Payment): Promise<PaymentResult> {
    // Step 1: Verify recipient with VoP
    const vopResult = await this.vopClient.verify({
      iban: payment.recipientIban,
      name: payment.recipientName,
      paymentAmount: payment.amount,
      paymentCurrency: payment.currency,
    });

    // Step 2: Log VoP result
    await this.logVopResult(payment.id, vopResult);

    // Step 3: Apply business rules
    if (vopResult.matchStatus === 'NO_MATCH') {
      if (payment.amount > 100000) {
        // High-value payment with NO_MATCH - block
        throw new Error('Payment blocked: recipient name mismatch');
      } else {
        // Low-value payment - allow with warning
        await this.flagForReview(payment.id, 'VoP mismatch');
      }
    }

    // Step 4: Process payment in core banking
    return await this.processPaymentInCBS(payment);
  }
}
```

---

## Error Handling

```typescript
import { VopRequesterClient, VopError, VopTimeoutError } from '@vop/requester';

try {
  const result = await vopClient.verify({ iban, name });
} catch (error) {
  if (error instanceof VopTimeoutError) {
    console.error('VoP timeout - allow payment to proceed');
  } else if (error instanceof VopError) {
    console.error(`VoP error: ${error.code} - ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Best Practices

### 1. Caching

```typescript
import { VopRequesterClient } from '@vop/requester';
import Redis from 'ioredis';

class CachedVopClient {
  private client: VopRequesterClient;
  private redis: Redis;

  constructor() {
    this.client = new VopRequesterClient({ ... });
    this.redis = new Redis();
  }

  async verify(params: VerifyParams): Promise<VopResponse> {
    const cacheKey = `vop:${params.iban}:${params.name}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Call VoP
    const result = await this.client.verify(params);

    // Cache result (5 minutes TTL)
    if (result.matchStatus !== 'ERROR') {
      await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    }

    return result;
  }
}
```

### 2. Retry Logic

```typescript
import { retry } from 'ts-retry';

async function verifyWithRetry(params: VerifyParams) {
  return await retry(
    () => vopClient.verify(params),
    {
      maxAttempts: 3,
      delay: 1000,
      timeout: 5000,
    }
  );
}
```

### 3. Monitoring

```typescript
import { VopRequesterClient } from '@vop/requester';
import { Counter, Histogram } from 'prom-client';

const vopRequestsTotal = new Counter({
  name: 'vop_requests_total',
  help: 'Total VoP requests',
  labelNames: ['status'],
});

const vopDuration = new Histogram({
  name: 'vop_request_duration_seconds',
  help: 'VoP request duration',
  buckets: [0.1, 0.5, 1.0, 2.0, 5.0],
});

async function verifyWithMetrics(params: VerifyParams) {
  const timer = vopDuration.startTimer();
  try {
    const result = await vopClient.verify(params);
    vopRequestsTotal.inc({ status: result.matchStatus });
    return result;
  } finally {
    timer();
  }
}
```

---

## Testing

```typescript
import { VopRequesterClient } from '@vop/requester';
import nock from 'nock';

describe('VoP Requester', () => {
  it('should handle MATCH response', async () => {
    nock('https://vop-router.nbu.gov.ua')
      .post('/v1/verify')
      .reply(200, {
        requestId: 'REQ-001',
        matchStatus: 'MATCH',
        matchScore: 100,
        verifiedName: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
        reasonCode: 'ANNM',
        responder: { bic: 'PBUA' },
        timestamp: '2026-02-07T10:30:00Z',
      });

    const client = new VopRequesterClient({ ... });
    const result = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
    });

    expect(result.matchStatus).toBe('MATCH');
    expect(result.matchScore).toBe(100);
  });
});
```

---

## Configuration

### Environment Variables

```bash
VOP_ROUTER_URL=https://vop-router.nbu.gov.ua
VOP_REQUESTER_BIC=PBUA
VOP_TLS_CERT=/path/to/client.crt
VOP_TLS_KEY=/path/to/client.key
VOP_TLS_CA=/path/to/ca.crt
VOP_OAUTH_TOKEN_URL=https://auth.nbu.gov.ua/token
VOP_OAUTH_CLIENT_ID=vop-client-pbua
VOP_OAUTH_CLIENT_SECRET=secret
VOP_TIMEOUT=5000
```

---

## License

Ця референсна реалізація створена для Національного банку України.

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
