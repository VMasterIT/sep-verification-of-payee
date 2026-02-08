# Сценарії інтеграції VoP з банківськими системами

**Версія:** 1.0
**Дата:** 2026-02-07
**Аудиторія:** Банки, ННПП, Архітектори, DevOps інженери

---

## Зміст

1. [Вступ](#вступ)
2. [Типи інтеграцій](#типи-інтеграцій)
3. [Інтеграція з Core Banking Systems](#інтеграція-з-core-banking-systems)
4. [Інтеграція з Digital Banking](#інтеграція-з-digital-banking)
5. [Інтеграція через ESB](#інтеграція-через-esb)
6. [Інтеграція з платіжними шлюзами](#інтеграція-з-платіжними-шлюзами)
7. [High Availability архітектури](#high-availability-архітектури)
8. [Disaster Recovery](#disaster-recovery)
9. [Testing Environments](#testing-environments)
10. [Monitoring та Logging](#monitoring-та-logging)
11. [Fraud Detection Integration](#fraud-detection-integration)
12. [Performance Optimization](#performance-optimization)

---

## Вступ

VoP інтегрується в існуючу банківську інфраструктуру та має працювати з різними системами:

- **Core Banking Systems (CBS)** — основна система обліку клієнтів та рахунків
- **Digital Banking** — інтернет-банкінг, мобільні додатки
- **Payment Gateway** — шлюз для платежів до СЕП НБУ
- **ESB (Enterprise Service Bus)** — шина для інтеграції систем
- **Fraud Detection** — системи виявлення шахрайства
- **Monitoring** — моніторинг та logging

**Ключові принципи інтеграції:**

✅ **Мінімальна інвазивність** — VoP не змінює існуючі процеси, а доповнює їх
✅ **Loose coupling** — слабке зв'язування з існуючими системами
✅ **Fail-safe** — якщо VoP недоступна, платежі продовжують працювати
✅ **Performance** — VoP перевірка не повинна сповільнювати платежі
✅ **Security** — захист даних клієнтів та банківської таємниці

---

## Типи інтеграцій

### 1. Direct Integration (Пряма інтеграція)

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Digital    │──────│  VoP Client  │──────│  VoP Router  │
│   Banking    │ HTTP │   (Java/     │ mTLS │    (NBU)     │
│   Backend    │      │   Node.js)   │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
```

**Коли використовувати:**
- ✅ Малі та середні банки
- ✅ Проста архітектура
- ✅ Швидке впровадження

**Переваги:**
- Простота впровадження
- Низька латентність
- Легке налаштування

**Недоліки:**
- Потребує змін в Digital Banking backend
- Складніше масштабування

---

### 2. ESB Integration (Через шину)

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Digital    │──────│     ESB      │──────│  VoP Adapter │──────│  VoP Router  │
│   Banking    │ SOAP/│   (IBM MQ,   │ HTTP │   (Gateway)  │ mTLS │    (NBU)     │
│              │ REST │   MuleSoft)  │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘      └──────────────┘
```

**Коли використовувати:**
- ✅ Великі банки з ESB
- ✅ Багато інтеграцій
- ✅ Централізоване управління

**Переваги:**
- Централізована точка інтеграції
- Легше додати нові системи
- Monitoring та logging з коробки

**Недоліки:**
- Додаткова латентність (ESB overhead)
- Складніша архітектура
- Залежність від ESB

---

### 3. API Gateway Pattern

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Mobile App │──────│  API Gateway │──────│  VoP Service │
│   Web App    │ HTTPS│   (Kong,     │ HTTP │  (Internal)  │
│   3rd Party  │      │   AWS API GW)│      │              │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                    │ mTLS
                                             ┌──────▼───────┐
                                             │  VoP Router  │
                                             │    (NBU)     │
                                             └──────────────┘
```

**Коли використовувати:**
- ✅ Microservices архітектура
- ✅ API-first підхід
- ✅ Потрібен rate limiting, throttling

**Переваги:**
- Rate limiting та throttling
- Centralized authentication
- API versioning
- Analytics та monitoring

---

## Інтеграція з Core Banking Systems

### Сценарій 1: Oracle FLEXCUBE (великі банки)

**Архітектура:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Oracle FLEXCUBE (CBS)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Customers  │  │   Accounts   │  │   Payments   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└────────────────────────────┬────────────────────────────────────┘
                             │ JDBC/Oracle DB Link
                      ┌──────▼───────┐
                      │  VoP Service │
                      │  (Java App)  │
                      │  - DB read   │
                      │  - Matching  │
                      │  - Cache     │
                      └──────┬───────┘
                             │ mTLS
                      ┌──────▼───────┐
                      │  VoP Router  │
                      │    (NBU)     │
                      └──────────────┘
```

**Імплементація:**

```java
// VoP Responder для Oracle FLEXCUBE
@Service
public class FlexcubeVopService implements VopResponder {

    @Autowired
    private JdbcTemplate flexcubeJdbc;

    @Autowired
    private NameMatchingService nameMatching;

    @Autowired
    private RedisTemplate<String, Customer> cache;

    @Override
    public VopResponse verify(VopRequest request) {
        String iban = request.getPayee().getIban();
        String requestedName = request.getPayee().getName();

        // 1. Check cache first
        String cacheKey = "vop:iban:" + iban;
        Customer customer = cache.opsForValue().get(cacheKey);

        if (customer == null) {
            // 2. Query FLEXCUBE database
            customer = queryFlexcube(iban);

            if (customer != null) {
                // Cache for 5 minutes
                cache.opsForValue().set(cacheKey, customer, 5, TimeUnit.MINUTES);
            }
        }

        // 3. If account not found
        if (customer == null) {
            return VopResponse.builder()
                .matchStatus(MatchStatus.NO_MATCH)
                .reasonCode("UNKN")
                .reasonDescription("Account not found")
                .build();
        }

        // 4. Check account status
        if (!customer.getAccountStatus().equals("ACTIVE")) {
            return VopResponse.builder()
                .matchStatus(MatchStatus.NO_MATCH)
                .reasonCode("ACLS")
                .reasonDescription("Account closed or blocked")
                .accountStatus(customer.getAccountStatus())
                .build();
        }

        // 5. Name matching
        MatchResult matchResult = nameMatching.match(
            requestedName,
            customer.getFullName()
        );

        // 6. Build response
        return VopResponse.builder()
            .matchStatus(matchResult.getStatus())
            .matchScore(matchResult.getScore())
            .reasonCode(matchResult.getReasonCode())
            .verifiedName(customer.getFullName())
            .accountStatus("ACTIVE")
            .build();
    }

    private Customer queryFlexcube(String iban) {
        String sql = """
            SELECT
                c.customer_id,
                c.full_name,
                c.first_name,
                c.last_name,
                c.middle_name,
                c.identification_type,
                c.identification_code,
                a.account_number,
                a.iban,
                a.account_status,
                a.account_class
            FROM
                sttm_customer c
            INNER JOIN
                sttm_cust_account ca ON c.customer_id = ca.customer_id
            INNER JOIN
                sttm_account a ON ca.account_id = a.account_id
            WHERE
                a.iban = ?
                AND a.delete_flag = 'N'
            """;

        try {
            return flexcubeJdbc.queryForObject(sql,
                new Object[]{iban},
                new CustomerRowMapper()
            );
        } catch (EmptyResultDataAccessException e) {
            return null;
        }
    }
}
```

**Налаштування:**

```yaml
# application.yml
spring:
  datasource:
    flexcube:
      url: jdbc:oracle:thin:@flexcube-db:1521:FCUBS
      username: ${FLEXCUBE_USER}
      password: ${FLEXCUBE_PASSWORD}
      driver-class-name: oracle.jdbc.OracleDriver
      hikari:
        maximum-pool-size: 20
        minimum-idle: 5
        connection-timeout: 10000

redis:
  host: redis-cluster
  port: 6379
  password: ${REDIS_PASSWORD}
  database: 1

vop:
  cache:
    ttl: 300  # 5 minutes
  performance:
    max-query-time: 500  # 500ms max for DB query
```

---

### Сценарій 2: Temenos T24 (середні банки)

**Архітектура:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      Temenos T24 (CBS)                          │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │   jBASE DB   │  │   T24 APIs   │                            │
│  └──────────────┘  └──────┬───────┘                            │
└─────────────────────────────┼──────────────────────────────────┘
                              │ SOAP/REST
                       ┌──────▼───────┐
                       │  VoP Adapter │
                       │  (Node.js)   │
                       │  - T24 API   │
                       │  - Transform │
                       └──────┬───────┘
                              │ mTLS
                       ┌──────▼───────┐
                       │  VoP Router  │
                       │    (NBU)     │
                       └──────────────┘
```

**Імплементація:**

```javascript
// VoP Responder для Temenos T24
const t24Client = require('./t24-api-client');
const nameMatching = require('./name-matching');
const redis = require('redis').createClient();

class T24VopService {
  async verify(vopRequest) {
    const { iban, name } = vopRequest.payee;

    // 1. Check cache
    const cacheKey = `vop:t24:${iban}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return this.processCustomer(JSON.parse(cached), name);
    }

    // 2. Call T24 API to get customer by IBAN
    let customer;
    try {
      // T24 API call: ENQUIRY.SELECT > CUSTOMER.IBAN
      const response = await t24Client.enquiry({
        enquiry: 'CUSTOMER.IBAN',
        selection: `IBAN EQ ${iban}`
      });

      if (!response || response.length === 0) {
        return {
          matchStatus: 'NO_MATCH',
          reasonCode: 'UNKN',
          reasonDescription: 'Account not found in T24'
        };
      }

      customer = response[0];

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(customer));

    } catch (error) {
      console.error('T24 API error:', error);
      return {
        matchStatus: 'ERROR',
        reasonCode: 'TCHA',
        reasonDescription: 'Technical error querying T24'
      };
    }

    // 3. Process customer data
    return this.processCustomer(customer, name);
  }

  processCustomer(customer, requestedName) {
    // Check account status
    if (customer.accountStatus !== 'LIVE') {
      return {
        matchStatus: 'NO_MATCH',
        reasonCode: 'ACLS',
        reasonDescription: 'Account not active',
        accountStatus: customer.accountStatus
      };
    }

    // Name matching
    const fullName = this.buildFullName(customer);
    const matchResult = nameMatching.match(requestedName, fullName);

    return {
      matchStatus: matchResult.status,
      matchScore: matchResult.score,
      reasonCode: matchResult.reasonCode,
      verifiedName: fullName,
      accountStatus: 'ACTIVE'
    };
  }

  buildFullName(customer) {
    // T24 stores name in segments
    const parts = [
      customer.firstName,
      customer.middleName,
      customer.lastName
    ].filter(Boolean);

    return parts.join(' ').toUpperCase();
  }
}

module.exports = new T24VopService();
```

---

### Сценарій 3: Власна CBS (малі банки, ННПП)

**Архітектура:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  Custom Core Banking System                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  PostgreSQL  │  │  REST API    │  │   Backend    │        │
│  │   Database   │  │   Gateway    │  │   Services   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────┬────────────────────────────────────────────────────┘
              │ Direct SQL or REST
       ┌──────▼───────┐
       │  VoP Service │
       │  (Python)    │
       │  - SQLAlchemy│
       │  - FastAPI   │
       └──────┬───────┘
              │ mTLS
       ┌──────▼───────┐
       │  VoP Router  │
       │    (NBU)     │
       └──────────────┘
```

**Імплементація:**

```python
# VoP Responder для Custom CBS (Python + FastAPI)
from fastapi import FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis
from typing import Optional

from .models import Customer, Account
from .name_matching import NameMatcher
from .schemas import VopRequest, VopResponse, MatchStatus

app = FastAPI()
name_matcher = NameMatcher()
redis_client = redis.from_url("redis://localhost")

class CustomCBSVopService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def verify(self, request: VopRequest) -> VopResponse:
        iban = request.payee.iban
        requested_name = request.payee.name

        # 1. Check cache
        cache_key = f"vop:customer:{iban}"
        cached = await redis_client.get(cache_key)

        if cached:
            customer_data = json.loads(cached)
        else:
            # 2. Query database
            customer_data = await self._query_customer(iban)

            if not customer_data:
                return VopResponse(
                    matchStatus=MatchStatus.NO_MATCH,
                    reasonCode="UNKN",
                    reasonDescription="Account not found"
                )

            # Cache for 5 minutes
            await redis_client.setex(
                cache_key,
                300,
                json.dumps(customer_data)
            )

        # 3. Check account status
        if customer_data['account_status'] != 'ACTIVE':
            return VopResponse(
                matchStatus=MatchStatus.NO_MATCH,
                reasonCode="ACLS",
                reasonDescription="Account closed or blocked",
                accountStatus=customer_data['account_status']
            )

        # 4. Name matching
        verified_name = customer_data['full_name']
        match_result = name_matcher.match(requested_name, verified_name)

        return VopResponse(
            matchStatus=match_result.status,
            matchScore=match_result.score,
            reasonCode=match_result.reason_code,
            verifiedName=verified_name,
            accountStatus="ACTIVE"
        )

    async def _query_customer(self, iban: str) -> Optional[dict]:
        """Query customer and account from database"""
        query = select(
            Customer.customer_id,
            Customer.full_name,
            Customer.first_name,
            Customer.last_name,
            Customer.identification_type,
            Customer.identification_code,
            Account.iban,
            Account.account_status
        ).join(
            Account, Customer.customer_id == Account.customer_id
        ).where(
            Account.iban == iban
        ).where(
            Account.deleted_at.is_(None)
        )

        result = await self.db.execute(query)
        row = result.first()

        if not row:
            return None

        return {
            'customer_id': row.customer_id,
            'full_name': row.full_name,
            'first_name': row.first_name,
            'last_name': row.last_name,
            'identification_type': row.identification_type,
            'identification_code': row.identification_code,
            'iban': row.iban,
            'account_status': row.account_status
        }

@app.post("/vop/v1/verify")
async def verify_endpoint(
    request: VopRequest,
    db: AsyncSession = Depends(get_db)
):
    service = CustomCBSVopService(db)
    return await service.verify(request)
```

---

## Інтеграція з Digital Banking

### Сценарій 4: Мобільний банкінг (React Native)

**User Flow:**

```
┌──────────────────────────────────────────────────────────────┐
│                    Mobile App (React Native)                 │
│                                                              │
│  1. User fills payment form                                 │
│     ┌─────────────────────────────────────┐                │
│     │ Отримувач: [ПЕТРЕНКО О.І.      ] │                │
│     │ IBAN:      [UA21305299...      ] │                │
│     │ Сума:      [5000] UAH           │                │
│     │                                  │                │
│     │  [Перевірити реквізити] ← Click│                │
│     └─────────────────────────────────────┘                │
│                                                              │
│  2. Call VoP API                                            │
│     POST /api/vop/check                                     │
│     { iban: "UA21...", name: "ПЕТРЕНКО О.І." }             │
│                                                              │
│  3. Show result                                             │
│     ✅ Match:        "Реквізити підтверджені"               │
│     ⚠️  Close Match: "Можлива помилка: [actual name]"      │
│     ❌ No Match:     "Реквізити не співпадають"             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Імплементація (React Native):**

```typescript
// VoP integration in React Native mobile app
import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { vopApi } from './api/vop';

export function PaymentForm() {
  const [iban, setIban] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState('');
  const [vopResult, setVopResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyRecipient = async () => {
    if (!iban || !recipientName) {
      Alert.alert('Помилка', 'Заповніть IBAN та імʼя отримувача');
      return;
    }

    setIsVerifying(true);

    try {
      const result = await vopApi.verify({
        iban: iban,
        name: recipientName.toUpperCase(),
        accountType: 'PERSONAL',
        paymentType: 'INSTANT'
      });

      setVopResult(result);
      showVopResult(result);

    } catch (error) {
      Alert.alert(
        'Помилка перевірки',
        'Не вдалося перевірити реквізити. Спробуйте пізніше.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const showVopResult = (result) => {
    switch (result.matchStatus) {
      case 'MATCH':
        Alert.alert(
          '✅ Реквізити підтверджені',
          `Отримувач: ${result.verifiedName}\n\nВи можете продовжити платіж.`,
          [{ text: 'OK', onPress: () => submitPayment() }]
        );
        break;

      case 'CLOSE_MATCH':
        Alert.alert(
          '⚠️ Можлива помилка в реквізитах',
          `Ви ввели: ${recipientName}\n` +
          `В банку зареєстровано: ${result.verifiedName}\n\n` +
          `Перевірте правильність написання.`,
          [
            { text: 'Виправити', style: 'cancel' },
            {
              text: 'Продовжити',
              onPress: () => confirmCloseMatch(result)
            }
          ]
        );
        break;

      case 'NO_MATCH':
        Alert.alert(
          '❌ Реквізити не співпадають',
          `Імʼя не співпадає з даними банку-отримувача.\n\n` +
          `Перевірте правильність IBAN та імені отримувача.`,
          [{ text: 'OK' }]
        );
        break;

      case 'ERROR':
      case 'NOT_SUPPORTED':
        Alert.alert(
          'Перевірка недоступна',
          'Не вдалося перевірити реквізити. Ви можете продовжити на свій ризик.',
          [
            { text: 'Скасувати', style: 'cancel' },
            { text: 'Продовжити без перевірки', onPress: () => submitPayment() }
          ]
        );
        break;
    }
  };

  const confirmCloseMatch = (result) => {
    Alert.alert(
      'Підтвердження',
      '⚠️ Ви підтверджуєте платіж з розбіжністю в імені.\n\n' +
      'У випадку помилки повернення коштів може зайняти до 72 годин.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Підтверджую',
          onPress: () => submitPayment(),
          style: 'destructive'
        }
      ]
    );
  };

  const submitPayment = async () => {
    // Submit payment to backend
    // Include VoP result for audit
    // ...
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>IBAN отримувача</Text>
      <TextInput
        value={iban}
        onChangeText={setIban}
        placeholder="UA213052990000026007233566001"
        style={styles.input}
      />

      <Text style={styles.label}>Імʼя отримувача</Text>
      <TextInput
        value={recipientName}
        onChangeText={setRecipientName}
        placeholder="ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
        style={styles.input}
        autoCapitalize="characters"
      />

      <Text style={styles.label}>Сума</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="1000"
        keyboardType="numeric"
        style={styles.input}
      />

      {vopResult && (
        <VopResultBadge result={vopResult} />
      )}

      <Button
        title="Перевірити реквізити"
        onPress={verifyRecipient}
        disabled={isVerifying}
      />

      <Button
        title="Відправити платіж"
        onPress={submitPayment}
        disabled={!vopResult || vopResult.matchStatus === 'NO_MATCH'}
      />
    </View>
  );
}
```

**Backend API (Node.js):**

```javascript
// Backend API для mobile app
const express = require('express');
const vopClient = require('./vop-client');
const auth = require('./middleware/auth');

const router = express.Router();

// VoP check endpoint for mobile app
router.post('/api/vop/check', auth.verifyToken, async (req, res) => {
  const { iban, name, accountType, paymentType } = req.body;
  const userId = req.user.id;

  // Validate input
  if (!iban || !name) {
    return res.status(400).json({
      error: 'Missing required fields: iban, name'
    });
  }

  try {
    // Call VoP Router
    const vopRequest = {
      requestId: generateRequestId(),
      timestamp: new Date().toISOString(),
      requester: {
        nbuId: process.env.BANK_NBU_ID
      },
      payee: {
        iban: iban,
        name: name.toUpperCase()
      },
      accountType: accountType || 'PERSONAL',
      paymentType: paymentType || 'REGULAR'
    };

    const vopResponse = await vopClient.verify(vopRequest);

    // Log for audit
    await auditLog.create({
      userId: userId,
      action: 'VOP_CHECK',
      requestId: vopRequest.requestId,
      iban: hashIban(iban),
      matchStatus: vopResponse.matchStatus,
      timestamp: new Date()
    });

    // Return response to mobile app
    res.json({
      matchStatus: vopResponse.matchStatus,
      matchScore: vopResponse.matchScore,
      reasonCode: vopResponse.reasonCode,
      verifiedName: vopResponse.verifiedName,
      accountStatus: vopResponse.accountStatus
    });

  } catch (error) {
    console.error('VoP check error:', error);

    // Don't block payment if VoP is unavailable
    res.json({
      matchStatus: 'ERROR',
      reasonCode: 'TCHA',
      reasonDescription: 'VoP temporarily unavailable'
    });
  }
});

module.exports = router;
```

---

### Сценарій 5: Інтернет-банкінг (Angular)

**Імплементація (Angular):**

```typescript
// VoP service for Angular web app
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface VopCheckRequest {
  iban: string;
  name: string;
  accountType?: string;
  paymentType?: string;
}

export interface VopCheckResponse {
  matchStatus: 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH' | 'ERROR' | 'NOT_SUPPORTED';
  matchScore?: number;
  reasonCode: string;
  verifiedName?: string;
  accountStatus?: string;
}

@Injectable({
  providedIn: 'root'
})
export class VopService {
  private apiUrl = '/api/vop';

  constructor(private http: HttpClient) {}

  checkRecipient(request: VopCheckRequest): Observable<VopCheckResponse> {
    return this.http.post<VopCheckResponse>(
      `${this.apiUrl}/check`,
      request
    );
  }
}
```

```typescript
// Payment form component
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { VopService, VopCheckResponse } from './vop.service';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-payment-form',
  templateUrl: './payment-form.component.html'
})
export class PaymentFormComponent {
  paymentForm: FormGroup;
  vopResult: VopCheckResponse | null = null;
  isVerifying = false;

  constructor(
    private fb: FormBuilder,
    private vopService: VopService,
    private dialog: MatDialog
  ) {
    this.paymentForm = this.fb.group({
      iban: ['', [Validators.required, Validators.pattern(/^UA\d{27}$/)]],
      recipientName: ['', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]]
    });
  }

  verifyRecipient(): void {
    if (this.paymentForm.invalid) {
      return;
    }

    this.isVerifying = true;

    const request = {
      iban: this.paymentForm.value.iban,
      name: this.paymentForm.value.recipientName.toUpperCase(),
      accountType: 'PERSONAL',
      paymentType: 'REGULAR'
    };

    this.vopService.checkRecipient(request).subscribe({
      next: (result) => {
        this.vopResult = result;
        this.showVopDialog(result);
        this.isVerifying = false;
      },
      error: (error) => {
        console.error('VoP error:', error);
        this.isVerifying = false;
        this.showErrorDialog();
      }
    });
  }

  showVopDialog(result: VopCheckResponse): void {
    const dialogRef = this.dialog.open(VopResultDialogComponent, {
      width: '500px',
      data: {
        result: result,
        enteredName: this.paymentForm.value.recipientName
      }
    });

    dialogRef.afterClosed().subscribe(action => {
      if (action === 'submit') {
        this.submitPayment();
      } else if (action === 'correct') {
        // Focus on name field for correction
        // Optionally pre-fill with verified name
        if (result.verifiedName) {
          this.paymentForm.patchValue({
            recipientName: result.verifiedName
          });
        }
      }
    });
  }

  submitPayment(): void {
    // Submit payment with VoP result
    const paymentData = {
      ...this.paymentForm.value,
      vopResult: this.vopResult
    };

    // POST to payment API
    // ...
  }
}
```

---

## Інтеграція через ESB

### Сценарій 6: IBM MQ / WebSphere ESB

**Архітектура:**

```
┌────────────────────────────────────────────────────────────────┐
│                        IBM MQ / ESB                            │
│                                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │    Queue     │───▶│  VoP Adapter │───▶│  VoP Client  │   │
│  │  VOP.REQUEST │    │  (Transform) │    │  (HTTP)      │   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                  │            │
│  ┌──────────────┐    ┌──────────────┐          │            │
│  │    Queue     │◀───│  VoP Adapter │◀─────────┘            │
│  │ VOP.RESPONSE │    │  (Transform) │                        │
│  └──────────────┘    └──────────────┘                        │
└────────────────────────────────────────────────────────────────┘
         │                                        │ mTLS
         │                                 ┌──────▼───────┐
         ▼                                 │  VoP Router  │
┌──────────────┐                           │    (NBU)     │
│  Digital     │                           └──────────────┘
│  Banking     │
└──────────────┘
```

**Імплементація (Java + IBM MQ):**

```java
// VoP MQ Adapter for IBM ESB
@Component
public class VopMqAdapter {

    @Autowired
    private JmsTemplate jmsTemplate;

    @Autowired
    private VopHttpClient vopClient;

    @Value("${ibm.mq.queue.vop.request}")
    private String requestQueue;

    @Value("${ibm.mq.queue.vop.response}")
    private String responseQueue;

    @JmsListener(destination = "${ibm.mq.queue.vop.request}")
    public void handleVopRequest(Message message) {
        try {
            // 1. Parse MQ message
            String messageText = ((TextMessage) message).getText();
            VopMqRequest mqRequest = parseXmlToRequest(messageText);

            // 2. Transform to VoP JSON format
            VopRequest vopRequest = transformToVopRequest(mqRequest);

            // 3. Call VoP Router via HTTP
            VopResponse vopResponse = vopClient.verify(vopRequest);

            // 4. Transform response to MQ format
            String xmlResponse = transformToXmlResponse(vopResponse);

            // 5. Send to response queue
            jmsTemplate.convertAndSend(responseQueue, xmlResponse, m -> {
                m.setJMSCorrelationID(message.getJMSMessageID());
                return m;
            });

            log.info("VoP request processed successfully: {}",
                vopRequest.getRequestId());

        } catch (Exception e) {
            log.error("Error processing VoP MQ message", e);
            sendErrorResponse(message, e);
        }
    }

    private VopRequest transformToVopRequest(VopMqRequest mqRequest) {
        return VopRequest.builder()
            .requestId(mqRequest.getRequestId())
            .timestamp(Instant.now().toString())
            .requester(Requester.builder()
                .nbuId(mqRequest.getRequesterNbuId())
                .build())
            .payee(Payee.builder()
                .iban(mqRequest.getPayeeIban())
                .name(mqRequest.getPayeeName())
                .build())
            .accountType(mqRequest.getAccountType())
            .paymentType(mqRequest.getPaymentType())
            .build();
    }

    private String transformToXmlResponse(VopResponse vopResponse) {
        // Transform JSON response to XML for ESB
        return String.format("""
            <?xml version="1.0" encoding="UTF-8"?>
            <VopResponse>
                <RequestId>%s</RequestId>
                <Timestamp>%s</Timestamp>
                <Result>
                    <MatchStatus>%s</MatchStatus>
                    <MatchScore>%d</MatchScore>
                    <ReasonCode>%s</ReasonCode>
                    <VerifiedName>%s</VerifiedName>
                    <AccountStatus>%s</AccountStatus>
                </Result>
            </VopResponse>
            """,
            vopResponse.getRequestId(),
            vopResponse.getTimestamp(),
            vopResponse.getMatchStatus(),
            vopResponse.getMatchScore(),
            vopResponse.getReasonCode(),
            vopResponse.getVerifiedName(),
            vopResponse.getAccountStatus()
        );
    }
}
```

**Конфігурація (IBM MQ):**

```yaml
# application.yml
ibm:
  mq:
    queue-manager: QM1
    channel: DEV.APP.SVRCONN
    conn-name: ibmmq.bank.ua(1414)
    user: ${MQ_USER}
    password: ${MQ_PASSWORD}
    queue:
      vop:
        request: VOP.REQUEST
        response: VOP.RESPONSE

spring:
  jms:
    listener:
      concurrency: 5
      max-concurrency: 10
```

---

## Інтеграція з платіжними шлюзами

### Сценарій 7: Payment Gateway Integration

**Архітектура:**

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Digital    │──1──▶│  Payment     │──3──▶│  СЕП НБУ     │
│   Banking    │      │  Gateway     │      │  (pacs.008)  │
└──────┬───────┘      └──────────────┘      └──────────────┘
       │                     ▲
       │ 2. VoP Check        │
       ▼                     │ 4. Status
┌──────────────┐             │
│  VoP Client  │─────────────┘
└──────┬───────┘
       │ mTLS
┌──────▼───────┐
│  VoP Router  │
│    (NBU)     │
└──────────────┘
```

**Flow:**

1. User initiates payment in Digital Banking
2. **VoP check before payment** (NEW!)
3. If VoP OK → submit pacs.008 to SEP NBU via Payment Gateway
4. Payment Gateway processes and sends status back

**Імплементація:**

```java
// Payment Gateway with VoP integration
@Service
public class PaymentGatewayService {

    @Autowired
    private VopClient vopClient;

    @Autowired
    private SepNbuClient sepNbuClient;

    @Autowired
    private PaymentRepository paymentRepo;

    @Transactional
    public PaymentResult processPayment(PaymentRequest request) {
        // 1. Validate payment request
        validatePaymentRequest(request);

        // 2. VoP check (if enabled)
        VopCheckResult vopResult = null;
        if (isVopEnabled()) {
            vopResult = performVopCheck(request);

            // 2.1. Handle VoP result
            if (vopResult.getMatchStatus() == MatchStatus.NO_MATCH) {
                // Block payment on NO_MATCH
                throw new PaymentRejectedException(
                    "Recipient verification failed: " + vopResult.getReasonCode()
                );
            }

            if (vopResult.getMatchStatus() == MatchStatus.CLOSE_MATCH) {
                // Log warning but allow payment (user was warned in UI)
                log.warn("Payment proceeding with CLOSE_MATCH: {}",
                    request.getPaymentId());
            }
        }

        // 3. Create payment record
        Payment payment = Payment.builder()
            .paymentId(request.getPaymentId())
            .fromAccount(request.getFromAccount())
            .toIban(request.getToIban())
            .amount(request.getAmount())
            .recipientName(request.getRecipientName())
            .vopMatchStatus(vopResult != null ? vopResult.getMatchStatus() : null)
            .vopVerifiedName(vopResult != null ? vopResult.getVerifiedName() : null)
            .status(PaymentStatus.PENDING)
            .createdAt(Instant.now())
            .build();

        paymentRepo.save(payment);

        // 4. Submit to SEP NBU (pacs.008)
        try {
            Pacs008 pacs008 = buildPacs008(request, vopResult);
            SepResponse sepResponse = sepNbuClient.submitPayment(pacs008);

            // 5. Update payment status
            payment.setStatus(PaymentStatus.SUBMITTED);
            payment.setSepTransactionId(sepResponse.getTransactionId());
            paymentRepo.save(payment);

            return PaymentResult.success(payment, vopResult);

        } catch (SepException e) {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setErrorCode(e.getCode());
            payment.setErrorMessage(e.getMessage());
            paymentRepo.save(payment);

            throw new PaymentProcessingException("SEP submission failed", e);
        }
    }

    private VopCheckResult performVopCheck(PaymentRequest request) {
        try {
            VopRequest vopRequest = VopRequest.builder()
                .requestId(generateVopRequestId())
                .timestamp(Instant.now().toString())
                .requester(Requester.builder()
                    .nbuId(bankConfig.getNbuId())
                    .build())
                .payee(Payee.builder()
                    .iban(request.getToIban())
                    .name(request.getRecipientName())
                    .build())
                .accountType("PERSONAL")
                .paymentType(request.getPaymentType())
                .build();

            VopResponse vopResponse = vopClient.verify(vopRequest);

            return VopCheckResult.from(vopResponse);

        } catch (VopException e) {
            // Don't block payment if VoP is unavailable
            log.error("VoP check failed, proceeding without verification", e);
            return VopCheckResult.unavailable();
        }
    }

    private Pacs008 buildPacs008(PaymentRequest request, VopCheckResult vopResult) {
        // Build ISO 20022 pacs.008 message
        // Include VoP result in Supplementary Data if available
        // ...
    }
}
```

---

## High Availability архітектури

### Сценарій 8: Active-Active HA Setup

**Архітектура:**

```
                           ┌──────────────┐
                           │  VoP Router  │
                           │    (NBU)     │
                           └──────┬───────┘
                                  │ mTLS
                    ┌─────────────┼─────────────┐
                    │                           │
           ┌────────▼────────┐         ┌───────▼────────┐
           │  Load Balancer  │         │ Load Balancer  │
           │   (Primary DC)  │         │  (Backup DC)   │
           └────────┬────────┘         └───────┬────────┘
                    │                           │
        ┌───────────┼───────────┐   ┌──────────┼──────────┐
        │           │           │   │          │          │
   ┌────▼───┐  ┌───▼────┐ ┌───▼───▼┐   ┌─────▼──┐  ┌────▼───┐
   │ VoP    │  │  VoP   │ │  VoP  │   │  VoP   │  │  VoP   │
   │Service │  │Service │ │Service│   │Service │  │Service │
   │  #1    │  │  #2    │ │  #3   │   │  #4    │  │  #5    │
   └────┬───┘  └───┬────┘ └───┬───┘   └────┬───┘  └────┬───┘
        │          │          │            │           │
        └──────────┴──────────┴────────────┴───────────┘
                              │
                     ┌────────▼────────┐
                     │  PostgreSQL     │
                     │  (Primary-      │
                     │   Replica)      │
                     └─────────────────┘
```

**Kubernetes Deployment:**

```yaml
# vop-responder-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vop-responder
  namespace: vop-production
spec:
  replicas: 5  # High availability
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2
      maxUnavailable: 1
  selector:
    matchLabels:
      app: vop-responder
  template:
    metadata:
      labels:
        app: vop-responder
        version: v1.0
    spec:
      affinity:
        # Spread pods across nodes for HA
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - vop-responder
              topologyKey: kubernetes.io/hostname

      containers:
      - name: vop-responder
        image: bank.registry.ua/vop-responder:1.0.0
        ports:
        - containerPort: 8443
          name: https
          protocol: TCP

        env:
        - name: SPRING_PROFILES_ACTIVE
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: vop-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: vop-secrets
              key: redis-url

        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"

        livenessProbe:
          httpGet:
            path: /actuator/health/liveness
            port: 8443
            scheme: HTTPS
          initialDelaySeconds: 30
          periodSeconds: 10
          failureThreshold: 3

        readinessProbe:
          httpGet:
            path: /actuator/health/readiness
            port: 8443
            scheme: HTTPS
          initialDelaySeconds: 10
          periodSeconds: 5
          failureThreshold: 3

        volumeMounts:
        - name: tls-certs
          mountPath: /etc/tls
          readOnly: true

      volumes:
      - name: tls-certs
        secret:
          secretName: vop-tls-certificates

---
apiVersion: v1
kind: Service
metadata:
  name: vop-responder
  namespace: vop-production
spec:
  type: ClusterIP
  selector:
    app: vop-responder
  ports:
  - port: 443
    targetPort: 8443
    protocol: TCP
    name: https

---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: vop-responder-pdb
  namespace: vop-production
spec:
  minAvailable: 3  # Always keep at least 3 pods running
  selector:
    matchLabels:
      app: vop-responder
```

**HorizontalPodAutoscaler:**

```yaml
# vop-responder-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: vop-responder-hpa
  namespace: vop-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: vop-responder
  minReplicas: 5
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 2
        periodSeconds: 120
```

---

## Disaster Recovery

### Сценарій 9: DR Setup з Cross-Region Replication

**Архітектура:**

```
Primary Region (Київ)              Backup Region (Львів)
┌─────────────────────────┐       ┌─────────────────────────┐
│  VoP Services (Active)  │       │  VoP Services (Standby) │
│  ┌───┐ ┌───┐ ┌───┐     │       │  ┌───┐ ┌───┐ ┌───┐     │
│  │ 1 │ │ 2 │ │ 3 │     │       │  │ 1'│ │ 2'│ │ 3'│     │
│  └───┘ └───┘ └───┘     │       │  └───┘ └───┘ └───┘     │
└──────────┬──────────────┘       └──────────┬──────────────┘
           │                                  │
     ┌─────▼─────┐                     ┌─────▼─────┐
     │PostgreSQL │─────Replication────▶│PostgreSQL │
     │ Primary   │     (Streaming)     │ Replica   │
     └───────────┘                     └───────────┘
```

**PostgreSQL Streaming Replication:**

```sql
-- Primary server (Київ)
-- postgresql.conf
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
archive_mode = on
archive_command = 'rsync -a %p backup-server:/archive/%f'

-- Create replication user
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'secure_password';

-- Create replication slot
SELECT * FROM pg_create_physical_replication_slot('standby_slot');
```

```sql
-- Standby server (Львів)
-- recovery.conf (or postgresql.auto.conf for PG 12+)
primary_conninfo = 'host=primary.kyiv.bank.ua port=5432 user=replicator password=secure_password'
primary_slot_name = 'standby_slot'
restore_command = 'rsync backup-server:/archive/%f %p'
```

**Failover Procedure:**

```bash
#!/bin/bash
# failover-to-lviv.sh

echo "Starting failover to Lviv datacenter..."

# 1. Promote standby to primary
echo "Promoting PostgreSQL standby to primary..."
ssh lviv-db-01 "pg_ctl promote -D /var/lib/postgresql/data"

# 2. Update DNS or load balancer
echo "Updating DNS records..."
./update-dns.sh --active-dc=lviv

# 3. Start VoP services in Lviv (if not running)
echo "Starting VoP services in Lviv..."
kubectl config use-context lviv-cluster
kubectl scale deployment/vop-responder --replicas=5 -n vop-production

# 4. Stop VoP services in Kyiv (if reachable)
echo "Stopping VoP services in Kyiv..."
kubectl config use-context kyiv-cluster
kubectl scale deployment/vop-responder --replicas=0 -n vop-production || true

# 5. Verify services
echo "Verifying VoP services..."
curl -k https://vop.bank.ua/actuator/health

echo "Failover complete!"
```

**Health Checks:**

```yaml
# prometheus-alerts.yaml
groups:
- name: vop-disaster-recovery
  rules:
  # Alert if primary DC is unreachable
  - alert: PrimaryDatacenterDown
    expr: up{datacenter="kyiv",job="vop-responder"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Primary datacenter (Kyiv) is DOWN"
      description: "Kyiv datacenter has been unreachable for 2 minutes. Consider failover to Lviv."

  # Alert if replication lag is too high
  - alert: PostgresReplicationLagHigh
    expr: pg_replication_lag_seconds > 60
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "PostgreSQL replication lag is high"
      description: "Replication lag is {{ $value }} seconds. Data loss risk if failover."
```

---

## Testing Environments

### Сценарій 10: Multi-Environment Setup

**Environments:**

```
┌──────────────────────────────────────────────────────────────┐
│ DEV (Development)                                            │
│ - Local development                                          │
│ - Mock VoP Router                                            │
│ - SQLite/Postgres local                                      │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ TEST (Integration Testing)                                   │
│ - Automated tests                                            │
│ - VoP Router stub                                            │
│ - PostgreSQL (test instance)                                 │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ STAGING (Pre-production)                                     │
│ - VoP Router (NBU sandbox)                                   │
│ - Real integrations (test mode)                              │
│ - Production-like data                                       │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ PRODUCTION                                                   │
│ - VoP Router (NBU production)                                │
│ - Real data                                                  │
│ - Full monitoring                                            │
└──────────────────────────────────────────────────────────────┘
```

**Mock VoP Router for DEV:**

```javascript
// mock-vop-router.js - for local development
const express = require('express');
const app = express();

app.use(express.json());

// Mock VoP verify endpoint
app.post('/api/vop/v1/verify', (req, res) => {
  const { payee } = req.body;

  console.log('Mock VoP Request:', JSON.stringify(req.body, null, 2));

  // Simulate different scenarios based on IBAN
  let response;

  if (payee.iban.endsWith('001')) {
    // Perfect match scenario
    response = {
      requestId: req.body.requestId,
      timestamp: new Date().toISOString(),
      result: {
        matchStatus: 'MATCH',
        matchScore: 100,
        reasonCode: 'ANNM',
        verifiedName: payee.name,
        accountStatus: 'ACTIVE'
      },
      processingTime: 250
    };
  } else if (payee.iban.endsWith('002')) {
    // Close match scenario
    response = {
      requestId: req.body.requestId,
      timestamp: new Date().toISOString(),
      result: {
        matchStatus: 'CLOSE_MATCH',
        matchScore: 85,
        reasonCode: 'MBAM',
        verifiedName: 'ПЕТРЕНКО ОЛЕНА ІВАНІВНА',  // Slightly different
        accountStatus: 'ACTIVE'
      },
      processingTime: 300
    };
  } else if (payee.iban.endsWith('003')) {
    // No match scenario
    response = {
      requestId: req.body.requestId,
      timestamp: new Date().toISOString(),
      result: {
        matchStatus: 'NO_MATCH',
        matchScore: 45,
        reasonCode: 'ANNM',
        reasonDescription: 'Name does not match',
        accountStatus: 'ACTIVE'
      },
      processingTime: 280
    };
  } else if (payee.iban.endsWith('999')) {
    // Error scenario
    response = {
      requestId: req.body.requestId,
      timestamp: new Date().toISOString(),
      result: {
        matchStatus: 'ERROR',
        reasonCode: 'TCHA',
        reasonDescription: 'Technical error (simulated)'
      },
      processingTime: 1000
    };
  } else {
    // Default: account not found
    response = {
      requestId: req.body.requestId,
      timestamp: new Date().toISOString(),
      result: {
        matchStatus: 'NO_MATCH',
        reasonCode: 'UNKN',
        reasonDescription: 'Account not found'
      },
      processingTime: 150
    };
  }

  // Simulate network delay
  setTimeout(() => {
    res.json(response);
  }, 200);
});

app.listen(9000, () => {
  console.log('Mock VoP Router running on http://localhost:9000');
  console.log('');
  console.log('Test IBANs:');
  console.log('  - UA21305299...001 - MATCH');
  console.log('  - UA21305299...002 - CLOSE_MATCH');
  console.log('  - UA21305299...003 - NO_MATCH');
  console.log('  - UA21305299...999 - ERROR');
  console.log('  - Any other       - UNKN (not found)');
});
```

---

## Monitoring та Logging

### Сценарій 11: Observability Stack

**Архітектура:**

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  VoP Service │─────▶│  Prometheus  │─────▶│   Grafana    │
│   (Metrics)  │      │   (TSDB)     │      │  (Dashboard) │
└──────────────┘      └──────────────┘      └──────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  VoP Service │─────▶│     ELK      │─────▶│   Kibana     │
│    (Logs)    │      │(Elasticsearch│      │   (Search)   │
└──────────────┘      │ Logstash)    │      └──────────────┘
                      └──────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  VoP Service │─────▶│    Jaeger    │─────▶│    Jaeger    │
│   (Traces)   │      │   (Tracing)  │      │      UI      │
└──────────────┘      └──────────────┘      └──────────────┘
```

**Prometheus Metrics:**

```java
// VoP metrics instrumentation
@Component
public class VopMetrics {

    private final Counter vopRequestsTotal;
    private final Counter vopRequestsByStatus;
    private final Histogram vopRequestDuration;
    private final Gauge vopActiveSessions;

    public VopMetrics(MeterRegistry registry) {
        this.vopRequestsTotal = Counter.builder("vop_requests_total")
            .description("Total VoP requests")
            .register(registry);

        this.vopRequestsByStatus = Counter.builder("vop_requests_by_status_total")
            .description("VoP requests by match status")
            .tag("status", "")
            .register(registry);

        this.vopRequestDuration = Histogram.builder("vop_request_duration_seconds")
            .description("VoP request duration")
            .serviceLevelObjectives(0.1, 0.5, 1.0, 2.0, 5.0)
            .register(registry);

        this.vopActiveSessions = Gauge.builder("vop_active_sessions")
            .description("Active VoP sessions")
            .register(registry);
    }

    public void recordRequest(VopResponse response, long durationMs) {
        vopRequestsTotal.increment();

        vopRequestsByStatus.tag("status", response.getMatchStatus().name())
            .increment();

        vopRequestDuration.record(durationMs / 1000.0);
    }
}
```

**Structured Logging:**

```java
// Structured logging for VoP
@Slf4j
@Component
public class VopAuditLogger {

    public void logVopRequest(VopRequest request, VopResponse response, long durationMs) {
        Map<String, Object> logEntry = new HashMap<>();
        logEntry.put("event", "vop_request");
        logEntry.put("request_id", request.getRequestId());
        logEntry.put("timestamp", Instant.now().toString());
        logEntry.put("requester_nbu_id", request.getRequester().getNbuId());
        logEntry.put("iban_hash", hashIban(request.getPayee().getIban()));
        logEntry.put("match_status", response.getMatchStatus());
        logEntry.put("match_score", response.getMatchScore());
        logEntry.put("reason_code", response.getReasonCode());
        logEntry.put("duration_ms", durationMs);

        // Log as JSON
        log.info("VOP_REQUEST: {}", new ObjectMapper().writeValueAsString(logEntry));
    }

    private String hashIban(String iban) {
        // Hash IBAN for privacy (show only last 4 digits)
        if (iban == null || iban.length() < 4) {
            return "****";
        }
        return "****" + iban.substring(iban.length() - 4);
    }
}
```

**Grafana Dashboard:**

```json
{
  "dashboard": {
    "title": "VoP Production Dashboard",
    "panels": [
      {
        "title": "Requests per Second",
        "targets": [{
          "expr": "rate(vop_requests_total[1m])"
        }]
      },
      {
        "title": "Match Status Distribution",
        "targets": [{
          "expr": "sum by (status) (rate(vop_requests_by_status_total[5m]))"
        }]
      },
      {
        "title": "Request Duration (p95, p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, vop_request_duration_seconds_bucket)",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, vop_request_duration_seconds_bucket)",
            "legendFormat": "p99"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(vop_requests_by_status_total{status=\"ERROR\"}[5m])"
        }]
      }
    ]
  }
}
```

---

## Fraud Detection Integration

### Сценарій 12: Integration з Fraud Detection System

**Архітектура:**

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Payment    │──1──▶│  VoP Check   │──2──▶│  VoP Router  │
│   Request    │      │              │      │    (NBU)     │
└──────────────┘      └──────┬───────┘      └──────────────┘
                             │
                          3. │ VoP Result
                             │
                      ┌──────▼───────┐
                      │    Fraud     │
                      │  Detection   │
                      │   Engine     │
                      └──────┬───────┘
                             │
                          4. │ Risk Score
                             │
                      ┌──────▼───────┐
                      │   Decision   │
                      │    Engine    │
                      └──────┬───────┘
                             │
                          5. │ Approve/Reject/Review
                             ▼
```

**Імплементація:**

```java
// Fraud detection with VoP integration
@Service
public class FraudDetectionService {

    @Autowired
    private VopClient vopClient;

    @Autowired
    private RiskEngine riskEngine;

    public FraudCheckResult checkPayment(PaymentRequest payment) {
        List<RiskFactor> riskFactors = new ArrayList<>();
        int totalRiskScore = 0;

        // 1. VoP verification
        VopResult vopResult = vopClient.verify(
            payment.getRecipientIban(),
            payment.getRecipientName()
        );

        // 2. Analyze VoP result for fraud signals
        if (vopResult.getMatchStatus() == MatchStatus.NO_MATCH) {
            riskFactors.add(new RiskFactor(
                "VOP_NO_MATCH",
                "Recipient name mismatch",
                50  // High risk score
            ));
            totalRiskScore += 50;
        } else if (vopResult.getMatchStatus() == MatchStatus.CLOSE_MATCH) {
            riskFactors.add(new RiskFactor(
                "VOP_CLOSE_MATCH",
                "Recipient name partial match",
                20  // Medium risk score
            ));
            totalRiskScore += 20;
        }

        // 3. Check if account is recently opened (fraud pattern)
        if (isRecentlyOpenedAccount(payment.getRecipientIban())) {
            riskFactors.add(new RiskFactor(
                "NEW_ACCOUNT",
                "Recipient account opened < 30 days ago",
                30
            ));
            totalRiskScore += 30;
        }

        // 4. Check transaction velocity
        int recentPaymentsCount = countRecentPayments(
            payment.getSenderAccount(),
            Duration.ofHours(24)
        );

        if (recentPaymentsCount > 10) {
            riskFactors.add(new RiskFactor(
                "HIGH_VELOCITY",
                "Multiple payments in 24 hours",
                25
            ));
            totalRiskScore += 25;
        }

        // 5. Check amount anomaly
        BigDecimal avgAmount = getAveragePaymentAmount(payment.getSenderAccount());
        if (payment.getAmount().compareTo(avgAmount.multiply(BigDecimal.valueOf(5))) > 0) {
            riskFactors.add(new RiskFactor(
                "AMOUNT_ANOMALY",
                "Amount 5x higher than average",
                30
            ));
            totalRiskScore += 30;
        }

        // 6. Determine action based on risk score
        FraudAction action;
        if (totalRiskScore >= 70) {
            action = FraudAction.BLOCK;
        } else if (totalRiskScore >= 40) {
            action = FraudAction.MANUAL_REVIEW;
        } else {
            action = FraudAction.ALLOW;
        }

        return FraudCheckResult.builder()
            .riskScore(totalRiskScore)
            .riskFactors(riskFactors)
            .action(action)
            .vopResult(vopResult)
            .build();
    }
}
```

---

## Performance Optimization

### Сценарій 13: Caching Strategy

**Multi-Level Caching:**

```
┌──────────────────────────────────────────────────────────────┐
│                      VoP Responder                           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Level 1: In-Memory Cache (Caffeine)                  │  │
│  │ - TTL: 1 minute                                       │  │
│  │ - Size: 10,000 entries                                │  │
│  │ - Ultra-fast lookup: < 1ms                            │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │ Miss                                │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │ Level 2: Redis Cache                                  │  │
│  │ - TTL: 5 minutes                                      │  │
│  │ - Shared across instances                             │  │
│  │ - Fast lookup: < 10ms                                 │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │ Miss                                │
│  ┌────────────────────▼─────────────────────────────────┐  │
│  │ Level 3: Database Query                               │  │
│  │ - CBS / PostgreSQL                                    │  │
│  │ - Slowest: 100-500ms                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Імплементація:**

```java
// Multi-level caching for VoP
@Service
public class CachedVopService {

    // Level 1: In-memory cache
    private final Cache<String, Customer> l1Cache;

    // Level 2: Redis cache
    @Autowired
    private RedisTemplate<String, Customer> redis;

    // Level 3: Database
    @Autowired
    private CustomerRepository customerRepo;

    public CachedVopService() {
        this.l1Cache = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(1, TimeUnit.MINUTES)
            .recordStats()
            .build();
    }

    public Customer getCustomerByIban(String iban) {
        // Level 1: Check in-memory cache
        Customer customer = l1Cache.getIfPresent(iban);
        if (customer != null) {
            log.debug("L1 cache HIT: {}", iban);
            return customer;
        }

        // Level 2: Check Redis
        String redisKey = "vop:customer:" + iban;
        customer = redis.opsForValue().get(redisKey);
        if (customer != null) {
            log.debug("L2 cache HIT (Redis): {}", iban);
            // Populate L1 cache
            l1Cache.put(iban, customer);
            return customer;
        }

        // Level 3: Query database
        log.debug("Cache MISS, querying database: {}", iban);
        customer = customerRepo.findByIban(iban)
            .orElse(null);

        if (customer != null) {
            // Populate both caches
            l1Cache.put(iban, customer);
            redis.opsForValue().set(redisKey, customer, 5, TimeUnit.MINUTES);
        }

        return customer;
    }

    // Cache invalidation on customer update
    public void invalidateCache(String iban) {
        l1Cache.invalidate(iban);
        redis.delete("vop:customer:" + iban);
    }
}
```

---

## Висновки

VoP інтеграція з банківськими системами вимагає:

✅ **Гнучкість** — підтримка різних CBS, ESB, архітектур
✅ **Надійність** — HA setup, disaster recovery, graceful degradation
✅ **Продуктивність** — caching, connection pooling, асинхронність
✅ **Безпека** — mTLS, OAuth, audit logging, data encryption
✅ **Observability** — metrics, logs, traces, alerting

**Рекомендації:**

1. **Почніть просто** — direct integration для MVP
2. **Додайте HA** — мінімум 3 instances, load balancer
3. **Впровадьте caching** — Redis для performance
4. **Налаштуйте monitoring** — Prometheus + Grafana
5. **Плануйте DR** — cross-region replication
6. **Тестуйте thoroughly** — unit, integration, performance, security tests

**Контакти:**

- Технічна підтримка НБУ: vop-support@bank.gov.ua
- Документація: https://vop.nbu.gov.ua/docs
- Slack: #vop-integration (для учасників пілоту)

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** Q3 2026
