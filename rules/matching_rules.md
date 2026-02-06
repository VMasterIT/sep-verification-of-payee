# Правила співставлення імен (Name Matching Rules)

## Огляд

Name Matching — це процес порівняння імені отримувача з запиту з іменем клієнта в базі даних банку-отримувача. Метою є визначення, чи співпадають ці імена, і якщо так, то наскільки.

## Основні принципи

1. **Fuzzy Matching** — допускаються незначні відмінності
2. **Толерантність до помилок** — враховуються друкарські помилки
3. **Нормалізація** — імена приводяться до стандартного формату
4. **Threshold-based** — результат базується на порогових значеннях similarity

---

## 1. Алгоритми matching

### 1.1 Levenshtein Distance

**Опис:** Мінімальна кількість операцій (вставка, видалення, заміна) для перетворення однієї строки в іншу.

**Formula:**
```
similarity = (1 - distance / max_length) * 100
```

**Приклад:**
```
s1 = "ШЕВЧЕНКО"
s2 = "ШЕВЧЕНКА"
distance = 1 (заміна 'О' → 'А')
max_length = 8
similarity = (1 - 1/8) * 100 = 87.5%
```

**Переваги:**
- Простий для розуміння
- Добре працює для коротких строк
- Виявляє одиничні помилки

**Недоліки:**
- Не враховує порядок слів
- Повільний для довгих строк

### 1.2 Jaro-Winkler Distance

**Опис:** Алгоритм, що враховує порядок символів та дає бонус за співпадіння на початку строки.

**Переваги:**
- Більш толерантний до перестановок
- Добре працює для імен
- Швидший за Levenshtein для довгих строк

**Недоліки:**
- Складніший для реалізації

**Приклад:**
```
s1 = "ШЕВЧЕНКО ТАРАС"
s2 = "ТАРАС ШЕВЧЕНКО"
Jaro-Winkler similarity ≈ 85% (висока через співпадіння символів)
```

### 1.3 Вибір алгоритму

**Рекомендація:** Використовувати обидва алгоритми та брати максимальний score.

```python
def calculate_similarity(name1, name2):
    lev_score = levenshtein_similarity(name1, name2)
    jw_score = jaro_winkler_similarity(name1, name2)
    return max(lev_score, jw_score)
```

---

## 2. Нормалізація імен

Перед matching імена ПОВИННІ бути нормалізовані.

### 2.1 Кроки нормалізації

**1. Case insensitive (lowercase)**
```
"ШЕВЧЕНКО" → "шевченко"
"ShEvChEnKo" → "shevchenko"
```

**2. Trim whitespace (видалення пробілів на початку/кінці)**
```
"  ШЕВЧЕНКО  " → "ШЕВЧЕНКО"
```

**3. Multiple spaces → single space**
```
"ШЕВЧЕНКО  ТАРАС" → "ШЕВЧЕНКО ТАРАС"
```

**4. Видалення спеціальних символів (крім дефіса)**
```
"О'КОННОР" → "ОКОННОР"
"ІВАН-ФРАНКО" → "ІВАН-ФРАНКО" (дефіс залишається)
```

**5. Видалення крапок після ініціалів**
```
"ШЕВЧЕНКО Т.Г." → "ШЕВЧЕНКО Т Г"
```

### 2.2 Приклад нормалізації

```python
def normalize_name(name):
    # 1. Lowercase
    name = name.lower()

    # 2. Trim whitespace
    name = name.strip()

    # 3. Multiple spaces → single space
    name = ' '.join(name.split())

    # 4. Remove special characters (except hyphen)
    import re
    name = re.sub(r'[^\w\s-]', '', name)

    # 5. Remove dots after initials
    name = re.sub(r'(\b\w)\.', r'\1', name)

    return name
```

---

## 3. Обробка ініціалів

### 3.1 Розширення ініціалів

Якщо в одному імені є ініціали, а в іншому — повні імена, необхідно:

**Варіант 1: Видалити ініціали з обох імен**
```
"ШЕВЧЕНКО Т.Г." → "ШЕВЧЕНКО"
"ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ" → "ШЕВЧЕНКО"
→ Порівняти "ШЕВЧЕНКО" == "ШЕВЧЕНКО" → MATCH
```

**Варіант 2: Порівняти ініціали**
```
"ШЕВЧЕНКО Т.Г." → ініціали: "Т", "Г"
"ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ" → ініціали: "Т", "Г"
→ Якщо ініціали співпадають + прізвище співпадає → MATCH
```

