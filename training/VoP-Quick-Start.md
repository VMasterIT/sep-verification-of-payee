# VoP Quick Start Guide
## Швидкий старт для інтеграції Verification of Payee

**Версія:** 1.0
**Дата:** 2026-02-07
**Час читання:** 15 хвилин

---

## Мета

Цей посібник допоможе вам **за 30 хвилин** запустити перший VoP запит у Test Environment.

**Що ви зробите:**
1. Отримаєте доступ до VoP Test Environment
2. Налаштуєте сертифікати та OAuth
3. Відправите перший VoP запит
4. Отримаєте результат

**Передумови:**
- Node.js 20+ встановлено
- Базові знання HTTP/REST API
- Доступ до терміналу

---

## Крок 1: Реєстрація у VoP Test Environment

### 1.1 Подайте заявку

Відправте email на **vop-pilot@bank.gov.ua**:

```
Subject: Заявка на доступ до VoP Test Environment

Банк: [Назва вашого банку]
БІК: [Ваш BIC код, наприклад PBUA]
Контакт: [Ваше ім'я]
Email: [Ваш email]
Phone: [Ваш телефон]

Мета: Тестування VoP інтеграції
```

### 1.2 Отримайте credentials

НБУ надішле вам (протягом 1-2 днів):

```
VoP Test Environment Credentials
================================

Router URL: https://vop-test.bank.gov.ua
OAuth Token URL: https://vop-test.bank.gov.ua/oauth/token

Client ID: TEST_BANK_BIC
Client Secret: abc123def456...

Certificates (attached):
- test-client.crt (клієнтський сертифікат)
- test-client.key (приватний ключ)
- test-ca.crt (сертифікат АЦСЬК)

Valid until: 2027-02-07
```

### 1.3 Збережіть credentials

```bash
# Створіть директорію для credentials
mkdir -p ~/vop-test
cd ~/vop-test

# Збережіть файли (отримані від НБУ)
# test-client.crt
# test-client.key
# test-ca.crt

# Захистіть приватний ключ
chmod 600 test-client.key
```

---

## Крок 2: Перший запит (cURL)

### 2.1 Отримайте OAuth token

```bash
# Set credentials
export VOP_CLIENT_ID="TEST_BANK_BIC"
export VOP_CLIENT_SECRET="abc123def456..."

# Get OAuth token
curl -X POST https://vop-test.bank.gov.ua/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "'$VOP_CLIENT_ID'",
    "client_secret": "'$VOP_CLIENT_SECRET'"
  }'
```

**Відповідь:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Збережіть token:**
```bash
export VOP_TOKEN="eyJhbGciOiJSUzI1NiIs..."
```

### 2.2 Відправте VoP запит

