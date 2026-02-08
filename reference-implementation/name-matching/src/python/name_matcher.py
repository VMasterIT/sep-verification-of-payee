"""
VoP Name Matching - Референсна реалізація (Python)

Алгоритми співставлення імен для VoP системи СЕП НБУ.
"""

import re
from typing import Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class MatchStatus(Enum):
    """Статус співставлення"""
    MATCH = "MATCH"
    CLOSE_MATCH = "CLOSE_MATCH"
    NO_MATCH = "NO_MATCH"


@dataclass
class MatchResult:
    """Результат співставлення імен"""
    status: MatchStatus
    score: float
    algorithm: str
    levenshtein_score: float
    jaro_winkler_score: float


class NameMatcher:
    """
    Клас для співставлення імен отримувачів платежів.

    Використовує комбінацію алгоритмів:
    - Levenshtein Distance
    - Jaro-Winkler Distance
    """

    def __init__(
        self,
        match_threshold: float = 95.0,
        close_match_threshold: float = 75.0
    ):
        """
        Ініціалізація NameMatcher.

        Args:
            match_threshold: Поріг для MATCH (≥95%)
            close_match_threshold: Поріг для CLOSE_MATCH (≥75%)
        """
        self.match_threshold = match_threshold
        self.close_match_threshold = close_match_threshold

    def match(self, name1: str, name2: str) -> MatchResult:
        """
        Співставлення двох імен.

        Args:
            name1: Перше ім'я (з запиту)
            name2: Друге ім'я (з бази даних)

        Returns:
            MatchResult з статусом та score
        """
        # Нормалізація
        norm1 = self._normalize(name1)
        norm2 = self._normalize(name2)

        # Перевірка на ініціали
        if self._has_initials(norm1) or self._has_initials(norm2):
            initials_score = self._match_with_initials(norm1, norm2)
            if initials_score is not None:
                return self._build_result(
                    initials_score,
                    initials_score,
                    initials_score,
                    "initials"
                )

        # Levenshtein Distance
        lev_score = self._levenshtein_similarity(norm1, norm2)

        # Jaro-Winkler Distance
        jw_score = self._jaro_winkler_similarity(norm1, norm2)

        # Комбінований score (max з двох алгоритмів)
        final_score = max(lev_score, jw_score)
        algorithm = "levenshtein" if lev_score >= jw_score else "jaro_winkler"

        return self._build_result(final_score, lev_score, jw_score, algorithm)

    def _build_result(
        self,
        final_score: float,
        lev_score: float,
        jw_score: float,
        algorithm: str
    ) -> MatchResult:
        """Побудова результату співставлення"""
        if final_score >= self.match_threshold:
            status = MatchStatus.MATCH
        elif final_score >= self.close_match_threshold:
            status = MatchStatus.CLOSE_MATCH
        else:
            status = MatchStatus.NO_MATCH

        return MatchResult(
            status=status,
            score=round(final_score, 2),
            algorithm=algorithm,
            levenshtein_score=round(lev_score, 2),
            jaro_winkler_score=round(jw_score, 2)
        )

    def _normalize(self, text: str) -> str:
        """
        Нормалізація тексту.

        - Lowercase
        - Trim whitespace
        - Remove punctuation
        - Normalize spaces
        """
        if not text:
            return ""

        # Lowercase
        text = text.lower()

        # Remove punctuation (except spaces and dots for initials)
        text = re.sub(r"[^\w\s\.]", " ", text)

        # Normalize spaces
        text = re.sub(r"\s+", " ", text).strip()

        return text

    def _has_initials(self, name: str) -> bool:
        """Перевірка чи містить ім'я ініціали (напр. 'Т.Г.')"""
        # Шукаємо патерн: одна літера + крапка
        return bool(re.search(r'\b\w\.', name))

    def _match_with_initials(
        self,
        name1: str,
        name2: str
    ) -> Optional[float]:
        """
        Співставлення імен з ініціалами.

        Приклад:
        - "шевченко тарас григорович" vs "шевченко т.г." → MATCH (100%)
        - "шевченко тарас" vs "шевченко т." → MATCH (100%)
        """
        parts1 = name1.split()
        parts2 = name2.split()

        if len(parts1) == 0 or len(parts2) == 0:
            return None

        # Визначаємо яке ім'я має ініціали
        if self._has_initials(name1):
            full_name = parts2
            initials_name = parts1
        elif self._has_initials(name2):
            full_name = parts1
            initials_name = parts2
        else:
            return None

        # Перша частина має співпадати (прізвище)
        if full_name[0] != initials_name[0]:
            # Нечітке співставлення прізвища
            surname_score = self._levenshtein_similarity(
                full_name[0],
                initials_name[0]
            )
            if surname_score < 90:
                return None

        # Перевірка ініціалів
        full_parts = full_name[1:]  # Ім'я та по-батькові
        initial_parts = initials_name[1:]  # Ініціали

        if len(initial_parts) == 0:
            return 100.0  # Тільки прізвище співпало

        matches = 0
        for i, initial_part in enumerate(initial_parts):
            if i >= len(full_parts):
                break

            # Видалити крапки з ініціалу
            initial = initial_part.replace(".", "").strip()

            if len(initial) == 1 and len(full_parts[i]) > 0:
                # Перевірка чи ініціал співпадає з першою літерою
                if initial == full_parts[i][0]:
                    matches += 1
            elif initial == full_parts[i][:len(initial)]:
                # Часткове співпадіння (напр. "тар" vs "тарас")
                matches += 1

        # Якщо всі ініціали співпали → MATCH
        if matches == len(initial_parts):
            return 100.0

        # Часткове співпадіння
        return (matches / len(initial_parts)) * 100

    def _levenshtein_similarity(self, s1: str, s2: str) -> float:
        """
        Levenshtein similarity (0-100%).

        Формула: (1 - distance / max_length) * 100
        """
        distance = self._levenshtein_distance(s1, s2)
        max_len = max(len(s1), len(s2))

        if max_len == 0:
            return 100.0

        similarity = (1 - distance / max_len) * 100
        return max(0, min(100, similarity))

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """
        Обчислення Levenshtein Distance.

        Мінімальна кількість операцій (вставка, видалення, заміна)
        для перетворення s1 в s2.
        """
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        # Ініціалізація матриці
        previous_row = range(len(s2) + 1)

        for i, c1 in enumerate(s1):
            current_row = [i + 1]

            for j, c2 in enumerate(s2):
                # Вартість операцій
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)

                current_row.append(min(insertions, deletions, substitutions))

            previous_row = current_row

        return previous_row[-1]

    def _jaro_winkler_similarity(self, s1: str, s2: str) -> float:
        """
        Jaro-Winkler similarity (0-100%).

        Враховує:
        - Спільні символи
        - Транспозиції
        - Спільний префікс (winkler boost)
        """
        jaro_sim = self._jaro_similarity(s1, s2)

        # Winkler boost для спільного префіксу
        prefix_len = 0
        for c1, c2 in zip(s1, s2):
            if c1 == c2:
                prefix_len += 1
            else:
                break

        # Max prefix length = 4
        prefix_len = min(prefix_len, 4)

        # Winkler boost
        p = 0.1  # Scaling factor
        jw_sim = jaro_sim + (prefix_len * p * (1 - jaro_sim))

        return jw_sim * 100

    def _jaro_similarity(self, s1: str, s2: str) -> float:
        """
        Jaro similarity (0-1).

        Формула:
        jaro = (m/|s1| + m/|s2| + (m-t)/m) / 3

        де:
        - m = кількість співпадаючих символів
        - t = кількість транспозицій
        """
        if len(s1) == 0 and len(s2) == 0:
            return 1.0

        if len(s1) == 0 or len(s2) == 0:
            return 0.0

        # Match window
        match_distance = max(len(s1), len(s2)) // 2 - 1
        match_distance = max(1, match_distance)

        s1_matches = [False] * len(s1)
        s2_matches = [False] * len(s2)

        matches = 0
        transpositions = 0

        # Знаходження співпадаючих символів
        for i, c1 in enumerate(s1):
            start = max(0, i - match_distance)
            end = min(i + match_distance + 1, len(s2))

            for j in range(start, end):
                if s2_matches[j] or c1 != s2[j]:
                    continue

                s1_matches[i] = True
                s2_matches[j] = True
                matches += 1
                break

        if matches == 0:
            return 0.0

        # Знаходження транспозицій
        k = 0
        for i, c1 in enumerate(s1):
            if not s1_matches[i]:
                continue

            while not s2_matches[k]:
                k += 1

            if c1 != s2[k]:
                transpositions += 1

            k += 1

        transpositions //= 2

        # Jaro similarity
        jaro = (
            matches / len(s1) +
            matches / len(s2) +
            (matches - transpositions) / matches
        ) / 3

        return jaro