### 3.2 Приклад коду

```python
def expand_initials(name):
    """
    Розширює ініціали: видаляє одиночні літери.
    "ШЕВЧЕНКО Т Г" → "ШЕВЧЕНКО"
    """
    tokens = name.split()
    full_name_parts = [t for t in tokens if len(t) > 1]
    return ' '.join(full_name_parts)

def compare_with_initials(name1, name2):
    # Варіант 1: Порівняти без ініціалів
    expanded1 = expand_initials(name1)
    expanded2 = expand_initials(name2)

    if expanded1 and expanded2:
        similarity = calculate_similarity(expanded1, expanded2)
        if similarity >= 95:
            return 'MATCH', similarity

    # Варіант 2: Fuzzy matching на повних іменах
    similarity = calculate_similarity(name1, name2)
    return determine_match_status(similarity), similarity
```

---

## 4. Threshold (Пороги)

### 4.1 Визначення статусу

| Similarity Score | Match Status | Reason Code |
|------------------|--------------|-------------|
| ≥ 95% | MATCH | ANNM |
| 75% - 94% | CLOSE_MATCH | MBAM |
| < 75% | NO_MATCH | ANNM |

### 4.2 Налаштування порогів

Банки можуть налаштовувати пороги залежно від:
- Типу рахунку (PERSONAL vs BUSINESS)
- Типу платежу (INSTANT vs REGULAR)
- Ризик-апетиту банку

**Приклад конфігурації:**

```yaml
matching_thresholds:
  personal:
    instant:
      match: 95
      close_match: 75
    regular:
      match: 90
      close_match: 70
  business:
    instant:
      match: 98
      close_match: 85
    regular:
      match: 95
      close_match: 80
```

---

## 5. Особливі випадки

### 5.1 Транслітерація

Якщо одне ім'я кирилицею, а інше — латиницею, необхідно транслітерувати.

**Стандарт:** ДСТУ 9112:2021 (Ukrainian transliteration)

**Приклад:**
```
"ШЕВЧЕНКО" → "SHEVCHENKO"
"ГРИГОРІЙ" → "HRYHORII"
```

**Алгоритм:**
1. Визначити алфавіт обох імен
2. Якщо різні → транслітерувати одне з них
3. Виконати matching

```python
def is_cyrillic(text):
    return bool(re.search('[а-яА-ЯіїєґІЇЄҐ]', text))

def is_latin(text):
    return bool(re.search('[a-zA-Z]', text))

def match_with_transliteration(name1, name2):
    # Якщо один кирилицею, інший латиницею
    if is_cyrillic(name1) and is_latin(name2):
        name1_translit = transliterate_ua_to_en(name1)
        return calculate_similarity(name1_translit, name2)
    elif is_latin(name1) and is_cyrillic(name2):
        name2_translit = transliterate_ua_to_en(name2)
        return calculate_similarity(name1, name2_translit)
    else:
        return calculate_similarity(name1, name2)
```

### 5.2 Порядок імен

Деякі клієнти вводять ім'я в різному порядку:
- "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
- "ТАРАС ГРИГОРОВИЧ ШЕВЧЕНКО"
- "ТАРАС ШЕВЧЕНКО"

**Рішення:** Token-based matching

```python
def token_based_matching(name1, name2):
    """
    Порівняти токени (слова) незалежно від порядку.
    """
    tokens1 = set(name1.lower().split())
    tokens2 = set(name2.lower().split())

    # Jaccard similarity
    intersection = len(tokens1 & tokens2)
    union = len(tokens1 | tokens2)

    if union == 0:
        return 0

    return (intersection / union) * 100
```

### 5.3 Подвійні прізвища

Приклад: "ІВАНОВА-ПЕТРЕНКО" vs "ІВАНОВА ПЕТРЕНКО" (без дефіса)

**Рішення:** Нормалізувати дефіс

```python
# Замінити дефіс на пробіл або видалити
name = name.replace('-', ' ')
# або
name = name.replace('-', '')
```

### 5.4 Бізнес-назви (BUSINESS accounts)

Бізнес-назви складніші:
- "ТОВ МОНОБАНК" vs "ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ МОНОБАНК"
- "ПП ШЕВЧЕНКО" vs "ПРИВАТНЕ ПІДПРИЄМСТВО ШЕВЧЕНКО"

**Рішення:** Словник скорочень