```bash
# Send VoP verification request
curl -X POST https://vop-test.bank.gov.ua/v1/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VOP_TOKEN" \
  --cert ~/vop-test/test-client.crt \
  --key ~/vop-test/test-client.key \
  --cacert ~/vop-test/test-ca.crt \
  -d '{
    "requestId": "TEST-'$(date +%s)'",
    "requester": {
      "bic": "'$VOP_CLIENT_ID'",
      "name": "Test Bank"
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
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

**Очікувана відповідь:**
```json
{
  "requestId": "TEST-1738844400",
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

**Вітаємо!** Ви відправили перший VoP запит.

---

## Крок 3: Node.js Integration

### 3.1 Створіть проєкт

```bash
# Create project
mkdir vop-quickstart
cd vop-quickstart
npm init -y

# Install dependencies
npm install axios https
```

### 3.2 Створіть vop-client.js

```javascript
// vop-client.js
const axios = require('axios');
const https = require('https');
const fs = require('fs');

class VopClient {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiry = 0;

    // HTTPS agent з mTLS
    this.httpsAgent = new https.Agent({
      cert: fs.readFileSync(config.certPath),
      key: fs.readFileSync(config.keyPath),
      ca: fs.readFileSync(config.caPath),
      rejectUnauthorized: true
    });
  }

  async getToken() {
    // Return cached token якщо ще валідний
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    // Request new token
    const response = await axios.post(this.config.oauthUrl, {
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    });

    this.token = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

    return this.token;
  }

  async verify({ iban, name, accountType = 'PERSONAL' }) {
    const token = await this.getToken();

    const request = {
      requestId: `REQ-${Date.now()}`,
      requester: {
        bic: this.config.clientId,
        name: this.config.bankName || 'Test Bank'
      },
      payee: {
        iban,
        name,
        accountType
      },
      timestamp: new Date().toISOString()
    };

    const response = await axios.post(
      `${this.config.routerUrl}/v1/verify`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        httpsAgent: this.httpsAgent,
        timeout: 5000
      }
    );

    return response.data;
  }
}

module.exports = VopClient;
```

### 3.3 Створіть test.js

```javascript
// test.js
const VopClient = require('./vop-client');

const client = new VopClient({
  routerUrl: 'https://vop-test.bank.gov.ua',
  oauthUrl: 'https://vop-test.bank.gov.ua/oauth/token',
  clientId: process.env.VOP_CLIENT_ID || 'TEST_BANK_BIC',
  clientSecret: process.env.VOP_CLIENT_SECRET,
  certPath: './test-client.crt',
  keyPath: './test-client.key',
  caPath: './test-ca.crt'
});

async function testVerify() {
  try {
    console.log('Sending VoP request...');

    const result = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      accountType: 'PERSONAL'
    });

    console.log('\n✅ VoP Response:');
    console.log('Match Status:', result.matchStatus);
    console.log('Match Score:', result.matchScore);
    console.log('Verified Name:', result.verifiedAccount?.verifiedName);
    console.log('Reason Code:', result.reasonCode);

    if (result.matchStatus === 'MATCH') {
      console.log('\n✅ SUCCESS: Name matches!');
    } else if (result.matchStatus === 'CLOSE_MATCH') {
      console.log('\n⚠️  WARNING: Close match, verify name');
    } else {
      console.log('\n❌ ERROR: Name does not match!');
    }

  } catch (error) {
    console.error('❌ VoP Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testVerify();
```

### 3.4 Запустіть тест

```bash
# Set credentials
export VOP_CLIENT_SECRET="abc123def456..."

# Copy certificates
cp ~/vop-test/*.crt .
cp ~/vop-test/*.key .

# Run test
node test.js
```

**Очікуваний вивід:**
```
Sending VoP request...

✅ VoP Response:
Match Status: MATCH
Match Score: 100
Verified Name: ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ
Reason Code: ANNM

✅ SUCCESS: Name matches!
```

---

## Крок 4: Тестові сценарії

### 4.1 Test Case 1: Exact Match

```javascript
await client.verify({
  iban: 'UA213052990000026007233566001',
  name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
});

// Expected: matchStatus = "MATCH", matchScore = 100
```

### 4.2 Test Case 2: Close Match (typo)

```javascript
await client.verify({
  iban: 'UA213052990000026007233566001',
  name: 'ШЕВЧЕНКО ТАРАК ГРИГОРОВИЧ' // typo: ТАРАК замість ТАРАС
});

// Expected: matchStatus = "CLOSE_MATCH", matchScore = 90-95
```

### 4.3 Test Case 3: No Match

```javascript
await client.verify({
  iban: 'UA213052990000026007233566001',
  name: 'ІВАНЕНКО ПЕТРО ІВАНОВИЧ' // неправильне ім'я
});

// Expected: matchStatus = "NO_MATCH", matchScore < 75
```

### 4.4 Test Case 4: Account Not Found

```javascript
await client.verify({
  iban: 'UA999999999999999999999999999', // неіснуючий IBAN
  name: 'TEST USER'
});

// Expected: matchStatus = "NO_MATCH", reasonCode = "ACNF"
```

### 4.5 Test Case 5: Initials

```javascript
await client.verify({
  iban: 'UA213052990000026007233566001',
  name: 'ШЕВЧЕНКО Т.Г.' // ініціали
});

// Expected: matchStatus = "MATCH", matchScore = 100
// (система розпізнає ініціали)
```

---

## Крок 5: Dashboard

### 5.1 Відкрийте Dashboard

Перейдіть на: **https://vop-test.bank.gov.ua/dashboard**

**Login:**
- Username: `ваш BIC`
- Password: `отримаєте від НБУ`

### 5.2 Моніторинг

**Dashboard показує:**
- Кількість запитів за день/годину
- Success rate (%)
- Latency (p50, p95, p99)
- Error breakdown

**Приклад:**
```
Today's Stats (2026-02-07)
==========================
Total Requests: 1,234
Success: 1,180 (95.6%)
Errors: 54 (4.4%)

Match Status Distribution:
- MATCH: 856 (69.4%)
- CLOSE_MATCH: 245 (19.9%)
- NO_MATCH: 133 (10.8%)

Average Latency: 285 ms (p95: 420 ms)
```

---

## Крок 6: Наступні кроки

Ви успішно запустили VoP! Тепер:

### 6.1 Інтегруйте з Backend API

```javascript
// Backend API endpoint
app.post('/api/v1/payments/verify-payee', async (req, res) => {
  const { iban, name } = req.body;

  try {
    const result = await vopClient.verify({ iban, name });

    res.json({
      success: true,
      matchStatus: result.matchStatus,
      matchScore: result.matchScore,
      verifiedName: result.verifiedAccount?.verifiedName,
      message: getMatchMessage(result.matchStatus)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'VoP service unavailable'
    });
  }
});

function getMatchMessage(status) {
  switch (status) {
    case 'MATCH':
      return 'Ім\'я отримувача підтверджено';
    case 'CLOSE_MATCH':
      return 'Ім\'я частково співпадає. Перевірте правильність.';
    case 'NO_MATCH':
      return 'Ім\'я НЕ співпадає. НЕ відправляйте платіж!';
    default:
      return 'Не вдалося перевірити отримувача';
  }
}
```

### 6.2 Додайте UI до Mobile Banking

```javascript
// React Native example
async function verifyPayeeBeforePayment() {
  setLoading(true);

  try {
    const response = await fetch('/api/v1/payments/verify-payee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iban, name })
    });

    const result = await response.json();

    if (result.matchStatus === 'MATCH') {
      Alert.alert(
        '✅ Отримувача підтверджено',
        `Власник рахунку: ${result.verifiedName}`,
        [{ text: 'Продовжити', onPress: () => executePayment() }]
      );
    } else if (result.matchStatus === 'NO_MATCH') {
      Alert.alert(
        '❌ Ім\'я НЕ співпадає!',
        result.message,
        [
          { text: 'Виправити', onPress: () => goBackToForm() },
          { text: 'Скасувати', style: 'cancel' }
        ]
      );
    }
  } catch (error) {
    Alert.alert('Помилка', 'Не вдалося перевірити отримувача');
  } finally {
    setLoading(false);
  }
}
```

### 6.3 Імплементуйте VoP Responder

Якщо ви хочете **отримувати** VoP запити (Responder):

```javascript
// vop-responder.js
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();
app.use(express.json());

// mTLS authentication middleware
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();

  if (!req.socket.authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract BIC from certificate
  const bic = cert.subject.CN; // або з insnfixe CN
  req.requesterBIC = bic;

  next();
});

// POST /vop/verify endpoint
app.post('/vop/verify', async (req, res) => {
  const { requestId, payee } = req.body;

  try {
    // 1. Find account by IBAN (у вашій CBS)
    const account = await findAccountByIBAN(payee.iban);

    if (!account) {
      return res.json({
        requestId,
        matchStatus: 'NO_MATCH',
        reasonCode: 'ACNF', // Account Not Found
        timestamp: new Date().toISOString()
      });
    }

    // 2. Match names
    const matchScore = calculateMatchScore(
      payee.name,
      account.accountHolder
    );

    let matchStatus, reasonCode;

    if (matchScore >= 95) {
      matchStatus = 'MATCH';
      reasonCode = 'ANNM'; // Account Name Match
    } else if (matchScore >= 75) {
      matchStatus = 'CLOSE_MATCH';
      reasonCode = 'PANM'; // Partial Account Name Match
    } else {
      matchStatus = 'NO_MATCH';
      reasonCode = 'PANM';
    }

    // 3. Return response
    res.json({
      requestId,
      matchStatus,
      matchScore,
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

// Start HTTPS server з mTLS
const server = https.createServer({
  cert: fs.readFileSync('./server.crt'),
  key: fs.readFileSync('./server.key'),
  ca: fs.readFileSync('./ca.crt'),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2'
}, app);

server.listen(8443, () => {
  console.log('VoP Responder listening on port 8443');
});

// Mock CBS integration (замініть на реальну CBS)
async function findAccountByIBAN(iban) {
  // TODO: Query вашої CBS
  // const result = await db.query('SELECT * FROM accounts WHERE iban = ?', [iban]);

  // Mock data для тестування
  if (iban === 'UA213052990000026007233566001') {
    return {
      accountHolder: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      accountType: 'PERSONAL',
      status: 'ACTIVE'
    };
  }

  return null;
}

// Mock name matching (замініть на Jaro-Winkler)
function calculateMatchScore(name1, name2) {
  // TODO: Implement Jaro-Winkler або Levenshtein
  // Див. docs/07_name_matching_algorithm.md

  // Mock: simple comparison
  const normalized1 = name1.toUpperCase().trim();
  const normalized2 = name2.toUpperCase().trim();

  if (normalized1 === normalized2) {
    return 100;
  }

  // Very simple similarity (placeholder)
  const commonChars = [...normalized1].filter(c => normalized2.includes(c)).length;
  const maxLength = Math.max(normalized1.length, normalized2.length);

  return (commonChars / maxLength) * 100;
}
```

**Запустіть Responder:**
```bash
node vop-responder.js
```

**Тестуйте:**
```bash
curl -X POST https://localhost:8443/vop/verify \
  --cert client.crt \
  --key client.key \
  --cacert ca.crt \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "TEST-001",
    "payee": {
      "iban": "UA213052990000026007233566001",
      "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
    }
  }'
```

---

## Крок 7: Error Handling

### 7.1 Обробка помилок

```javascript
async function verifyWithRetry(iban, name, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await vopClient.verify({ iban, name });

    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);

      // Retry на певні помилки
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.response?.status === 503
      ) {
        if (attempt < maxRetries) {
          const delay = 1000 * attempt; // exponential backoff
          console.log(`Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      // Не retry на інші помилки
      throw error;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 7.2 Graceful Degradation

```javascript
async function verifyPayee(iban, name) {
  try {
    return await vopClient.verify({ iban, name });

  } catch (error) {
    console.error('VoP unavailable:', error);

    // Fallback: дозволити платіж з попередженням
    return {
      matchStatus: 'NOT_SUPPORTED',
      reasonCode: 'TECH',
      message: 'VoP сервіс тимчасово недоступний. ' +
               'Ви можете продовжити платіж на свій ризик.'
    };
  }
}
```

---

## Troubleshooting

### Проблема 1: "ECONNREFUSED"

**Причина:** Немає зв'язку з VoP Router.

**Рішення:**
```bash
# Перевірте URL
ping vop-test.bank.gov.ua

# Перевірте HTTPS
curl -v https://vop-test.bank.gov.ua/health

# Перевірте firewall
telnet vop-test.bank.gov.ua 443
```

### Проблема 2: "401 Unauthorized"

**Причина:** OAuth token invalid.

**Рішення:**
```javascript
// Refresh token
this.token = null;
await this.getToken();
```

### Проблема 3: "SSL Certificate Error"

**Причина:** Invalid mTLS certificates.

**Рішення:**
```bash
# Перевірте validity
openssl x509 -in test-client.crt -noout -dates

# Перевірте chain
openssl verify -CAfile test-ca.crt test-client.crt
```

### Проблема 4: "Timeout"

**Причина:** VoP Router повільний або недоступний.

**Рішення:**
```javascript
// Збільште timeout
axios.post(url, data, {
  timeout: 10000 // 10 секунд
});
```

---

## Корисні команди

### cURL Examples

```bash
# Health check
curl https://vop-test.bank.gov.ua/health

# Get OAuth token
curl -X POST https://vop-test.bank.gov.ua/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"TEST","client_secret":"..."}'

# VoP verify request
curl -X POST https://vop-test.bank.gov.ua/v1/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --cert client.crt --key client.key --cacert ca.crt \
  -d '{...}'
```

### OpenSSL Commands

```bash
# Check certificate
openssl x509 -in cert.crt -text -noout

# Check expiry date
openssl x509 -in cert.crt -noout -dates

# Verify certificate chain
openssl verify -CAfile ca.crt cert.crt

# Test TLS connection
openssl s_client -connect vop-test.bank.gov.ua:443 -cert client.crt -key client.key
```

---

## Наступні кроки

**Ви успішно завершили Quick Start!**

**Тепер:**

1. **Прочитайте повну документацію:**
   - [Implementation Guide](../docs/05_implementation_guide.md)
   - [API Reference](../docs/03_api_reference.md)
   - [Training Guide](VoP-Training-Guide.md)

2. **Імплементуйте Responder:**
   - Інтеграція з CBS
   - Name Matching
   - Production deployment

3. **Тестування:**
   - Unit tests
   - Integration tests
   - Load tests

4. **Production:**
   - Отримати production сертифікати
   - Deployment
   - Моніторинг

**Потрібна допомога?**
- Email: vop-support@bank.gov.ua
- Slack: #vop-integration
- Documentation: https://bank.gov.ua/vop

---

**Кінець Quick Start Guide**

Версія 1.0 | 2026-02-07 | Національний банк України

**Успішної інтеграції!** 🚀
