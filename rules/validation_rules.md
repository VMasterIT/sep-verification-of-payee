# Правила валідації для VoP СЕП НБУ

## Зміст

1. [Загальні принципи](#загальні-принципи)
2. [Валідація IBAN](#валідація-iban)
3. [Валідація імен](#валідація-імен)
4. [Валідація ідентифікаційних кодів](#валідація-ідентифікаційних-кодів)
5. [Валідація BIC](#валідація-bic)
6. [Валідація UUID](#валідація-uuid)
7. [Валідація timestamp](#валідація-timestamp)
8. [Валідація request payload](#валідація-request-payload)
9. [Санітизація даних](#санітизація-даних)

---

## 1. Загальні принципи

### 1.1 Рівні валідації

```
┌─────────────────────────────────┐
│  1. Синтаксична валідація       │ ← Формат, довжина, регулярні вирази
├─────────────────────────────────┤
│  2. Семантична валідація        │ ← Checksum, логічна правильність
├─────────────────────────────────┤
│  3. Бізнес-валідація            │ ← Існування в БД, статус, правила
└─────────────────────────────────┘
```

### 1.2 Validation Strategy

**Fail Fast:**
- Валідувати на найбільш ранньому етапі
- Повертати першу знайдену помилку (або всі помилки разом)
- Не обробляти невалідні дані

**Error Response Format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "payee.iban",
        "error": "Invalid IBAN checksum"
      },
      {
        "field": "payee.name",
        "error": "Name too long (max 140 characters)"
      }
    ]
  }
}
```

---

## 2. Валідація IBAN

### 2.1 Формат українського IBAN

**Структура:**
```
UA + 2 check digits + 6 bank code + 19 account number = 29 символів

Приклад: UA21 322313 0000026007233566001
         ││││ ││││││ │││││││││││││││││││
         │││└─ Check digits (mod 97)
         ││└── Код країни (Ukraine)
         │└─── Bank code (6 цифр)
         └──── Account number (19 символів)
```

### 2.2 Validation Rules

**VR-IBAN-01: Довжина**
```
Вимога: IBAN має бути точно 29 символів (без пробілів)
Regex: ^UA\d{27}$
```

**Приклад:**
```javascript
function validateIBANLength(iban) {
  // Видалити пробіли
  iban = iban.replace(/\s/g, '');

  if (iban.length !== 29) {
    return {
      valid: false,
      error: `Invalid IBAN length: ${iban.length} (expected 29)`
    };
  }

  return { valid: true };
}
```

**VR-IBAN-02: Код країни**
```
Вимога: IBAN має починатися з "UA"
Regex: ^UA
```

**VR-IBAN-03: Формат символів**
```
Вимога: UA + 27 цифр
Regex: ^UA\d{27}$
Допустимі символи: 0-9 (цифри), UA (літери)
```

**Приклад:**
```python
import re

def validate_iban_format(iban):
    """
    Валідація формату IBAN
    """
    iban = iban.replace(' ', '').upper()

    if not re.match(r'^UA\d{27}$', iban):
        return {
            'valid': False,
            'error': 'Invalid IBAN format (expected UA + 27 digits)'
        }

    return {'valid': True}
```

**VR-IBAN-04: Checksum (mod 97)**
```
Вимога: Контрольна сума має бути валідною
Алгоритм: ISO 13616
```

**Приклад:**
```python
def validate_iban_checksum(iban):
    """
    Валідація IBAN checksum за допомогою mod 97
    """
    # 1. Видалити пробіли та uppercase
    iban = iban.replace(' ', '').upper()

    # 2. Перемістити перші 4 символи в кінець
    rearranged = iban[4:] + iban[:4]

    # 3. Замінити літери на цифри (A=10, B=11, ..., Z=35)
    numeric = ''
    for char in rearranged:
        if char.isdigit():
            numeric += char
        else:
            numeric += str(ord(char) - ord('A') + 10)

    # 4. Перевірити mod 97 == 1
    if int(numeric) % 97 != 1:
        return {
            'valid': False,
            'error': 'Invalid IBAN checksum'
        }

    return {'valid': True}
```

**Тестові кейси:**
```python
# Valid IBANs
valid_ibans = [
    'UA213223130000026007233566001',
    'UA903052990000026009011702860',
    'UA21 3223 1300 0002 6007 2335 6600 1'  # з пробілами
]

# Invalid IBANs
invalid_ibans = [
    'UA00000000000000000000000000000',  # Invalid checksum
    'UA2132231300000260072335660',      # Too short
    'UA2132231300000260072335660011',   # Too long
    'DE89370400440532013000',           # Wrong country code
    'UA2X322313000002600723356600',     # Letters in digits
]
```

**VR-IBAN-05: Bank Code Existence**
```
Вимога: Bank code (символи 5-10) має існувати в Directory
Валідація: Lookup в Directory Service
```

**Приклад:**
```python
def validate_bank_code(iban):
    """
    Валідація існування bank code в Directory
    """
    bank_code = iban[4:10]  # Витягнути bank code

    participant = directory_service.lookup_by_bank_code(bank_code)

    if not participant:
        return {
            'valid': False,
            'error': f'Bank code {bank_code} not found in Directory'
        }

    if participant.status != 'ACTIVE':
        return {
            'valid': False,
            'error': f'Bank {bank_code} is not active (status: {participant.status})'
        }

    return {'valid': True, 'participant': participant}
```

---

## 3. Валідація імен

### 3.1 Формат імен

**VR-NAME-01: Довжина**
```
Вимога: 1-140 символів
Min: 1
Max: 140
```

**VR-NAME-02: Допустимі символи**
```
Допустимо:
- Українські літери: А-Я, а-я, Ґ, ґ, Є, є, І, і, Ї, ї
- Латинські літери: A-Z, a-z
- Цифри: 0-9 (для назв компаній)
- Спеціальні: пробіл, дефіс (-), апостроф ('), лапки ("), крапка (.)

Заборонено:
- Контрольні символи (\x00-\x1f, \x7f-\x9f)
- SQL injection patterns ('; DROP TABLE; --)
- XSS patterns (<script>, javascript:)
```

**Приклад:**
```python
import re

def validate_name(name):
    """
    Валідація імені отримувача
    """
    # 1. Довжина
    if len(name) < 1 or len(name) > 140:
        return {
            'valid': False,
            'error': f'Invalid name length: {len(name)} (expected 1-140)'
        }

    # 2. Заборонені символи
    # Контрольні символи
    if re.search(r'[\x00-\x1f\x7f-\x9f]', name):
        return {
            'valid': False,
            'error': 'Name contains control characters'
        }

    # SQL injection patterns
    dangerous_patterns = ['--', ';', '/*', '*/', 'DROP', 'DELETE', 'INSERT', 'UPDATE']
    for pattern in dangerous_patterns:
        if pattern.upper() in name.upper():
            return {
                'valid': False,
                'error': f'Name contains dangerous pattern: {pattern}'
            }

    # XSS patterns
    if '<' in name or '>' in name or 'script' in name.lower():
        return {
            'valid': False,
            'error': 'Name contains XSS patterns'
        }

    return {'valid': True}
```

**VR-NAME-03: Формат для фізичних осіб**
```
Формат: ПРІЗВИЩЕ ІМ'Я ПО-БАТЬКОВІ
Приклад: ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ

Допустимі варіанти:
- Повне ім'я: "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
- З ініціалами: "ШЕВЧЕНКО Т.Г."
- Без по-батькові: "ШЕВЧЕНКО ТАРАС"
- Зворотний порядок: "ТАРАС ШЕВЧЕНКО"
```

**VR-NAME-04: Формат для юридичних осіб**
```
Формат: [ТИП] НАЗВА [ЛАПКИ]
Приклад: ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ "МОНОБАНК"

Типи компаній:
- ТОВ / ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ
- ПП / ПРИВАТНЕ ПІДПРИЄМСТВО
- ФОП / ФІЗИЧНА ОСОБА ПІДПРИЄМЕЦЬ
- АТ / АКЦІОНЕРНЕ ТОВАРИСТВО
- ПАТ / ПУБЛІЧНЕ АКЦІОНЕРНЕ ТОВАРИСТВО
- ДП / ДЕРЖАВНЕ ПІДПРИЄМСТВО
```

**VR-NAME-05: Пробіли**
```
Вимога: Не більше одного пробілу підряд
Trim: Видалити пробіли на початку та в кінці
```

**Приклад:**
```python
def normalize_name(name):
    """
    Нормалізація імені
    """
    # 1. Trim
    name = name.strip()

    # 2. Multiple spaces → single space
    name = ' '.join(name.split())

    return name
```

---

## 4. Валідація ідентифікаційних кодів

### 4.1 ЄДРПОУ (для юридичних осіб)

**VR-EDRPOU-01: Формат**
```
Довжина: 8 або 10 цифр
Regex: ^\d{8}$|^\d{10}$
Приклад: 14360570
```

**VR-EDRPOU-02: Checksum**
```
Алгоритм: Модуль 11 з вагами
Ваги: [1, 2, 3, 4, 5, 6, 7]
```

**Приклад:**
```python
def validate_edrpou(code):
    """
    Валідація коду ЄДРПОУ
    """
    # 1. Формат
    if not re.match(r'^\d{8}$|^\d{10}$', code):
        return {
            'valid': False,
            'error': 'EDRPOU must be 8 or 10 digits'
        }

    # 2. Checksum (для 8-значного коду)
    if len(code) == 8:
        weights = [1, 2, 3, 4, 5, 6, 7]
        digits = [int(d) for d in code[:7]]

        checksum = sum(w * d for w, d in zip(weights, digits)) % 11

        if checksum == 10:
            # Якщо 10, використовуємо інші ваги
            weights = [3, 4, 5, 6, 7, 8, 9]
            checksum = sum(w * d for w, d in zip(weights, digits)) % 11
            if checksum == 10:
                checksum = 0

        if checksum != int(code[7]):
            return {
                'valid': False,
                'error': 'Invalid EDRPOU checksum'
            }

    return {'valid': True}
```

### 4.2 ІПН (Індивідуальний податковий номер)

**VR-INN-01: Формат**
```
Довжина: 10 цифр
Regex: ^\d{10}$
Приклад: 1234567890
```

**VR-INN-02: Структура**
```
Формат: DDMMYYSSSSC
DD - день народження (01-31)
MM - місяць народження (01-12)
YY - рік народження (00-99)
SSSS - порядковий номер
C - контрольна цифра
```

**VR-INN-03: Валідація дати**
```
Вимога: Дата народження має бути реалістичною
- День: 01-31
- Місяць: 01-12
- Рік: 00-99 (1900-2099)
```

**Приклад:**
```python
def validate_inn(code):
    """
    Валідація ІПН
    """
    # 1. Формат
    if not re.match(r'^\d{10}$', code):
        return {
            'valid': False,
            'error': 'INN must be 10 digits'
        }

    # 2. Валідація дати
    day = int(code[0:2])
    month = int(code[2:4])
    year = int(code[4:6])

    if day < 1 or day > 31:
        return {
            'valid': False,
            'error': f'Invalid day in INN: {day}'
        }

    if month < 1 or month > 12:
        return {
            'valid': False,
            'error': f'Invalid month in INN: {month}'
        }

    # 3. Checksum (mod 11)
    weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7]
    digits = [int(d) for d in code[:9]]

    checksum = sum(w * d for w, d in zip(weights, digits)) % 11

    if checksum != int(code[9]):
        return {
            'valid': False,
            'error': 'Invalid INN checksum'
        }

    return {'valid': True}
```

### 4.3 Паспорт

**VR-PASSPORT-01: Формат**
```
Старий формат: AA123456 (2 літери + 6 цифр)
Новий формат (ID-карта): 123456789 (9 цифр)
Regex: ^[A-Z]{2}\d{6}$|^\d{9}$
```

**Приклад:**
```python
def validate_passport(code):
    """
    Валідація паспорта
    """
    # Старий формат або новий (ID-карта)
    if not re.match(r'^[A-Z]{2}\d{6}$|^\d{9}$', code):
        return {
            'valid': False,
            'error': 'Invalid passport format'
        }

    return {'valid': True}
```

---

## 5. Валідація BIC

### 5.1 Формат BIC (ISO 9362)

**VR-BIC-01: Довжина**
```
Вимога: 8 або 11 символів
8 символів: bank code + country code + location code
11 символів: + branch code
```

**VR-BIC-02: Структура**
```
Формат: AAAABBCCXXX
AAAA - Bank code (4 літери)
BB - Country code (2 літери, ISO 3166-1)
CC - Location code (2 символи, літери або цифри)
XXX - Branch code (опційно, 3 символи)

Приклад: PRYBUA2XXXX
PRYB - ПриватБанк
UA - Ukraine
2X - Location
XXX - Head office
```

**VR-BIC-03: Regex**
```
Regex: ^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$
```

**Приклад:**
```python
def validate_bic(bic):
    """
    Валідація BIC
    """
    # 1. Довжина
    if len(bic) not in [8, 11]:
        return {
            'valid': False,
            'error': f'Invalid BIC length: {len(bic)} (expected 8 or 11)'
        }

    # 2. Формат
    if not re.match(r'^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$', bic):
        return {
            'valid': False,
            'error': 'Invalid BIC format'
        }

    # 3. Country code
    country_code = bic[4:6]
    if country_code != 'UA':
        return {
            'valid': False,
            'error': f'Invalid country code: {country_code} (expected UA)'
        }

    return {'valid': True}
```

**Тестові кейси:**
```python
# Valid BICs
valid_bics = [
    'PRYBUA2X',        # 8 символів
    'PRYBUA2XXXX',     # 11 символів
    'NBUBUBU1XXX',
    'PBANUA2X'
]

# Invalid BICs
invalid_bics = [
    'PRYB',            # Too short
    'PRYBUA',          # Too short
    'prybua2xxxx',     # Lowercase
    'PRYBDE2XXXX',     # Wrong country (DE)
    'PRYB1A2XXXX',     # Digit in bank code
]
```

---

## 6. Валідація UUID

### 6.1 UUID v4 Format

**VR-UUID-01: Формат**
```
Формат: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
x - hex digit (0-9, a-f)
y - 8, 9, a, або b
4 - версія UUID (v4)

Приклад: 550e8400-e29b-41d4-a716-446655440000
```

**VR-UUID-02: Regex**
```
Regex: ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

**Приклад:**
```python
import uuid

def validate_uuid(uuid_string):
    """
    Валідація UUID v4
    """
    try:
        # Спроба parse UUID
        parsed_uuid = uuid.UUID(uuid_string, version=4)

        # Перевірка версії
        if parsed_uuid.version != 4:
            return {
                'valid': False,
                'error': f'Invalid UUID version: {parsed_uuid.version} (expected 4)'
            }

        return {'valid': True}
    except ValueError as e:
        return {
            'valid': False,
            'error': f'Invalid UUID format: {str(e)}'
        }
```

---

## 7. Валідація Timestamp

### 7.1 ISO 8601 Format

**VR-TIMESTAMP-01: Формат**
```
Формат: YYYY-MM-DDTHH:MM:SSZ
або: YYYY-MM-DDTHH:MM:SS.sssZ

Приклад:
2026-02-06T14:30:00Z
2026-02-06T14:30:00.123Z
```

**VR-TIMESTAMP-02: Timezone**
```
Вимога: Тільки UTC (Z на кінці)
Заборонено: +02:00, -05:00
```

**VR-TIMESTAMP-03: Діапазон**
```
Вимога: Timestamp має бути в розумному діапазоні
- Не в майбутньому (> now + 5 хвилин)
- Не дуже старий (< now - 24 години)
```

**Приклад:**
```python
from datetime import datetime, timedelta

def validate_timestamp(timestamp_string):
    """
    Валідація timestamp
    """
    try:
        # 1. Parse ISO 8601
        timestamp = datetime.fromisoformat(timestamp_string.replace('Z', '+00:00'))

        # 2. Перевірка UTC
        if timestamp.tzinfo is None:
            return {
                'valid': False,
                'error': 'Timestamp must include timezone (Z)'
            }

        # 3. Перевірка діапазону
        now = datetime.now(timezone.utc)
        max_future = now + timedelta(minutes=5)
        max_past = now - timedelta(hours=24)

        if timestamp > max_future:
            return {
                'valid': False,
                'error': 'Timestamp is in the future'
            }

        if timestamp < max_past:
            return {
                'valid': False,
                'error': 'Timestamp is too old (> 24 hours)'
            }

        return {'valid': True}
    except ValueError as e:
        return {
            'valid': False,
            'error': f'Invalid timestamp format: {str(e)}'
        }
```

---

## 8. Валідація Request Payload

### 8.1 JSON Schema Validation

**VR-REQUEST-01: Schema compliance**
```
Вимога: Request має відповідати JSON Schema
Schema: vop-request.json
```

**Приклад:**
```python
from jsonschema import validate, ValidationError
import json

# Load schema
with open('vop-request.json', 'r') as f:
    schema = json.load(f)

def validate_request_payload(request_data):
    """
    Валідація request payload за допомогою JSON Schema
    """
    try:
        validate(instance=request_data, schema=schema)
        return {'valid': True}
    except ValidationError as e:
        return {
            'valid': False,
            'error': e.message,
            'path': list(e.path)
        }
```

### 8.2 Required Fields

**VR-REQUEST-02: Обов'язкові поля**
```
Required:
- requestId
- timestamp
- requester.bic
- requester.nbuId
- payee.iban
- payee.name

Optional:
- payee.identificationType
- payee.identificationCode
- accountType
- paymentType
```

### 8.3 Cross-field Validation

**VR-REQUEST-03: identificationType + identificationCode**
```
Правило: Якщо один присутній, то і другий має бути присутнім
```

**Приклад:**
```python
def validate_cross_fields(request_data):
    """
    Cross-field валідація
    """
    payee = request_data.get('payee', {})
    id_type = payee.get('identificationType')
    id_code = payee.get('identificationCode')

    # Якщо один є, то і другий має бути
    if (id_type and not id_code) or (id_code and not id_type):
        return {
            'valid': False,
            'error': 'identificationType and identificationCode must be both present or both absent'
        }

    # Валідація відповідності типу та коду
    if id_type == 'EDRPOU':
        result = validate_edrpou(id_code)
        if not result['valid']:
            return result
    elif id_type == 'INN':
        result = validate_inn(id_code)
        if not result['valid']:
            return result
    elif id_type == 'PASSPORT':
        result = validate_passport(id_code)
        if not result['valid']:
            return result

    return {'valid': True}
```

**VR-REQUEST-04: accountType відповідає identificationType**
```
Правило:
- accountType=PERSONAL → identificationType=INN або PASSPORT
- accountType=BUSINESS → identificationType=EDRPOU
```

**Приклад:**
```python
def validate_account_type_consistency(request_data):
    """
    Валідація узгодженості accountType та identificationType
    """
    account_type = request_data.get('accountType')
    id_type = request_data.get('payee', {}).get('identificationType')

    if not account_type or not id_type:
        return {'valid': True}  # Skip if not present

    if account_type == 'PERSONAL' and id_type not in ['INN', 'PASSPORT']:
        return {
            'valid': False,
            'error': f'PERSONAL account must have INN or PASSPORT, got {id_type}'
        }

    if account_type == 'BUSINESS' and id_type != 'EDRPOU':
        return {
            'valid': False,
            'error': f'BUSINESS account must have EDRPOU, got {id_type}'
        }

    return {'valid': True}
```

---

## 9. Санітизація даних

### 9.1 Input Sanitization

**VR-SANITIZE-01: Trim whitespace**
```python
def sanitize_string(value):
    """
    Видалити пробіли на початку та в кінці
    """
    if isinstance(value, str):
        return value.strip()
    return value
```

**VR-SANITIZE-02: Normalize spaces**
```python
def normalize_spaces(value):
    """
    Multiple spaces → single space
    """
    if isinstance(value, str):
        return ' '.join(value.split())
    return value
```

**VR-SANITIZE-03: Remove control characters**
```python
import re

def remove_control_characters(value):
    """
    Видалити контрольні символи
    """
    if isinstance(value, str):
        return re.sub(r'[\x00-\x1f\x7f-\x9f]', '', value)
    return value
```

**VR-SANITIZE-04: SQL Injection Protection**
```python
def sanitize_sql(value):
    """
    Видалити небезпечні SQL patterns
    """
    if isinstance(value, str):
        dangerous_patterns = ['--', ';', '/*', '*/', 'xp_', 'sp_']
        for pattern in dangerous_patterns:
            value = value.replace(pattern, '')
        return value
    return value
```

**VR-SANITIZE-05: XSS Protection**
```python
def sanitize_xss(value):
    """
    Екранувати HTML/JS
    """
    if isinstance(value, str):
        value = value.replace('<', '&lt;')
        value = value.replace('>', '&gt;')
        value = value.replace('"', '&quot;')
        value = value.replace("'", '&#039;')
        return value
    return value
```

### 9.2 Complete Sanitization Pipeline

```python
def sanitize_request(request_data):
    """
    Повна санітизація VoP request
    """
    # Deep copy для уникнення мутацій
    import copy
    sanitized = copy.deepcopy(request_data)

    # Sanitize payee.name
    if 'payee' in sanitized and 'name' in sanitized['payee']:
        name = sanitized['payee']['name']
        name = sanitize_string(name)
        name = normalize_spaces(name)
        name = remove_control_characters(name)
        name = sanitize_sql(name)
        sanitized['payee']['name'] = name

    # Sanitize payee.iban (remove spaces)
    if 'payee' in sanitized and 'iban' in sanitized['payee']:
        iban = sanitized['payee']['iban']
        iban = iban.replace(' ', '').upper()
        sanitized['payee']['iban'] = iban

    return sanitized
```

---

## 10. Complete Validation Pipeline

### 10.1 Full Request Validation

```python
class VoPRequestValidator:
    """
    Повний валідатор VoP Request
    """

    def __init__(self, schema):
        self.schema = schema

    def validate(self, request_data):
        """
        Виконати всі валідації
        """
        errors = []

        # 1. Sanitize
        request_data = sanitize_request(request_data)

        # 2. JSON Schema validation
        result = self.validate_schema(request_data)
        if not result['valid']:
            errors.append(result['error'])

        # 3. Field-level validation
        errors.extend(self.validate_fields(request_data))

        # 4. Cross-field validation
        result = self.validate_cross_fields(request_data)
        if not result['valid']:
            errors.append(result['error'])

        # 5. Business rules validation
        errors.extend(self.validate_business_rules(request_data))

        if errors:
            return {
                'valid': False,
                'errors': errors
            }

        return {
            'valid': True,
            'sanitized_data': request_data
        }

    def validate_schema(self, request_data):
        """JSON Schema validation"""
        try:
            validate(instance=request_data, schema=self.schema)
            return {'valid': True}
        except ValidationError as e:
            return {
                'valid': False,
                'error': {
                    'field': '.'.join(str(p) for p in e.path),
                    'message': e.message
                }
            }

    def validate_fields(self, request_data):
        """Field-level validation"""
        errors = []

        # IBAN
        iban = request_data.get('payee', {}).get('iban')
        if iban:
            result = validate_iban(iban)
            if not result['valid']:
                errors.append({'field': 'payee.iban', 'message': result['error']})

        # Name
        name = request_data.get('payee', {}).get('name')
        if name:
            result = validate_name(name)
            if not result['valid']:
                errors.append({'field': 'payee.name', 'message': result['error']})

        # BIC
        bic = request_data.get('requester', {}).get('bic')
        if bic:
            result = validate_bic(bic)
            if not result['valid']:
                errors.append({'field': 'requester.bic', 'message': result['error']})

        # UUID
        request_id = request_data.get('requestId')
        if request_id:
            result = validate_uuid(request_id)
            if not result['valid']:
                errors.append({'field': 'requestId', 'message': result['error']})

        # Timestamp
        timestamp = request_data.get('timestamp')
        if timestamp:
            result = validate_timestamp(timestamp)
            if not result['valid']:
                errors.append({'field': 'timestamp', 'message': result['error']})

        return errors

    def validate_cross_fields(self, request_data):
        """Cross-field validation"""
        # identificationType + identificationCode
        result = validate_cross_fields(request_data)
        if not result['valid']:
            return result

        # accountType відповідає identificationType
        result = validate_account_type_consistency(request_data)
        return result

    def validate_business_rules(self, request_data):
        """Business rules validation"""
        errors = []

        # BR-XX: Add business rules here
        # Example: Check if bank is active

        return errors


def validate_iban(iban):
    """Complete IBAN validation"""
    # Length
    result = validateIBANLength(iban)
    if not result['valid']:
        return result

    # Format
    result = validate_iban_format(iban)
    if not result['valid']:
        return result

    # Checksum
    result = validate_iban_checksum(iban)
    if not result['valid']:
        return result

    return {'valid': True}
```

---

## Висновки

Правила валідації VoP забезпечують:

✅ **Синтаксична валідація** — формат, довжина, regex
✅ **Семантична валідація** — checksum, логічна правильність
✅ **Бізнес-валідація** — існування в БД, статуси
✅ **Санітизація** — захист від SQL injection, XSS
✅ **Cross-field validation** — узгодженість полів
✅ **Clear error messages** — зрозумілі повідомлення про помилки

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