# Helper functions
def match_names(name1: str, name2: str) -> MatchResult:
    """
    Швидка функція для співставлення імен.

    Args:
        name1: Перше ім'я
        name2: Друге ім'я

    Returns:
        MatchResult
    """
    matcher = NameMatcher()
    return matcher.match(name1, name2)


if __name__ == "__main__":
    # Приклад використання
    matcher = NameMatcher()

    test_cases = [
        ("ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ", "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"),
        ("ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ", "ШЕВЧЕНКО Т.Г."),
        ("ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ", "SHEVCHENKO TARAS"),
        ("ПЕТРЕНКО ОЛЕНА ІВАНІВНА", "PETRANKO OLENA IVANIVNA"),
        ("ІВАНОВ ІВАН ІВАНОВИЧ", "ІВАНОВ І.І."),
        ("КОВАЛЕНКО МАРІЯ", "КОВАЛЕНКО МАРІЯ ПЕТРІВНА"),
        ("СИДОРЕНКО ПЕТРО", "ФЕДОРЕНКО ПЕТРО"),
    ]

    print("=" * 80)
    print("VoP Name Matching - Test Results")
    print("=" * 80)

    for name1, name2 in test_cases:
        result = matcher.match(name1, name2)
        print(f"\nName 1: {name1}")
        print(f"Name 2: {name2}")
        print(f"Status: {result.status.value}")
        print(f"Score: {result.score}%")
        print(f"Algorithm: {result.algorithm}")
        print(f"  - Levenshtein: {result.levenshtein_score}%")
        print(f"  - Jaro-Winkler: {result.jaro_winkler_score}%")
        print("-" * 80)
