# Roadmap впровадження VoP для СЕП НБУ

**Версія:** 1.0
**Дата створення:** 2026-02-06
**Статус:** Draft

---

## Огляд

Цей документ описує детальний план впровадження системи Verification of Payee (VoP) для Системи Електронних Платежів НБУ на період 2026-2028 років.

**Загальний timeline:** Q2 2026 - 2028 (приблизно 24 місяці)

---

## Фази впровадження

```
2026                          2027                          2028
Q2    Q3    Q4    Q1    Q2    Q3    Q4    Q1    Q2    Q3    Q4
├─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┤
│ Фаза 1: Пілот     │ Фаза 2: МП СЕП    │ Фаза 3: Розширення│
│ (Q2-Q4 2026)      │ (Q4 2026-Q2 2027) │ (2027-2028)       │
└───────────────────┴───────────────────┴───────────────────┘
```

---

## Фаза 1: Пілотне впровадження

**Термін:** Q2 2026 - Q4 2026 (6 місяців)
**Мета:** Розробка, тестування та валідація рішення

### Q2 2026: Старт проекту та проектування

**Дата старту:** Квітень 2026

#### Milestones:

**M1.1: Ініціація проекту (Квітень 2026)**
- ✅ Затвердження проекту керівництвом НБУ
- ✅ Призначення власника продукту (Product Owner)
- ✅ Формування команди проекту
- ✅ Kickoff meeting зі stakeholders

**M1.2: Архітектура та дизайн (Квітень-Травень 2026)**
- ✅ Фіналізація технічної архітектури
- ✅ Вибір технологічного стеку
- ✅ Дизайн API (OpenAPI специфікації)
- ✅ Security design (mTLS, OAuth 2.0 FAPI)
- ✅ Інфраструктурний дизайн (Kubernetes, monitoring)

#### Deliverables:
- Technical Design Document (TDD)
- Security Architecture Document
- Infrastructure Architecture Document
- Project Charter
- Risk Register

#### Success Criteria:
- ✅ Архітектура схвалена Architecture Review Board
- ✅ Security дизайн пройшов Security Review
- ✅ Команда сформована та онбордилася

---

### Q3 2026: Розробка та підготовка

**Дата:** Липень - Вересень 2026

#### Milestones:

**M1.3: Розробка VoP Router (Липень-Серпень 2026)**
- VoP Router API (маршрутизація, load balancing)
- VoP Directory Service (реєстр учасників)
- Authentication/Authorization (OAuth 2.0 + mTLS)
- Monitoring та logging (Prometheus, Grafana, ELK)

**M1.4: Референсна реалізація для банків (Серпень 2026)**
- Reference implementation VoP Requester API (Node.js + Python)
- Reference implementation VoP Responder API (Node.js + Python)
- Name Matching алгоритми (Levenshtein, Jaro-Winkler)
- Документація для банків (Integration Guide)

**M1.5: Підготовка тестового середовища (Серпень-Вересень 2026)**
- Kubernetes cluster (staging environment)
- CI/CD pipelines
- Test automation framework
- Sandbox environment для банків

**M1.6: Залучення пілотних банків (Вересень 2026)**
- Відбір 5-10 банків для пілоту
- Підписання participation agreements
- Технічні воркшопи для банків
- Початок інтеграції банків з тестовим середовищем

#### Deliverables:
- VoP Router v0.9 (beta)
- VoP Directory Service v0.9
- Reference implementations (Requester + Responder)
- Integration Guide для банків
- Test environment
- Participation agreements (5-10 банків)

#### Success Criteria:
- ✅ VoP Router пройшов unit та integration тести
- ✅ Reference implementations доступні для банків
- ✅ 5-10 банків підписали участь у пілоті
- ✅ Sandbox environment запущене

---

### Q4 2026: Пілотне тестування

**Дата:** Жовтень - Грудень 2026

#### Milestones:

**M1.7: Інтеграція пілотних банків (Жовтень-Листопад 2026)**
- Банки розгортають VoP Responder/Requester APIs
- Підключення до VoP Router (sandbox)
- Certificate management (QWAC/АЦСК)
- Testing та debugging

