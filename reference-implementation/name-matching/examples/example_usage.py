"""
VoP Name Matching - Приклад використання (Python)
"""

import sys
sys.path.insert(0, '../src/python')

from name_matcher import NameMatcher, MatchStatus


def main():
    # Створення matcher
    matcher = NameMatcher(
        match_threshold=95.0,
        close_match_threshold=75.0
    )

    print("=" * 80)
    print("VoP Name Matching - Приклади використання")
    print("=" * 80)
    print()

    # Приклад 1: Повне співпадіння
    print("1. Повне співпадіння (MATCH)")
    print("-" * 80)
    result = matcher.match(
        "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
        "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
    )
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    print(f"✅ Реквізити підтверджені")
    print()

    # Приклад 2: Ініціали
    print("2. Співставлення з ініціалами")
    print("-" * 80)
    result = matcher.match(
        "ПЕТРЕНКО ОЛЕНА ІВАНІВНА",
        "ПЕТРЕНКО О.І."
    )
    print(f"Name 1: ПЕТРЕНКО ОЛЕНА ІВАНІВНА")
    print(f"Name 2: ПЕТРЕНКО О.І.")
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    print(f"✅ Реквізити підтверджені (ініціали)")
    print()

    # Приклад 3: Транслітерація (близьке співпадіння)
    print("3. Транслітерація (CLOSE_MATCH)")
    print("-" * 80)
    result = matcher.match(
        "ПЕТРЕНКО ОЛЕНА ІВАНІВНА",
        "PETRANKO OLENA IVANIVNA"  # Помилка: PETRANKO замість PETRENKO
    )
    print(f"Name 1: ПЕТРЕНКО ОЛЕНА ІВАНІВНА")
    print(f"Name 2: PETRANKO OLENA IVANIVNA")
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    print(f"⚠️  Можлива помилка в транслітерації")
    print()

    # Приклад 4: Опечатка
    print("4. Опечатка в імені (CLOSE_MATCH)")
    print("-" * 80)
    result = matcher.match(
        "ІВАНОВ ІВАН ІВАНОВИЧ",
        "ІВАНОВ ІВАН ІВАОВИЧ"  # Помилка: ІВАОВИЧ
    )
    print(f"Name 1: ІВАНОВ ІВАН ІВАНОВИЧ")
    print(f"Name 2: ІВАНОВ ІВАН ІВАОВИЧ")
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    print(f"⚠️  Можлива опечатка")
    print()

    # Приклад 5: Не співпадає
    print("5. Імена не співпадають (NO_MATCH)")
    print("-" * 80)
    result = matcher.match(
        "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
        "КОВАЛЕНКО ПЕТРО МИКОЛАЙОВИЧ"
    )
    print(f"Name 1: ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ")
    print(f"Name 2: КОВАЛЕНКО ПЕТРО МИКОЛАЙОВИЧ")
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    print(f"❌ Реквізити не співпадають")
    print()

    # Приклад 6: Різна кількість частин імені
    print("6. Різна кількість частин")
    print("-" * 80)
    result = matcher.match(
        "КОВАЛЕНКО МАРІЯ",
        "КОВАЛЕНКО МАРІЯ ПЕТРІВНА"
    )
    print(f"Name 1: КОВАЛЕНКО МАРІЯ")
    print(f"Name 2: КОВАЛЕНКО МАРІЯ ПЕТРІВНА")
    print(f"Статус: {result.status.value}")
    print(f"Score: {result.score}%")
    if result.status == MatchStatus.MATCH:
        print(f"✅ Реквізити підтверджені")
    else:
        print(f"⚠️  Часткове співпадіння")
    print()

    # Приклад 7: Batch processing
    print("7. Batch обробка (10 пар імен)")
    print("-" * 80)

    test_pairs = [
        ("ШЕВЧЕНКО Т.Г.", "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"),
        ("ПЕТРЕНКО О.", "ПЕТРЕНКО ОЛЕНА"),
        ("ІВАНОВ І.І.", "ІВАНОВ ІВАН ІВАНОВИЧ"),
        ("СИДОРЕНКО П.", "СИДОРЕНКО ПЕТРО МИХАЙЛОВИЧ"),
        ("КОВАЛЬ М.П.", "КОВАЛЬ МАРІЯ ПЕТРІВНА"),
        ("МЕЛЬНИК В.", "МЕЛЬНИК ВАСИЛЬ"),
        ("БОНДАРЕНКО О.І.", "БОНДАРЕНКО ОЛЕКСАНДР ІГОРОВИЧ"),
        ("КРАВЧЕНКО Н.", "КРАВЧЕНКО НАТАЛІЯ"),
        ("ТКАЧЕНКО С.В.", "ТКАЧЕНКО СЕРГІЙ ВОЛОДИМИРОВИЧ"),
        ("МОРОЗОВ А.А.", "МОРОЗОВ АНДРІЙ АНАТОЛІЙОВИЧ"),
    ]

    stats = {
        "MATCH": 0,
        "CLOSE_MATCH": 0,
        "NO_MATCH": 0
    }

    for name1, name2 in test_pairs:
        result = matcher.match(name1, name2)
        stats[result.status.value] += 1
        status_icon = "✅" if result.status == MatchStatus.MATCH else "⚠️" if result.status == MatchStatus.CLOSE_MATCH else "❌"
        print(f"{status_icon} {result.status.value:12} {result.score:5.1f}% | {name1:30} <-> {name2}")

    print()
    print("Статистика:")
    print(f"  MATCH:       {stats['MATCH']}")
    print(f"  CLOSE_MATCH: {stats['CLOSE_MATCH']}")
    print(f"  NO_MATCH:    {stats['NO_MATCH']}")
    print()

    # Приклад 8: Інтеграція з VoP Responder
    print("8. Інтеграція з VoP Responder")
    print("-" * 80)
    print("""
# Приклад інтеграції з FastAPI

from fastapi import FastAPI
from name_matcher import NameMatcher

app = FastAPI()
matcher = NameMatcher()

@app.post("/vop/v1/verify")
async def verify(request: VopRequest):
    # 1. Отримати ім'я з БД за IBAN
    db_name = await get_customer_name(request.payee.iban)

    # 2. Співставлення імен
    result = matcher.match(request.payee.name, db_name)

    # 3. Повернути результат
    return VopResponse(
        matchStatus=result.status.value,
        matchScore=result.score,
        reasonCode="ANNM" if result.status == MatchStatus.MATCH else "MBAM",
        verifiedName=db_name,
        accountStatus="ACTIVE"
    )
    """)
    print()

    print("=" * 80)
    print("Готово!")
    print("=" * 80)


if __name__ == "__main__":
    main()
