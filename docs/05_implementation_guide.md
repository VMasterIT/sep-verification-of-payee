# Посібник впровадження VoP для СЕП НБУ

## Зміст

1. [Підготовка до впровадження](#підготовка-до-впровадження)
2. [Реєстрація учасника](#реєстрація-учасника)
3. [Реалізація VoP Requester](#реалізація-vop-requester)
4. [Реалізація VoP Responder](#реалізація-vop-responder)
5. [Тестування](#тестування)
6. [Production deployment](#production-deployment)
7. [Моніторинг та підтримка](#моніторинг-та-підтримка)

---

## 1. Підготовка до впровадження

### 1.1 Технічні вимоги

**Мінімальні вимоги:**

```yaml
Infrastructure:
  - Kubernetes cluster (версія 1.25+)
  - PostgreSQL 15+ або еквівалент
  - Redis 7+ для кешування
  - Load Balancer (NGINX / HAProxy)

Security:
  - QWAC сертифікати від НБУ або акредитованого CA
  - mTLS support
  - OAuth 2.0 Authorization Server

Network:
  - Stable internet connection (мінімум 100 Mbps)
  - Static IP address
  - Firewall rules для VoP traffic

Development:
  - Language: Java 17+ / Node.js 18+ / Python 3.11+ / .NET 8+
  - Framework: Spring Boot / Express / Django / ASP.NET Core
  - CI/CD pipeline
```

### 1.2 Команда

**Рекомендована команда:**

- **Tech Lead** — 1 особа (архітектура, координація)
- **Backend Developers** — 2-3 особи (API розробка)
- **Security Engineer** — 1 особа (mTLS, OAuth, сертифікати)
- **DevOps Engineer** — 1 особа (deployment, моніторинг)
- **QA Engineer** — 1 особа (тестування)
- **Business Analyst** — 1 особа (вимоги, документація)

### 1.3 Часовий план

**Фаза 1: Підготовка (2-3 тижні)**
- Аналіз вимог
- Дизайн архітектури
- Підготовка інфраструктури

**Фаза 2: Розробка (4-6 тижнів)**
- Реалізація Requester API
- Реалізація Responder API
- Інтеграція з існуючими системами

**Фаза 3: Тестування (2-3 тижні)**
- Unit tests
- Integration tests
- Performance tests
- Security tests

**Фаза 4: Пілот (2-4 тижні)**
- Deployment в test environment
- Тестування з іншими банками
- Bug fixing

**Фаза 5: Production (1-2 тижні)**
- Deployment в production
- Моніторинг
- Підтримка

**Загалом: 11-18 тижнів (3-4.5 місяці)**

---

## 2. Реєстрація учасника

### 2.1 Процес реєстрації

**Крок 1: Подати заявку до НБУ**

Документи:
- Заява на участь у VoP
- Технічна специфікація (API endpoints, infrastructure)
- Сертифікати безпеки (QWAC)
- План тестування

**Крок 2: Отримати облікові дані**

НБУ надає:
- NBU ID (6-значний код)
- OAuth 2.0 client credentials (client_id, client_secret)
- VoP Router endpoint URL
- Directory Service endpoint URL

**Крок 3: Налаштувати сертифікати**

```bash
# Отримати QWAC сертифікат від НБУ або акредитованого CA
openssl req -new -newkey rsa:4096 -nodes \
  -keyout bank-vop-private.key \
  -out bank-vop.csr \
  -subj "/C=UA/O=YourBank/CN=vop.yourbank.ua"

# Після підписання сертифіката CA
# Завантажити сертифікат на сервер
cp bank-vop.crt /etc/ssl/certs/
cp bank-vop-private.key /etc/ssl/private/
chmod 600 /etc/ssl/private/bank-vop-private.key
```

**Крок 4: Реєстрація в Directory Service**

```http
POST https://vop-directory.nbu.gov.ua/api/v1/participants
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "nbuId": "300099",
  "bic": "YOURBANKUA2X",
  "name": "Your Bank JSC",
  "vopResponderUrl": "https://vop.yourbank.ua/api/v1/verify",
  "certificateFingerprint": "SHA256:abc123...",
  "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
  "maxResponseTime": 1000
}
```

---

## 3. Реалізація VoP Requester

### 3.1 Архітектура Requester

```
┌───────────────┐
│   Client UI   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Payment API  │ ← Існуюча система
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ VoP Requester │ ← Новий компонент
│   Service     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  VoP Router   │ ← NBU Infrastructure
└───────────────┘
```

### 3.2 Приклад реалізації (Node.js)

```javascript
// vop-requester.js
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class VoPRequester {
  constructor(config) {
    this.config = config;
    this.routerUrl = config.vopRouterUrl;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Перевірка реквізитів отримувача
   */
  async verifyPayee(payeeData) {
    // 1. Валідація input
    this.validatePayeeData(payeeData);

    // 2. Формування запиту
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
      accountType: payeeData.accountType || 'PERSONAL',
      paymentType: payeeData.paymentType || 'REGULAR'
    };

    // 3. Виклик Router API
    try {
      const response = await this.sendVoPRequest(request);

      // 4. Логування
      await this.logVoPTransaction(request, response);

      return this.formatResponse(response);
    } catch (error) {
      console.error('VoP request failed:', error);
      return this.handleError(error, request.requestId);
    }
  }

  /**
   * Відправка VoP запиту до Router
   */
  async sendVoPRequest(request) {
    const token = await this.getAccessToken();

    const response = await axios.post(
      `${this.routerUrl}/vop/v1/verify`,
      request,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Request-ID': request.requestId
        },
        timeout: 3000, // 3 seconds
        httpsAgent: this.getHttpsAgent() // mTLS
      }
    );

    return response.data;
  }

  /**
   * Отримання OAuth access token
   */
  async getAccessToken() {
    // Якщо токен валідний — повернути його
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    // Отримати новий токен
    const response = await axios.post(
      `${this.config.authServerUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: 'vop:request'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // -1 min buffer

    return this.accessToken;
  }

  /**
   * mTLS Agent
   */
  getHttpsAgent() {
    const https = require('https');
    const fs = require('fs');

    return new https.Agent({
      cert: fs.readFileSync(this.config.clientCert),
      key: fs.readFileSync(this.config.clientKey),
      ca: fs.readFileSync(this.config.caCert),
      rejectUnauthorized: true
    });
  }

  /**
   * Валідація даних
   */
  validatePayeeData(data) {
    if (!data.iban || !this.validateIBAN(data.iban)) {
      throw new Error('Invalid IBAN');
    }
    if (!data.name || data.name.length < 1 || data.name.length > 140) {
      throw new Error('Invalid name');
    }
  }

  /**
   * Валідація IBAN
   */
  validateIBAN(iban) {
    // Видалити пробіли
    iban = iban.replace(/\s/g, '').toUpperCase();

    // Перевірити довжину
    if (iban.length !== 29) return false;

    // Перевірити код країни
    if (!iban.startsWith('UA')) return false;

    // Перевірити checksum (mod 97)
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);

    return BigInt(numeric) % 97n === 1n;
  }

  /**
   * Форматування відповіді для UI
   */
  formatResponse(response) {
    const { result } = response;

    return {
      requestId: response.requestId,
      matchStatus: result.matchStatus,
      matchScore: result.matchScore,
      verifiedName: result.verifiedName,
      accountStatus: result.accountStatus,
      message: this.getClientMessage(result),
      action: this.getRecommendedAction(result.matchStatus)
    };
  }

  /**
   * Повідомлення для клієнта
   */
  getClientMessage(result) {
    switch (result.matchStatus) {
      case 'MATCH':
        return `✅ Реквізити підтверджені: ${result.verifiedName}`;
      case 'CLOSE_MATCH':
        return `⚠️ Можлива помилка в імені. Перевірте: ${result.verifiedName}`;
      case 'NO_MATCH':
        return '❌ Ім\'я не співпадає з рахунком. Перевірте реквізити.';
      case 'NOT_SUPPORTED':
        return 'ℹ️ Перевірка реквізитів недоступна для цього рахунку.';
      case 'ERROR':
        return '⚠️ Помилка перевірки. Спробуйте пізніше.';
      default:
        return 'Невідомий статус';
    }
  }

  /**
   * Рекомендована дія
   */
  getRecommendedAction(matchStatus) {
    switch (matchStatus) {
      case 'MATCH':
        return 'CONTINUE'; // Можна продовжити
      case 'CLOSE_MATCH':
        return 'WARN'; // Показати попередження
      case 'NO_MATCH':
        return 'STOP'; // Рекомендовано зупинити
      case 'NOT_SUPPORTED':
      case 'ERROR':
        return 'OPTIONAL'; // Опційно продовжити
      default:
        return 'STOP';
    }
  }

  /**
   * Логування транзакції
   */
  async logVoPTransaction(request, response) {
    const log = {
      timestamp: new Date(),
      requestId: request.requestId,
      iban_masked: this.maskIBAN(request.payee.iban),
      matchStatus: response.result.matchStatus,
      matchScore: response.result.matchScore,
      processingTime: response.processingTime
    };

    // Зберегти в БД або log file
    await this.db.saveVoPLog(log);
  }

  /**
   * Маскування IBAN для логів
   */
  maskIBAN(iban) {
    return iban.slice(0, 4) + '********' + iban.slice(-5);
  }

  /**
   * Обробка помилок
   */
  handleError(error, requestId) {
    if (error.code === 'ECONNABORTED') {
      return {
        requestId: requestId,
        matchStatus: 'ERROR',
        message: '⚠️ Перевірка недоступна (timeout). Можете продовжити.',
        action: 'OPTIONAL'
      };
    }

    return {
      requestId: requestId,
      matchStatus: 'ERROR',
      message: '⚠️ Технічна помилка. Спробуйте пізніше.',
      action: 'OPTIONAL'
    };
  }
}

module.exports = VoPRequester;
```

### 3.3 Інтеграція з Payment Flow

```javascript
// payment-service.js
const VoPRequester = require('./vop-requester');

class PaymentService {
  constructor() {
    this.vopRequester = new VoPRequester(config);
  }

  /**
   * Створення платежу з VoP перевіркою
   */
  async createPayment(paymentData, userId) {
    // 1. VoP перевірка (ПЕРЕД створенням платежу)
    const vopResult = await this.vopRequester.verifyPayee({
      iban: paymentData.recipientIban,
      name: paymentData.recipientName,
      identificationType: paymentData.recipientIdType,
      identificationCode: paymentData.recipientIdCode,
      accountType: paymentData.accountType,
      paymentType: paymentData.paymentType
    });

    // 2. Зберегти результат VoP
    paymentData.vopResult = vopResult;

    // 3. Якщо NO_MATCH — вимагати підтвердження від клієнта
    if (vopResult.matchStatus === 'NO_MATCH' && !paymentData.confirmedByUser) {
      return {
        status: 'CONFIRMATION_REQUIRED',
        vopResult: vopResult,
        message: 'Реквізити не співпадають. Підтвердіть платіж.'
      };
    }

    // 4. Створити платіж
    const payment = await this.createPaymentRecord(paymentData, userId);

    // 5. Відправити pacs.008 до СЕП
    await this.sendToSEP(payment);

    return {
      status: 'SUCCESS',
      paymentId: payment.id,
      vopResult: vopResult
    };
  }
}
```

---

## 4. Реалізація VoP Responder

### 4.1 Архітектура Responder

```
┌───────────────┐
│  VoP Router   │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ VoP Responder │ ← Новий компонент
│   Service     │
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Client DB   │ ← Існуюча БД клієнтів
└───────────────┘
```

### 4.2 Приклад реалізації (Python)

```python
# vop_responder.py
from flask import Flask, request, jsonify
from datetime import datetime
import logging

app = Flask(__name__)

class VoPResponder:
    def __init__(self, db, config):
        self.db = db
        self.config = config
        self.name_matcher = NameMatcher()

    @app.route('/vop/v1/verify', methods=['POST'])
    def verify_payee(self):
        """
        Endpoint для обробки VoP запитів
        """
        try:
            # 1. Валідація запиту
            vop_request = request.json
            self.validate_request(vop_request)

            # 2. Пошук клієнта за IBAN
            iban = vop_request['payee']['iban']
            account = self.db.find_account_by_iban(iban)

            if not account:
                return self.account_not_found_response(vop_request)

            # 3. Перевірка opt-out
            if account.vop_opted_out:
                return self.opted_out_response(vop_request)

            # 4. Перевірка статусу рахунку
            account_status = self.get_account_status(account)

            # 5. Name matching
            request_name = vop_request['payee']['name']
            account_name = account.client_name

            match_result = self.name_matcher.match(request_name, account_name)

            # 6. Формування відповіді
            response = {
                'requestId': vop_request['requestId'],
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'responder': {
                    'bic': self.config['bic'],
                    'nbuId': self.config['nbuId']
                },
                'result': {
                    'matchStatus': match_result['status'],
                    'matchScore': match_result['score'],
                    'reasonCode': match_result['reason_code'],
                    'reasonDescription': match_result['description'],
                    'verifiedName': account_name,
                    'accountStatus': account_status
                },
                'processingTime': self.calculate_processing_time()
            }

            # 7. Логування
            self.log_vop_request(vop_request, response)

            return jsonify(response), 200

        except Exception as e:
            logging.error(f"VoP error: {e}")
            return self.error_response(vop_request.get('requestId'), str(e)), 500

    def account_not_found_response(self, vop_request):
        """
        Відповідь якщо рахунок не знайдено
        """
        return jsonify({
            'requestId': vop_request['requestId'],
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'responder': {
                'bic': self.config['bic'],
                'nbuId': self.config['nbuId']
            },
            'result': {
                'matchStatus': 'NO_MATCH',
                'matchScore': 0,
                'reasonCode': 'ANNM',
                'reasonDescription': 'Account not found'
            },
            'processingTime': self.calculate_processing_time()
        }), 200

    def opted_out_response(self, vop_request):
        """
        Відповідь якщо клієнт opted out
        """
        return jsonify({
            'requestId': vop_request['requestId'],
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'responder': {
                'bic': self.config['bic'],
                'nbuId': self.config['nbuId']
            },
            'result': {
                'matchStatus': 'NOT_SUPPORTED',
                'reasonCode': 'OPTO',
                'reasonDescription': 'Client opted out from VoP'
            },
            'processingTime': self.calculate_processing_time()
        }), 200


class NameMatcher:
    """
    Клас для name matching
    """
    def match(self, name1, name2):
        # 1. Нормалізація
        norm1 = self.normalize(name1)
        norm2 = self.normalize(name2)

        # 2. Exact match
        if norm1 == norm2:
            return {
                'status': 'MATCH',
                'score': 100,
                'reason_code': 'ANNM',
                'description': 'Account name match'
            }

        # 3. Fuzzy matching
        lev_score = self.levenshtein_similarity(norm1, norm2)
        jw_score = self.jaro_winkler_similarity(norm1, norm2)

        max_score = max(lev_score, jw_score)

        # 4. Визначити статус
        if max_score >= 95:
            status = 'MATCH'
            reason_code = 'ANNM'
            description = 'Account name match'
        elif max_score >= 75:
            status = 'CLOSE_MATCH'
            reason_code = 'MBAM'
            description = 'May be a match'
        else:
            status = 'NO_MATCH'
            reason_code = 'ANNM'
            description = 'Account name no match'

        return {
            'status': status,
            'score': round(max_score, 2),
            'reason_code': reason_code,
            'description': description
        }

    def normalize(self, name):
        """
        Нормалізація імені
        """
        name = name.lower().strip()
        name = ' '.join(name.split())  # Multiple spaces → single
        # Remove special characters except hyphen
        import re
        name = re.sub(r'[^\w\s-]', '', name)
        return name

    # Реалізація Levenshtein та Jaro-Winkler
    # (див. matching_rules.md)
```

---

## 5. Тестування

### 5.1 Unit Tests

```javascript
// vop-requester.test.js
const VoPRequester = require('./vop-requester');

describe('VoP Requester', () => {
  let requester;

  beforeEach(() => {
    requester = new VoPRequester(testConfig);
  });

  test('should validate IBAN correctly', () => {
    expect(requester.validateIBAN('UA213052990000026007233566001')).toBe(true);
    expect(requester.validateIBAN('INVALID')).toBe(false);
  });

  test('should mask IBAN for logging', () => {
    const masked = requester.maskIBAN('UA213052990000026007233566001');
    expect(masked).toBe('UA21********66001');
  });

  test('should handle timeout error', () => {
    const error = { code: 'ECONNABORTED' };
    const result = requester.handleError(error, 'req-123');
    expect(result.matchStatus).toBe('ERROR');
    expect(result.action).toBe('OPTIONAL');
  });
});
```

### 5.2 Integration Tests

```python
# test_vop_responder.py
import pytest
from vop_responder import VoPResponder

def test_vop_match():
    """
    Тест повного співпадіння
    """
    request = {
        'requestId': 'test-123',
        'payee': {
            'iban': 'UA213052990000026007233566001',
            'name': 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
        }
    }

    response = responder.verify_payee(request)
    assert response['result']['matchStatus'] == 'MATCH'
    assert response['result']['matchScore'] >= 95

def test_vop_close_match():
    """
    Тест часткового співпадіння
    """
    request = {
        'requestId': 'test-124',
        'payee': {
            'iban': 'UA213052990000026007233566001',
            'name': 'ШЕВЧЕНКО ТАРАС'  # Відсутнє по батькові
        }
    }

    response = responder.verify_payee(request)
    assert response['result']['matchStatus'] == 'CLOSE_MATCH'
    assert 75 <= response['result']['matchScore'] < 95
```

### 5.3 Performance Tests

```javascript
// performance-test.js
const loadtest = require('loadtest');

const options = {
  url: 'https://vop-router-test.nbu.gov.ua/api/vop/v1/verify',
  maxRequests: 10000,
  concurrency: 100,
  method: 'POST',
  body: JSON.stringify(testRequest),
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
};

loadtest.loadTest(options, (error, result) => {
  if (error) {
    console.error('Load test failed:', error);
    return;
  }

  console.log('Load test results:');
  console.log(`  Total requests: ${result.totalRequests}`);
  console.log(`  Total errors: ${result.totalErrors}`);
  console.log(`  Mean latency: ${result.meanLatencyMs} ms`);
  console.log(`  P95 latency: ${result.percentiles['95']} ms`);
  console.log(`  P99 latency: ${result.percentiles['99']} ms`);
  console.log(`  RPS: ${result.rps}`);
});
```

---

## 6. Production Deployment

### 6.1 Kubernetes Deployment

```yaml
# vop-responder-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vop-responder
  namespace: vop
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vop-responder
  template:
    metadata:
      labels:
        app: vop-responder
    spec:
      containers:
      - name: vop-responder
        image: yourbank/vop-responder:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: vop-secrets
              key: database-url
        - name: BIC
          value: "YOURBANKUA2X"
        - name: NBU_ID
          value: "300099"
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: vop-responder
  namespace: vop
spec:
  selector:
    app: vop-responder
  ports:
  - protocol: TCP
    port: 443
    targetPort: 8080
  type: LoadBalancer
```

### 6.2 Моніторинг

```yaml
# prometheus-servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: vop-responder
  namespace: vop
spec:
  selector:
    matchLabels:
      app: vop-responder
  endpoints:
  - port: metrics
    interval: 30s
```

---

## 7. Моніторинг та підтримка

### 7.1 Ключові метрики

```
vop_requests_total - Загальна кількість запитів
vop_requests_duration_seconds - Час обробки
vop_requests_by_status{status="MATCH|NO_MATCH|..."} - Запити за статусом
vop_errors_total - Кількість помилок
vop_name_matching_score - Розподіл match scores
```

### 7.2 Alerts

```yaml
# alerts.yaml
groups:
- name: vop_alerts
  rules:
  - alert: VoPHighLatency
    expr: histogram_quantile(0.99, vop_requests_duration_seconds) > 3
    for: 5m
    annotations:
      summary: "VoP latency is high"
      description: "P99 latency is {{ $value }} seconds"

  - alert: VoPHighErrorRate
    expr: rate(vop_errors_total[5m]) > 0.05
    for: 5m
    annotations:
      summary: "VoP error rate is high"
      description: "Error rate is {{ $value }}"
```

---

## Висновки

Успішне впровадження VoP вимагає:

✅ **Підготовка** — інфраструктура, команда, сертифікати
✅ **Розробка** — Requester та Responder APIs
✅ **Тестування** — unit, integration, performance tests
✅ **Deployment** — Kubernetes, моніторинг, alerts
✅ **Підтримка** — 24/7 моніторинг, incident management

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
