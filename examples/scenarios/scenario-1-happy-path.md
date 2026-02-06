# Сценарій 1: Happy Path - Успішна перевірка з повним співпадінням

## Контекст

**Учасники:**
- **Клієнт-платник:** Олена Петренко (рахунок в NBU Bank)
- **Банк-відправник:** NBU Bank (Код ID НБУ: 300001)
- **Банк-отримувач:** ПриватБанк (Код ID НБУ: 300023)
- **Отримувач платежу:** Тарас Шевченко (рахунок в ПриватБанку)

**Тип операції:** Миттєвий переказ (Instant Payment) на суму 1000 UAH

**Дата:** 2026-02-06, 14:30:00

---

## Крок 1: Клієнт ініціює платіж

Олена Петренко відкриває мобільний додаток NBU Bank та заповнює форму платежу:

```
Отримувач: ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ
IBAN: UA213223130000026007233566001
Сума: 1000 UAH
Призначення платежу: Оплата за послуги
```

**UI мобільного додатку:**

```
┌────────────────────────────────┐
│      Новий платіж              │
├────────────────────────────────┤
│ Отримувач:                     │
│ [ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ   ]│
│                                │
│ IBAN:                          │
│ [UA213223130000026007233566001]│
│                                │
│ Сума:                          │
│ [1000] UAH                     │
│                                │
│ Призначення:                   │
│ [Оплата за послуги          ]│
│                                │
│  [ Перевірити реквізити ]      │ ← Клієнт натискає
│                                │
└────────────────────────────────┘
```

---

## Крок 2: Frontend викликає VoP API

Після натискання "Перевірити реквізити", frontend відправляє запит до backend NBU Bank:

```http
POST https://api.nbubank.ua/payments/verify-payee
Authorization: Bearer {user_session_token}
Content-Type: application/json

{
  "recipientName": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
  "recipientIban": "UA213223130000026007233566001",
  "recipientIdType": "INN",
  "recipientIdCode": "1234567890",
  "accountType": "PERSONAL",
  "paymentType": "INSTANT"
}
```

---

## Крок 3: Backend формує VoP Request

Backend NBU Bank (VoP Requester) формує VoP Request для відправки до VoP Router:

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00.000Z",
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

**Логування (NBU Bank):**

```
[2026-02-06T14:30:00.123Z] INFO: VoP Request initiated
  RequestID: 550e8400-e29b-41d4-a716-446655440000
  IBAN: UA21********66001
  Name: SHA256:abc123...
  Type: INSTANT
```

---

## Крок 4: Відправка до VoP Router

NBU Bank відправляє VoP Request до VoP Router:

```http
POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
X-Client-Certificate: [mTLS certificate]

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00.000Z",
  ...
}
```

**Час відправки:** 14:30:00.150

---

## Крок 5: Router визначає банк-отримувач

VoP Router розбирає IBAN та визначає банк-отримувач:

```
IBAN: UA21 322313 0000026007233566001
       ^^^^ ^^^^^^
       check bank code

Bank code: 322313 → ПриватБанк
```

**Router lookup в Directory Service:**

```http
GET https://vop-directory.nbu.gov.ua/api/v1/lookup/322313
Authorization: Bearer {router_token}

Response:
{
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

**Cache hit:** Так (Directory lookup з Redis cache)

**Час обробки Router:** 50 мс

---

## Крок 6: Router направляє запит до ПриватБанку

VoP Router відправляє VoP Request до VoP Responder API ПриватБанку:

```http
POST https://vop.privatbank.ua/api/v1/verify
Authorization: Bearer {router_to_privatbank_token}
Content-Type: application/json
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
X-Client-Certificate: [Router's mTLS certificate]

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00.000Z",
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

**Час відправки:** 14:30:00.200

---

## Крок 7: ПриватБанк обробляє запит

### 7.1 Валідація запиту

```python
# Validation
validate_request_schema(request)  # ✅ Valid
validate_client_certificate()     # ✅ Valid (mTLS)
validate_oauth_token()            # ✅ Valid
```

### 7.2 Пошук рахунку в БД

```sql
SELECT
  c.client_id,
  c.full_name,
  c.identification_type,
  c.identification_code,
  a.iban,
  a.account_status,
  a.vop_opted_out
FROM accounts a
JOIN clients c ON a.client_id = c.client_id
WHERE a.iban = 'UA213223130000026007233566001';
```

**Результат:**

```
client_id: 123456
full_name: ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ
identification_type: INN
identification_code: 1234567890
iban: UA213223130000026007233566001
account_status: ACTIVE
vop_opted_out: FALSE
```

**Час пошуку в БД:** 120 мс

### 7.3 Name Matching

```python
request_name = "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
db_name = "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ"

# Нормалізація
norm_request = normalize(request_name)  # "шевченко тарас григорович"
norm_db = normalize(db_name)            # "шевченко тарас григорійович"

# Fuzzy matching
lev_score = levenshtein_similarity(norm_request, norm_db)  # 92%
jw_score = jaro_winkler_similarity(norm_request, norm_db)  # 95%

max_score = max(lev_score, jw_score)  # 95%

# Визначити статус
if max_score >= 95:
    match_status = "MATCH"
    reason_code = "ANNM"
```

**Результат matching:**
- Match Status: `MATCH`
- Match Score: 95.0
- Reason Code: `ANNM`

**Час matching:** 80 мс

### 7.4 Формування відповіді

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:00.850Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 95,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name match",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 800
}
```

**Час обробки ПриватБанком:** 800 мс

---

## Крок 8: Router отримує відповідь

VoP Router отримує відповідь від ПриватБанку:

```
[2026-02-06T14:30:01.050Z] INFO: VoP Response received from Responder
  RequestID: 550e8400-e29b-41d4-a716-446655440000
  Responder: PRYBUA2XXXX (300023)
  MatchStatus: MATCH
  ResponderLatency: 800ms