```python
business_abbreviations = {
    'ТОВ': 'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ',
    'ПП': 'ПРИВАТНЕ ПІДПРИЄМСТВО',
    'ФОП': 'ФІЗИЧНА ОСОБА ПІДПРИЄМЕЦЬ',
    'АТ': 'АКЦІОНЕРНЕ ТОВАРИСТВО',
    'ПАТ': 'ПУБЛІЧНЕ АКЦІОНЕРНЕ ТОВАРИСТВО',
    'ДП': 'ДЕРЖАВНЕ ПІДПРИЄМСТВО'
}

def expand_business_name(name):
    for abbr, full in business_abbreviations.items():
        name = re.sub(r'\b' + abbr + r'\b', full, name, flags=re.IGNORECASE)
    return name
```

---

## 6. Приклади matching

### 6.1 Повне співпадіння (MATCH)

| Input Name | DB Name | Score | Status |
|------------|---------|-------|--------|
| ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | 100% | MATCH |
| шевченко тарас григорович | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | 100% | MATCH |
| ШЕВЧЕНКО Т.Г. | ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | 98% | MATCH |

### 6.2 Часткове співпадіння (CLOSE_MATCH)

| Input Name | DB Name | Score | Status | Причина |
|------------|---------|-------|--------|---------|
| ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ | ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ | 92% | CLOSE_MATCH | Помилка в написанні |
| ШЕВЧЕНКО ТАРАС | ШЕВЧЕНКО ТАРАС ГРИГОРІЙОВИЧ | 85% | CLOSE_MATCH | Відсутнє по батькові |
| SHEVCHENKO TARAS | ШЕВЧЕНКО ТАРАС | 88% | CLOSE_MATCH | Транслітерація |
| ТАРАС ШЕВЧЕНКО | ШЕВЧЕНКО ТАРАС | 85% | CLOSE_MATCH | Зворотний порядок |

### 6.3 Не співпадає (NO_MATCH)

| Input Name | DB Name | Score | Status |
|------------|---------|-------|--------|
| ПЕТРЕНКО ОЛЕГ | ШЕВЧЕНКО ТАРАС | 30% | NO_MATCH |
| КОВАЛЕНКО | МЕЛЬНИК ІВАН | 15% | NO_MATCH |

---

## 7. Рекомендації для впровадження

### 7.1 Використовувати кілька алгоритмів

```python
def match_name(request_name, db_name):
    # 1. Нормалізація
    norm1 = normalize_name(request_name)
    norm2 = normalize_name(db_name)

    # 2. Exact match
    if norm1 == norm2:
        return 'MATCH', 100

    # 3. Обробка ініціалів
    expanded1 = expand_initials(norm1)
    expanded2 = expand_initials(norm2)
    if expanded1 and expanded2 and expanded1 == expanded2:
        return 'MATCH', 98

    # 4. Fuzzy matching
    lev_score = levenshtein_similarity(norm1, norm2)
    jw_score = jaro_winkler_similarity(norm1, norm2)
    token_score = token_based_matching(norm1, norm2)

    max_score = max(lev_score, jw_score, token_score)

    # 5. Визначити статус
    if max_score >= 95:
        return 'MATCH', max_score
    elif max_score >= 75:
        return 'CLOSE_MATCH', max_score
    else:
        return 'NO_MATCH', max_score
```

### 7.2 Логування для аналізу

```python
log_matching_result({
    'request_name': request_name,
    'db_name': db_name,
    'lev_score': lev_score,
    'jw_score': jw_score,
    'token_score': token_score,
    'final_score': max_score,
    'status': status,
    'processing_time': processing_time
})
```

### 7.3 A/B тестування порогів

```python
# Тестувати різні threshold для оптимізації
thresholds = [
    {'match': 95, 'close': 75},
    {'match': 90, 'close': 70},
    {'match': 98, 'close': 85}
]

for threshold in thresholds:
    evaluate_threshold(threshold)
```

---

## 8. Висновки

Ефективний Name Matching для VoP вимагає:

✅ **Нормалізація** — приведення до стандартного формату
✅ **Fuzzy matching** — толерантність до помилок
✅ **Кілька алгоритмів** — Levenshtein, Jaro-Winkler, token-based
✅ **Обробка ініціалів** — розширення або порівняння
✅ **Транслітерація** — підтримка кирилиці та латиниці
✅ **Налаштовувані пороги** — залежно від типу рахунку

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
