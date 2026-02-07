# Технічна специфікація системи VoP для СЕП НБУ

## Зміст

1. [Технічний огляд](#технічний-огляд)
2. [Компоненти системи](#компоненти-системи)
3. [Протоколи та стандарти](#протоколи-та-стандарти)
4. [Форма

ти даних](#формати-даних)
5. [Name Matching Algorithm](#name-matching-algorithm)
6. [Безпека](#безпека)
7. [Performance](#performance)
8. [Error Handling](#error-handling)

## 1. Технічний огляд

### 1.1 Архітектурний стиль

- **RESTful API** — основний стиль взаємодії
- **Request-Response Pattern** — синхронна комунікація
- **Stateless** — кожен запит незалежний
- **Microservices** — децентралізована архітектура

### 1.2 Технологічний стек

**Backend:**
```
Language: Node.js / Java / Go / Python
Framework: Express / Spring Boot / Gin / Django
Database: PostgreSQL / MongoDB
Cache: Redis
Message Queue: RabbitMQ / Kafka (опційно)
```

**Security:**
```
TLS: 1.3
mTLS: Mutual TLS
OAuth 2.0: Financial-grade API (FAPI)
Certificates: QWAC (Qualified Web Authentication Certificates)
```

**Infrastructure:**
```
Container: Docker
Orchestration: Kubernetes
Service Mesh: Istio (для mTLS)
Load Balancer: NGINX / HAProxy
```

**Monitoring:**
```
Metrics: Prometheus + Grafana
Logging: ELK Stack (Elasticsearch, Logstash, Kibana)
Tracing: Jaeger / Zipkin
APM: New Relic / Datadog
```

## 2. Компоненти системи

### 2.1 VoP Directory Service

**Технічна специфікація:**

```yaml
Component: VoP Directory Service
Purpose: Централізований реєстр учасників
Technology:
  - Database: PostgreSQL 15+
  - Cache: Redis 7+
  - API: REST (JSON)
Deployment:
  - Environment: Kubernetes
  - Replicas: 3 (High Availability)
  - Resources:
      - CPU: 2 cores
      - Memory: 4 GB
      - Storage: 100 GB SSD
```

**Database Schema:**

```sql
CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    nbu_id VARCHAR(10) UNIQUE NOT NULL,
    bic VARCHAR(11) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    vop_responder_url VARCHAR(255) NOT NULL,
    certificate_fingerprint VARCHAR(64),
    max_response_time_ms INTEGER DEFAULT 1000,
    supported_account_types TEXT[] DEFAULT ARRAY['PERSONAL', 'BUSINESS'],
    registered_date TIMESTAMP NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_nbu_id CHECK (nbu_id ~ '^\d{6}$'),
    CONSTRAINT valid_bic CHECK (bic ~ '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$')
);

CREATE INDEX idx_participants_bic ON participants(bic);
CREATE INDEX idx_participants_nbu_id ON participants(nbu_id);
CREATE INDEX idx_participants_status ON participants(status);

CREATE TABLE participant_bank_codes (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER REFERENCES participants(id),
    bank_code VARCHAR(6) NOT NULL,
    UNIQUE(bank_code),
    CONSTRAINT valid_bank_code CHECK (bank_code ~ '^\d{6}$')
);

CREATE INDEX idx_bank_codes_code ON participant_bank_codes(bank_code);
```

**API Endpoints:**

```
GET  /directory/v1/participants          - Список всіх учасників
GET  /directory/v1/participants/{id}     - Деталі учасника
GET  /directory/v1/lookup/{iban}         - Пошук банку за IBAN
POST /directory/v1/participants          - Реєстрація учасника (admin)
PUT  /directory/v1/participants/{id}     - Оновлення учасника (admin)
```

**Приклад lookup за IBAN:**

```http
GET /directory/v1/lookup/UA213223130000026007233566001
Authorization: Bearer {token}

Response:
{
  "iban": "UA213223130000026007233566001",
  "bankCode": "322313",
  "participant": {
    "nbuId": "305299",
    "bic": "PRYBUA2XXXX",
    "name": "ПриватБанк",
    "vopResponderUrl": "https://api.privatbank.ua/vop/v1/verify",
    "status": "ACTIVE"
  }
}
```

### 2.2 VoP Router

**Технічна специфікація:**

```yaml
Component: VoP Router
Purpose: Маршрутизація VoP запитів
Technology:
  - Language: Node.js / Go
  - Framework: Express / Gin
  - Cache: Redis
  - API Gateway: Kong
Deployment:
  - Environment: Kubernetes
  - Replicas: 5 (Auto-scaling)
  - Resources:
      - CPU: 4 cores
      - Memory: 8 GB
Performance:
  - Throughput: 1000+ req/sec
  - Latency: < 100 ms (router overhead)
  - Timeout: 3 sec (per request)
```

**Алгоритм маршрутизації:**

```python
def route_vop_request(request):
    # 1. Parse IBAN
    iban = request.payee.iban
    if not validate_iban(iban):
        return error_response("INVALID_IBAN")

    # 2. Extract bank code (символи 5-10)
    bank_code = iban[4:10]  # UA21 322313 0000026007233566001

    # 3. Lookup в Directory (з кешуванням)
    cache_key = f"bank_code:{bank_code}"
    participant = redis.get(cache_key)

    if not participant:
        participant = directory_service.lookup(bank_code)
        if participant:
            redis.setex(cache_key, 3600, participant)  # TTL: 1 hour

    if not participant:
        return error_response("BANK_NOT_FOUND")

    if participant.status != "ACTIVE":
        return error_response("BANK_INACTIVE")

    # 4. Forward request до Responder
    try:
        response = http_client.post(
            url=participant.vop_responder_url,
            json=request,
            timeout=3.0,
            headers={
                "Authorization": f"Bearer {get_access_token()}",
                "X-Request-ID": request.request_id
            }
        )
        return response
    except TimeoutError:
        return error_response("TIMEOUT")
    except Exception as e:
        log.error(f"Error routing request: {e}")
        return error_response("TECHNICAL_ERROR")
```

**Monitoring Metrics:**

```yaml
Metrics:
  - vop_requests_total (counter) - Загальна кількість запитів
  - vop_requests_duration_seconds (histogram) - Час обробки
  - vop_requests_by_status (counter) - Кількість за статусом
  - vop_errors_total (counter) - Кількість помилок
  - vop_timeout_total (counter) - Кількість timeouts
  - vop_directory_cache_hit_rate (gauge) - Cache hit rate
```

### 2.3 VoP Requester API

**Технічна специфікація:**

```yaml
Component: VoP Requester API
Purpose: API банку-відправника
Owner: Кожен банк реалізує самостійно
Technology: Залежить від банку
Integration Point: VoP Router API
```

**Інтеграційний flow:**

```javascript
// Приклад реалізації на Node.js
const axios = require('axios');

class VoPRequester {
    constructor(config) {
        this.routerUrl = config.routerUrl;
        this.accessToken = null;
    }

    async checkPayee(payeeData) {
        // 1. Формування VoP Request
        const request = {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
            requester: {
                bic: this.config.bic,
                nbuId: this.config.nbuId
            },
            payee: {
                iban: payeeData.iban,
                name: payeeData.name,
                identificationType: payeeData.identificationType,
                identificationCode: payeeData.identificationCode
            },
            accountType: payeeData.accountType,
            paymentType: payeeData.paymentType
        };

        // 2. Виклик Router API
        try {
            const response = await axios.post(
                `${this.routerUrl}/vop/v1/verify`,
                request,
                {
                    headers: {
                        'Authorization': `Bearer ${await this.getAccessToken()}`,
                        'Content-Type': 'application/json',
                        'X-Request-ID': request.requestId
                    },
                    timeout: 3000
                }
            );

            // 3. Логування
            await this.logVoPRequest(request, response.data);

            return response.data;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                return this.timeoutResponse(request.requestId);
            }
            throw error;
        }
    }

    timeoutResponse(requestId) {
        return {
            requestId: requestId,
            timestamp: new Date().toISOString(),
            result: {
                matchStatus: 'ERROR',
                reasonCode: 'TCHA',
                reasonDescription: 'Timeout'
            }
        };
    }
}
```

### 2.4 VoP Responder API

**Технічна специфікація:**

```yaml
Component: VoP Responder API
Purpose: API банку-отримувача
Owner: Кожен банк реалізує самостійно
Technology: Залежить від банку
Endpoints:
  - POST /vop/v1/verify - Обробка VoP запиту
Performance:
  - Response time: < 500 ms
  - Max response time: 1000 ms
```

**Алгоритм обробки:**

```python
class VoPResponder:
    def verify(self, request):
        # 1. Валідація запиту
        if not self.validate_request(request):
            return self.error_response("INVALID_REQUEST")

        # 2. Пошук клієнта за IBAN
        iban = request['payee']['iban']
        account = self.db.find_account_by_iban(iban)

        if not account:
            return self.no_match_response("Account not found")

        # 3. Перевірка статусу рахунку
        account_status = self.get_account_status(account)

        # 4. Перевірка opt-out
        if account.vop_opted_out:
            return self.not_supported_response("OPTO")

        # 5. Name matching
        request_name = request['payee']['name']
        account_name = account.client_name

        match_result = self.name_matcher.match(request_name, account_name)

        # 6. Формування відповіді
        return {
            "requestId": request['requestId'],
            "timestamp": datetime.now().isoformat(),
            "responder": {
                "bic": self.config['bic'],
                "nbuId": self.config['nbuId']
            },
            "result": {
                "matchStatus": match_result['status'],
                "matchScore": match_result['score'],
                "reasonCode": match_result['reason_code'],
                "reasonDescription": match_result['description'],
                "verifiedName": account_name,
                "accountStatus": account_status
            },
            "processingTime": self.calculate_processing_time()
        }
```

## 3. Протоколи та стандарти

### 3.1 HTTP/HTTPS

- **HTTP Version:** HTTP/2 (preferred) або HTTP/1.1
- **TLS Version:** TLS 1.3 (мінімум TLS 1.2)
- **Cipher Suites:** AES-256-GCM, ChaCha20-Poly1305

### 3.2 RESTful API Principles

- **Stateless** — кожен запит незалежний
- **Content-Type:** `application/json`
- **HTTP Methods:** POST (для VoP requests)
- **Status Codes:**
  - `200 OK` — успішна перевірка (всі matchStatus)
  - `400 Bad Request` — невалідний запит
  - `401 Unauthorized` — невалідна автентифікація
  - `403 Forbidden` — відсутні права доступу
  - `404 Not Found` — endpoint не знайдено
  - `429 Too Many Requests` — rate limit exceeded
  - `500 Internal Server Error` — помилка сервера
  - `503 Service Unavailable` — сервіс недоступний
  - `504 Gateway Timeout` — timeout

### 3.3 ISO 20022 Compatibility

VoP використовує JSON замість XML, але сумісний з ISO 20022:

**Mapping ISO 20022 ↔ VoP:**

| ISO 20022 Element | VoP JSON Field |
|-------------------|----------------|
| `MsgId` | `requestId` |
| `CreDtTm` | `timestamp` |
| `Cdtr` (Creditor) | `payee` |
| `CdtrAcct.Id.IBAN` | `payee.iban` |
| `Cdtr.Nm` | `payee.name` |
| `Cdtr.Id` | `payee.identificationType` + `identificationCode` |
| `InstgAgt` (Instructing Agent) | `requester` |
| `InstdAgt` (Instructed Agent) | `responder` |

**Опційно:** можна використовувати ISO 20022 XML (acmt.023/acmt.024):

```xml
<!-- acmt.023 - IdentificationVerificationRequest -->
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:acmt.023.001.03">
  <IdVrfctnReq>
    <Assgnmt>
      <MsgId>550e8400-e29b-41d4-a716-446655440000</MsgId>
      <CreDtTm>2026-02-06T14:30:00Z</CreDtTm>
    </Assgnmt>
    <Vrfctn>
      <Id>
        <IBAN>UA213223130000026007233566001</IBAN>
      </Id>
      <Nm>ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ</Nm>
    </Vrfctn>
  </IdVrfctnReq>
</Document>
```

### 3.4 IBAN Standard (ISO 13616)

**Український IBAN формат:**

```
UA + 2 check digits + 6 bank code + 19 account number = 29 symbols

Приклад: UA21 322313 0000026007233566001

UA        - Код країни (Ukraine)
21        - Контрольні цифри (checksum)
322313    - Код банку (6 цифр)
0000026007233566001 - Номер рахунку (19 символів)
```

**Валідація IBAN:**

```python
def validate_iban(iban):
    # 1. Видалити пробіли
    iban = iban.replace(' ', '').upper()

    # 2. Перевірити довжину
    if len(iban) != 29:
        return False

    # 3. Перевірити код країни
    if not iban.startswith('UA'):
        return False

    # 4. Перевірити checksum (mod 97)
    # Перемістити перші 4 символи в кінець
    rearranged = iban[4:] + iban[:4]

    # Замінити літери на цифри (A=10, B=11, ..., Z=35)
    numeric = ''.join(str(ord(c) - ord('A') + 10) if c.isalpha() else c for c in rearranged)

    # Перевірити mod 97 == 1
    return int(numeric) % 97 == 1
```

## 4. Формати даних

### 4.1 VoP Request Format

```typescript
interface VoPRequest {
  requestId: string;           // UUID v4
  timestamp: string;           // ISO 8601
  requester: {
    bic: string;               // ISO 9362 (11 chars)
    nbuId: string;             // 6 digits
  };
  payee: {
    iban: string;              // 29 chars (UA + 27)
    name: string;              // Max 140 chars
    identificationType: 'EDRPOU' | 'PASSPORT' | 'RNOKPP';
    identificationCode: string;  // 10 digits (EDRPOU/RNOKPP) або passport
  };
  accountType: 'PERSONAL' | 'BUSINESS';
  paymentType: 'INSTANT' | 'REGULAR';
}
```

**JSON Schema:**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["requestId", "timestamp", "requester", "payee"],
  "properties": {
    "requestId": {
      "type": "string",
      "format": "uuid",
      "description": "Unique request identifier (UUID v4)"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "Request timestamp (ISO 8601)"
    },
    "requester": {
      "type": "object",
      "required": ["bic", "nbuId"],
      "properties": {
        "bic": {
          "type": "string",
          "pattern": "^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$",
          "description": "Bank Identifier Code (ISO 9362)"
        },
        "nbuId": {
          "type": "string",
          "pattern": "^\\d{6}$",
          "description": "NBU participant ID (6 digits)"
        }
      }
    },
    "payee": {
      "type": "object",
      "required": ["iban", "name"],
      "properties": {
        "iban": {
          "type": "string",
          "pattern": "^UA\\d{27}$",
          "description": "Ukrainian IBAN (29 chars)"
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 140,
          "description": "Payee name"
        },
        "identificationType": {
          "type": "string",
          "enum": ["EDRPOU", "PASSPORT", "RNOKPP"]
        },
        "identificationCode": {
          "type": "string",
          "minLength": 8,
          "maxLength": 20
        }
      }
    },
    "accountType": {
      "type": "string",
      "enum": ["PERSONAL", "BUSINESS"]
    },
    "paymentType": {
      "type": "string",
      "enum": ["INSTANT", "REGULAR"]
    }
  }
}
```

### 4.2 VoP Response Format

```typescript
interface VoPResponse {
  requestId: string;
  timestamp: string;
  responder: {
    bic: string;
    nbuId: string;
  };
  result: {
    matchStatus: 'MATCH' | 'NO_MATCH' | 'CLOSE_MATCH' | 'NOT_SUPPORTED' | 'ERROR';
    matchScore: number;        // 0-100
    reasonCode: string;        // ANNM, MBAM, ACNS, OPTO, etc.
    reasonDescription: string;
    verifiedName?: string;     // Ім'я з БД банку-отримувача
    accountStatus?: 'ACTIVE' | 'CLOSED' | 'BLOCKED';
  };
  processingTime: number;      // Milliseconds
}
```

## 5. Name Matching Algorithm

### 5.1 Алгоритми

**Levenshtein Distance:**

```python
def levenshtein_distance(s1, s2):
    """
    Обчислює Levenshtein distance між двома строками.
    Повертає кількість операцій (insert, delete, substitute) для перетворення s1 в s2.
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]

def levenshtein_similarity(s1, s2):
    """
    Конвертує distance в similarity score (0-100%).
    """
    distance = levenshtein_distance(s1, s2)
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 100.0
    return (1 - distance / max_len) * 100
```

**Jaro-Winkler Distance:**

```python
def jaro_winkler_similarity(s1, s2):
    """
    Обчислює Jaro-Winkler similarity (0-100%).
    Більш толерантний до помилок на початку строки.
    """
    # Jaro similarity
    def jaro_similarity(s1, s2):
        if len(s1) == 0 and len(s2) == 0:
            return 1.0
        if len(s1) == 0 or len(s2) == 0:
            return 0.0

        match_distance = max(len(s1), len(s2)) // 2 - 1
        s1_matches = [False] * len(s1)
        s2_matches = [False] * len(s2)

        matches = 0
        transpositions = 0

        for i in range(len(s1)):
            start = max(0, i - match_distance)
            end = min(i + match_distance + 1, len(s2))
            for j in range(start, end):
                if s2_matches[j] or s1[i] != s2[j]:
                    continue
                s1_matches[i] = True
                s2_matches[j] = True
                matches += 1
                break

        if matches == 0:
            return 0.0

        k = 0
        for i in range(len(s1)):
            if not s1_matches[i]:
                continue
            while not s2_matches[k]:
                k += 1
            if s1[i] != s2[k]:
                transpositions += 1
            k += 1

        return (matches / len(s1) + matches / len(s2) +
                (matches - transpositions / 2) / matches) / 3

    jaro = jaro_similarity(s1, s2)

    # Winkler modification (prefix bonus)
    prefix_len = 0
    for i in range(min(len(s1), len(s2), 4)):
        if s1[i] == s2[i]:
            prefix_len += 1
        else:
            break

    return (jaro + prefix_len * 0.1 * (1 - jaro)) * 100
```

### 5.2 Нормалізація імен

```python
class NameNormalizer:
    def normalize(self, name):
        """
        Нормалізує ім'я перед matching.
        """
        # 1. Lowercase
        name = name.lower()

        # 2. Remove extra spaces
        name = ' '.join(name.split())

        # 3. Remove punctuation (крім дефіса)
        import string
        name = ''.join(c for c in name if c.isalnum() or c.isspace() or c == '-')

        # 4. Транслітерація (якщо потрібно)
        # name = self.transliterate(name)

        return name.strip()

    def transliterate_ua_to_en(self, text):
        """
        Транслітерація української мови в латиницю (ДСТУ 9112:2021).
        """
        translit_map = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g',
            'д': 'd', 'е': 'e', 'є': 'ie', 'ж': 'zh', 'з': 'z',
            'и': 'y', 'і': 'i', 'ї': 'i', 'й': 'i', 'к': 'k',
            'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
            'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
            'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
            'ь': '', 'ю': 'iu', 'я': 'ia'
        }
        result = []
        for char in text.lower():
            result.append(translit_map.get(char, char))
        return ''.join(result)
```

### 5.3 Обробка ініціалів

```python
def expand_initials(name):
    """
    Розширює ініціали до повного імені (якщо можливо).

    Приклад:
    "ШЕВЧЕНКО Т.Г." → ["ШЕВЧЕНКО Т Г", "ШЕВЧЕНКО"]
    """
    import re

    # Видалити крапки після ініціалів
    name = re.sub(r'(\b[А-ЯA-Z])\.',  r'\1', name)

    # Розділити на токени
    tokens = name.split()

    # Видалити одиночні літери (ініціали)
    full_name_parts = [t for t in tokens if len(t) > 1]

    return ' '.join(full_name_parts)
```

### 5.4 Fuzzy Matching Pipeline

```python
class NameMatcher:
    def __init__(self):
        self.normalizer = NameNormalizer()

    def match(self, name1, name2):
        """
        Основний метод для matching імен.
        Повертає: {status, score, reason_code, description}
        """
        # 1. Нормалізація
        norm1 = self.normalizer.normalize(name1)
        norm2 = self.normalizer.normalize(name2)

        # 2. Exact match (після нормалізації)
        if norm1 == norm2:
            return {
                'status': 'MATCH',
                'score': 100,
                'reason_code': 'ANNM',
                'description': 'Account name match'
            }

        # 3. Обробка ініціалів
        expanded1 = expand_initials(norm1)
        expanded2 = expand_initials(norm2)

        if expanded1 == expanded2 and expanded1:
            return {
                'status': 'MATCH',
                'score': 98,
                'reason_code': 'ANNM',
                'description': 'Account name match (initials expanded)'
            }

        # 4. Fuzzy matching
        lev_score = levenshtein_similarity(norm1, norm2)
        jw_score = jaro_winkler_similarity(norm1, norm2)

        # Використовуємо максимальний score
        score = max(lev_score, jw_score)

        # 5. Визначення статусу
        if score >= 95:
            return {
                'status': 'MATCH',
                'score': round(score, 2),
                'reason_code': 'ANNM',
                'description': 'Account name match'
            }
        elif score >= 75:
            return {
                'status': 'CLOSE_MATCH',
                'score': round(score, 2),
                'reason_code': 'MBAM',
                'description': 'May be a match'
            }
        else:
            return {
                'status': 'NO_MATCH',
                'score': round(score, 2),
                'reason_code': 'ANNM',
                'description': 'Account name no match'
            }
```

### 5.5 Threshold Configuration

```yaml
Name Matching Thresholds:
  MATCH:
    - score >= 95%
    - Exact match after normalization
    - Initials expanded match

  CLOSE_MATCH:
    - 75% <= score < 95%
    - Minor spelling differences
    - Missing middle name
    - Transliteration variations

  NO_MATCH:
    - score < 75%
    - Completely different names

Tunable Parameters:
  - match_threshold: 95  (default)
  - close_match_threshold: 75  (default)
  - use_levenshtein: true
  - use_jaro_winkler: true
  - use_soundex: false  (для майбутньої реалізації)
```

## 6. Безпека

### 6.1 mTLS (Mutual TLS)

**Конфігурація mTLS:**

```yaml
TLS Configuration:
  version: TLS 1.3
  cipher_suites:
    - TLS_AES_256_GCM_SHA384
    - TLS_CHACHA20_POLY1305_SHA256
    - TLS_AES_128_GCM_SHA256

  client_auth: required
  verify_client_cert: true

  certificates:
    server_cert: /etc/ssl/certs/vop-router.crt
    server_key: /etc/ssl/private/vop-router.key
    ca_cert: /etc/ssl/certs/nbu-ca.crt
    client_cert_whitelist: /etc/ssl/certs/allowed-participants.pem
```

**Приклад конфігурації NGINX:**

```nginx
server {
    listen 443 ssl http2;
    server_name vop-router.nbu.gov.ua;

    # TLS 1.3
    ssl_protocols TLSv1.3;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256';
    ssl_prefer_server_ciphers on;

    # Server certificate
    ssl_certificate /etc/ssl/certs/vop-router.crt;
    ssl_certificate_key /etc/ssl/private/vop-router.key;

    # Client certificate (mTLS)
    ssl_client_certificate /etc/ssl/certs/nbu-ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location /vop/v1/ {
        proxy_pass http://vop-router-backend;
        proxy_set_header X-Client-Certificate $ssl_client_cert;
        proxy_set_header X-Client-Verify $ssl_client_verify;
    }
}
```

### 6.2 OAuth 2.0 + FAPI

**Authorization Flow:**

```
1. Bank отримує client_credentials від NBU Authorization Server
2. Bank викликає /oauth/token для отримання access_token
3. Access token додається до VoP Request: Authorization: Bearer {token}
4. Router валідує token (JWT signature, expiration, scopes)
5. Якщо валідний → процес продовжується
```

**Token Format (JWT):**

```json
{
  "iss": "https://auth.nbu.gov.ua",
  "sub": "305299",
  "aud": "https://vop-router.nbu.gov.ua",
  "exp": 1707228000,
  "iat": 1707224400,
  "scope": "vop:request vop:respond",
  "bic": "PRYBUA2XXXX",
  "nbu_id": "305299"
}
```

### 6.3 Rate Limiting

```yaml
Rate Limits:
  per_bank:
    - 100 requests/second (normal)
    - 500 requests/second (burst)

  per_ip:
    - 10 requests/second

  global:
    - 5000 requests/second

Response on rate limit exceeded:
  status_code: 429
  body:
    error: "rate_limit_exceeded"
    retry_after: 60  # seconds
```

### 6.4 Audit Logging

**Log Format:**

```json
{
  "timestamp": "2026-02-06T14:30:00.123Z",
  "event_type": "vop_request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "requester": {
    "bic": "NBUBUBU1XXX",
    "nbu_id": "300001",
    "ip_address": "10.0.1.5"
  },
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbu_id": "305299"
  },
  "payee": {
    "iban_masked": "UA21********66001",
    "name_hash": "sha256:abc123..."
  },
  "result": {
    "match_status": "MATCH",
    "match_score": 100
  },
  "performance": {
    "router_latency_ms": 50,
    "responder_latency_ms": 300,
    "total_latency_ms": 850
  }
}
```

## 7. Performance

### 7.1 Performance Targets

| Component | Metric | Target | Maximum |
|-----------|--------|--------|---------|
| VoP Router | Latency | < 100 ms | 200 ms |
| Directory Lookup | Latency | < 50 ms | 100 ms |
| Responder API | Latency | < 500 ms | 1000 ms |
| End-to-End | Latency | < 800 ms | 3000 ms |
| Router | Throughput | 1000 req/sec | - |

### 7.2 Caching Strategy

**Directory Service Cache:**

```yaml
Cache: Redis
TTL: 3600 seconds (1 hour)
Keys:
  - "bank_code:{code}" → participant metadata
  - "iban:{iban}" → participant ID
Invalidation: On participant update
```

**Responder Cache (опційно):**

```yaml
Cache: Redis
TTL: 300 seconds (5 minutes)
Keys:
  - "vop:{hash(iban+name)}" → match result
Notes: Кешувати тільки MATCH results
```

### 7.3 Database Optimization

**Indexes:**

```sql
-- Directory Service
CREATE INDEX idx_bank_codes_code ON participant_bank_codes(bank_code);
CREATE INDEX idx_participants_status ON participants(status);

-- Responder (банк)
CREATE INDEX idx_accounts_iban ON accounts(iban);
CREATE INDEX idx_accounts_client_id ON accounts(client_id);
CREATE INDEX idx_clients_name ON clients USING gin(to_tsvector('ukrainian', name));
```

### 7.4 Load Testing Scenarios

```yaml
Scenario 1: Normal Load
  - Duration: 1 hour
  - RPS: 100
  - Expected P99 latency: < 1000 ms

Scenario 2: Peak Load
  - Duration: 15 minutes
  - RPS: 500
  - Expected P99 latency: < 2000 ms

Scenario 3: Spike Test
  - Duration: 5 minutes
  - RPS: 0 → 1000 → 0
  - Expected P99 latency: < 3000 ms

Scenario 4: Endurance Test
  - Duration: 24 hours
  - RPS: 100
  - Monitor: Memory leaks, degradation
```

## 8. Error Handling

### 8.1 Error Response Format

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01Z",
  "error": {
    "code": "TECHNICAL_ERROR",
    "message": "Service temporarily unavailable",
    "details": "Database connection timeout",
    "retryable": true
  }
}
```

### 8.2 Error Codes

| Code | HTTP Status | Опис | Retryable |
|------|-------------|------|-----------|
| `INVALID_REQUEST` | 400 | Невалідний запит | No |
| `INVALID_IBAN` | 400 | Невалідний IBAN | No |
| `UNAUTHORIZED` | 401 | Невалідна автентифікація | No |
| `FORBIDDEN` | 403 | Недостатньо прав | No |
| `BANK_NOT_FOUND` | 404 | Банк не знайдено в Directory | No |
| `RATE_LIMIT_EXCEEDED` | 429 | Перевищено ліміт запитів | Yes |
| `TECHNICAL_ERROR` | 500 | Технічна помилка | Yes |
| `SERVICE_UNAVAILABLE` | 503 | Сервіс недоступний | Yes |
| `TIMEOUT` | 504 | Timeout | Yes |

### 8.3 Retry Strategy

```python
class RetryStrategy:
    def __init__(self):
        self.max_retries = 1
        self.backoff_ms = 500

    def should_retry(self, error_code):
        """
        Визначає, чи потрібно робити retry.
        """
        retryable_codes = [
            'TIMEOUT',
            'SERVICE_UNAVAILABLE',
            'TECHNICAL_ERROR'
        ]
        return error_code in retryable_codes

    async def execute_with_retry(self, func):
        """
        Виконує функцію з retry logic.
        """
        for attempt in range(self.max_retries + 1):
            try:
                return await func()
            except Exception as e:
                if attempt >= self.max_retries or not self.should_retry(e.code):
                    raise
                await asyncio.sleep(self.backoff_ms / 1000)
```

## 9. Висновки

Технічна специфікація VoP для СЕП НБУ забезпечує:

✅ **RESTful API** з JSON payload
✅ **ISO 20022 compatibility** через mapping
✅ **Fuzzy name matching** з Levenshtein та Jaro-Winkler
✅ **mTLS + OAuth 2.0** для безпеки
✅ **< 1 сек латентність** для миттєвих переказів
✅ **99.9% uptime** через HA та caching
✅ **Comprehensive error handling** з retry logic

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
