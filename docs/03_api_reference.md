# API Референс для VoP СЕП НБУ

## Зміст

1. [Загальна інформація](#загальна-інформація)
2. [Автентифікація](#автентифікація)
3. [VoP Router API](#vop-router-api)
4. [VoP Requester API](#vop-requester-api)
5. [VoP Responder API](#vop-responder-api)
6. [Directory Service API](#directory-service-api)
7. [Коди помилок](#коди-помилок)
8. [Приклади викликів](#приклади-викликів)

---

## 1. Загальна інформація

### 1.1 Базові URLs

**Production:**
```
VoP Router:    https://vop-router.sep.nbu.gov.ua/api
Directory:     https://vop-directory.sep.nbu.gov.ua/api
Auth Server:   https://auth.sep.nbu.gov.ua
```

**Test Environment:**
```
VoP Router:    https://vop-router-test.sep.nbu.gov.ua/api
Directory:     https://vop-directory-test.sep.nbu.gov.ua/api
Auth Server:   https://auth-test.sep.nbu.gov.ua
```

**Sandbox:**
```
VoP Router:    https://vop-router-sandbox.sep.nbu.gov.ua/api
Directory:     https://vop-directory-sandbox.sep.nbu.gov.ua/api
Auth Server:   https://auth-sandbox.sep.nbu.gov.ua
```

### 1.2 Формати даних

**Content-Type:** `application/json`

**Charset:** UTF-8

**Date/Time Format:** ISO 8601
```
2026-02-06T14:30:00Z
2026-02-06T14:30:00.123Z
```

**UUID Format:** UUID v4
```
550e8400-e29b-41d4-a716-446655440000
```

### 1.3 HTTP Headers

**Обов'язкові:**
```http
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Рекомендовані:**
```http
X-Request-ID: {uuid}           # Унікальний ID запиту
X-Idempotency-Key: {uuid}      # Для ідемпотентності
X-NBU-ID: {nbu_id}             # NBU ID банку
User-Agent: BankName/1.0
```

### 1.4 Rate Limits

| Тип | Ліміт | Період | Burst |
|-----|-------|--------|-------|
| Per Bank | 100 req | 1 сек | 500 |
| Per IP | 10 req | 1 сек | 20 |
| Global | 5000 req | 1 сек | - |

**Response Headers при rate limiting:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707224460
Retry-After: 60
```

---

## 2. Автентифікація

### 2.1 OAuth 2.0 Token Endpoint

**Отримання access token:**

```http
POST /oauth/token
Host: auth.sep.nbu.gov.ua
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&
client_id={your_client_id}&
client_secret={your_client_secret}&
scope=vop:request vop:respond
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "vop:request vop:respond"
}
```

**Використання token:**
```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 mTLS

**Client Certificate Headers (передаються nginx):**
```http
X-Client-Certificate: {certificate_pem}
X-Client-Verify: SUCCESS
X-Client-DN: CN=vop.privatbank.ua,O=PrivatBank,C=UA
X-Client-Fingerprint: SHA256:abc123...
```

---

## 3. VoP Router API

### 3.1 POST /vop/v1/verify

Основний endpoint для перевірки реквізитів отримувача.

**Request:**

```http
POST /vop/v1/verify
Host: vop-router.sep.nbu.gov.ua
Content-Type: application/json
Authorization: Bearer {access_token}
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00Z",
  "requester": {
    "bic": "NBUBUBU1XXX",
    "nbuId": "300001"
  },
  "payee": {
    "iban": "UA213223130000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "identificationType": "INN",
    "identificationCode": "1234567890"
  },
  "accountType": "PERSONAL",
  "paymentType": "INSTANT"
}
```

**Response (200 OK):**

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 100,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name match",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 850
}
```

**Request Parameters:**

| Поле | Тип | Обов'язкове | Опис | Формат/Обмеження |
|------|-----|-------------|------|------------------|
| `requestId` | string | Так | UUID запиту | UUID v4 |
| `timestamp` | string | Так | Час запиту | ISO 8601 |
| `requester.bic` | string | Так | BIC банку-відправника | ISO 9362, 8-11 символів |
| `requester.nbuId` | string | Так | NBU ID | 6 цифр |
| `payee.iban` | string | Так | IBAN отримувача | 29 символів, UA + 27 цифр |
| `payee.name` | string | Так | Ім'я отримувача | 1-140 символів |
| `payee.identificationType` | string | Ні | Тип ідентифікатора | EDRPOU, INN, PASSPORT |
| `payee.identificationCode` | string | Ні | Код ідентифікатора | 8-20 символів |
| `accountType` | string | Ні | Тип рахунку | PERSONAL, BUSINESS |
| `paymentType` | string | Ні | Тип платежу | INSTANT, REGULAR |

**Response Fields:**

| Поле | Тип | Завжди присутнє | Опис |
|------|-----|-----------------|------|
| `requestId` | string | Так | UUID запиту (echo) |
| `timestamp` | string | Так | Час відповіді |
| `responder.bic` | string | Ні | BIC банку-отримувача |
| `responder.nbuId` | string | Ні | NBU ID банку-отримувача |
| `result.matchStatus` | string | Так | MATCH, NO_MATCH, CLOSE_MATCH, NOT_SUPPORTED, ERROR |
| `result.matchScore` | number | Ні | 0-100 |
| `result.reasonCode` | string | Так | ANNM, MBAM, ACNS, OPTO, TCHA, UNKN |
| `result.reasonDescription` | string | Ні | Опис причини |
| `result.verifiedName` | string | Ні | Перевірене ім'я з БД |
| `result.accountStatus` | string | Ні | ACTIVE, CLOSED, BLOCKED |
| `processingTime` | number | Так | Час обробки (мс) |

**HTTP Status Codes:**

| Code | Опис | Response Body |
|------|------|---------------|
| 200 | OK | VoPResponse (всі matchStatus) |
| 400 | Bad Request | ErrorResponse |
| 401 | Unauthorized | ErrorResponse |
| 403 | Forbidden | ErrorResponse |
| 404 | Bank Not Found | ErrorResponse |
| 429 | Too Many Requests | ErrorResponse |
| 500 | Internal Server Error | ErrorResponse |
| 503 | Service Unavailable | ErrorResponse |
| 504 | Gateway Timeout | ErrorResponse |

### 3.2 GET /health

Health check endpoint.

**Request:**
```http
GET /health
Host: vop-router.sep.nbu.gov.ua
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-06T14:30:00Z",
  "version": "1.0.0",
  "components": {
    "database": "up",
    "cache": "up",
    "directory": "up"
  }
}
```

**Status Values:**
- `healthy` - всі компоненти працюють
- `degraded` - деякі компоненти недоступні, але сервіс працює
- `unhealthy` - критичні компоненти недоступні

### 3.3 GET /metrics

Prometheus metrics endpoint.

**Request:**
```http
GET /metrics
Host: vop-router.sep.nbu.gov.ua
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```
# HELP vop_requests_total Total number of VoP requests
# TYPE vop_requests_total counter
vop_requests_total{status="MATCH"} 12345
vop_requests_total{status="NO_MATCH"} 234

# HELP vop_requests_duration_seconds VoP request duration
# TYPE vop_requests_duration_seconds histogram
vop_requests_duration_seconds_bucket{le="0.5"} 8900
vop_requests_duration_seconds_bucket{le="1.0"} 11200
vop_requests_duration_seconds_bucket{le="3.0"} 12340
```

---

## 4. VoP Requester API

### 4.1 POST /payments/verify-payee

Internal API банку-відправника для перевірки реквізитів.

**Request:**
```http
POST /payments/verify-payee
Host: api.yourbank.ua
Content-Type: application/json
Authorization: Bearer {user_session_token}

{
  "recipientName": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
  "recipientIban": "UA213223130000026007233566001",
  "recipientIdType": "INN",
  "recipientIdCode": "1234567890",
  "accountType": "PERSONAL",
  "paymentType": "INSTANT"
}
```

**Response (200 OK):**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "matchStatus": "MATCH",
  "matchScore": 100,
  "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
  "accountStatus": "ACTIVE",
  "message": "✅ Реквізити підтверджені",
  "action": "CONTINUE",
  "timestamp": "2026-02-06T14:30:01Z"
}
```

**Action Values:**
- `CONTINUE` - клієнт може продовжити платіж
- `WARN` - показати попередження клієнту
- `STOP` - рекомендовано зупинити платіж
- `OPTIONAL` - перевірка недоступна, платіж опційний

### 4.2 GET /payments/vop-history

Історія VoP перевірок (для аудиту).

**Request:**
```http
GET /payments/vop-history?limit=50&offset=0
Host: api.yourbank.ua
Authorization: Bearer {admin_token}
```

**Response (200 OK):**
```json
{
  "total": 1234,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "requestId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-02-06T14:30:00Z",
      "ibanMasked": "UA21********66001",
      "matchStatus": "MATCH",
      "matchScore": 100,
      "userId": "user-123",
      "processingTime": 850
    }
  ]
}
```

---

## 5. VoP Responder API

### 5.1 POST /vop/v1/verify

Endpoint банку-отримувача для обробки VoP запитів.

**Request (від Router):**
```http
POST /vop/v1/verify
Host: vop.privatbank.ua
Content-Type: application/json
Authorization: Bearer {router_token}
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00Z",
  "requester": {
    "bic": "NBUBUBU1XXX",
    "nbuId": "300001"
  },
  "payee": {
    "iban": "UA213223130000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "identificationType": "INN",
    "identificationCode": "1234567890"
  },
  "accountType": "PERSONAL",
  "paymentType": "INSTANT"
}
```

**Response (200 OK):**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 100,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name match",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 800
}
```

**Алгоритм обробки:**

```
1. Валідація запиту (schema, OAuth token, mTLS)
2. Пошук рахунку за IBAN в БД
3. Перевірка opt-out статусу
4. Перевірка статусу рахунку (ACTIVE/CLOSED/BLOCKED)
5. Name matching (Levenshtein, Jaro-Winkler)
6. Визначення matchStatus та reasonCode
7. Формування відповіді
8. Логування
```

**Performance Target:**
- Response time: < 500 мс (normal)
- Response time: < 1000 мс (maximum)

---

## 6. Directory Service API

### 6.1 GET /directory/v1/participants

Список всіх учасників VoP.

**Request:**
```http
GET /directory/v1/participants?status=ACTIVE
Host: vop-directory.sep.nbu.gov.ua
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "total": 45,
  "items": [
    {
      "nbuId": "300023",
      "bic": "PRYBUA2XXXX",
      "name": "ПриватБанк",
      "status": "ACTIVE",
      "vopResponderUrl": "https://vop.privatbank.ua/api/v1/verify",
      "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
      "registeredDate": "2026-01-01T00:00:00Z",
      "lastUpdated": "2026-02-06T10:00:00Z"
    }
  ]
}
```

### 6.2 GET /directory/v1/participants/{id}

Деталі конкретного учасника.

**Request:**
```http
GET /directory/v1/participants/300023
Host: vop-directory.sep.nbu.gov.ua
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "nbuId": "300023",
  "bic": "PRYBUA2XXXX",
  "name": "ПриватБанк",
  "status": "ACTIVE",
  "vopResponderUrl": "https://vop.privatbank.ua/api/v1/verify",
  "certificateFingerprint": "SHA256:abc123...",
  "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
  "maxResponseTime": 1000,
  "bankCodes": ["322313"],
  "registeredDate": "2026-01-01T00:00:00Z",
  "lastUpdated": "2026-02-06T10:00:00Z"
}
```

### 6.3 GET /directory/v1/lookup/{iban}

Пошук банку-отримувача за IBAN.

**Request:**
```http
GET /directory/v1/lookup/UA213223130000026007233566001
Host: vop-directory.sep.nbu.gov.ua
Authorization: Bearer {access_token}
```

**Response (200 OK):**
```json
{
  "iban": "UA213223130000026007233566001",
  "bankCode": "322313",
  "participant": {
    "nbuId": "300023",
    "bic": "PRYBUA2XXXX",
    "name": "ПриватБанк",
    "vopResponderUrl": "https://vop.privatbank.ua/api/v1/verify",
    "status": "ACTIVE"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": {
    "code": "BANK_NOT_FOUND",
    "message": "Bank not found in directory",
    "details": "Bank code 322313 is not registered"
  }
}
```

### 6.4 POST /directory/v1/participants

Реєстрація нового учасника (тільки для адміністраторів НБУ).

**Request:**
```http
POST /directory/v1/participants
Host: vop-directory.sep.nbu.gov.ua
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "nbuId": "300099",
  "bic": "YOURBANKUA2X",
  "name": "Your Bank JSC",
  "vopResponderUrl": "https://vop.yourbank.ua/api/v1/verify",
  "certificateFingerprint": "SHA256:abc123...",
  "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
  "maxResponseTime": 1000,
  "bankCodes": ["999888"]
}
```

**Response (201 Created):**
```json
{
  "nbuId": "300099",
  "bic": "YOURBANKUA2X",
  "name": "Your Bank JSC",
  "status": "ACTIVE",
  "registeredDate": "2026-02-06T14:30:00Z"
}
```

### 6.5 PUT /directory/v1/participants/{id}

Оновлення даних учасника.

**Request:**
```http
PUT /directory/v1/participants/300099
Host: vop-directory.sep.nbu.gov.ua
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "vopResponderUrl": "https://vop-new.yourbank.ua/api/v1/verify",
  "status": "ACTIVE"
}
```

**Response (200 OK):**
```json
{
  "nbuId": "300099",
  "bic": "YOURBANKUA2X",
  "status": "ACTIVE",
  "lastUpdated": "2026-02-06T14:30:00Z"
}
```

---

## 7. Коди помилок

### 7.1 Error Response Format

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00Z",
  "error": {
    "code": "INVALID_IBAN",
    "message": "Invalid IBAN format or checksum",
    "details": "IBAN checksum validation failed",
    "retryable": false
  }
}
```

### 7.2 HTTP Error Codes

| HTTP Code | Error Code | Опис | Retryable |
|-----------|------------|------|-----------|
| 400 | `INVALID_REQUEST` | Невалідний запит | Ні |
| 400 | `INVALID_IBAN` | Невалідний IBAN | Ні |
| 400 | `INVALID_NAME` | Невалідне ім'я | Ні |
| 400 | `MISSING_REQUIRED_FIELD` | Відсутнє обов'язкове поле | Ні |
| 401 | `UNAUTHORIZED` | Невалідна автентифікація | Ні |
| 401 | `TOKEN_EXPIRED` | Токен прострочений | Так (після refresh) |
| 401 | `INVALID_TOKEN` | Невалідний токен | Ні |
| 403 | `FORBIDDEN` | Недостатньо прав | Ні |
| 403 | `INSUFFICIENT_SCOPE` | Недостатньо scope | Ні |
| 404 | `BANK_NOT_FOUND` | Банк не знайдено | Ні |
| 404 | `PARTICIPANT_NOT_FOUND` | Учасник не знайдено | Ні |
| 404 | `RESOURCE_NOT_FOUND` | Ресурс не знайдено | Ні |
| 429 | `RATE_LIMIT_EXCEEDED` | Перевищено ліміт | Так (після delay) |
| 500 | `TECHNICAL_ERROR` | Технічна помилка | Так |
| 500 | `DATABASE_ERROR` | Помилка БД | Так |
| 503 | `SERVICE_UNAVAILABLE` | Сервіс недоступний | Так |
| 503 | `MAINTENANCE` | Технічне обслуговування | Так |
| 504 | `TIMEOUT` | Timeout | Так |
| 504 | `GATEWAY_TIMEOUT` | Gateway timeout | Так |

### 7.3 VoP Reason Codes

Детальний опис у `rules/reason_codes.md`.

| Code | matchStatus | Опис |
|------|-------------|------|
| `ANNM` | MATCH / NO_MATCH | Account Name No Match / Match |
| `MBAM` | CLOSE_MATCH | May Be A Match |
| `ACNS` | NOT_SUPPORTED | Account Not Supported |
| `OPTO` | NOT_SUPPORTED | Opted Out |
| `BANM` | MATCH | Business Account Name Match |
| `PAMM` | CLOSE_MATCH | Personal Account May Match |
| `TCHA` | ERROR | Technical Error |
| `UNKN` | ERROR | Unknown Error |

---

## 8. Приклади викликів

### 8.1 Приклад 1: Успішна перевірка (MATCH)

**Request:**
```bash
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "X-Request-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-02-06T14:30:00Z",
    "requester": {
      "bic": "NBUBUBU1XXX",
      "nbuId": "300001"
    },
    "payee": {
      "iban": "UA213223130000026007233566001",
      "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
      "identificationType": "INN",
      "identificationCode": "1234567890"
    },
    "accountType": "PERSONAL",
    "paymentType": "INSTANT"
  }'
```

**Response:**
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 100,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name match",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 850
}
```

### 8.2 Приклад 2: Часткове співпадіння (CLOSE_MATCH)

**Request:**
```bash
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "requestId": "7b3d8f90-c1e2-4567-89ab-cdef01234567",
    "timestamp": "2026-02-06T14:35:00Z",
    "requester": {
      "bic": "NBUBUBU1XXX",
      "nbuId": "300001"
    },
    "payee": {
      "iban": "UA213223130000026007233566001",
      "name": "ШЕВЧЕНКО ТАРАС",
      "identificationType": "INN",
      "identificationCode": "1234567890"
    },
    "accountType": "PERSONAL",
    "paymentType": "REGULAR"
  }'