```

**Час отримання:** 14:30:01.000

---

## Крок 9: Router повертає відповідь до NBU Bank

VoP Router додає метадані та повертає відповідь до NBU Bank:

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
X-Response-Time: 850

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-06T14:30:01.000Z",
  "responder": {
    "bic": "PRYBUA2XXXX",
    "nbuId": "300023"
  },
  "result": {
    "matchStatus": "MATCH",
    "matchScore": 95,
    "reasonCode": "ANNM",
    "reasonDescription": "Account name match",
    "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
    "accountStatus": "ACTIVE"
  },
  "processingTime": 850
}
```

**Загальний час обробки:** 850 мс (< 1 сек ✅)

---

## Крок 10: NBU Bank відображає результат клієнту

Backend NBU Bank отримує VoP Response та форматує для UI:

```json
{
  "status": "success",
  "matchStatus": "MATCH",
  "message": "✅ Реквізити підтверджені",
  "verifiedName": "ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ",
  "accountStatus": "ACTIVE",
  "action": "CONTINUE"
}
```

**UI мобільного додатку:**

```
┌────────────────────────────────┐
│  ✅ Реквізити підтверджені     │
├────────────────────────────────┤
│ Отримувач:                     │
│ ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ    │
│                                │
│ IBAN:                          │
│ UA213223130000026007233566001  │
│                                │
│ Статус рахунку: Активний       │
│                                │
│ Сума: 1000 UAH                 │
│                                │
│     [ Підтвердити платіж ]     │ ← Клієнт натискає
│     [ Скасувати ]              │
│                                │
└────────────────────────────────┘
```

**Час відображення:** 14:30:01.100 (загалом 1.1 сек з моменту натискання "Перевірити")

---

## Крок 11: Клієнт підтверджує платіж

Олена Петренко бачить, що реквізити підтверджені, та натискає "Підтвердити платіж".

```
┌────────────────────────────────┐
│  Підтвердження платежу         │
├────────────────────────────────┤
│ ✅ Реквізити перевірені        │
│                                │
│ Отримувач:                     │
│ ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ    │
│                                │
│ Сума: 1000 UAH                 │
│                                │
│ [ Підтвердити за допомогою:  ] │
│   • Touch ID / Face ID         │
│   • PIN-код                    │
│                                │
└────────────────────────────────┘
```

**Час підтвердження:** 14:30:05.000 (через 4 секунди після перевірки)

---

## Крок 12: NBU Bank відправляє pacs.008 до СЕП

Після підтвердження клієнта, NBU Bank створює платіжне повідомлення pacs.008 (ISO 20022) та відправляє до СЕП НБУ:

```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>NBU-IP-20260206-001234</MsgId>
      <CreDtTm>2026-02-06T14:30:05Z</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>INDA</SttlmMtd>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <InstrId>NBU-IP-20260206-001234-001</InstrId>
        <EndToEndId>550e8400-e29b-41d4-a716-446655440001</EndToEndId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="UAH">1000.00</IntrBkSttlmAmt>
      <InstdAmt Ccy="UAH">1000.00</InstdAmt>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>NBUBUBU1XXX</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtrAgt>
        <FinInstnId>
          <BICFI>PRYBUA2XXXX</BICFI>
        </FinInstnId>
      </CdtrAgt>
      <Cdtr>
        <Nm>ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>UA213223130000026007233566001</IBAN>
        </Id>
      </CdtrAcct>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>
```

**Час відправки до СЕП:** 14:30:05.200

---

## Крок 13: СЕП обробляє платіж

СЕП НБУ обробляє платіж (миттєвий переказ):

```
1. Валідація pacs.008          ✅ (50 мс)
2. AML/CFT перевірки           ✅ (200 мс)
3. Перевірка балансу NBU Bank  ✅ (50 мс)
4. Списання з рахунку NBU Bank ✅ (100 мс)
5. Зарахування на рахунок ПриватБанку ✅ (100 мс)
6. Формування pacs.002         ✅ (50 мс)
```

**Загальний час обробки в СЕП:** 550 мс

---

## Крок 14: СЕП повертає pacs.002 (підтвердження)

