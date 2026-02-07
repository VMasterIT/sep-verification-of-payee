# Сценарій 3: Error Handling - Обробка помилок та збоїв

## Контекст

Цей документ описує різні сценарії помилок у VoP та рекомендовані стратегії обробки.

**Типи помилок:**
1. Timeout (Responder не відповідає вчасно)
2. Network errors (з'єднання втрачено)
3. Responder unavailable (offline, maintenance)
4. Invalid response (некоректний формат)
5. Certificate errors (mTLS проблеми)
6. Authorization errors (OAuth token проблеми)

---

## Сценарій 3.1: Timeout - Responder не відповідає

### Контекст

**Учасники:**
- **Клієнт:** Сергій Іванов (рахунок в Alfa Bank)
- **Банк-відправник:** Alfa Bank (Код ID НБУ: 300019)
- **Банк-отримувач:** Regional Bank (Код ID НБУ: 300045)
- **Проблема:** Regional Bank Responder API перевантажений та не відповідає вчасно

**Дата:** 2026-02-06, 14:30:00

---

### Крок 1: Клієнт ініціює платіж

```
Отримувач: МЕЛЬНИК ВАСИЛЬ ПЕТРОВИЧ
IBAN: UA703000450000026008765432109
Сума: 3000 UAH
```

Клієнт натискає **"Перевірити реквізити"**.

---

### Крок 2: VoP Request відправлено

```json
{
  "requestId": "timeout-test-001",
  "timestamp": "2026-02-06T14:30:00.000Z",
  "requester": {"nbuId": "300019"},
  "payee": {
    "iban": "UA703000450000026008765432109",
    "name": "МЕЛЬНИК ВАСИЛЬ ПЕТРОВИЧ"
  }
}
```

**Час відправки:** 14:30:00.000

---

### Крок 3: VoP Router направляє до Regional Bank

VoP Router відправляє request до Regional Bank Responder API:

```http
POST https://vop.regionalbank.ua/api/v1/verify
Timeout: 3000ms  ← VoP Router має timeout 3 секунди
```

**Що відбувається:**
- Regional Bank Responder API перевантажений (high load)
- Request потрапляє в чергу
- Обробка затримується...

**14:30:00.500** - Request в черзі
**14:30:01.000** - Request ще в черзі
**14:30:02.000** - Request ще в черзі
**14:30:03.000** - **TIMEOUT!** ⏰

---

### Крок 4: VoP Router обробляє timeout

```javascript
// VoP Router timeout handler
try {
  const response = await fetch(responderUrl, {
    method: 'POST',
    body: JSON.stringify(vopRequest),
    timeout: 3000  // 3 секунди max
  });
  return response.json();
} catch (error) {
  if (error.name === 'TimeoutError') {
    // Timeout - повертаємо ERROR response
    return {
      requestId: vopRequest.requestId,
      timestamp: new Date().toISOString(),
      responder: {
        nbuId: responderNbuId
      },
      result: {
        matchStatus: 'ERROR',
        reasonCode: 'TCHA',  // Technical Error
        reasonDescription: 'Responder timeout - no response within 3 seconds'
      },
      processingTime: 3000
    };
  }
}
```

**VoP Response (ERROR):**

```json
{
  "requestId": "timeout-test-001",
  "timestamp": "2026-02-06T14:30:03.050Z",
  "responder": {
    "nbuId": "300045"
  },
  "result": {
    "matchStatus": "ERROR",
    "reasonCode": "TCHA",
    "reasonDescription": "Responder timeout - no response within 3 seconds"
  },
  "processingTime": 3000
}
```

**Логування (VoP Router):**

```
[2026-02-06T14:30:03.050Z] ERROR: VoP Responder timeout
  RequestID: timeout-test-001
  Responder: 300045 (Regional Bank)
  URL: https://vop.regionalbank.ua/api/v1/verify
  Timeout: 3000ms
  Error: TimeoutError
```

---

### Крок 5: Alfa Bank обробляє ERROR response

Backend Alfa Bank отримує ERROR та форматує для UI:

```json
{
  "status": "error",
  "matchStatus": "ERROR",
  "message": "⚠️ Перевірка тимчасово недоступна",
  "details": "Банк-отримувач не відповідає. Спробуйте через кілька хвилин.",
  "action": "RETRY_OR_PROCEED",
  "canProceedWithoutVop": true
}
```

**UI мобільного додатку:**

```
┌────────────────────────────────────────────────────────┐
│  ⚠️  Перевірка реквізитів тимчасово недоступна         │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Банк-отримувач (Regional Bank) не відповідає на       │
│ запит перевірки.                                       │
│                                                        │
│ Отримувач: МЕЛЬНИК ВАСИЛЬ ПЕТРОВИЧ                     │
│ IBAN: UA703000450000026008765432109                    │
│ Сума: 3000 UAH                                         │
│                                                        │
│ ┌────────────────────────────────────────────────┐    │
│ │ ℹ️  Що робити?                                  │    │
│ │                                                │    │
│ │ • Спробуйте перевірити знову через кілька      │    │
│ │   хвилин                                       │    │
│ │                                                │    │
│ │ • Або продовжіть платіж без перевірки          │    │
│ │   (на ваш ризик)                               │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│     [ Спробувати знову ]                               │
│                                                        │
│     [ Продовжити без перевірки ]                       │
│                                                        │
│     [ Скасувати платіж ]                               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

### Крок 6: Варіанти дій клієнта

#### Варіант A: Спробувати знову ✅ (Рекомендовано)

Клієнт чекає 1-2 хвилини та натискає **"Спробувати знову"**.

**Retry attempt:**
```
14:32:00.000  Клієнт натискає "Спробувати знову"
14:32:00.100  Новий VoP Request відправлено
14:32:00.800  Regional Bank відповідає (load знизився)
14:32:00.850  Response: MATCH ✅
```

**UI:**
```
┌────────────────────────────────┐
│  ✅ Реквізити підтверджені     │
├────────────────────────────────┤
│ Перевірка успішна.             │
│                                │
│ Отримувач:                     │
│ МЕЛЬНИК ВАСИЛЬ ПЕТРОВИЧ        │
│                                │
│     [ Підтвердити платіж ]     │
│                                │
└────────────────────────────────┘
```

**Результат:** ✅ Retry successful, платіж може продовжитися.

---

#### Варіант B: Продовжити без перевірки ⚠️

Клієнт не хоче чекати та натискає **"Продовжити без перевірки"**.

**Confirmation dialog:**

```
┌────────────────────────────────────────────────────────┐
│  ⚠️  Підтвердження платежу без перевірки                │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Ви продовжуєте платіж БЕЗ перевірки реквізитів.       │
│                                                        │
│ ⚠️  ВАЖЛИВО:                                           │
│ • Банк НЕ перевірив правильність реквізитів           │
│ • У випадку помилки повернення коштів може зайняти    │
│   до 72 годин                                         │
│ • Рекомендуємо перевірити реквізити вручну            │
│                                                        │
│ Сума: 3000 UAH                                         │
│ Отримувач: МЕЛЬНИК ВАСИЛЬ ПЕТРОВИЧ                     │
│ IBAN: UA703000450000026008765432109                    │
│                                                        │
│     [ Я підтверджую ризики і продовжую ]               │
│                                                        │
│     [ Скасувати та спробувати пізніше ]                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Якщо клієнт підтверджує:

**Логування (Alfa Bank):**
```
[2026-02-06T14:30:15.000Z] WARN: Payment proceeded without VoP verification
  RequestID: timeout-test-001
  ClientID: 123456
  Reason: VOP_TIMEOUT
  Decision: PROCEED_WITHOUT_VOP
  Amount: 3000 UAH
```

Платіж відправляється до СЕП **без VoP перевірки** (як це було до VoP).

**Результат:** ⚠️ Платіж виконано, але без підтвердження реквізитів.

---

#### Варіант C: Скасувати платіж ❌

Клієнт вирішує почекати або перевірити реквізити іншим способом.

**Результат:** ❌ Платіж скасовано.

---

## Сценарій 3.2: Network Error - З'єднання втрачено

### Контекст

**Проблема:** Мережеве з'єднання між VoP Router та Responder втрачено (DDoS attack, infrastructure failure, тощо).

---

### Error Response

```json
{
  "requestId": "network-error-001",
  "timestamp": "2026-02-06T15:00:01.000Z",
  "result": {
    "matchStatus": "ERROR",
    "reasonCode": "TCHA",
    "reasonDescription": "Network error - unable to connect to responder"
  }
}
```

**UI (аналогічно до Timeout):**
```
⚠️  Перевірка тимчасово недоступна

Технічна помилка при з'єднанні з банком-отримувачем.

[ Спробувати знову ]
[ Продовжити без перевірки ]
[ Скасувати ]
```

---

## Сценарій 3.3: Responder Unavailable - Planned Maintenance

### Контекст

**Проблема:** Regional Bank проводить планове технічне обслуговування VoP Responder API.

---

### Maintenance Window Communication

Regional Bank заздалегідь повідомляє НБУ:

```
From: vop-support@regionalbank.ua
To: vop-support@bank.gov.ua
Subject: VoP Maintenance Window - 2026-02-06

Regional Bank VoP Responder API буде недоступний:
- Дата: 2026-02-06
- Час: 02:00 - 04:00 (2 години)
- Причина: Planned maintenance (infrastructure upgrade)

Status: VoP Directory буде оновлено (status: MAINTENANCE)
```

НБУ оновлює VoP Directory:

```json
{
  "participantId": "300045",
  "name": "Regional Bank",
  "status": "MAINTENANCE",  ← Status змінено
  "maintenanceWindow": {
    "start": "2026-02-06T02:00:00Z",
    "end": "2026-02-06T04:00:00Z"
  }
}
```

---

### VoP Router Handling

```javascript
// VoP Router check before routing
const participant = await directory.lookup(bankCode);

if (participant.status === 'MAINTENANCE') {
  // Don't даже try to connect, відразу поверни NOT_SUPPORTED
  return {
    matchStatus: 'NOT_SUPPORTED',
    reasonCode: 'ACNS',  // Account verification service not supported
    reasonDescription: `Responder undergoing maintenance (${participant.name}). Try after ${participant.maintenanceWindow.end}`
  };
}
```

**Response:**

```json
{
  "requestId": "maintenance-001",
  "result": {
    "matchStatus": "NOT_SUPPORTED",
    "reasonCode": "ACNS",
    "reasonDescription": "Regional Bank VoP service undergoing maintenance until 04:00"
  }
}
```

**UI:**

```
┌────────────────────────────────────────────────────────┐
│  ℹ️  Перевірка тимчасово недоступна                     │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Regional Bank проводить технічне обслуговування        │
│ до 04:00.                                              │
│                                                        │
│ Ви можете:                                             │
│ • Почекати до 04:00 та спробувати знову                │
│ • Продовжити платіж без перевірки                      │
│                                                        │
│     [ Продовжити без перевірки ]                       │
│     [ Скасувати платіж ]                               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Сценарій 3.4: Invalid Response Format

### Контекст

**Проблема:** Responder повертає некоректний JSON або не валідує schema.

---

### Invalid Response Example

```json
{
  "requestId": "invalid-001",
  // Missing required fields!
  "result": {
    "status": "OK"  ← Wrong field name (має бути matchStatus)
  }
}
```

---

### VoP Router Validation

```javascript
// VoP Router validates response schema
try {
  const response = await fetch(responderUrl, ...);
  const data = await response.json();

  // Validate against JSON Schema
  const valid = validateSchema(data, vopResponseSchema);

  if (!valid) {
    logger.error('Invalid response format from Responder', {
      responder: responderNbuId,
      errors: validateSchema.errors
    });

    // Return ERROR to Requester
    return {
      matchStatus: 'ERROR',
      reasonCode: 'TCHA',
      reasonDescription: 'Invalid response format from responder'
    };
  }

  return data;
} catch (error) {
  // ...
}
```

**Response to Requester:**

```json
{
  "requestId": "invalid-001",
  "result": {
    "matchStatus": "ERROR",
    "reasonCode": "TCHA",
    "reasonDescription": "Invalid response format from responder"
  }
}
```

**UI (аналогічно до інших errors):**
```
⚠️  Перевірка тимчасово недоступна

Технічна помилка при обробці відповіді.

[ Спробувати знову ]
[ Продовжити без перевірки ]
```

**Додатково:**
- VoP Router повідомляє НБУ про проблему
- НБУ контактує Regional Bank для виправлення

---

## Сценарій 3.5: Certificate Error (mTLS)

### Контекст

**Проблема:** Client certificate expired або invalid.

---

### Error at TLS Handshake

```
SSL handshake failed:
  certificate has expired
  certificate: CN=vop.regionalbank.ua
  expiry date: 2026-01-31
```

VoP Router **відхиляє з'єднання** ще до API request.

---

### VoP Router Response

```json
{
  "requestId": "cert-error-001",
  "result": {
    "matchStatus": "ERROR",
    "reasonCode": "TCHA",
    "reasonDescription": "TLS certificate error - unable to establish secure connection"
  }
}
```

**Додатково:**
- VoP Router логує certificate error
- НБУ отримує alert про проблему
- НБУ контактує Regional Bank ТЕРМІНОВО

**UI:**
```
⚠️  Перевірка тимчасово недоступна

Технічна помилка безпеки. Спробуйте пізніше.

[ Продовжити без перевірки ]
[ Скасувати платіж ]
```

---

## Сценарій 3.6: Authorization Error (OAuth Token)

### Контекст

**Проблема:** Access token expired або invalid.

---

### Error Response from VoP Router

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "invalid_token",
  "error_description": "Access token expired"
}
```

---

### Requester Handling

```javascript
// Alfa Bank VoP client
async function sendVopRequest(payload) {
  let token = await tokenManager.getToken();

  try {
    const response = await fetch(vopRouterUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      // Token expired, refresh and retry
      logger.warn('Access token expired, refreshing...');
      token = await tokenManager.requestNewToken();

      // Retry with new token
      const retryResponse = await fetch(vopRouterUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...
        },
        body: JSON.stringify(payload)
      });

      return await retryResponse.json();
    }

    return await response.json();
  } catch (error) {
    // ...
  }
}
```

**Result:** Auto-retry з новим token, клієнт не бачить помилку.

---

## Retry Strategy

### Exponential Backoff

```javascript
async function sendVopRequestWithRetry(payload, maxRetries = 3) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await sendVopRequest(payload);

      // Success
      return response;
    } catch (error) {
      lastError = error;

      if (error.name === 'TimeoutError' || error.code === 'ECONNREFUSED') {
        // Retryable error
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        logger.warn(`VoP request failed, retrying in ${delay}ms...`, {
          attempt: attempt + 1,
          error: error.message
        });

        await sleep(delay);
        continue;
      } else {
        // Non-retryable error (4xx), don't retry
        throw error;
      }
    }
  }

  // All retries exhausted
  throw new Error(`VoP request failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

**Retry policy:**
- **Attempt 1:** Immediate
- **Attempt 2:** Wait 1 sec, then retry
- **Attempt 3:** Wait 2 sec, then retry
- **Attempt 4:** Wait 4 sec, then retry (max)

**What to retry:**
- ✅ Timeout
- ✅ Network errors (ECONNREFUSED, ECONNRESET)
- ✅ HTTP 503 Service Unavailable
- ✅ HTTP 429 Rate Limit Exceeded

**What NOT to retry:**
- ❌ HTTP 400 Bad Request (client error)
- ❌ HTTP 401 Unauthorized (except token refresh)
- ❌ HTTP 404 Not Found
- ❌ Invalid response format

---

## Fallback Strategy

### Graceful Degradation

Якщо VoP недоступна, платіжна система **продовжує працювати** без VoP (як раніше).

```javascript
async function processPayment(paymentData) {
  let vopResult = null;

  try {
    // Try VoP verification
    vopResult = await sendVopRequestWithRetry(paymentData);

    if (vopResult.matchStatus === 'MATCH') {
      // VoP confirmed, proceed with confidence
      return await sendPaymentToSEP(paymentData, { vopVerified: true });
    } else if (vopResult.matchStatus === 'CLOSE_MATCH') {
      // Show warning to client, let them decide
      return { status: 'REVIEW_REQUIRED', vopResult };
    } else if (vopResult.matchStatus === 'NO_MATCH') {
      // Show error to client
      return { status: 'VERIFICATION_FAILED', vopResult };
    }
  } catch (error) {
    // VoP failed (timeout, network error, etc.)
    logger.error('VoP verification failed, proceeding without VoP', {
      error: error.message,
      paymentId: paymentData.id
    });

    // Show warning to client: "VoP unavailable, proceed?"
    return { status: 'VOP_UNAVAILABLE', canProceed: true };
  }
}
```

**Fallback flow:**
```
VoP available → Use VoP (preferred)
VoP unavailable → Proceed without VoP (fallback, like before VoP existed)
```

---

## Monitoring та Alerting

### Metrics to Monitor

```prometheus
# VoP request success rate
vop_requests_total{status="success"} 9500
vop_requests_total{status="error"} 500
# Success rate: 95%

# Error types
vop_errors_total{type="timeout"} 300
vop_errors_total{type="network"} 150
vop_errors_total{type="invalid_response"} 50

# Latency
vop_request_duration_seconds{quantile="0.5"} 0.4
vop_request_duration_seconds{quantile="0.95"} 0.9
vop_request_duration_seconds{quantile="0.99"} 2.5

# Responder availability
vop_responder_availability{nbu_id="300045"} 0.95  # 95% uptime
```

### Alerts

```yaml
# Alert: High error rate
- alert: VopHighErrorRate
  expr: rate(vop_errors_total[5m]) > 0.1  # >10% error rate
  labels:
    severity: warning
  annotations:
    summary: "VoP error rate is high ({{ $value }})"

# Alert: Responder down
- alert: VopResponderDown
  expr: vop_responder_availability < 0.9  # <90% uptime
  labels:
    severity: critical
  annotations:
    summary: "VoP Responder {{ $labels.nbu_id }} availability low"

# Alert: High latency
- alert: VopHighLatency
  expr: vop_request_duration_seconds{quantile="0.95"} > 1.5
  labels:
    severity: warning
  annotations:
    summary: "VoP latency is high (p95: {{ $value }}s)"
```

---

## Best Practices

### 1. ✅ Graceful Degradation

**DO:**
- ✅ VoP недоступна → платіжна система продовжує працювати
- ✅ Show clear warnings клієнту
- ✅ Дозволити клієнту вибрати (retry/proceed/cancel)

**DON'T:**
- ❌ НЕ блокувати всі платежі якщо VoP down
- ❌ НЕ приховувати помилки від клієнта

### 2. ✅ Retry Logic

**DO:**
- ✅ Retry transient errors (timeout, network)
- ✅ Exponential backoff
- ✅ Max 3-4 retries

**DON'T:**
- ❌ НЕ retry non-retryable errors (4xx)
- ❌ НЕ retry indefinitely

### 3. ✅ Monitoring

**DO:**
- ✅ Monitor success rate, error rate, latency
- ✅ Alerts для high error rate або responder down
- ✅ Dashboard з real-time metrics

### 4. ✅ Client Communication

**DO:**
- ✅ Clear error messages для клієнта
- ✅ Explain what happened та що робити
- ✅ Provide options (retry/proceed/cancel)

**DON'T:**
- ❌ НЕ показувати технічні details (stack traces)
- ❌ НЕ залишати клієнта без опцій

---

## Висновки

**Error handling є критичним для VoP:**
- ✅ **Graceful degradation:** Система працює навіть якщо VoP down
- ✅ **User choice:** Клієнт має контроль (retry/proceed/cancel)
- ✅ **Monitoring:** Проактивне виявлення проблем
- ✅ **Clear communication:** Зрозумілі повідомлення для клієнта

**Результат:**
- VoP покращує UX коли працює
- VoP не блокує UX коли не працює
- Баланс між безпекою та usability

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