**M1.8: Пілотне тестування (Листопад-Грудень 2026)**
- Functional testing (end-to-end scenarios)
- Performance testing (latency, throughput)
- Security testing (penetration tests, vulnerability scans)
- User Acceptance Testing (UAT) з банками

**M1.9: Збір метрик та feedback (Листопад-Грудень 2026)**
- Match rate (MATCH/CLOSE_MATCH/NO_MATCH distribution)
- Latency metrics (p50, p95, p99)
- Error rates
- User feedback від банків

**M1.10: Оптимізація та fixes (Грудень 2026)**
- Bug fixes based on pilot feedback
- Performance optimization
- UX improvements
- Documentation updates

#### Deliverables:
- 5-10 банків інтегровані з VoP Router
- Pilot testing report
- Performance benchmark report
- Security audit report
- Lessons learned document

#### Success Criteria:
- ✅ Латентність < 1 сек (p95)
- ✅ Uptime > 99.5% протягом пілоту
- ✅ Match rate > 80% (MATCH або CLOSE_MATCH)
- ✅ 0 критичних security vulnerabilities
- ✅ Позитивний feedback від банків

---

## Фаза 2: Миттєві перекази (МП СЕП)

**Термін:** Q4 2026 - Q2 2027 (9 місяців)
**Мета:** Production launch для миттєвих переказів СЕП

### Q4 2026: Підготовка до production

**Дата:** Жовтень - Грудень 2026 (паралельно з пілотом)

#### Milestones:

**M2.1: Production-ready інфраструктура (Жовтень-Листопад 2026)**
- Production Kubernetes cluster (High Availability)
- Disaster Recovery setup (cross-region backup)
- Production monitoring (24/7)
- Production certificates (QWAC/АЦСК)

**M2.2: Нормативно-правова база (Листопад-Грудень 2026)**
- Зміни в Правила СЕП НБУ
- Оновлення НПА НБУ (постанови, положення)
- Participation Agreement template (production)
- SLA визначення

#### Deliverables:
- Production environment (fully redundant)
- Оновлені Правила СЕП НБУ
- НПА НБУ (чернетка для затвердження)
- Production SLA

#### Success Criteria:
- ✅ Production infrastructure пройшла DR testing
- ✅ НПА готові до затвердження Правлінням НБУ

---

### Q1 2027: Розширення учасників

**Дата:** Січень - Березень 2027

#### Milestones:

**M2.3: Залучення всіх банків-учасників МП СЕП (Січень-Березень 2027)**
- Onboarding всіх банків, що підтримують миттєві перекази
- Onboarding ННПП (Небанківські надавачі платіжних послуг)
- Технічна підтримка інтеграції
- Certification process (кожен банк)

**M2.4: Production launch (soft launch) (Березень 2027)**
- VoP Router v1.0 в production
- Поступовий rollout (по банках)
- Моніторинг та hotfix support

