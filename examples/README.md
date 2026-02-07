# VoP Приклади запитів та відповідей

Ця папка містить приклади JSON для VoP (Verification of Payee) запитів та відповідей.

## Структура

```
examples/
├── requests/           # Приклади VoP запитів
│   ├── vop-request-personal.json      # Особистий рахунок (з BIC)
│   ├── vop-request-business.json      # Бізнес рахунок (з BIC)
│   ├── vop-request-instant.json       # Миттєвий переказ (з BIC)
│   └── vop-request-without-bic.json   # Запит без BIC (тільки МФО)
│
├── responses/          # Приклади VoP відповідей
│   ├── vop-response-match.json        # Повне співпадіння (з BIC)
│   ├── vop-response-close-match.json  # Часткове співпадіння (з BIC)
│   ├── vop-response-no-match.json     # Не співпадає (з BIC)
│   ├── vop-response-error.json        # Помилка
│   └── vop-response-without-bic.json  # Відповідь без BIC (тільки МФО)
│
└── scenarios/          # Детальні сценарії використання
    ├── scenario-1-happy-path.md
    ├── scenario-2-close-match.md
    └── scenario-3-error-handling.md
```

## Ідентифікація учасників: BIC vs МФО

### Основний ідентифікатор: `nbuId` (МФО код)

В VoP системі СЕП НБУ **обов'язковим** є поле `nbuId` - МФО код (Міжбанківський ідентифікаційний код).

**Характеристики:**
- Формат: 6 цифр (наприклад: `300001`, `300023`, `305299`)
- Область: Внутрішні українські перекази через СЕП НБУ
- Обов'язковість: ✅ **ОБОВ'ЯЗКОВИЙ**

**Приклади МФО кодів:**
- `300001` - Національний банк України
- `300023` - ПриватБанк
- `300346` - Monobank
- `305299` - АТ КБ "ПриватБанк" (розрахунковий центр)

### Опціональний ідентифікатор: `bic`

Поле `bic` (Bank Identifier Code) є **ОПЦІОНАЛЬНИМ**.

**Характеристики:**
- Формат: 8-11 символів ISO 9362 (наприклад: `PRYBUA2XXXX`)
- Область: Міжнародні перекази через SWIFT
- Обов'язковість: ⭕ **ОПЦІОНАЛЬНИЙ**
- Майбутнє: Буде використовуватись для транскордонних переказів

**Коли передавати BIC:**

✅ **Рекомендовано:**
- Банк має намір підтримувати транскордонні перекази
- Для сумісності з міжнародними стандартами
- Якщо BIC вже є в системі

❌ **Можна не передавати:**
- Для внутрішніх українських переказів (достатньо МФО)
- Якщо BIC ще не отриманий від SWIFT
- Для спрощення початкової інтеграції

## Приклади використання

### Запит з обома ідентифікаторами (рекомендовано)

```json
{
  "requester": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  }
}
```

**Файл:** `requests/vop-request-personal.json`

### Запит тільки з МФО (валідний)

```json
{
  "requester": {
    "nbuId": "300346"
  }
}
```

**Файл:** `requests/vop-request-without-bic.json`

### Відповідь з обома ідентифікаторами

```json
{
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  }
}
```

**Файл:** `responses/vop-response-match.json`

### Відповідь тільки з МФО (валідний)

```json
{
  "responder": {
    "nbuId": "305299"
  }
}
```

**Файл:** `responses/vop-response-without-bic.json`

## Валідація

### Обов'язкові поля

**Request:**
- ✅ `requestId` (UUID)
- ✅ `timestamp` (ISO 8601)
- ✅ `requester.nbuId` (6 цифр)
- ✅ `payee.iban` (29 символів, UA + 27 цифр)
- ✅ `payee.name` (1-140 символів)

**Response:**
- ✅ `requestId` (echo з request)
- ✅ `timestamp` (ISO 8601)
- ✅ `responder.nbuId` (6 цифр) - якщо є responder
- ✅ `result.matchStatus` (MATCH/NO_MATCH/CLOSE_MATCH/NOT_SUPPORTED/ERROR)
- ✅ `result.reasonCode` (ANNM/MBAM/ACNS/OPTO/TCHA/UNKN)
- ✅ `processingTime` (мілісекунди)

### Опціональні поля

- ⭕ `requester.bic` / `responder.bic` (8-11 символів)
- ⭕ `payee.identificationType` / `payee.identificationCode`
- ⭕ `accountType` (PERSONAL/BUSINESS)
- ⭕ `paymentType` (INSTANT/REGULAR)
- ⭕ `result.matchScore` (0-100)
- ⭕ `result.verifiedName`
- ⭕ `result.accountStatus`

## Детальна документація

Для детальної інформації про API дивіться:
- **API Reference:** [docs/03_api_reference.md](../docs/03_api_reference.md)
- **JSON Schemas:** [specifications/json-schemas/](../specifications/json-schemas/)
- **Technical Specification:** [docs/02_technical_specification.md](../docs/02_technical_specification.md)

## Сценарії використання

Детальні сценарії з поясненнями дивіться в папці `scenarios/`:

1. **Happy Path** - успішна перевірка з повним співпадінням
2. **Close Match** - часткове співпадіння імені
3. **Error Handling** - обробка помилок та timeout

## Тестування

Ці приклади можна використовувати для:
- ✅ Unit тестів
- ✅ Integration тестів
- ✅ Валідації JSON schema
- ✅ Mock серверів
- ✅ Документації API

## JSON Schema

Всі приклади валідуються проти офіційних JSON schemas:
- **Request:** [specifications/json-schemas/vop-request.json](../specifications/json-schemas/vop-request.json)
- **Response:** [specifications/json-schemas/vop-response.json](../specifications/json-schemas/vop-response.json)

Для валідації використовуйте:

```bash
# npm install -g ajv-cli

# Validate request
ajv validate -s specifications/json-schemas/vop-request.json \
  -d examples/requests/vop-request-personal.json

# Validate response
ajv validate -s specifications/json-schemas/vop-response.json \
  -d examples/responses/vop-response-match.json
```
