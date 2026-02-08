# VoP Training Guide
## Навчальний посібник з інтеграції Verification of Payee

**Версія:** 1.0
**Дата:** 2026-02-07
**Аудиторія:** Розробники банків, DevOps інженери, архітектори

---

## Зміст

1. [Вступ](#вступ)
2. [Передумови](#передумови)
3. [Архітектура та компоненти](#архітектура-та-компоненти)
4. [Підготовка до інтеграції](#підготовка-до-інтеграції)
5. [Інтеграція Requester](#інтеграція-requester)
6. [Інтеграція Responder](#інтеграція-responder)
7. [Тестування](#тестування)
8. [Запуск у Production](#запуск-у-production)
9. [Troubleshooting](#troubleshooting)
10. [Практичні вправи](#практичні-вправи)

---

## 1. Вступ

### 1.1 Що таке VoP?

**Verification of Payee (VoP)** — це система перевірки відповідності імені отримувача платежу з власником рахунку ПЕРЕД відправкою грошей.

**Мета:** Захист від шахрайства та помилок при переказах.

**Як працює:**
```
1. Клієнт вводить IBAN + ім'я отримувача
   ↓
2. Банк A (Requester) → VoP Router → Банк B (Responder)
   ↓
3. Банк B перевіряє ім'я у своїй БД
   ↓
4. Результат: MATCH / CLOSE_MATCH / NO_MATCH
   ↓
5. Клієнт бачить результат і приймає рішення
```

### 1.2 Переваги

**Для клієнтів:**
- ✅ Захист від phishing та шахрайства
- ✅ Впевненість у платежах
- ✅ Виявлення помилок до відправки грошей

**Для банків:**
- ✅ Зниження шахрайства на 30-40%
- ✅ Менше скарг клієнтів
- ✅ Комплаєнс з EU стандартами
- ✅ Конкурентна перевага

**Для НБУ:**
- ✅ Безпека платіжної системи
- ✅ Довіра до СЕП
- ✅ Міжнародна інтеграція

### 1.3 Ролі учасників

**VoP Router (НБУ):**
- Центральна точка маршрутизації
- Directory Service (IBAN → BIC)
- Моніторинг та логування

**VoP Requester (Банк-ініціатор):**
- Відправляє запити на перевірку
- Отримує результат від Router
- Показує результат клієнту

**VoP Responder (Банк-отримувач):**
- Отримує запити від Router
- Перевіряє ім'я у своїй CBS
- Повертає результат

---

## 2. Передумови

### 2.1 Технічні вимоги

**Мінімальні вимоги:**

| Компонент | Вимога |
|-----------|--------|
| **Runtime** | Node.js 20+ або Java 17+ або Python 3.11+ |
| **Memory** | 2 GB RAM (мінімум) |
| **CPU** | 2 cores |
| **Network** | HTTPS (TLS 1.2+), порт 443 |
| **Сертифікати** | АЦСЬК сертифікати для mTLS |

**Рекомендовані вимоги (Production):**

| Компонент | Рекомендація |
|-----------|--------------|
| **Servers** | 2+ для HA (Load Balancer) |
| **Memory** | 4-8 GB RAM per server |
| **CPU** | 4-8 cores per server |
| **Database** | PostgreSQL 15+ або MySQL 8+ |
| **Monitoring** | Prometheus + Grafana |

### 2.2 Організаційні вимоги

**Команда:**
- 2-3 Backend Developers (Node.js/Java/Python)
- 1 DevOps Engineer (Kubernetes, Docker)
- 1 Security Engineer (mTLS, OAuth)
- 1 QA Engineer (testing, automation)

**Timeline:**
- Фаза 1: Підготовка (2 тижні)
- Фаза 2: Розробка (4-6 тижнів)
- Фаза 3: Тестування (2-3 тижні)
- Фаза 4: Production (1 тиждень)

**Бюджет:**
- Infrastructure: $20,000-50,000 (один раз)
- Operations: $1,000/місяць

### 2.3 Знання

**Необхідні знання:**
- REST API design
- HTTPS / TLS / mTLS
- OAuth 2.0 / JWT
- JSON Schema validation
- Error handling
- Logging and monitoring

**Бажані знання:**
- ISO 20022 (якщо використовуєте XML)
- Name matching algorithms (Levenshtein, Jaro-Winkler)
- Kubernetes / Docker
- Financial messaging standards

---

## 3. Архітектура та компоненти

### 3.1 High-Level архітектура

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Banking App                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │  UI: IBAN input + Name input + [Verify] button   │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ HTTP POST /verify
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Bank A (VoP Requester)                     │
│  ┌───────────────────────────────────────────────────┐ │
│  │  VoP Requester Service                            │ │
│  │  - Validate input                                 │ │
│  │  - Add OAuth token                                │ │
│  │  - Send request to Router                         │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ mTLS + OAuth
                           │ POST /v1/verify
                           ▼
┌─────────────────────────────────────────────────────────┐
│              VoP Router (НБУ)                           │
│  ┌───────────────────────────────────────────────────┐ │
│  │  1. Authenticate (mTLS + OAuth)                   │ │
│  │  2. Directory lookup (IBAN → BIC)                 │ │
│  │  3. Route to Responder                            │ │
│  │  4. Log request/response                          │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ mTLS
                           │ POST /vop/verify
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Bank B (VoP Responder)                     │
│  ┌───────────────────────────────────────────────────┐ │
│  │  VoP Responder Service                            │ │
│  │  1. Find account by IBAN                          │ │
│  │  2. Get account holder name from CBS              │ │
│  │  3. Match names (Levenshtein/Jaro-Winkler)        │ │
│  │  4. Return result                                 │ │
│  └───────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ Response
                           ▼
                      VoP Router
                           │
                           │ Response
                           ▼
                    VoP Requester
                           │
                           │ Display to user
                           ▼
                  Mobile Banking App
```

### 3.2 Компоненти

**1. VoP Requester (у вашому банку):**
- **Мова:** Node.js, Java, Python, або .NET
- **Функції:**
  - Валідація вхідних даних
  - OAuth token management
  - HTTP client для Router
  - Error handling
  - Response caching (опціонально)

**2. VoP Responder (у вашому банку):**
- **Мова:** Node.js, Java, Python, або .NET
- **Функції:**
  - HTTP server з mTLS
  - Інтеграція з CBS
  - Name matching engine
  - Response formatting
  - Audit logging

**3. VoP Router (НБУ):**
- Ви НЕ розробляєте Router
- НБУ надає endpoint: `https://vop.bank.gov.ua`
- Документація: API Reference

### 3.3 Потік даних

**Запит (Request):**
```json
{
  "requestId": "REQ-2026-001",
  "requester": {
    "bic": "NBUA",
    "name": "Ваш Банк"
  },
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "accountType": "PERSONAL"
  },
  "additionalInfo": {
    "amount": 5000.00,
    "currency": "UAH"
  },
  "timestamp": "2026-02-07T10:30:00Z"
}
```

**Відповідь (Response):**
```json
{
  "requestId": "REQ-2026-001",
  "matchStatus": "MATCH",
  "matchScore": 100.0,
  "verifiedAccount": {
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    "accountType": "PERSONAL",
    "accountStatus": "ACTIVE"
  },
  "reasonCode": "ANNM",
  "timestamp": "2026-02-07T10:30:00.450Z"
}
```

**Match Status:**
- `MATCH` — Ім'я співпадає (≥95%)
- `CLOSE_MATCH` — Часткове співпадіння (75-94%)
- `NO_MATCH` — Ім'я не співпадає (<75%)
- `NOT_SUPPORTED` — Перевірка не підтримується
- `ERROR` — Помилка

---

## 4. Підготовка до інтеграції

### 4.1 Реєстрація у VoP

**Крок 1: Подати заявку**

Email: `vop-pilot@bank.gov.ua`

```
Subject: Заявка на підключення до VoP Pilot

Банк: [Назва банку]
БІК: [BIC код]
Контакт: [Ім'я, email, телефон]
Tech Lead: [Ім'я, email]

Планована дата інтеграції: [дата]
Очікуваний обсяг запитів: [XXX req/day]
```

**Крок 2: Отримати сертифікати**

НБУ надасть:
- `client.crt` — ваш клієнтський сертифікат (для Requester)
- `client.key` — приватний ключ
- `ca.crt` — сертифікат АЦСЬК (Certificate Authority)
- `server.crt` — серверний сертифікат (для Responder)
- `server.key` — приватний ключ

**Зберігайте ключі в безпеці!**
- НЕ комітьте в git
- Використовуйте secrets management (HashiCorp Vault, AWS Secrets Manager)
- Обмежте доступ (chmod 600)

**Крок 3: Отримати OAuth credentials**

НБУ надасть:
- `client_id`: ваш BIC код
- `client_secret`: секретний ключ
- OAuth token endpoint: `https://vop.bank.gov.ua/oauth/token`

**Крок 4: Налаштувати Responder endpoint**

Надайте НБУ:
- Endpoint URL: `https://api.yourbank.com/vop/verify`
- BIC код
- Rate limit: XXX req/s

НБУ додасть ваш банк до Directory Service.

### 4.2 Environment setup

**Test Environment (Sandbox):**
- Router: `https://vop-test.bank.gov.ua`
- OAuth: `https://vop-test.bank.gov.ua/oauth/token`
- Dashboard: `https://vop-test.bank.gov.ua/dashboard`

**Production Environment:**
- Router: `https://vop.bank.gov.ua`
- OAuth: `https://vop.bank.gov.ua/oauth/token`
- Dashboard: `https://vop.bank.gov.ua/dashboard`

**Конфігурація (config.json):**
```json
{
  "env": "test",
  "router": {
    "baseUrl": "https://vop-test.bank.gov.ua",
    "timeout": 5000
  },
  "oauth": {
    "tokenUrl": "https://vop-test.bank.gov.ua/oauth/token",
    "clientId": "ВАШИЙ_BIC",
    "clientSecret": "***"
  },
  "tls": {
    "cert": "/path/to/client.crt",
    "key": "/path/to/client.key",
    "ca": "/path/to/ca.crt"
  },
  "responder": {
    "port": 8443,
    "host": "0.0.0.0"
  }
}
```

### 4.3 Reference Implementation

НБУ надає готову реалізацію:

**Node.js/TypeScript:**
```bash
git clone https://github.com/nbu/vop-sep.git
cd vop-sep/reference-implementation

# Requester
cd requester
npm install
npm run build

# Responder
cd ../responder
npm install
npm run build
```

**Ви можете:**
- Використати як є
- Адаптувати під свої потреби
- Переписати на іншу мову (Java, Python, .NET)

---

## 5. Інтеграція Requester

### 5.1 Огляд

**VoP Requester** — це клієнт, який відправляє запити на перевірку імені отримувача.

**Інтеграція:**
1. Mobile Banking App → Backend API → VoP Requester
2. VoP Requester → VoP Router (НБУ)
3. Response → Backend API → Mobile App

### 5.2 Приклад коду (Node.js)

**Крок 1: Install library**
```bash
npm install @nbu/vop-requester
```

**Крок 2: Initialize client**
```typescript
import { VopRequesterClient } from '@nbu/vop-requester';

const client = new VopRequesterClient({
  routerUrl: 'https://vop-test.bank.gov.ua',
  requesterBIC: 'ВАШBIC',
  oauth: {
    tokenUrl: 'https://vop-test.bank.gov.ua/oauth/token',
    clientId: 'ВАШBIC',
    clientSecret: process.env.VOP_CLIENT_SECRET
  },
  tls: {
    cert: fs.readFileSync('/path/to/client.crt'),
    key: fs.readFileSync('/path/to/client.key'),
    ca: fs.readFileSync('/path/to/ca.crt')
  },
  timeout: 5000
});
```

**Крок 3: Send verification request**
```typescript
async function verifyPayee(iban: string, name: string) {
  try {
    const response = await client.verify({
      iban: iban,
      name: name,
      accountType: 'PERSONAL'
    });

    console.log('Match Status:', response.matchStatus);
    console.log('Match Score:', response.matchScore);
    console.log('Verified Name:', response.verifiedAccount?.verifiedName);

    return response;
  } catch (error) {
    console.error('VoP Error:', error);
    throw error;
  }
}

// Usage
const result = await verifyPayee(
  'UA213052990000026007233566001',
  'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
);
```

### 5.3 Інтеграція з Mobile Banking

**Backend API endpoint:**
```typescript
// POST /api/v1/payments/verify-payee
app.post('/api/v1/payments/verify-payee', async (req, res) => {
  const { iban, name } = req.body;

  // Валідація
  if (!iban || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!isValidIBAN(iban)) {
    return res.status(400).json({ error: 'Invalid IBAN' });
  }

  try {
    // Виклик VoP
    const vopResult = await vopClient.verify({ iban, name });

    // Повернути результат клієнту
    res.json({
      matchStatus: vopResult.matchStatus,
      matchScore: vopResult.matchScore,
      verifiedName: vopResult.verifiedAccount?.verifiedName,
      message: getMatchMessage(vopResult.matchStatus)
    });
  } catch (error) {
    console.error('VoP error:', error);
    res.status(500).json({ error: 'VoP service unavailable' });
  }
});

function getMatchMessage(status: string): string {
  switch (status) {
    case 'MATCH':
      return 'Ім\'я отримувача підтверджено. Можна продовжити платіж.';
    case 'CLOSE_MATCH':
      return 'Ім\'я частково співпадає. Перевірте правильність написання.';
    case 'NO_MATCH':
      return 'Ім\'я НЕ співпадає. НЕ відправляйте платіж!';
    default:
      return 'Не вдалося перевірити отримувача.';
  }
}
```

**Mobile App (React Native example):**
```typescript
async function verifyPayeeBeforePayment() {
  const iban = ibanInput.value;
  const name = nameInput.value;

  // Show loading
  setLoading(true);

  try {
    const response = await fetch('/api/v1/payments/verify-payee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iban, name })
    });

    const result = await response.json();

    // Display result to user
    if (result.matchStatus === 'MATCH') {
      showSuccessModal({
        title: 'Отримувача підтверджено',
        message: result.message,
        verifiedName: result.verifiedName
      });
    } else if (result.matchStatus === 'CLOSE_MATCH') {
      showWarningModal({
        title: 'Перевірте ім\'я',
        message: result.message,
        verifiedName: result.verifiedName,
        actions: ['Виправити', 'Продовжити']
      });
    } else {
      showErrorModal({
        title: 'Невідповідність імені',
        message: result.message,
        verifiedName: result.verifiedName
      });
    }
  } catch (error) {
    showErrorModal({
      title: 'Помилка',
      message: 'Не вдалося перевірити отримувача. Спробуйте пізніше.'
    });
  } finally {
    setLoading(false);
  }
}
```

### 5.4 Error Handling

**Типи помилок:**

| Error Type | HTTP Status | Опис | Дія |
|------------|-------------|------|-----|
| `NETWORK_ERROR` | - | Немає зв'язку з Router | Retry 3 times |
| `TIMEOUT` | - | Router не відповів за 5s | Retry 1 time |
| `UNAUTHORIZED` | 401 | OAuth token invalid | Refresh token |
| `FORBIDDEN` | 403 | Rate limit exceeded | Wait and retry |
| `NOT_FOUND` | 404 | IBAN не знайдено | Show to user |
| `SERVER_ERROR` | 500 | Router error | Retry 1 time |

**Приклад обробки:**
```typescript
async function verifyWithRetry(iban: string, name: string, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await vopClient.verify({ iban, name });
    } catch (error) {
      lastError = error;

      if (error.code === 'UNAUTHORIZED') {
        // Refresh OAuth token
        await vopClient.refreshToken();
        continue;
      }

      if (error.code === 'TIMEOUT' && attempt < maxRetries) {
        // Retry після timeout
        await sleep(1000 * attempt);
        continue;
      }

      if (error.code === 'NOT_FOUND') {
        // Рахунок не знайдено — не retry
        throw error;
      }

      // Інші помилки — retry
      if (attempt < maxRetries) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw lastError;
}
```

### 5.5 Caching (опціонально)

Ви можете кешувати результати VoP для одного IBAN+Name:

```typescript
const cache = new Map<string, VopResponse>();

async function verifyWithCache(iban: string, name: string) {
  const cacheKey = `${iban}:${name}`;

  // Check cache (TTL 5 хвилин)
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.response;
  }

  // Call VoP
  const response = await vopClient.verify({ iban, name });

  // Save to cache
  cache.set(cacheKey, { response, timestamp: Date.now() });

  return response;
}
```

**УВАГА:** Кешування має сенс лише для повторних перевірок (наприклад, користувач виправив ім'я).

---

## 6. Інтеграція Responder

### 6.1 Огляд

**VoP Responder** — це сервер, який отримує запити від Router і перевіряє імена у вашій CBS.

**Інтеграція:**
1. VoP Router → VoP Responder (ваш сервер)
2. VoP Responder → CBS (пошук рахунку)
3. VoP Responder → Name Matcher (порівняння імен)
4. Response → VoP Router

### 6.2 Приклад коду (Node.js)

**Крок 1: Create server**
```typescript
import express from 'express';
import https from 'https';
import fs from 'fs';

const app = express();
app.use(express.json());

// Middleware: mTLS authentication
app.use((req, res, next) => {
  const socket = req.socket as any;
  const cert = socket.getPeerCertificate();

  if (!socket.authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract BIC from certificate
  const bic = extractBICFromCert(cert);
  req.requesterBIC = bic;

  next();
});

// POST /vop/verify
app.post('/vop/verify', async (req, res) => {
  const { requestId, payee } = req.body;

  try {
    // 1. Find account by IBAN
    const account = await findAccountByIBAN(payee.iban);

    if (!account) {
      return res.json({
        requestId,
        matchStatus: 'NO_MATCH',
        reasonCode: 'ACNF', // Account Not Found
        timestamp: new Date().toISOString()
      });
    }

    // 2. Check account status
    if (account.status === 'CLOSED') {
      return res.json({
        requestId,
        matchStatus: 'NO_MATCH',
        reasonCode: 'CLOS', // Account Closed
        timestamp: new Date().toISOString()
      });
    }

    // 3. Match names
    const matchResult = nameMatcher.match(
      payee.name,
      account.accountHolder
    );

    // 4. Determine match status
    let matchStatus: string;
    let reasonCode: string;

    if (matchResult.score >= 95) {
      matchStatus = 'MATCH';
      reasonCode = 'ANNM'; // Account Name Match
    } else if (matchResult.score >= 75) {
      matchStatus = 'CLOSE_MATCH';
      reasonCode = 'PANM'; // Partial Account Name Match
    } else {
      matchStatus = 'NO_MATCH';
      reasonCode = 'PANM';
    }

    // 5. Return response
    res.json({
      requestId,
      matchStatus,
      matchScore: matchResult.score,
      verifiedAccount: {
        verifiedName: account.accountHolder,
        accountType: account.accountType,
        accountStatus: account.status
      },
      reasonCode,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('VoP Responder error:', error);
    res.status(500).json({
      requestId,
      matchStatus: 'ERROR',
      reasonCode: 'TECH',
      timestamp: new Date().toISOString()
    });
  }
});

// Start HTTPS server with mTLS
const server = https.createServer({
  cert: fs.readFileSync('/path/to/server.crt'),
  key: fs.readFileSync('/path/to/server.key'),
  ca: fs.readFileSync('/path/to/ca.crt'),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2'
}, app);

server.listen(8443, () => {
  console.log('VoP Responder listening on port 8443');
});
```

### 6.3 Інтеграція з CBS

**Варіант 1: Direct SQL query**
```typescript
async function findAccountByIBAN(iban: string) {
  const result = await db.query(`
    SELECT
      account_number,
      account_holder_name,
      account_type,
      status
    FROM accounts
    WHERE iban = $1
  `, [iban]);

  if (result.rows.length === 0) {
    return null;
  }

  return {
    accountNumber: result.rows[0].account_number,
    accountHolder: result.rows[0].account_holder_name,
    accountType: result.rows[0].account_type,
    status: result.rows[0].status
  };
}
```

**Варіант 2: CBS API call**
```typescript
async function findAccountByIBAN(iban: string) {
  const response = await fetch(`https://cbs.yourbank.com/api/accounts/${iban}`, {
    headers: {
      'Authorization': `Bearer ${CBS_API_TOKEN}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  const data = await response.json();
  return {
    accountHolder: data.holderName,
    accountType: data.type,
    status: data.status
  };
}
```

**Варіант 3: Message Queue**
```typescript
async function findAccountByIBAN(iban: string) {
  // Send request to queue
  await messageQueue.send('cbs.account.query', { iban });

  // Wait for response (with timeout)
  const response = await messageQueue.receive('cbs.account.response', {
    correlationId: iban,
    timeout: 3000
  });

  return response;
}
```

### 6.4 Name Matching

**Використовуйте готовий модуль:**
```typescript
import { NameMatcher } from '@nbu/vop-name-matcher';

const nameMatcher = new NameMatcher({
  algorithm: 'jaro-winkler', // або 'levenshtein'
  thresholds: {
    match: 95,
    closeMatch: 75
  },
  normalization: {
    removeAccents: true,
    uppercase: true,
    trimSpaces: true
  }
});

const result = nameMatcher.match(
  'ШЕВЧЕНКО ТАРАС',
  'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
);

console.log(result.score); // 96.5
console.log(result.status); // 'MATCH'
```

**Або імплементуйте власний:**
```typescript
function jaroWinklerDistance(s1: string, s2: string): number {
  // Normalize
  s1 = normalize(s1);
  s2 = normalize(s2);

  // Jaro distance
  const jaro = jaroDistance(s1, s2);

  // Winkler bonus for common prefix
  const prefixLength = commonPrefixLength(s1, s2, 4);
  const winkler = jaro + (prefixLength * 0.1 * (1 - jaro));

  return winkler * 100;
}

function normalize(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^\u0400-\u04FF\s]/g, '') // Тільки кирилиця
    .replace(/\s+/g, ' ')
    .trim();
}
```

Детальну реалізацію див. у `docs/07_name_matching_algorithm.md`.

### 6.5 Performance Optimization

**1. Caching рахунків:**
```typescript
const accountCache = new LRU<string, Account>({
  max: 10000,
  ttl: 5 * 60 * 1000 // 5 хвилин
});

async function findAccountByIBAN(iban: string) {
  // Check cache
  const cached = accountCache.get(iban);
  if (cached) return cached;

  // Query CBS
  const account = await queryCBS(iban);

  // Save to cache
  if (account) {
    accountCache.set(iban, account);
  }

  return account;
}
```

**2. Connection pooling:**
```typescript
const pool = new Pool({
  host: 'cbs-db.yourbank.com',
  database: 'accounts',
  max: 20, // максимум 20 з'єднань
  idleTimeoutMillis: 30000
});
```

**3. Async parallel processing:**
```typescript
app.post('/vop/verify-batch', async (req, res) => {
  const requests = req.body.requests; // масив запитів

  // Process in parallel
  const results = await Promise.all(
    requests.map(req => processVerification(req))
  );

  res.json({ results });
});
```

---

## 7. Тестування

### 7.1 Unit Testing

**Test Name Matcher:**
```typescript
describe('NameMatcher', () => {
  const matcher = new NameMatcher();

  test('exact match', () => {
    const result = matcher.match(
      'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
    );
    expect(result.score).toBe(100);
    expect(result.status).toBe('MATCH');
  });

  test('partial match with initials', () => {
    const result = matcher.match(
      'ШЕВЧЕНКО Т.Г.',
      'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
    );
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  test('close match with typo', () => {
    const result = matcher.match(
      'ШЕВЧЕНКО ТАРАК',
      'ШЕВЧЕНКО ТАРАС'
    );
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThan(95);
    expect(result.status).toBe('CLOSE_MATCH');
  });

  test('no match', () => {
    const result = matcher.match(
      'ІВАНЕНКО ПЕТРО',
      'ШЕВЧЕНКО ТАРАС'
    );
    expect(result.score).toBeLessThan(75);
    expect(result.status).toBe('NO_MATCH');
  });
});
```

### 7.2 Integration Testing

**Test Requester:**
```typescript
describe('VopRequester Integration', () => {
  let client: VopRequesterClient;

  beforeAll(() => {
    client = new VopRequesterClient({
      routerUrl: 'https://vop-test.bank.gov.ua',
      requesterBIC: 'TEST',
      oauth: { ... }
    });
  });

  test('verify existing account - MATCH', async () => {
    const response = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
    });

    expect(response.matchStatus).toBe('MATCH');
    expect(response.matchScore).toBeGreaterThanOrEqual(95);
  });

  test('verify non-existent account - NOT FOUND', async () => {
    const response = await client.verify({
      iban: 'UA999999999999999999999999999',
      name: 'TEST USER'
    });

    expect(response.matchStatus).toBe('NO_MATCH');
    expect(response.reasonCode).toBe('ACNF');
  });
});
```

**Test Responder:**
```typescript
describe('VopResponder Integration', () => {
  test('POST /vop/verify - success', async () => {
    const response = await request(app)
      .post('/vop/verify')
      .send({
        requestId: 'TEST-001',
        payee: {
          iban: 'UA213052990000026007233566001',
          name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
        }
      })
      .expect(200);

    expect(response.body.matchStatus).toBe('MATCH');
  });
});
```

### 7.3 End-to-End Testing

**Scenario 1: Успішна перевірка (MATCH)**
```typescript
test('E2E: Successful verification', async () => {
  // 1. Mobile app отримує IBAN та ім'я від користувача
  const paymentData = {
    iban: 'UA213052990000026007233566001',
    name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
    amount: 5000
  };

  // 2. Backend викликає VoP Requester
  const vopResponse = await fetch('/api/v1/payments/verify-payee', {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });

  const result = await vopResponse.json();

  // 3. Перевірити результат
  expect(result.matchStatus).toBe('MATCH');
  expect(result.message).toContain('підтверджено');

  // 4. Користувач продовжує платіж
  const paymentResponse = await fetch('/api/v1/payments/execute', {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });

  expect(paymentResponse.status).toBe(200);
});
```

**Scenario 2: Невідповідність імені (NO_MATCH)**
```typescript
test('E2E: Name mismatch detected', async () => {
  const paymentData = {
    iban: 'UA213052990000026007233566001',
    name: 'ІВАНЕНКО ПЕТРО' // неправильне ім'я
  };

  const response = await fetch('/api/v1/payments/verify-payee', {
    method: 'POST',
    body: JSON.stringify(paymentData)
  });

  const result = await response.json();

  // Очікуємо NO_MATCH
  expect(result.matchStatus).toBe('NO_MATCH');
  expect(result.message).toContain('НЕ співпадає');

  // Користувач НЕ продовжує платіж
});
```

### 7.4 Load Testing

**Test with Apache Bench:**
```bash
# 1000 запитів, 10 паралельних
ab -n 1000 -c 10 \
   -H "Content-Type: application/json" \
   -H "Authorization: Bearer $TOKEN" \
   -p request.json \
   https://vop-test.bank.gov.ua/v1/verify
```

**Test with k6:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 50 },  // ramp-up
    { duration: '5m', target: 100 }, // steady state
    { duration: '1m', target: 0 },   // ramp-down
  ],
};

export default function () {
  const payload = JSON.stringify({
    requestId: `TEST-${Date.now()}`,
    payee: {
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
    }
  });

  const response = http.post('https://vop-test.bank.gov.ua/v1/verify', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.VOP_TOKEN}`
    }
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500
  });
}
```

---

## 8. Запуск у Production

### 8.1 Pre-Production Checklist

**Infrastructure:**
- [ ] 2+ серверів для HA (High Availability)
- [ ] Load Balancer налаштовано
- [ ] Firewall rules (дозволити тільки VoP Router IP)
- [ ] SSL/TLS сертифікати встановлено
- [ ] Secrets management (Vault, AWS Secrets)

**Application:**
- [ ] Environment variables налаштовано
- [ ] Logging включено (JSON format)
- [ ] Monitoring включено (Prometheus/Grafana)
- [ ] Health check endpoint `/health` працює
- [ ] Rate limiting налаштовано

**Database:**
- [ ] Connection pooling налаштовано
- [ ] Indexes створено на IBAN колонці
- [ ] Backup налаштовано (автоматичний щоденний)

**Security:**
- [ ] mTLS сертифікати встановлено
- [ ] OAuth credentials безпечно збережено
- [ ] Audit logging включено
- [ ] Security headers налаштовано

**Testing:**
- [ ] Unit tests pass (100% coverage)
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Load tests pass (SLA compliance)

**Documentation:**
- [ ] Runbook створено
- [ ] Incident response plan готовий
- [ ] On-call rotation налаштовано

### 8.2 Deployment

**Blue-Green Deployment:**
```bash
# 1. Deploy новий сервер (Green)
kubectl apply -f vop-responder-v2.yaml

# 2. Перевірити health
curl https://green.vop.yourbank.com/health

# 3. Switch traffic (поступово)
# 10% traffic на Green
kubectl patch service vop-responder -p '{"spec":{"selector":{"version":"v2","weight":"10"}}}'

# 4. Моніторинг (15 хвилин)
# Якщо все OK → 50% → 100%
kubectl patch service vop-responder -p '{"spec":{"selector":{"version":"v2","weight":"100"}}}'

# 5. Видалити старий сервер (Blue)
kubectl delete deployment vop-responder-v1
```

**Rollback Plan:**
```bash
# Якщо щось пішло не так → швидкий rollback
kubectl patch service vop-responder -p '{"spec":{"selector":{"version":"v1","weight":"100"}}}'
```

### 8.3 Monitoring

**Key Metrics:**

| Metric | Target | Critical |
|--------|--------|----------|
| **Uptime** | 99.9% | 99.5% |
| **Latency (p95)** | < 500 ms | < 1000 ms |
| **Latency (p99)** | < 1000 ms | < 2000 ms |
| **Error Rate** | < 0.5% | < 2% |
| **Throughput** | XXX req/s | - |

**Prometheus queries:**
```promql
# Request rate
rate(vop_requests_total[5m])

# Error rate
rate(vop_requests_total{status="error"}[5m]) / rate(vop_requests_total[5m])

# Latency p95
histogram_quantile(0.95, vop_request_duration_seconds_bucket)

# Availability
100 - (rate(vop_requests_total{status="error"}[1h]) / rate(vop_requests_total[1h]) * 100)
```

**Grafana Dashboard:**
- Request rate (по часу)
- Error rate (по типу помилки)
- Latency percentiles (p50, p95, p99)
- Match status distribution (MATCH / CLOSE_MATCH / NO_MATCH)
- CBS response time
- Cache hit rate

**Alerts:**
```yaml
# AlertManager config
alerts:
  - name: VopHighErrorRate
    expr: rate(vop_requests_total{status="error"}[5m]) > 0.02
    for: 5m
    severity: critical
    annotations:
      message: "VoP error rate > 2% for 5 minutes"

  - name: VopHighLatency
    expr: histogram_quantile(0.95, vop_request_duration_seconds_bucket) > 1.0
    for: 5m
    severity: warning
    annotations:
      message: "VoP p95 latency > 1s"

  - name: VopDown
    expr: up{job="vop-responder"} == 0
    for: 1m
    severity: critical
    annotations:
      message: "VoP Responder is DOWN"
```

### 8.4 Incident Response

**Incident Severity:**

| Level | Response Time | Example |
|-------|---------------|---------|
| **P0 (Critical)** | 15 min | VoP Router down |
| **P1 (High)** | 30 min | Error rate > 10% |
| **P2 (Medium)** | 2 hours | Latency > 2s |
| **P3 (Low)** | 1 day | Documentation issue |

**Response Process:**
1. **Detect** — Alert → PagerDuty → On-call engineer
2. **Acknowledge** — Respond within SLA time
3. **Investigate** — Check logs, metrics, dashboards
4. **Mitigate** — Rollback / Restart / Scale up
5. **Communicate** — Update stakeholders (Slack, email)
6. **Resolve** — Fix root cause
7. **Post-mortem** — RCA document (24-48h after)

**Common Issues:**

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| CBS Timeout | High latency, TECH errors | Increase timeout, check CBS |
| Certificate Expired | 401 Unauthorized | Renew cert, restart |
| OAuth Token Invalid | 401 errors | Refresh token |
| Memory Leak | OOM errors | Restart, investigate code |
| Database Connection Pool | Connection timeouts | Increase pool size |

---

## 9. Troubleshooting

### 9.1 Requester Issues

**Issue 1: "401 Unauthorized"**

**Причина:** OAuth token invalid або expired.

**Рішення:**
```typescript
// Автоматично refresh token
await vopClient.refreshToken();

// Або вручну:
const tokenResponse = await fetch('https://vop.bank.gov.ua/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'client_credentials',
    client_id: 'ВАШИЙ_BIC',
    client_secret: process.env.VOP_CLIENT_SECRET
  })
});

const { access_token } = await tokenResponse.json();
```

**Issue 2: "ETIMEDOUT" / "ECONNREFUSED"**

**Причина:** Немає зв'язку з VoP Router.

**Перевірити:**
```bash
# Ping Router
ping vop.bank.gov.ua

# Test HTTPS connection
curl -v https://vop.bank.gov.ua/health

# Check DNS resolution
nslookup vop.bank.gov.ua

# Check firewall
telnet vop.bank.gov.ua 443
```

**Issue 3: "SSL Certificate Error"**

**Причина:** Invalid mTLS certificates.

**Перевірити:**
```bash
# Check certificate validity
openssl x509 -in client.crt -text -noout

# Check certificate chain
openssl verify -CAfile ca.crt client.crt

# Test mTLS connection
curl --cert client.crt --key client.key --cacert ca.crt \
     https://vop.bank.gov.ua/health
```

### 9.2 Responder Issues

**Issue 1: "Slow responses"**

**Причина:** CBS queries slow.

**Діагностика:**
```typescript
// Add timing logs
console.time('cbs-query');
const account = await findAccountByIBAN(iban);
console.timeEnd('cbs-query');

console.time('name-matching');
const matchResult = nameMatcher.match(name, account.accountHolder);
console.timeEnd('name-matching');
```

**Оптимізація:**
- Додати caching
- Оптимізувати SQL queries (indexes)
- Збільшити connection pool

**Issue 2: "High CPU usage"**

**Причина:** Name matching алгоритм занадто повільний.

**Рішення:**
- Використовуйте Jaro-Winkler (швидший за Levenshtein)
- Додайте early exit conditions
- Кешуйте результати

**Issue 3: "CBS connection errors"**

**Причина:** CBS недоступна.

**Fallback:**
```typescript
try {
  const account = await queryCBS(iban);
  return processAccount(account);
} catch (error) {
  if (error.code === 'CBS_UNAVAILABLE') {
    // Fallback: повернути NOT_SUPPORTED
    return {
      requestId,
      matchStatus: 'NOT_SUPPORTED',
      reasonCode: 'TECH',
      timestamp: new Date().toISOString()
    };
  }
  throw error;
}
```

### 9.3 Network Issues

**Debug with cURL:**
```bash
# Test mTLS connection
curl -v \
  --cert /path/to/client.crt \
  --key /path/to/client.key \
  --cacert /path/to/ca.crt \
  -H "Content-Type: application/json" \
  -d '{"requestId":"TEST-001","payee":{"iban":"UA213052990000026007233566001","name":"TEST"}}' \
  https://vop-test.bank.gov.ua/v1/verify

# Check TLS version
openssl s_client -connect vop.bank.gov.ua:443 -tls1_2

# Test DNS resolution
dig vop.bank.gov.ua
```

---

## 10. Практичні вправи

### Вправа 1: Створити простий VoP Requester

**Завдання:** Написати Node.js скрипт, який відправляє VoP запит.

**Код:**
```typescript
// vop-test.ts
import https from 'https';
import fs from 'fs';

const requestData = JSON.stringify({
  requestId: 'TEST-' + Date.now(),
  requester: { bic: 'TESTBIC' },
  payee: {
    iban: 'UA213052990000026007233566001',
    name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
  },
  timestamp: new Date().toISOString()
});

const options = {
  hostname: 'vop-test.bank.gov.ua',
  port: 443,
  path: '/v1/verify',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': requestData.length,
    'Authorization': `Bearer ${process.env.VOP_TOKEN}`
  },
  cert: fs.readFileSync('/path/to/client.crt'),
  key: fs.readFileSync('/path/to/client.key'),
  ca: fs.readFileSync('/path/to/ca.crt')
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);

  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Response:', JSON.parse(data));
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(requestData);
req.end();
```

**Run:**
```bash
VOP_TOKEN=your-token ts-node vop-test.ts
```

### Вправа 2: Імплементувати Name Matcher

**Завдання:** Написати функцію для порівняння імен з Jaro-Winkler.

**Код:** Див. `docs/07_name_matching_algorithm.md` → Section 4.

### Вправа 3: Створити VoP Responder endpoint

**Завдання:** Створити Express.js endpoint `/vop/verify` з mTLS.

**Код:** Див. Section 6.2 вище.

### Вправа 4: E2E тест

**Завдання:** Написати тест, який перевіряє весь flow (Requester → Router → Responder).

**Код:** Див. Section 7.3 вище.

---

## Додатки

### Додаток A: Глосарій

| Термін | Опис |
|--------|------|
| **VoP** | Verification of Payee — система перевірки отримувачів |
| **IBAN** | International Bank Account Number |
| **BIC** | Bank Identifier Code (SWIFT код) |
| **mTLS** | Mutual TLS — взаємна автентифікація |
| **OAuth 2.0** | Протокол авторизації |
| **FAPI** | Financial-grade API |
| **CBS** | Core Banking System |
| **Requester** | Банк-ініціатор платежу |
| **Responder** | Банк-отримувач платежу |
| **Router** | Центральний маршрутизатор (НБУ) |
| **Directory Service** | Сервіс пошуку IBAN → BIC |
| **Name Matching** | Алгоритм порівняння імен |
| **Levenshtein Distance** | Алгоритм edit distance |
| **Jaro-Winkler** | Алгоритм string similarity |

### Додаток B: Посилання

**Документація:**
- [API Reference](../docs/03_api_reference.md)
- [Security Guidelines](../docs/04_security_guidelines.md)
- [Implementation Guide](../docs/05_implementation_guide.md)
- [Name Matching Algorithm](../docs/07_name_matching_algorithm.md)
- [Operational Procedures](../docs/08_operational_procedures.md)

**Reference Implementation:**
- [VoP Router](../reference-implementation/router/)
- [VoP Requester](../reference-implementation/requester/)
- [VoP Responder](../reference-implementation/responder/)

**External Resources:**
- UK Confirmation of Payee: https://www.ukfinance.org.uk/cop
- EU Verification of Payee: https://www.europeanpaymentscouncil.eu/
- ISO 20022: https://www.iso20022.org/
- OAuth 2.0: https://oauth.net/2/
- FAPI: https://openid.net/wg/fapi/

### Додаток C: Контакти

**Технічна підтримка:**
- Email: vop-support@bank.gov.ua
- Phone: +380-44-XXX-XXXX
- Slack: #vop-integration

**Пілот програма:**
- Email: vop-pilot@bank.gov.ua

**Dashboard:**
- Test: https://vop-test.bank.gov.ua/dashboard
- Production: https://vop.bank.gov.ua/dashboard

---

**Кінець Training Guide**

Версія 1.0 | 2026-02-07 | Національний банк України
