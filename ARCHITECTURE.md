# Архітектура системи VoP для СЕП НБУ

## Зміст

1. [Загальний огляд](#загальний-огляд)
2. [Компоненти системи](#компоненти-системи)
3. [Потоки даних](#потоки-даних)
4. [Технічний стек](#технічний-стек)
5. [Масштабованість](#масштабованість)
6. [Відмовостійкість](#відмовостійкість)
7. [Безпека](#безпека)
8. [Інтеграція з СЕП](#інтеграція-з-сеп)

## Загальний огляд

### Принципи архітектури

1. **Децентралізація** — кожен банк зберігає дані своїх клієнтів
2. **Маршрутизація** — централізований Router для направлення запитів
3. **Мінімізація даних** — передача тільки необхідних реквізитів
4. **Висока доступність** — 99.9% uptime, 24/7
5. **Низька латентність** — < 1 сек для миттєвих переказів

### Архітектурна діаграма

```
                           ┌─────────────────────────┐
                           │    VoP Directory (EDS)  │
                           │   - Реєстр учасників    │
                           │   - Код ID НБУ          │
                           │   - API endpoints       │
                           └───────────┬─────────────┘
                                       │
                                       │ (Lookup)
                                       │
┌──────────────┐          ┌────────────▼────────────┐          ┌──────────────┐
│   Клієнт     │          │                         │          │   База       │
│  (платник)   │          │     VoP Router (RVM)    │          │  клієнтів    │
│              │          │                         │          │  банку B     │
│   Банк A     │          │  - Маршрутизація        │          │              │
└──────┬───────┘          │  - Load balancing       │          └──────▲───────┘
       │                  │  - Monitoring           │                 │
       │ 1. Ініціює       │  - Logging              │                 │
       │    платіж        │                         │                 │
       ▼                  └────────────┬────────────┘                 │
┌──────────────┐                       │                              │
│              │                       │                              │
│ VoP Requester│          ┌────────────▼────────────┐          ┌──────┴───────┐
│   API        │          │                         │          │              │
│              │          │                         │          │ VoP Responder│
│  Банк A      │◄─────────┤  2. VoP Request         │─────────►│   API        │
│              │  4. VoP  │                         │ 2. VoP   │              │
│              │  Response│     Маршрутизація       │ Request  │  Банк B      │
└──────┬───────┘          │                         │          │              │
       │                  └─────────────────────────┘          └──────────────┘
       │ 5. Результат                                                 │
       │    клієнту                                                   │
       │                                                              │
       │ 6. pacs.008                                                  │ 3. Перевірка
       │    (якщо OK)                                                 │    в БД
       ▼                                                              │
┌──────────────┐                                                      │
│              │                                                      │
│   СЕП НБУ    │                                                      │
│              │                                                      │
└──────────────┘                                                      │
```

## Компоненти системи

### 1. VoP Directory Service (EDS)

**Призначення:** Централізований реєстр учасників VoP

**Функції:**
- Реєстрація банків-учасників VoP
- Зберігання метаданих: Код ID НБУ (NBU ID), API endpoints, сертифікати
- Пошук банку-отримувача за IBAN
- Валідація учасників
- Управління статусами учасників (active/inactive)

**Примітка:** Код ID НБУ (NBU ID) - це 6-значний код банку, що є основним ідентифікатором в Україні. BIC (міжнародний код ISO 9362) може зберігатися опціонально для міжнародної інтеграції.

**Технології:**
- База даних: PostgreSQL або MongoDB
- API: REST (JSON)
- Кешування: Redis
- Автентифікація: mTLS + OAuth 2.0

**Схема даних:**
```json
{
  "participantId": "300023",
  "nbuId": "300023",
  "bic": "PRYBUA2XXXX",
  "name": "ПриватБанк",
  "status": "ACTIVE",
  "endpoints": {
    "vopResponderUrl": "https://api.privatbank.ua/vop/v1/verify",
    "certificate": "cert-fingerprint-hash"
  },
  "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
  "maxResponseTime": 1000,
  "registeredDate": "2026-01-01T00:00:00Z",
  "lastUpdated": "2026-02-06T10:00:00Z"
}
```

### 2. VoP Router (RVM - Routing and Verification Mechanism)

**Призначення:** Маршрутизація VoP запитів між банками

**Функції:**
- Визначення банку-отримувача за IBAN (символи 5-10: 6-значний bank code)
- Lookup в Directory Service
- Маршрутизація запиту до Responder API
- Агрегація відповідей (опційно)
- Load balancing
- Rate limiting
- Моніторинг та логування

**Алгоритм маршрутизації:**
```
1. Отримати VoP Request від Requester
2. Парсити IBAN → витягнути bank code (символи 5-10)
3. Lookup в Directory Service: bank code → participant metadata
4. Валідувати статус учасника (ACTIVE?)
5. Надіслати VoP Request до Responder URL
6. Отримати VoP Response
7. Додати метадані (processing time, router id)
8. Повернути Response до Requester
```

**Обробка помилок:**
- Якщо банк-отримувач не в Directory → `ERROR` + `UNKN`
- Якщо timeout (> 3 сек) → `ERROR` + `TCHA`
- Якщо банк неактивний → `NOT_SUPPORTED` + `ACNS`

**Технології:**
- API Gateway: Kong або AWS API Gateway
- Language: Node.js / Go / Java
- Message Queue: RabbitMQ / Kafka (для асинхронності)
- Monitoring: Prometheus + Grafana

### 3. VoP Requester API (Банк-відправник)

**Призначення:** API банку-відправника для ініціювання VoP запитів

**Функції:**
- Прийом запиту від UI/backend банку
- Формування VoP Request payload
- Виклик VoP Router API
- Обробка VoP Response
- Відображення результату клієнту
- Логування для аудиту

**Інтеграція в процес платежу:**
```
1. Клієнт заповнює форму платежу (IBAN, ім'я, сума)
2. Frontend викликає /vop/check перед submit
3. Backend викликає VoP Router API
4. Отримує результат (MATCH/CLOSE_MATCH/NO_MATCH)
5. Відображає результат клієнту:
   - MATCH → ✅ "Реквізити підтверджені"
   - CLOSE_MATCH → ⚠️ "Можлива помилка: [verified name]"
   - NO_MATCH → ❌ "Реквізити не співпадають"
6. Клієнт приймає рішення (продовжити / змінити)
7. Якщо OK → відправка pacs.008 до СЕП
```

**Endpoints:**
- `POST /vop/v1/check` — перевірка реквізитів
- `GET /vop/v1/history` — історія перевірок (для аудиту)

### 4. VoP Responder API (Банк-отримувач)

**Призначення:** API банку-отримувача для обробки VoP запитів

**Функції:**
- Прийом VoP Request від Router
- Пошук клієнта в БД за IBAN
- Name matching (fuzzy matching)
- Перевірка статусу рахунку (ACTIVE/CLOSED/BLOCKED)
- Формування VoP Response
- Логування запитів

**Алгоритм обробки:**
```
1. Отримати VoP Request
2. Валідувати request (schema, signature)
3. Пошук клієнта за IBAN в БД
4. Якщо рахунок не знайдено → NO_MATCH + ANNM
5. Якщо знайдено:
   a. Витягнути ім'я клієнта з БД
   b. Name matching: request.name vs db.name
   c. Розрахувати similarity score
   d. Визначити matchStatus:
      - score ≥ 95% → MATCH
      - 75% ≤ score < 95% → CLOSE_MATCH
      - score < 75% → NO_MATCH
6. Перевірити статус рахунку
7. Сформувати Response
8. Повернути Response до Router
```

**Name Matching:**
- Levenshtein Distance
- Jaro-Winkler Distance
- Нормалізація: lowercase, trim, транслітерація
- Обробка ініціалів: "ШЕВЧЕНКО Т.Г." ≈ "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"

**Endpoints:**
- `POST /vop/v1/verify` — обробка VoP запиту

**Технології:**
- Database: PostgreSQL / Oracle (існуюча БД клієнтів)
- Caching: Redis (кешування частих запитів)
- Name Matching: Python (NLTK, fuzzywuzzy) або Java (Apache Commons Text)

### 5. ННПП як учасники VoP

**ННПП (Небанківські надавачі платіжних послуг)** — це фінансові установи, які надають платіжні послуги, але не є банками. В Україні це можуть бути:
- Платіжні системи (наприклад, для мобільних платежів)
- Фінтех компанії з ліцензіями НБУ
- E-wallet провайдери
- Money transfer operators

#### 5.1 Ролі ННПП у VoP

**ННПП як Requester (ініціатор VoP перевірки):**

ННПП можуть виступати як ініціатори VoP запитів, якщо вони надають послуги відправлення платежів своїм клієнтам:

```
Клієнт ННПП → ННПП (Requester API) → VoP Router → Банк-отримувач (Responder)
```

**Приклад use case:**
- Клієнт використовує мобільний додаток ННПП для відправлення грошей
- ННПП викликає VoP перед відправкою платежу до СЕП
- ННПП отримує підтвердження реквізитів та показує результат клієнту
- Якщо MATCH → ННПП відправляє платіж до СЕП НБУ

**ННПП як Responder (обробник VoP запитів):**

Якщо ННПП надає послуги отримання платежів (наприклад, e-wallet з IBAN-рахунками), то вони також можуть бути Responder:

```
Банк-відправник (Requester) → VoP Router → ННПП (Responder API) → БД клієнтів ННПП
```

**Приклад use case:**
- Клієнт банку відправляє переказ на e-wallet ННПП
- Банк викликає VoP
- ННПП перевіряє реквізити в своїй БД клієнтів e-wallet
- ННПП повертає результат (MATCH/NO_MATCH)

#### 5.2 Реєстрація ННПП у VoP Directory

**Вимоги для реєстрації ННПП:**

1. **Ліцензування:**
   - ННПП має бути зареєстрований у НБУ як надавач платіжних послуг
   - Наявність відповідної ліцензії НБУ

2. **Технічні вимоги:**
   - Реалізація VoP Requester API (якщо ініціює платежі)
   - Реалізація VoP Responder API (якщо обслуговує рахунки отримувачів)
   - Підтримка mTLS + OAuth 2.0 FAPI
   - QWAC/АЦСК сертифікати

3. **Код ID НБУ:**
   - ННПП отримують свій Код ID НБУ (6-значний)
   - Діапазон кодів для ННПП визначається окремо НБУ

**Схема даних Directory для ННПП:**

```json
{
  "participantId": "350001",
  "nbuId": "350001",
  "name": "MonoPay (ННПП)",
  "type": "PSP",
  "status": "ACTIVE",
  "endpoints": {
    "vopResponderUrl": "https://api.monopay.ua/vop/v1/verify",
    "vopRequesterEnabled": true,
    "certificate": "cert-fingerprint-hash"
  },
  "supportedAccountTypes": ["PERSONAL", "BUSINESS"],
  "maxResponseTime": 1000,
  "registeredDate": "2027-01-01T00:00:00Z",
  "lastUpdated": "2027-06-15T10:00:00Z"
}
```

**Примітка:** `type: "PSP"` відрізняє ННПП від банків (`type: "BANK"`).

#### 5.3 Особливості для ННПП

**Відмінності від банків:**

| Аспект | Банки | ННПП |
|--------|-------|------|
| Ліцензування | Банківська ліцензія НБУ | Ліцензія на надання платіжних послуг |
| Участь у СЕП | Обов'язкова для всіх банків | Опціонально (залежить від послуг) |
| VoP Responder | Обов'язково (якщо обслуговують рахунки) | Обов'язково (якщо обслуговують рахунки) |
| VoP Requester | Обов'язково (для МП СЕП) | Обов'язково (якщо ініціюють платежі) |
| Код ID НБУ | 300001-349999 | 350001-399999 (орієнтовно) |
| IBAN | Власні IBAN (якщо банк-кореспондент) | IBAN через банк-кореспондент або власні |

**Спеціальні випадки:**

1. **ННПП без власних IBAN:**
   - Якщо ННПП не надає рахунки з IBAN, то VoP Responder API не потрібен
   - ННПП може виступати тільки як Requester

2. **ННПП з банком-кореспондентом:**
   - IBAN належать банку-кореспонденту
   - VoP запити направляються до банку-кореспондента, не до ННПП
   - ННПП може отримувати notification від банку (опційно)

3. **ННПП з власною банківською ліцензією:**
   - Розглядається як банк у VoP
   - Використовує діапазон кодів банків (300001-349999)

#### 5.4 Timeline впровадження для ННПП

**Фаза 1 (Q2-Q4 2026): Пілот**
- ННПП не беруть участь (тільки банки)

**Фаза 2 (Q4 2026 - Q2 2027): МП СЕП**
- ННПП, що надають послуги миттєвих переказів, підключаються до VoP
- Обов'язкова реалізація VoP Requester API (якщо ініціюють МП)
- Опціональна реалізація VoP Responder API (якщо обслуговують рахунки)

**Фаза 3 (2027-2028): Повне розгортання**
- Всі ННПП, що надають платіжні послуги, підключені до VoP
- VoP стає обов'язковою для всіх типів переказів

#### 5.5 Use Cases для ННПП

**UC-ННПП-01: Мобільний гаманець відправляє гроші на банківський рахунок**

```
1. Клієнт MonoPay хоче відправити 500 грн на банківський рахунок друга
2. Клієнт вводить IBAN та ім'я отримувача в додатку MonoPay
3. MonoPay (Requester) викликає VoP Router
4. VoP Router направляє запит до банку-отримувача (Responder)
5. Банк перевіряє реквізити та повертає MATCH
6. MonoPay показує підтвердження клієнту: "Реквізити підтверджені"
7. Клієнт підтверджує платіж
8. MonoPay відправляє платіж до СЕП НБУ
```

**UC-ННПП-02: Банк відправляє гроші на мобільний гаманець**

```
1. Клієнт банку хоче відправити гроші на MonoPay рахунок
2. Клієнт вводить IBAN MonoPay та ім'я отримувача
3. Банк (Requester) викликає VoP Router
4. VoP Router направляє запит до MonoPay (Responder)
5. MonoPay перевіряє реквізити в БД своїх клієнтів
6. MonoPay повертає MATCH
7. Банк показує підтвердження клієнту
8. Банк відправляє платіж до СЕП НБУ → MonoPay отримує кошти
```

**UC-ННПП-03: ННПП без VoP Responder (тільки Requester)**

```
1. Payment Processor X не надає рахунки клієнтам (тільки process payments)
2. Payment Processor X реалізує VoP Requester API
3. Payment Processor X НЕ реалізує VoP Responder API (немає рахунків)
4. VoP Router знає, що Payment Processor X — тільки Requester
5. VoP запити до Payment Processor X повертають NOT_SUPPORTED
```

#### 5.6 Governance для ННПП

**Participation Agreement:**
- ННПП підписують той самий Participation Agreement, що й банки
- Додаткові умови для ННПП (якщо потрібно)

**SLA:**
- Ті ж SLA, що й для банків (латентність, uptime)

**Support:**
- НБУ надає технічну підтримку ННПП
- Референсна реалізація доступна для ННПП

**Monitoring:**
- НБУ моніторить performance ННПП
- Quarterly reports включають статистику по ННПП

## Потоки даних

### Послідовність VoP запиту

```
┌────────┐  ┌─────────┐  ┌────────┐  ┌─────────┐  ┌─────────┐
│ Client │  │Requester│  │ Router │  │Directory│  │Responder│
└───┬────┘  └────┬────┘  └───┬────┘  └────┬────┘  └────┬────┘
    │            │            │            │            │
    │ 1. Платіж  │            │            │            │
    ├───────────►│            │            │            │
    │            │ 2. VoP Req │            │            │
    │            ├───────────►│            │            │
    │            │            │ 3. Lookup  │            │
    │            │            ├───────────►│            │
    │            │            │◄───────────┤            │
    │            │            │  Bank URL  │            │
    │            │            │            │            │
    │            │            │ 4. VoP Req │            │
    │            │            ├───────────────────────►│
    │            │            │            │            │
    │            │            │            │  5. DB     │
    │            │            │            │   Query    │
    │            │            │            │            │
    │            │            │ 6. VoP Resp│            │
    │            │            │◄───────────────────────┤
    │            │ 7. VoP Resp│            │            │
    │            │◄───────────┤            │            │
    │ 8. Результат            │            │            │
    │◄───────────┤            │            │            │
    │            │            │            │            │
    │ 9. Confirm │            │            │            │
    ├───────────►│            │            │            │
    │            │ 10. pacs.008 → СЕП НБУ  │            │
    │            │            │            │            │
```

### Формат VoP Request

**Примітка:** Поле `bic` є опціональним. Обов'язковим є тільки `nbuId` (МФО код). BIC використовується для майбутніх транскордонних переказів.

```json
POST /vop/v1/verify
Content-Type: application/json
Authorization: Bearer {access_token}

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00Z",
  "requester": {
    "bic": "NBUBUBU1XXX",  // Опціонально
    "nbuId": "300001"      // Обов'язково (МФО код)
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

### Формат VoP Response

**Примітка:** Поле `bic` є опціональним. Обов'язковим є тільки `nbuId` (МФО код).

```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01Z",
  "responder": {
    "bic": "PRYBUA2XXXX",  // Опціонально
    "nbuId": "300023"      // Обов'язково (МФО код)
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

## Технічний стек

### Backend

**VoP Router:**
- **Language:** Node.js (Express) / Go / Java (Spring Boot)
- **API Gateway:** Kong / AWS API Gateway / Azure API Management
- **Database:** PostgreSQL (Directory metadata)
- **Cache:** Redis
- **Message Queue:** RabbitMQ / Kafka (для асинхронності)

**VoP Requester/Responder:**
- **Language:** Залежить від банку (Java, .NET, Node.js, Python)
- **Framework:** Spring Boot / ASP.NET Core / Express / Django
- **Database:** PostgreSQL / Oracle / MS SQL (існуюча БД банку)

### Інфраструктура

- **Container Orchestration:** Kubernetes
- **Service Mesh:** Istio (для mTLS між сервісами)
- **Load Balancer:** NGINX / HAProxy / AWS ALB
- **CDN/WAF:** Cloudflare / AWS CloudFront + WAF

### Моніторинг та логування

- **Metrics:** Prometheus + Grafana
- **Logging:** ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing:** Jaeger / Zipkin
- **APM:** New Relic / Datadog (опційно)

### Безпека

- **TLS:** TLS 1.3
- **mTLS:** Mutual TLS для автентифікації
- **Certificates:** QWAC (Qualified Web Authentication Certificates)
- **OAuth 2.0:** FAPI (Financial-grade API)
- **WAF:** Web Application Firewall
- **DDoS Protection:** Cloudflare / AWS Shield

## Масштабованість

### Horizontal Scaling

**VoP Router:**
- Stateless design → легко масштабувати
- Load balancing через NGINX/ALB
- Auto-scaling на основі CPU/Memory/Requests

**VoP Responder (банк):**
- Кожен банк масштабує свій Responder незалежно
- Read replicas для БД клієнтів

### Caching Strategy

**Directory Service:**
- Redis cache для метаданих банків (TTL: 1 година)
- Invalidation при оновленні учасника

**Responder:**
- Кешування результатів name matching (TTL: 5 хвилин)
- Cache key: `hash(IBAN + name)`

### Database Optimization

**Indexes:**
- IBAN → primary key / unique index
- Client name → full-text search index (для fuzzy matching)

**Partitioning:**
- Партиціювання за bank code (для великих банків)

## Відмовостійкість

### High Availability

**Router:**
- Multi-region deployment
- Active-Active setup
- Health checks кожні 10 сек

**Database:**
- Master-Slave replication (PostgreSQL Streaming Replication)
- Automatic failover (Patroni + etcd)

### Disaster Recovery

- **RPO (Recovery Point Objective):** < 5 хвилин
- **RTO (Recovery Time Objective):** < 15 хвилин
- Backup кожні 6 годин + transaction log
- Cross-region backup replication

### Graceful Degradation

Якщо банк-отримувач недоступний:
- Router повертає `ERROR` + `TCHA`
- Клієнт може продовжити платіж (з попередженням)
- Платіж обробляється СЕП як звичайно (без VoP)

### Circuit Breaker

- Після 5 невдалих запитів до Responder → circuit open
- Повернення `ERROR` без виклику Responder
- Auto-recovery після 30 секунд

## Безпека

### Аутентифікація та авторизація

**mTLS (Mutual TLS):**
```
1. Client (Requester) надсилає сертифікат
2. Router валідує сертифікат проти whitelist
3. Router надсилає свій сертифікат
4. Client валідує сертифікат Router
5. Встановлюється зашифроване з'єднання
```

**OAuth 2.0 + FAPI:**
```
1. Bank отримує access_token від Authorization Server
2. Access token додається до Request: Authorization: Bearer {token}
3. Router валідує token (signature, expiration, scopes)
4. Якщо валідний → маршрутизація, інакше → 401 Unauthorized
```

### Шифрування

- **In-transit:** TLS 1.3 (AES-256-GCM)
- **At-rest:** Database encryption (PostgreSQL pgcrypto)
- **Payload encryption (опційно):** JWE (JSON Web Encryption)

### Privacy (GDPR)

**Мінімізація даних:**
- Передається тільки: IBAN, ім'я, код
- НЕ передається: номер телефону, email, адреса

**Retention Policy:**
- VoP запити зберігаються 90 днів (для аудиту)
- Після 90 днів → автоматичне видалення або анонімізація

**Opt-out:**
- Клієнт може відмовитися від VoP (через згоду в банку)
- Якщо opt-out → Response: `NOT_SUPPORTED` + `OPTO`

### Audit Logging

Кожен VoP запит логується:
```json
{
  "timestamp": "2026-02-06T14:30:00Z",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "requesterBic": "NBUBUBU1XXX",
  "responderBic": "PRYBUA2XXXX",
  "iban": "UA21...001",
  "matchStatus": "MATCH",
  "processingTime": 850,
  "ipAddress": "10.0.1.5"
}
```

## Інтеграція з СЕП

### ISO 20022 Compatibility

VoP використовує ті ж стандарти, що й СЕП:
- **IBAN format:** UA + 2 check digits + 6 bank code + 19 account (29 symbols)
- **BIC:** ISO 9362
- **Timestamps:** ISO 8601

### Послідовність з pacs.008

```
1. VoP Request/Response (перевірка)
2. Якщо MATCH → pacs.008 відправляється до СЕП
3. СЕП обробляє pacs.008 як звичайно
4. pacs.002 (Payment Status Report) повертається
```

**Важливо:** VoP НЕ замінює pacs.008, а доповнює його на етапі підготовки платежу.

### UETR Tracking

Опційно: VoP запит може мати UETR (Unique End-to-End Transaction Reference):
```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "uetr": "97ed4827-7b6f-4491-a06f-b548d5a7512d",
  ...
}
```

Це дозволяє трекінг VoP запиту в ТрекСЕП (якщо інтегровано).

## Performance Benchmarks

### Latency Targets

| Scenario | Target | Maximum |
|----------|--------|---------|
| VoP Request → Response (normal load) | < 500 ms | 1000 ms |
| VoP Request → Response (peak load) | < 1 sec | 3 sec |
| Directory lookup | < 50 ms | 100 ms |
| Name matching (Responder) | < 200 ms | 500 ms |
| Router overhead | < 100 ms | 200 ms |

### Throughput Targets

- **Router:** 1000+ requests/sec
- **Responder (банк):** 100-500 requests/sec (залежить від банку)

### Load Testing Scenarios

1. **Normal load:** 100 req/sec
2. **Peak load:** 500 req/sec
3. **Spike test:** 1000 req/sec протягом 1 хв
4. **Endurance test:** 100 req/sec протягом 24 год

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────────────────────────┐
│                     Load Balancer (NGINX)               │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
┌────────▼────────┐    ┌─────────▼───────┐
│ VoP Router      │    │ VoP Router      │
│ Instance 1      │    │ Instance 2      │
│ (Kubernetes Pod)│    │ (Kubernetes Pod)│
└────────┬────────┘    └─────────┬───────┘
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │  PostgreSQL Cluster   │
         │  (Primary + Replicas) │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │    Redis Cluster      │
         │    (Cache)            │
         └───────────────────────┘
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vop-router
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vop-router
  template:
    metadata:
      labels:
        app: vop-router
    spec:
      containers:
      - name: vop-router
        image: vop-router:1.0
        ports:
        - containerPort: 8080
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
```

## Висновки

Архітектура VoP для СЕП НБУ забезпечує:

✅ **Децентралізацію** — кожен банк контролює свої дані
✅ **Швидкість** — < 1 сек для миттєвих переказів
✅ **Безпеку** — mTLS, OAuth 2.0, шифрування
✅ **Масштабованість** — horizontal scaling, caching
✅ **Відмовостійкість** — HA, DR, graceful degradation
✅ **Сумісність** — ISO 20022, інтеграція з СЕП

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