```

**Response:**
```json
{
  "requestId": "7b3d8f90-c1e2-4567-89ab-cdef01234567",
  "timestamp": "2026-02-06T14:35:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "CLOSE_MATCH",
    "matchScore": 85,
    "reasonCode": "MBAM",
    "reasonDescription": "May be a match - missing middle name",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 920
}
```

### 8.3 Приклад 3: Не співпадає (NO_MATCH)

**Request:**
```bash
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "timestamp": "2026-02-06T14:40:00Z",
    "requester": {
      "bic": "NBUBUBU1XXX",
      "nbuId": "300001"
    },
    "payee": {
      "iban": "UA213223130000026007233566001",
      "name": "ПЕТРЕНКО ОЛЕГ ІВАНОВИЧ",
      "identificationType": "INN",
      "identificationCode": "9876543210"
    },
    "accountType": "PERSONAL",
    "paymentType": "INSTANT"
  }'
```

**Response:**
```json
{
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-02-06T14:40:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "NO_MATCH",
    "matchScore": 25,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name no match",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 780
}
```

### 8.4 Приклад 4: Помилка (банк не знайдено)

**Request:**
```bash
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "requestId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "timestamp": "2026-02-06T14:45:00Z",
    "requester": {
      "bic": "NBUBUBU1XXX",
      "nbuId": "300001"
    },
    "payee": {
      "iban": "UA219999990000026007233566001",
      "name": "КОВАЛЕНКО ІВАН",
      "identificationType": "INN",
      "identificationCode": "1111111111"
    },
    "accountType": "PERSONAL",
    "paymentType": "INSTANT"
  }'