#### Deliverables:
- Всі банки МП СЕП підключені до VoP
- ННПП підключені (опціонально в Q1, обов'язково в Q2)
- VoP Router v1.0 (production)
- 24/7 support процедури

#### Success Criteria:
- ✅ 100% банків МП СЕП підключені
- ✅ VoP доступна 24/7 (uptime > 99.9%)
- ✅ Латентність < 500 мс (p95)

---

### Q2 2027: Обов'язкове впровадження для МП СЕП

**Дата:** Квітень - Червень 2027

#### Milestones:

**M2.5: Обов'язкова VoP для миттєвих переказів (Квітень 2027)**
- Вступають в силу зміни в Правила СЕП НБУ
- VoP стає обов'язковою для всіх МП СЕП
- Моніторинг adoption rate

**M2.6: Оптимізація та stabilization (Квітень-Червень 2027)**
- Capacity planning (scaling based on actual load)
- Performance tuning
- Algorithm optimization (name matching)
- Incident management та support

**M2.7: Звітність та аналітика (Червень 2027)**
- VoP usage dashboards для НБУ
- Quarterly report (Q2 2027)
- KPI tracking (match rate, latency, errors)

#### Deliverables:
- VoP обов'язкова для 100% МП СЕП
- Operational dashboards (Grafana)
- Q2 2027 Performance Report

#### Success Criteria:
- ✅ 100% миттєвих переказів проходять через VoP
- ✅ Латентність < 500 мс (p95)
- ✅ Match rate > 85%
- ✅ Uptime > 99.9%
- ✅ Зменшення помилкових платежів на 40%+

---

## Фаза 3: Повне розгортання

**Термін:** Q3 2027 - 2028 (15+ місяців)
**Мета:** Розширення на всі типи платежів та додаткові функції

### Q3-Q4 2027: Розширення на звичайні перекази

**Дата:** Липень - Грудень 2027

#### Milestones:

**M3.1: VoP для звичайних переказів (Липень-Вересень 2027)**
- Розширення VoP на звичайні (не-миттєві) перекази СЕП
- Опціональна VoP для звичайних переказів (не обов'язкова)
- Integration з існуючими банківськими процесами

**M3.2: Додаткові перевірки (Жовтень-Грудень 2027)**
- Перевірка ЄДРПОУ (для бізнес-рахунків)
- Перевірка ІПН (для фізосіб)
- Інтеграція з державними реєстрами (опційно)

#### Deliverables:
- VoP для всіх типів переказів СЕП
- Додаткові перевірки (ЄДРПОУ, ІПН)
- API інтеграція з реєстрами (якщо доступно)

#### Success Criteria:
- ✅ VoP доступна для всіх типів переказів
- ✅ Adoption rate для звичайних переказів > 50%

---

### 2028: Advanced features та міжнародна інтеграція

**Дата:** 2028 (весь рік)

#### Milestones:

**M3.3: Machine Learning для name matching (Q1-Q2 2028)**
- ML-based name matching алгоритм
- Training на історичних даних
- A/B testing (ML vs rule-based)

**M3.4: API для фінтех та третіх сторін (Q2 2028)**
- Public API для фінтех компаній
- Open Banking integration
- Developer portal

**M3.5: Міжнародна інтеграція (Q3-Q4 2028)**
- Дослідження інтеграції з EU VoP
- Cross-border VoP (pilot)
- SEPA integration (якщо застосовно)

**M3.6: AI-powered fraud detection (Q4 2028)**
- AI для виявлення шахрайських патернів
- Real-time anomaly detection
- Integration з AML/CFT системами

#### Deliverables:
- ML-based matching в production
- Public API для third-party providers
- Cross-border VoP (pilot)
- AI fraud detection (beta)

#### Success Criteria:
- ✅ ML matching accuracy > 95%
- ✅ Public API adopted by 10+ фінтех компаній
- ✅ Cross-border VoP pilot completed

---

## Key Performance Indicators (KPIs)

### Технічні KPIs

| KPI | Target (Фаза 1) | Target (Фаза 2) | Target (Фаза 3) |
|-----|-----------------|-----------------|-----------------|
| Латентність (p95) | < 1 сек | < 500 мс | < 300 мс |
| Uptime | > 99.5% | > 99.9% | > 99.95% |
| Throughput | 100+ req/s | 500+ req/s | 1000+ req/s |
| Match Rate (MATCH+CLOSE_MATCH) | > 80% | > 85% | > 90% |
| Error Rate | < 5% | < 2% | < 1% |

### Бізнес KPIs

| KPI | Baseline | Target (після Фази 2) | Target (після Фази 3) |
|-----|----------|----------------------|---------------------|
| Платежі з помилками | 15-20% | 8-10% | 3-5% |
| Збитки від помилок | ₴2.5 млрд/рік | ₴1.5 млрд/рік | ₴1.25 млрд/рік |
| Час повернення коштів | 72 год | 36 год | < 24 год |
| Fraud detection | Baseline | +30% | +50% |
| Customer satisfaction | Baseline | +15% | +20% |
| Adoption rate (МП СЕП) | 0% | 100% | 100% |
| Adoption rate (звичайні) | 0% | 30% | 70% |

---

## Ризики та mitigation

### Критичні ризики

| Ризик | Ймовірність | Вплив | Mitigation |
|-------|-------------|-------|------------|
| Низька adoption rate банків | Середня | Високий | Обов'язкова VoP для МП СЕП, референсна реалізація, технічна підтримка |
| Performance issues (high latency) | Середня | Високий | Performance testing в пілоті, horizontal scaling, caching |
| Security vulnerabilities | Низька | Критичний | Security audit, penetration testing, mTLS + OAuth 2.0 FAPI |
| Затримка в НПА змінах | Середня | Високий | Early engagement з юридичним департаментом, parallel tracks |
| Інтеграційні проблеми з core banking | Висока | Середній | Референсна реалізація, technical workshops, dedicated support |

---

## Бюджет (орієнтовний)

### Витрати НБУ

| Категорія | Фаза 1 (пілот) | Фаза 2 (МП СЕП) | Фаза 3 (розширення) | Всього |
|-----------|----------------|-----------------|---------------------|--------|
| Команда (6-12 міс.) | Included | Included | Included | - |
| Інфраструктура (servers, cloud) | - | - | - | - |
| Security (certificates, audit) | - | - | - | - |
| Консалтинг (якщо потрібно) | - | - | - | - |

**Примітка:** Конкретні цифри бюджету визначаються окремо залежно від рішення НБУ (власна команда vs outsourcing, on-premise vs cloud, тощо).

### Витрати банків (на банк)

| Розмір банку | Responder API | Requester API | Всього (на банк) |
|--------------|---------------|---------------|------------------|
| Великий банк (топ-10) | ₴800к - 1млн | ₴300к - 500к | ₴1.1-1.5 млн |
| Середній банк | ₴400к - 600к | ₴200к - 300к | ₴600-900 тис |
| Малий банк | ₴200к - 300к | ₴100к - 200к | ₴300-500 тис |

**ROI для банківської системи:** Економія ₴1.25+ млрд/рік vs витрати на впровадження = **окупність за 6-12 місяців**

---

## Dependencies та Prerequisites

### Залежності від НБУ

- ✅ Затвердження проекту Правлінням НБУ (Q2 2026)
- ✅ Бюджет виділений (Q2 2026)
- ✅ Команда сформована (Q2 2026)
- ⏳ Зміни в Правила СЕП НБУ (Q4 2026 - Q1 2027)
- ⏳ Оновлення НПА НБУ (Q4 2026 - Q1 2027)

### Залежності від банків

- ⏳ Participation agreements підписані (Q3-Q4 2026)
- ⏳ Інтеграція з core banking systems (Q4 2026 - Q1 2027)
- ⏳ QWAC/АЦСК certificates отримані (Q4 2026)

### Технічні prerequisites

- ✅ Kubernetes cluster (staging) (Q3 2026)
- ✅ Monitoring infrastructure (Q3 2026)
- ⏳ Kubernetes cluster (production) (Q4 2026)
- ⏳ DR infrastructure (Q4 2026)

---

## Governance

### Steering Committee

**Склад:**
- Голова НБУ / Перший заступник (sponsor)
- Директор Департаменту ІТ НБУ
- Директор Департаменту платіжних систем НБУ
- Представники від банків (ротація)

**Зустрічі:** Щомісяця або за потребою

### Project Team

**Склад:**
- Product Owner (НБУ)
- Project Manager (НБУ)
- Solution Architect (НБУ)
- Backend Developers (3-4)
- DevOps Engineer
- QA Engineers (1-2)
- Security Specialist
- Business Analyst

### Communication Plan

- **Weekly:** Team standup
- **Bi-weekly:** Sprint review та planning
- **Monthly:** Steering Committee update
- **Quarterly:** Stakeholder report (всі банки)

---

## Висновки

VoP для СЕП НБУ — це амбітний проект, що вимагає координації між НБУ, банками та ННПП. Roadmap розрахований на 24 місяці (2026-2028) і включає три основні фази:

1. **Фаза 1 (Q2-Q4 2026):** Пілот з 5-10 банками
2. **Фаза 2 (Q4 2026-Q2 2027):** Production для миттєвих переказів
3. **Фаза 3 (2027-2028):** Розширення на всі платежі + advanced features

**Ключові success factors:**
- Сильна підтримка з боку керівництва НБУ
- Early engagement з банками
- Референсна реалізація та технічна підтримка для банків
- Чіткі SLA та operational procedures
- Continuous monitoring та optimization

**Очікувані результати:**
- Економія ₴1.25+ млрд/рік для банківської системи
- Зменшення помилкових платежів на 50%+
- Зниження шахрайства на 30-40%
- ROI за 6-12 місяців

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-06
**Наступний review:** Q3 2026 (після завершення пілоту)