```xml
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.002.001.10">
  <FIToFIPmtStsRpt>
    <GrpHdr>
      <MsgId>SEP-20260206-543210</MsgId>
      <CreDtTm>2026-02-06T14:30:05.750Z</CreDtTm>
    </GrpHdr>
    <TxInfAndSts>
      <StsId>SEP-20260206-543210-001</StsId>
      <OrgnlInstrId>NBU-IP-20260206-001234-001</OrgnlInstrId>
      <OrgnlEndToEndId>550e8400-e29b-41d4-a716-446655440001</OrgnlEndToEndId>
      <TxSts>ACSC</TxSts> <!-- Accepted Settlement Completed -->
      <StsRsnInf>
        <Rsn>
          <Cd>0000</Cd>
        </Rsn>
      </StsRsnInf>
    </TxInfAndSts>
  </FIToFIPmtStsRpt>
</Document>
```

**Час отримання pacs.002:** 14:30:05.750

---

## Крок 15: NBU Bank повідомляє клієнта

NBU Bank отримує підтвердження від СЕП та відправляє push notification:

```
┌────────────────────────────────┐
│  ✅ Платіж виконано             │
├────────────────────────────────┤
│ 1000 UAH відправлено           │
│                                │
│ Отримувач:                     │
│ ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ    │
│                                │
│ Дата: 06.02.2026 14:30         │
│ Статус: Виконано               │
│                                │
│ [ Деталі платежу ]             │
│                                │
└────────────────────────────────┘
```

**Час відображення:** 14:30:06.000

---

## Крок 16: ПриватБанк зараховує кошти

ПриватБанк отримує кошти від СЕП та зараховує на рахунок Тараса Шевченка:

```sql
UPDATE accounts
SET balance = balance + 1000.00
WHERE iban = 'UA213223130000026007233566001';
```

ПриватБанк відправляє SMS/push notification Тарасу:

```
┌────────────────────────────────┐
│  ✅ Поповнення рахунку          │
├────────────────────────────────┤
│ +1000.00 UAH                   │
│                                │
│ Від: Олена Петренко            │
│     (NBU Bank)                 │
│                                │
│ Дата: 06.02.2026 14:30         │
│                                │
│ Баланс: 15,430.00 UAH          │
│                                │
└────────────────────────────────┘
```

**Час зарахування:** 14:30:06.000

---

## Підсумки

### Часова діаграма

```
14:30:00.000  Клієнт натискає "Перевірити реквізити"
14:30:00.150  NBU Bank → VoP Router (VoP Request)
14:30:00.200  Router → ПриватБанк (VoP Request)
14:30:01.000  ПриватБанк → Router (VoP Response) [800 мс обробки]
14:30:01.050  Router → NBU Bank (VoP Response) [50 мс overhead]
14:30:01.100  Результат відображається клієнту

--- VoP перевірка завершена (1.1 сек) ---

14:30:05.000  Клієнт підтверджує платіж
14:30:05.200  NBU Bank → СЕП (pacs.008)
14:30:05.750  СЕП → NBU Bank (pacs.002) [550 мс обробки]
14:30:06.000  Платіж виконано, клієнти отримують notification

--- Платіж завершено (6 сек загалом) ---
```

### Метрики продуктивності

| Етап | Час | Target | Status |
|------|-----|--------|--------|
| VoP перевірка (end-to-end) | 1.1 сек | < 1.5 сек | ✅ |
| VoP Router overhead | 50 мс | < 100 мс | ✅ |
| ПриватБанк processing | 800 мс | < 1 сек | ✅ |
| СЕП processing (pacs.008) | 550 мс | < 10 сек | ✅ |
| Платіж (загалом) | 6 сек | < 10 сек | ✅ |

### Логи

**NBU Bank:**
```
[14:30:00.150] INFO: VoP request initiated (req: 550e8400...)
[14:30:01.050] INFO: VoP response received (status: MATCH, score: 95)
[14:30:05.200] INFO: Payment sent to SEP (pacs.008)
[14:30:05.750] INFO: Payment confirmed (pacs.002: ACSC)
```

**VoP Router:**
```
[14:30:00.200] INFO: VoP request received (from: NBUBUBU1XXX)
[14:30:00.210] INFO: Directory lookup (bank_code: 322313 → PRYBUA2XXXX)
[14:30:00.220] INFO: Forwarding to responder (url: https://vop.privatbank.ua)
[14:30:01.020] INFO: Response received from responder (latency: 800ms)
[14:30:01.050] INFO: Response sent to requester
```

**ПриватБанк:**
```
[14:30:00.220] INFO: VoP request received (iban: UA21********66001)
[14:30:00.340] INFO: Account found (client_id: 123456)
[14:30:00.420] INFO: Name matching completed (status: MATCH, score: 95)
[14:30:01.020] INFO: VoP response sent (processing_time: 800ms)
```

### Результат

✅ **VoP перевірка:** Успішна (MATCH)
✅ **Час перевірки:** 1.1 сек (< 1.5 сек target)
✅ **Платіж:** Виконано успішно
✅ **Час платежу:** 6 сек (< 10 сек для миттєвих переказів)
✅ **Клієнтський досвід:** Відмінний (впевненість у правильності реквізитів)

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
