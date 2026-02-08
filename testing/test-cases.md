# Тест-кейси для VoP СЕП НБУ

**Версія:** 1.0
**Дата:** 2026-02-07
**Статус:** Draft

---

## Зміст

1. [Огляд](#огляд)
2. [Functional Test Cases](#functional-test-cases)
3. [Integration Test Cases](#integration-test-cases)
4. [Edge Cases та Boundary Tests](#edge-cases-та-boundary-tests)
5. [Negative Test Cases](#negative-test-cases)
6. [Security Test Cases](#security-test-cases)
7. [User Acceptance Tests](#user-acceptance-tests)
8. [Test Data](#test-data)

---

## Огляд

Цей документ описує тест-кейси для системи Verification of Payee (VoP) СЕП НБУ.

**Test Coverage:**
- Functional tests (основна функціональність)
- Integration tests (інтеграція компонентів)
- Edge cases (граничні випадки)
- Negative tests (обробка помилок)
- Security tests (безпека)
- UAT (користувацьке прийняття)

**Test Levels:**
- Unit tests (окремі модулі)
- Integration tests (взаємодія компонентів)
- System tests (вся система end-to-end)
- Acceptance tests (бізнес-сценарії)

---

## Functional Test Cases

### TC-F-001: Perfect Name Match

**Priority:** P0 (Critical)
**Type:** Positive
**Module:** Name Matching

**Preconditions:**
- VoP Responder API доступний
- Клієнт існує в БД з IBAN `UA213052990000026007233566001`
- Ім'я в БД: `ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ`

**Test Steps:**
1. Відправити VoP Request:
```json
{
  "requestId": "test-001",
  "timestamp": "2026-02-07T10:00:00Z",
  "requester": {"nbuId": "300001"},
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
  }
}
```

**Expected Result:**
```json
{
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 100,
    "reasonCode": "ANNM",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "accountStatus": "ACTIVE"
  }
}
```

**Actual Result:** [To be filled during testing]
**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### TC-F-002: Name Match with Initials

**Priority:** P0 (Critical)
**Type:** Positive
**Module:** Name Matching

**Preconditions:**
- Клієнт існує з повним ім'ям: `ПЕТРЕНКО ОЛЕНА ІВАНІВНА`

**Test Steps:**
1. Відправити VoP Request з ініціалами:
```json
{
  "payee": {
    "iban": "UA903004650000026001234567890",
    "name": "ПЕТРЕНКО О.І."
  }
}
```

**Expected Result:**
- `matchStatus: "MATCH"`
- `matchScore: 100`
- `reasonCode: "ANNM"`
- Ініціали О.І. співпадають з ОЛЕНА ІВАНІВНА

**Status:** [ ] Pass [ ] Fail

---

### TC-F-003: Close Match - Typo in Name

**Priority:** P0 (Critical)
**Type:** Positive
**Module:** Name Matching

**Preconditions:**
- Клієнт існує: `ПЕТРЕНКО ОЛЕНА ІВАНІВНА`

**Test Steps:**
1. Відправити запит з опечаткою:
```json
{
  "payee": {
    "name": "ПЕТРЕНКО ОЛЕНА ІВАІВНА"  // Пропущена Н
  }
}
```

**Expected Result:**
- `matchStatus: "CLOSE_MATCH"`
- `matchScore: 85-95`
- `reasonCode: "MBAM"`
- `verifiedName: "ПЕТРЕНКО ОЛЕНА ІВАНІВНА"`

**Status:** [ ] Pass [ ] Fail

---

### TC-F-004: Close Match - Transliteration Variation

**Priority:** P1 (High)
**Type:** Positive
**Module:** Name Matching

**Preconditions:**
- Клієнт існує: `ПЕТРЕНКО ОЛЕНА ІВАНІВНА`

**Test Steps:**
1. Відправити запит з варіацією транслітерації:
```json
{
  "payee": {
    "name": "PETRANKO OLENA IVANIVNA"  // PETRANKO vs PETRENKO
  }
}
```

**Expected Result:**
- `matchStatus: "CLOSE_MATCH"`
- `matchScore: 75-94`
- `reasonCode: "MBAM"`

**Status:** [ ] Pass [ ] Fail

---

### TC-F-005: No Match - Wrong Name

**Priority:** P0 (Critical)
**Type:** Positive
**Module:** Name Matching

**Preconditions:**
- Клієнт існує: `ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ`

**Test Steps:**
1. Відправити запит з неправильним ім'ям:
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "КОВАЛЕНКО ПЕТРО МИКОЛАЙОВИЧ"
  }
}
```

**Expected Result:**
- `matchStatus: "NO_MATCH"`
- `matchScore: < 75`
- `reasonCode: "ANNM"`
- `verifiedName: "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"` (показати правильне ім'я)

**Status:** [ ] Pass [ ] Fail

---

### TC-F-006: Account Not Found

**Priority:** P0 (Critical)
**Type:** Negative
**Module:** Account Lookup

**Test Steps:**
1. Відправити запит з неіснуючим IBAN:
```json
{
  "payee": {
    "iban": "UA999999999999999999999999999",
    "name": "TEST USER"
  }
}
```

**Expected Result:**
- `matchStatus: "NO_MATCH"`
- `reasonCode: "UNKN"` (Unknown account)
- `reasonDescription: "Account not found"`

**Status:** [ ] Pass [ ] Fail

---

### TC-F-007: Account Closed

**Priority:** P1 (High)
**Type:** Negative
**Module:** Account Status

**Preconditions:**
- Рахунок існує але має статус `CLOSED`

**Test Steps:**
1. Відправити VoP Request для закритого рахунку

**Expected Result:**
- `matchStatus: "NO_MATCH"`
- `reasonCode: "ACLS"` (Account closed)
- `accountStatus: "CLOSED"`

**Status:** [ ] Pass [ ] Fail

---

### TC-F-008: Business Account Verification

**Priority:** P1 (High)
**Type:** Positive
**Module:** Account Type

**Preconditions:**
- Бізнес-рахунок існує
- Назва компанії: `ТОВ "ПРИВАТБАНК"`
- ЄДРПОУ: `14360570`

**Test Steps:**
1. Відправити запит:
```json
{
  "payee": {
    "iban": "UA...",
    "name": "ТОВ ПРИВАТБАНК",
    "identificationType": "EDRPOU",
    "identificationCode": "14360570"
  },
  "accountType": "BUSINESS"
}
```

**Expected Result:**
- `matchStatus: "MATCH"`
- Name match + ЄДРПОУ match

**Status:** [ ] Pass [ ] Fail

---

### TC-F-009: Response Time - Normal Load

**Priority:** P0 (Critical)
**Type:** Performance
**Module:** VoP Responder

**Test Steps:**
1. Відправити 100 послідовних VoP запитів
2. Виміряти latency для кожного

**Expected Result:**
- p50 latency: < 300 мс
- p95 latency: < 1000 мс
- p99 latency: < 3000 мс

**Actual Result:** [Latency distribution]
**Status:** [ ] Pass [ ] Fail

---

### TC-F-010: VoP Router Availability

**Priority:** P0 (Critical)
**Type:** Reliability
**Module:** VoP Router

**Test Steps:**
1. Моніторити VoP Router протягом 24 годин
2. Відправляти health check кожні 60 секунд

**Expected Result:**
- Uptime: ≥ 99.9%
- Max downtime: < 43.8 хвилин/місяць

**Actual Result:** [Uptime %]
**Status:** [ ] Pass [ ] Fail

---

## Integration Test Cases

### TC-I-001: End-to-End VoP Flow (Requester → Router → Responder)

**Priority:** P0 (Critical)
**Type:** Integration
**Modules:** All

**Architecture:**
```
Requester (Bank A) → VoP Router (NBU) → Responder (Bank B)
```

**Test Steps:**
1. Bank A (Requester) відправляє VoP Request до Router
2. Router виконує lookup в Directory Service
3. Router пересилає запит до Bank B (Responder)
4. Bank B обробляє запит та повертає відповідь
5. Router пересилає відповідь до Bank A

**Expected Result:**
- Успішне проходження всіх етапів
- Total latency: < 1500 мс (end-to-end)
- Всі компоненти працюють коректно

**Status:** [ ] Pass [ ] Fail

---

### TC-I-002: VoP + Payment Flow Integration

**Priority:** P0 (Critical)
**Type:** Integration
**Modules:** VoP + Payment Gateway

**Test Steps:**
1. Клієнт ініціює платіж в Digital Banking
2. Frontend викликає VoP check
3. VoP повертає MATCH
4. Клієнт підтверджує платіж
5. pacs.008 відправляється до СЕП НБУ

**Expected Result:**
- VoP check завершується успішно
- Платіж відправляється тільки після VoP MATCH
- Повний flow: < 5 секунд

**Status:** [ ] Pass [ ] Fail

---

### TC-I-003: VoP Directory Service Lookup

**Priority:** P1 (High)
**Type:** Integration
**Modules:** Router + Directory

**Test Steps:**
1. VoP Router отримує запит з IBAN
2. Парсить IBAN для отримання bank code (символи 5-10)
3. Виконує lookup в Directory Service
4. Отримує Responder URL

**Test Data:**
- IBAN: `UA213052990000026007233566001`
- Bank code: `305299` (ПриватБанк)

**Expected Result:**
- Bank code correctly extracted: `305299`
- Directory returns: `https://vop.privatbank.ua/api/v1/verify`
- Lookup time: < 50 мс

**Status:** [ ] Pass [ ] Fail

---

### TC-I-004: VoP with Database Integration

**Priority:** P1 (High)
**Type:** Integration
**Modules:** Responder + Database

**Test Steps:**
1. Responder отримує VoP Request
2. Виконує SQL query до CBS database
3. Отримує дані клієнта
4. Виконує name matching
5. Повертає VoP Response

**Expected Result:**
- Database query: < 200 мс
- Total processing: < 800 мс
- Connection pool працює коректно

**Status:** [ ] Pass [ ] Fail

---

### TC-I-005: VoP with Redis Cache

**Priority:** P1 (High)
**Type:** Integration
**Modules:** Responder + Cache

**Test Steps:**
1. Перший запит: cache miss, query database
2. Другий запит (той самий IBAN): cache hit
3. Через 5 хвилин: cache expired, query database знову

**Expected Result:**
- Cache hit latency: < 50 мс
- Cache miss latency: < 800 мс
- TTL працює коректно (5 хвилин)

**Status:** [ ] Pass [ ] Fail

---

## Edge Cases та Boundary Tests

### TC-E-001: Empty Name Field

**Priority:** P2 (Medium)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "iban": "UA...",
    "name": ""
  }
}
```

**Expected Result:**
- HTTP 400 Bad Request
- Error: "Name is required"

**Status:** [ ] Pass [ ] Fail

---

### TC-E-002: Name with Special Characters

**Priority:** P2 (Medium)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "name": "О'КОННОР-ПЕТРЕНКО МАРІЯ"
  }
}
```

**Expected Result:**
- Successfully processed
- Special chars normalized (apostrophe, hyphen)

**Status:** [ ] Pass [ ] Fail

---

### TC-E-003: Very Long Name (255+ characters)

**Priority:** P2 (Medium)
**Type:** Boundary

**Test Steps:**
1. Відправити ім'я довжиною 300 символів

**Expected Result:**
- HTTP 400 Bad Request
- Error: "Name exceeds maximum length (255 characters)"

**Status:** [ ] Pass [ ] Fail

---

### TC-E-004: Invalid IBAN Format

**Priority:** P1 (High)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "iban": "INVALID_IBAN_123"
  }
}
```

**Expected Result:**
- HTTP 400 Bad Request
- Error: "Invalid IBAN format"

**Status:** [ ] Pass [ ] Fail

---

### TC-E-005: IBAN from Different Country

**Priority:** P2 (Medium)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "iban": "GB29NWBK60161331926819"  // UK IBAN
  }
}
```

**Expected Result:**
- `matchStatus: "NOT_SUPPORTED"`
- `reasonCode: "ACNS"`
- Error: "Only Ukrainian IBANs supported"

**Status:** [ ] Pass [ ] Fail

---

### TC-E-006: Concurrent Requests for Same IBAN

**Priority:** P1 (High)
**Type:** Concurrency

**Test Steps:**
1. Відправити 100 паралельних запитів для одного IBAN
2. Всі запити одночасно

**Expected Result:**
- Всі запити успішно оброблені
- Немає race conditions
- Cache consistency maintained

**Status:** [ ] Pass [ ] Fail

---

### TC-E-007: Unicode Characters in Name

**Priority:** P2 (Medium)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "name": "ШЕВЧЕНКО 😀 ТАРАС"  // Emoji
  }
}
```

**Expected Result:**
- Emoji видалено або normalized
- Processing continues without errors

**Status:** [ ] Pass [ ] Fail

---

### TC-E-008: Name with Numbers

**Priority:** P2 (Medium)
**Type:** Edge Case

**Test Steps:**
```json
{
  "payee": {
    "name": "ПЕТРЕНКО123 ОЛЕНА"
  }
}
```

**Expected Result:**
- Numbers видалено або ignored
- Name matching focuses on alphabetic characters

**Status:** [ ] Pass [ ] Fail

---

## Negative Test Cases

### TC-N-001: Missing Required Field (IBAN)

**Priority:** P1 (High)
**Type:** Negative

**Test Steps:**
```json
{
  "payee": {
    "name": "ШЕВЧЕНКО ТАРАС"
    // IBAN missing
  }
}
```

**Expected Result:**
- HTTP 400 Bad Request
- Error: "Missing required field: iban"

**Status:** [ ] Pass [ ] Fail

---

### TC-N-002: Invalid JSON Format

**Priority:** P1 (High)
**Type:** Negative

**Test Steps:**
```
POST /vop/v1/verify
Body: {invalid json syntax}
```

**Expected Result:**
- HTTP 400 Bad Request
- Error: "Invalid JSON format"

**Status:** [ ] Pass [ ] Fail

---

### TC-N-003: Missing Authorization Header

**Priority:** P0 (Critical)
**Type:** Negative - Security

**Test Steps:**
1. Відправити VoP Request без `Authorization: Bearer` header

**Expected Result:**
- HTTP 401 Unauthorized
- Error: "Missing or invalid authorization token"

**Status:** [ ] Pass [ ] Fail

---

### TC-N-004: Expired OAuth Token

**Priority:** P1 (High)
**Type:** Negative - Security

**Test Steps:**
1. Використати expired access token

**Expected Result:**
- HTTP 401 Unauthorized
- Error: "Token expired"

**Status:** [ ] Pass [ ] Fail

---

### TC-N-005: Invalid Client Certificate (mTLS)

**Priority:** P0 (Critical)
**Type:** Negative - Security

**Test Steps:**
1. Спробувати з'єднатися з неправильним client certificate

**Expected Result:**
- TLS handshake fails
- Connection refused

**Status:** [ ] Pass [ ] Fail

---

### TC-N-006: VoP Responder Timeout

**Priority:** P1 (High)
**Type:** Negative - Reliability

**Test Steps:**
1. Симулювати повільний Responder (затримка 5 сек)
2. VoP Router має timeout 3 сек

**Expected Result:**
- VoP Router timeout after 3 sec
- Return: `matchStatus: "ERROR"`, `reasonCode: "TCHA"`

**Status:** [ ] Pass [ ] Fail

---

### TC-N-007: Database Connection Lost

**Priority:** P1 (High)
**Type:** Negative - Reliability

**Test Steps:**
1. Симулювати втрату з'єднання з БД
2. Відправити VoP Request

**Expected Result:**
- `matchStatus: "ERROR"`
- `reasonCode: "TCHA"`
- Error logged, alert triggered

**Status:** [ ] Pass [ ] Fail

---

### TC-N-008: Rate Limit Exceeded

**Priority:** P1 (High)
**Type:** Negative - Security

**Test Steps:**
1. Відправити 200 запитів за 1 секунду (rate limit: 100 req/sec)

**Expected Result:**
- Перші 100 requests: успішні
- Наступні 100 requests: HTTP 429 Too Many Requests

**Status:** [ ] Pass [ ] Fail

---

## Security Test Cases

### TC-S-001: SQL Injection in Name Field

**Priority:** P0 (Critical)
**Type:** Security - Injection

**Test Steps:**
```json
{
  "payee": {
    "name": "'; DROP TABLE customers; --"
  }
}
```

**Expected Result:**
- Escaped properly, no SQL injection
- Database tables intact

**Status:** [ ] Pass [ ] Fail

---

### TC-S-002: XSS in Name Field

**Priority:** P1 (High)
**Type:** Security - XSS

**Test Steps:**
```json
{
  "payee": {
    "name": "<script>alert('XSS')</script>"
  }
}
```

**Expected Result:**
- HTML tags stripped або escaped
- No script execution in UI

**Status:** [ ] Pass [ ] Fail

---

### TC-S-003: Certificate Revocation Check

**Priority:** P0 (Critical)
**Type:** Security - PKI

**Test Steps:**
1. Revoke client certificate
2. Спробувати з'єднатися з revoked certificate

**Expected Result:**
- Connection refused
- Certificate revocation detected via CRL/OCSP

**Status:** [ ] Pass [ ] Fail

---

### TC-S-004: Request Tampering (Signature Verification)

**Priority:** P1 (High)
**Type:** Security - Integrity

**Test Steps:**
1. Відправити VoP Request
2. Змінити payload in-flight (MitM attack)

**Expected Result:**
- Signature mismatch detected
- Request rejected

**Status:** [ ] Pass [ ] Fail

---

### TC-S-005: GDPR - Data Retention

**Priority:** P1 (High)
**Type:** Security - Privacy

**Test Steps:**
1. Виконати VoP check
2. Через 91 день перевірити logs

**Expected Result:**
- Персональні дані видалені після 90 днів
- Тільки метадані (без імен/IBAN) залишаються

**Status:** [ ] Pass [ ] Fail

---

## User Acceptance Tests

### TC-UAT-001: Happy Path - Mobile Banking

**Priority:** P0 (Critical)
**Type:** UAT
**User:** Банківський клієнт

**Scenario:**
1. Клієнт відкриває мобільний додаток
2. Переходить до "Нова оплата"
3. Вводить IBAN отримувача
4. Вводить ім'я отримувача
5. Натискає "Перевірити реквізити"
6. Бачить ✅ "Реквізити підтверджені"
7. Вводить суму та підтверджує платіж

**Expected UX:**
- VoP check: < 2 секунди
- Зрозуміле повідомлення про результат
- Seamless UX (не відволікає від платежу)

**Status:** [ ] Pass [ ] Fail
**User Feedback:** [Notes]

---

### TC-UAT-002: Close Match Warning

**Priority:** P0 (Critical)
**Type:** UAT
**User:** Банківський клієнт

**Scenario:**
1. Клієнт вводить ім'я з опечаткою
2. VoP повертає CLOSE_MATCH
3. Клієнт бачить попередження:
   ```
   ⚠️ Можлива помилка в реквізитах

   Ви ввели: PETRANKO OLENA
   В банку зареєстровано: PETRENKO OLENA

   [Виправити] [Продовжити як є]
   ```

**Expected UX:**
- Чітке пояснення розбіжності
- Показати обидва варіанти імені
- Дати можливість виправити

**User Feedback:** [Did user understand the warning?]
**Status:** [ ] Pass [ ] Fail

---

### TC-UAT-003: No Match - Block Payment

**Priority:** P0 (Critical)
**Type:** UAT

**Scenario:**
1. Клієнт вводить повністю неправильне ім'я
2. VoP повертає NO_MATCH
3. Клієнт бачить:
   ```
   ❌ Реквізити не співпадають

   Ім'я не співпадає з даними банку-отримувача.
   Перевірте правильність IBAN та імені.
   ```

**Expected UX:**
- Зрозуміле повідомлення про помилку
- Заблокувати платіж (не дати продовжити)

**Status:** [ ] Pass [ ] Fail

---

### TC-UAT-004: VoP Unavailable - Graceful Degradation

**Priority:** P1 (High)
**Type:** UAT

**Scenario:**
1. VoP Router тимчасово недоступний
2. Клієнт намагається перевірити реквізити
3. Клієнт бачить:
   ```
   ⚠️ Перевірка тимчасово недоступна

   Ви можете:
   • Спробувати пізніше
   • Продовжити без перевірки (на свій ризик)
   ```

**Expected UX:**
- Не блокувати платіж повністю
- Дати опцію продовжити без VoP
- Clear warning про ризики

**Status:** [ ] Pass [ ] Fail

---

## Test Data

### Valid Test Accounts

```json
[
  {
    "iban": "UA213052990000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "identificationType": "RNOKPP",
    "identificationCode": "1234567890",
    "accountStatus": "ACTIVE",
    "accountType": "PERSONAL"
  },
  {
    "iban": "UA903004650000026001234567890",
    "name": "ПЕТРЕНКО ОЛЕНА ІВАНІВНА",
    "identificationType": "RNOKPP",
    "identificationCode": "2345678901",
    "accountStatus": "ACTIVE",
    "accountType": "PERSONAL"
  },
  {
    "iban": "UA123220010000026003000111222",
    "name": "ТОВ \"ПРИВАТБАНК\"",
    "identificationType": "EDRPOU",
    "identificationCode": "14360570",
    "accountStatus": "ACTIVE",
    "accountType": "BUSINESS"
  }
]
```

### Test Scenarios Matrix

| Scenario | Name in Request | Name in DB | Expected Match Status |
|----------|----------------|------------|-----------------------|
| Perfect match | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | MATCH (100) |
| Initials | ШЕВЧЕНКО Т.Г. | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | MATCH (100) |
| Typo | ШЕВЧЕНКО ТАРАС ГИГОРОВИЧ | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | CLOSE_MATCH (92) |
| Transliteration | PETRANKO OLENA | ПЕТРЕНКО ОЛЕНА | CLOSE_MATCH (87) |
| Wrong name | КОВАЛЕНКО ПЕТРО | ШЕВЧЕНКО ТАРАС | NO_MATCH (25) |
| Not found | Any name | (no account) | NO_MATCH (UNKN) |
| Closed account | Any name | (account closed) | NO_MATCH (ACLS) |

---

## Test Execution Checklist

### Pre-requisites
- [ ] Test environment ready (staging)
- [ ] Test data loaded
- [ ] Test accounts created
- [ ] Monitoring enabled
- [ ] Test tools configured

### Execution
- [ ] Functional tests (TC-F-001 to TC-F-010)
- [ ] Integration tests (TC-I-001 to TC-I-005)
- [ ] Edge cases (TC-E-001 to TC-E-008)
- [ ] Negative tests (TC-N-001 to TC-N-008)
- [ ] Security tests (TC-S-001 to TC-S-005)
- [ ] UAT (TC-UAT-001 to TC-UAT-004)

### Post-execution
- [ ] Test results documented
- [ ] Bugs filed in Jira
- [ ] Test report generated
- [ ] Sign-off from QA lead

---

## Test Report Template

```markdown
# VoP Test Execution Report

**Date:** 2026-02-XX
**Environment:** Staging
**Tester:** [Name]

## Summary
- Total test cases: 50
- Passed: XX
- Failed: XX
- Blocked: XX
- Pass rate: XX%

## Failed Tests
| Test ID | Description | Severity | Status |
|---------|-------------|----------|--------|
| TC-F-003 | Close match typo | P0 | Failed - score too low |

## Bugs Found
| Bug ID | Description | Severity | Status |
|--------|-------------|----------|--------|
| BUG-001 | Name matching fails for initials | Critical | Open |

## Recommendations
1. Fix critical bugs before production
2. Improve name matching algorithm
3. Add more edge case tests

**Sign-off:** [QA Lead] [Date]
```

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** After pilot testing