```

**Response (404 Not Found):**
```json
{
  "requestId": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
  "timestamp": "2026-02-06T14:45:00Z",
  "error": {
    "code": "BANK_NOT_FOUND",
    "message": "Responder bank not found in directory",
    "details": "Bank code 999999 is not registered in VoP Directory",
    "retryable": false
  }
}
```

### 8.5 Приклад 5: Rate Limit

**Request:**
```bash
# 101-й запит за секунду
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{ ... }'
```

**Response (429 Too Many Requests):**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": "Rate limit: 100 requests/second per bank. Current: 101",
    "retryable": true
  }
}
```

**Headers:**
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1707224460
Retry-After: 1
```

### 8.6 Приклад 6: OAuth Token

**Request:**
```bash
curl -X POST https://auth.sep.nbu.gov.ua/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=yourbank_client_id" \
  -d "client_secret=yourbank_client_secret" \
  -d "scope=vop:request vop:respond"
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2F1dGguc2VwLm5idS5nb3YudWEiLCJzdWIiOiIzMDAwMjMiLCJhdWQiOiJodHRwczovL3ZvcC1yb3V0ZXIuc2VwLm5idS5nb3YudWEiLCJleHAiOjE3MDcyMjgwMDAsImlhdCI6MTcwNzIyNDQwMCwic2NvcGUiOiJ2b3A6cmVxdWVzdCB2b3A6cmVzcG9uZCIsImJpYyI6IlBSWUJVQTJYWFhYIiwibmJ1X2lkIjoiMzAwMDIzIn0.signature",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "vop:request vop:respond"
}
```

---

## 9. Webhook Notifications (опційно)

Якщо банк хоче отримувати асинхронні notification про VoP events.

### 9.1 POST {webhook_url}

**Request (від VoP Router до банку):**
```http
POST https://api.yourbank.ua/webhooks/vop
Content-Type: application/json
X-Webhook-Signature: sha256=abc123...

{
  "eventType": "vop.completed",
  "eventId": "evt_123456",
  "timestamp": "2026-02-06T14:30:01Z",
  "data": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "matchStatus": "MATCH",
    "processingTime": 850
  }
}
```

**Response:**
```http
HTTP/1.1 200 OK
```

---

## 10. Versioning

### 10.1 API Versions

API використовує версіонування в URL:
```
/vop/v1/verify      - Version 1 (current)
/vop/v2/verify      - Version 2 (future)
```

### 10.2 Deprecation Policy

- Підтримка старих версій: мінімум 12 місяців
- Deprecation notice: мінімум 6 місяців
- Header для deprecated API:
```http
Warning: 299 - "API version v1 will be deprecated on 2027-06-01"
```

---

## Висновки

VoP API забезпечує:

✅ **RESTful design** — зрозумілі endpoints
✅ **JSON формат** — легкість інтеграції
✅ **OAuth 2.0 + mTLS** — безпека
✅ **Rate limiting** — захист від перевантаження
✅ **Clear error codes** — проста обробка помилок
✅ **Comprehensive examples** — швидкий старт

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
