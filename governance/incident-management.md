# Управління інцидентами VoP СЕП НБУ

**Версія:** 1.0
**Дата:** 2026-02-07
**Статус:** Draft

---

## Зміст

1. [Огляд](#огляд)
2. [Визначення інциденту](#визначення-інциденту)
3. [Класифікація інцидентів](#класифікація-інцидентів)
4. [Процес управління інцидентами](#процес-управління-інцидентами)
5. [Ролі та відповідальність](#ролі-та-відповідальність)
6. [Communication Plan](#communication-plan)
7. [Post-Incident Review](#post-incident-review)
8. [Контакти для екстрених ситуацій](#контакти-для-екстрених-ситуацій)

---

## Огляд

Цей документ визначає процедури управління інцидентами в системі Verification of Payee (VoP) СЕП НБУ.

**Мета:**
- Швидке виявлення та реагування на інциденти
- Мінімізація впливу інцидентів на учасників VoP
- Прозора комунікація під час інцидентів
- Навчання на помилках (post-incident review)

**Scope:**
- VoP Router (НБУ)
- VoP Responder (Учасники)
- Інфраструктура та мережа
- Безпека (security incidents)

---

## Визначення інциденту

**Інцидент** — будь-яка подія, що призводить до:
- Зниження доступності VoP системи
- Деградації продуктивності (latency, throughput)
- Помилок в обробці VoP запитів
- Порушення безпеки або конфіденційності даних
- Порушення SLA

**Приклади інцидентів:**
- ✅ VoP Router недоступний (downtime)
- ✅ Висока латентність (> 3 сек p99)
- ✅ High error rate (> 5%)
- ✅ Витік даних або несанкціонований доступ
- ✅ DDoS атака на VoP Router
- ✅ Certificate expiration
- ✅ Database corruption у Responder

**Не є інцидентами:**
- ❌ Планові технічні роботи (announced maintenance)
- ❌ Проблеми на стороні клієнта (неправильна інтеграція)
- ❌ Feature requests або minor bugs

---

## Класифікація інцидентів

### Severity Levels

#### P0 - Critical (Критичний)

**Визначення:**
- VoP Router повністю недоступний для всіх учасників
- Витік персональних даних клієнтів
- Security breach (несанкціонований доступ до системи)

**Вплив:**
- Блокується робота VoP для всіх учасників
- Платежі не можуть бути перевірені
- Критичний ризик для фінансової системи

**Reaction Time:**
- **Виявлення:** Негайно (< 5 хвилин)
- **Response:** Негайно (< 15 хвилин)
- **Resolution Target:** 2 години

**Communication:**
- Негайне оповіщення всіх учасників
- Щогодинні updates
- Status page: "Major Outage"

**Escalation:**
- Автоматичний page для on-call engineer
- Негайна ескалація до management
- War room activation

---

#### P1 - High (Високий)

**Визначення:**
- VoP Router частково недоступний (50%+ учасників постраждали)
- Значна деградація продуктивності (latency > 5 сек)
- High error rate (> 10%)
- Критична помилка у Responder великого банку

**Вплив:**
- Значне сповільнення VoP перевірок
- Багато учасників не можуть використовувати VoP
- Можливі збитки для клієнтів

**Reaction Time:**
- **Виявлення:** < 15 хвилин
- **Response:** < 30 хвилин
- **Resolution Target:** 4 години

**Communication:**
- Оповіщення постраждалих учасників
- Updates кожні 2 години
- Status page: "Partial Outage"

**Escalation:**
- Page для on-call engineer
- Ескалація до team lead через 1 годину

---

#### P2 - Medium (Середній)

**Визначення:**
- Локальні проблеми з продуктивністю
- Error rate підвищений (2-10%)
- Проблеми у 1-2 учасників
- Minor degradation

**Вплив:**
- Частина VoP запитів повільні або failюються
- Окремі учасники постраждали
- Клієнти відчувають затримки

**Reaction Time:**
- **Виявлення:** < 30 хвилин
- **Response:** < 2 години
- **Resolution Target:** 8 робочих годин

**Communication:**
- Email постраждалим учасникам
- Updates кожні 4 години
- Status page: "Performance Issues"

**Escalation:**
- Ticket для on-call engineer
- Ескалація через 4 години

---

#### P3 - Low (Низький)

**Визначення:**
- Minor issues без значного впливу
- Низький error rate (< 2%)
- Проблеми тільки у non-critical функціях
- Cosmetic bugs

**Вплив:**
- Мінімальний вплив на користувачів
- Система працює, але не оптимально

**Reaction Time:**
- **Виявлення:** < 2 години
- **Response:** < 1 робочий день
- **Resolution Target:** 5 робочих днів

**Communication:**
- No immediate communication required
- Include in weekly report

**Escalation:**
- Standard ticket process
- No immediate escalation

---

## Процес управління інцидентами

### 1. Detection (Виявлення)

**Автоматичне виявлення:**
- Monitoring alerts (Prometheus, Datadog)
- Health check failures
- Error rate spikes
- Latency threshold breaches

**Ручне виявлення:**
- User reports (учасники повідомляють про проблеми)
- Customer complaints
- Internal testing

**Канали виявлення:**
- PagerDuty alerts → On-call engineer
- Email → vop-support@bank.gov.ua
- Slack → #vop-incidents
- Phone → Hotline +380-44-XXX-XXXX

---

### 2. Triage (Сортування)

**On-call engineer виконує:**

1. **Verify incident** (підтвердити, що це справді інцидент)
2. **Assess severity** (визначити P0/P1/P2/P3)
3. **Create incident ticket** (Jira/ServiceNow)
4. **Notify stakeholders** (згідно з severity level)

**Incident ticket має містити:**
```
Title: [P1] VoP Router high latency
Description:
  - What happened: Router latency spiked to 5 sec (p95)
  - When: 2026-02-07 14:30 UTC
  - Impact: 80% учасників постраждали
  - Affected systems: VoP Router, Database
  - Current status: Investigating

Labels: incident, p1, vop-router
Assignee: on-call-engineer
```

---

### 3. Investigation (Розслідування)

**Збір інформації:**
- Check monitoring dashboards (Grafana)
- Review logs (ELK Stack)
- Check recent deployments (git log)
- Review infrastructure status (Kubernetes, AWS)
- Query database performance
- Network connectivity tests

**Common tools:**
```bash
# Check VoP Router status
kubectl get pods -n vop-production

# Check logs
kubectl logs vop-router-xxx -n vop-production --tail=1000

# Check metrics
curl https://monitoring.nbu.gov.ua/vop-router/metrics

# Database queries
psql -h db.nbu.gov.ua -U vop -d vop_prod -c "SELECT pg_stat_activity FROM ..."
```

**Root cause hypothesis:**
- Database slowdown?
- Network issues?
- Code bug?
- Infrastructure problem (CPU/memory)?
- DDoS attack?

---

### 4. Response (Реагування)

**Immediate actions (залежно від root cause):**

**If Database issue:**
- Kill long-running queries
- Restart database (якщо необхідно)
- Scale up database resources
- Enable read replicas

**If Infrastructure issue:**
- Scale up pods (Kubernetes)
- Add more nodes to cluster
- Restart failed pods
- Switch to backup datacenter (DR scenario)

**If Code bug:**
- Rollback to previous version
- Deploy hotfix (if critical)
- Disable broken feature (feature flag)

**If Security issue:**
- Isolate compromised systems
- Revoke suspicious certificates
- Block malicious IPs
- Engage security team

**If DDoS attack:**
- Enable DDoS protection (Cloudflare/AWS Shield)
- Rate limiting
- Block attack sources

---

### 5. Communication (Комунікація)

**Initial notification (within 15 min of P0/P1):**

```
Subject: [INCIDENT] VoP Router High Latency

Priority: P1
Status: Investigating
Impact: 80% учасників постраждали
Started: 2026-02-07 14:30 UTC

Description:
VoP Router experiencing high latency (5 sec p95).
Investigating database performance issues.

Next update: 16:30 UTC (every 2 hours)

Status page: https://status.vop.nbu.gov.ua
```

**Updates (every 1-4 hours залежно від severity):**

```
Subject: [UPDATE] VoP Router High Latency

Status: Mitigating
Progress: Database scaled up, latency improving (now 2 sec p95)

Actions taken:
- Identified slow queries in database
- Optimized indexes
- Scaled database from 4 to 8 CPUs
- Monitoring improvement

Next update: 18:30 UTC
```

**Resolution notification:**

```
Subject: [RESOLVED] VoP Router High Latency

Status: Resolved
Duration: 4 hours (14:30 - 18:30 UTC)
Impact: 80% учасників, degraded performance

Root cause: Database slow queries due to missing index

Resolution:
- Added missing index on vop_requests table
- Scaled database resources
- Latency returned to normal (< 500ms p95)

Post-incident review: Will be published within 3 business days

We apologize for the inconvenience.
```

---

### 6. Resolution (Вирішення)

**Criteria для закриття інциденту:**
- ✅ Root cause identified and fixed
- ✅ Metrics returned to normal
- ✅ No ongoing impact on users
- ✅ Monitoring confirms stability

**Verification:**
- Check metrics for 30 minutes (P0/P1) або 2 години (P2/P3)
- Confirm з постраждалими учасниками
- Update status page: "Operational"

---

### 7. Post-Incident Review (Після інциденту)

**Timeline:** Within 3 business days after resolution

**Participants:**
- Incident Commander
- On-call engineer(s)
- Team Lead
- DevOps Engineer
- Опціонально: постраждалі учасники

**Agenda:**

1. **Timeline reconstruction**
   - Коли почався інцидент?
   - Коли був виявлений?
   - Коли почали reaction?
   - Коли був вирішений?

2. **Root Cause Analysis (RCA)**
   - Що пішло не так?
   - Чому це сталося?
   - 5 Whys analysis

3. **Impact Assessment**
   - Скільки учасників постраждало?
   - Який був downtime?
   - Фінансові збитки (якщо є)

4. **What went well**
   - Що спрацювало добре?
   - Які процеси допомогли?

5. **What could be improved**
   - Що можна було зробити краще?
   - Де були затримки?

6. **Action items**
   - Технічні fixes (code, infrastructure)
   - Process improvements
   - Documentation updates
   - Training needs

**Post-Incident Review Report template:**

```markdown
# Post-Incident Review: VoP Router High Latency

## Metadata
- Incident ID: INC-2026-0207-001
- Severity: P1
- Duration: 4 hours
- Date: 2026-02-07

## Executive Summary
VoP Router experienced high latency (5 sec p95) due to missing
database index, impacting 80% of participants.

## Timeline
| Time (UTC) | Event |
|------------|-------|
| 14:30 | Incident started (latency spike detected) |
| 14:35 | Alert triggered, on-call paged |
| 14:45 | Incident declared P1, stakeholders notified |
| 15:00 | Root cause identified (database slow queries) |
| 15:30 | Mitigation started (index creation) |
| 16:30 | Latency improving |
| 18:30 | Incident resolved |

## Root Cause
Missing index on `vop_requests.timestamp` column caused full
table scans, slowing down queries as table grew > 10M rows.

## Impact
- 80% of participants affected
- Latency: 5 sec (p95) vs normal < 500ms
- Error rate: 0% (no errors, just slow)
- Duration: 4 hours

## What Went Well
✅ Quick detection (5 min from start to alert)
✅ Clear communication to participants
✅ Successful mitigation without data loss

## What Could Be Improved
❌ Missing database index should have been caught in review
❌ No synthetic monitoring for query performance
❌ Slow initial triage (10 min delay)

## Action Items
1. [P0] Add missing indexes to production - DONE
2. [P1] Implement query performance monitoring - Due: 2026-02-14
3. [P2] Add database review to deployment checklist - Due: 2026-02-21
4. [P3] Improve runbook for database incidents - Due: 2026-02-28

## Lessons Learned
- Always review database indexes before production
- Synthetic monitoring catches issues before users
- Clear runbooks speed up incident response

---
Report by: John Doe (Incident Commander)
Date: 2026-02-10
```

---

## Ролі та відповідальність

### Incident Commander (IC)

**Призначення:** Автоматично (on-call engineer) або manually (для P0/P1)

**Відповідальність:**
- Координація всіх дій під час інциденту
- Decision-making (rollback? scale up? DR failover?)
- Communication з stakeholders
- Ведення incident timeline
- Організація post-incident review

**Authority:**
- Може залучати будь-яких інженерів
- Може приймати критичні рішення (rollback, DR)
- Може ескалювати до management

---

### On-Call Engineer

**Schedule:** 24/7 rotation (1 тиждень on-call)

**Відповідальність:**
- Першим реагує на alerts
- Initial triage та investigation
- Стає Incident Commander для P2/P3
- Підтримка IC для P0/P1

**Tools:**
- PagerDuty (для alerts)
- Slack (для communication)
- VPN access (для remote work)
- Runbooks (для standard procedures)

---

### Engineering Team

**Відповідальність:**
- Допомога on-call engineer при розслідуванні
- Імплементація fixes
- Code review hotfixes
- Testing перед deployment

---

### Communications Lead

**Призначення:** Для P0/P1 incidents

**Відповідальність:**
- Написання та розсилка incident updates
- Управління status page
- Спілкування з постраждалими учасниками
- Social media (якщо потрібно)

---

### Management

**Відповідальність:**
- Oversight для P0/P1 incidents
- Ескалація до вищого керівництва (якщо потрібно)
- Business decisions (compensation, SLA credits)
- External communication (преса, регулятори)

---

## Communication Plan

### Internal Communication (НБУ)

**Slack Channels:**
- `#vop-incidents` — Real-time incident coordination
- `#vop-alerts` — Automated alerts from monitoring
- `#vop-general` — General updates

**Email:**
- vop-team@bank.gov.ua — Internal team

**War Room (для P0 incidents):**
- Physical: НБУ HQ, Conference Room A
- Virtual: Zoom link (always available)

---

### External Communication (Учасники)

**Email distribution list:**
- vop-participants@bank.gov.ua (всі учасники)
- vop-technical-contacts@bank.gov.ua (технічні контакти)

**Slack (для pilot учасників):**
- `#vop-announcements` — Official announcements
- `#vop-technical-support` — Q&A та troubleshooting

**Status Page:**
- https://status.vop.nbu.gov.ua
- Real-time status updates
- Incident history
- Scheduled maintenance calendar

**Phone (для urgent P0 incidents):**
- Hotline: +380-44-XXX-XXXX
- Automated calls через PagerDuty

---

### Communication Templates

**P0 Incident (Initial):**
```
Subject: [P0 CRITICAL] VoP Router Outage

VoP Router is currently unavailable. We are investigating and
will provide updates every hour.

Start time: 2026-02-07 14:30 UTC
Impact: All participants unable to use VoP
Status: Investigating

Next update: 15:30 UTC
Status page: https://status.vop.nbu.gov.ua
```

**P1 Incident (Initial):**
```
Subject: [P1 HIGH] VoP Router Performance Issues

VoP Router is experiencing high latency. Some requests may
be slow or timeout.

Start time: 2026-02-07 14:30 UTC
Impact: 80% participants affected, degraded performance
Status: Investigating

Next update: 16:30 UTC (every 2 hours)
Status page: https://status.vop.nbu.gov.ua
```

---

## Escalation Matrix

| Severity | Initial Response | Escalate After | Escalate To |
|----------|-----------------|----------------|-------------|
| **P0** | On-call (immediately) | 15 min | Team Lead |
| | | 30 min | Engineering Manager |
| | | 1 hour | Director of IT |
| **P1** | On-call (15 min) | 1 hour | Team Lead |
| | | 4 hours | Engineering Manager |
| **P2** | On-call (2 hours) | 8 hours | Team Lead |
| **P3** | On-call (1 day) | 3 days | Team Lead |

---

## Runbooks

### Common Incident Scenarios

**Runbook 1: VoP Router High Latency**
```
1. Check Grafana dashboard для latency metrics
2. Check database performance (pg_stat_activity)
3. Check recent deployments (git log)
4. If DB slow:
   - Kill long queries
   - Scale up database
5. If infrastructure:
   - Scale up pods
   - Check node resources
6. Monitor improvement for 30 min
```

**Runbook 2: VoP Router Downtime**
```
1. Check pod status: kubectl get pods -n vop-production
2. Check logs: kubectl logs vop-router-xxx
3. If pod crashed:
   - Check OOM (out of memory)?
   - Restart pod
4. If infrastructure issue:
   - Check Kubernetes cluster health
   - Failover to backup datacenter?
5. Verify recovery
```

**Runbook 3: Certificate Expiration**
```
1. Check cert expiry: openssl x509 -in cert.pem -noout -dates
2. If expired:
   - Use backup certificate (if available)
   - Request new cert from CA (urgent)
3. Deploy new certificate:
   - Update Kubernetes secret
   - Restart pods
4. Verify mTLS working
```

---

## Контакти для екстрених ситуацій

### НБУ VoP Team

**On-Call Engineer:**
- PagerDuty: @vop-oncall
- Phone: +380-XX-XXX-XXXX (24/7)

**Team Lead:**
- Email: teamlead.vop@bank.gov.ua
- Phone: +380-XX-XXX-XXXX

**Engineering Manager:**
- Email: manager.vop@bank.gov.ua
- Phone: +380-XX-XXX-XXXX

**Director of IT:**
- Email: it-director@bank.gov.ua
- Phone: +380-XX-XXX-XXXX (P0 only)

### External Contacts

**Infrastructure (AWS/Azure):**
- Support: enterprise-support@aws.com
- Phone: +1-XXX-XXX-XXXX

**Database Vendor (PostgreSQL Support):**
- Support: support@postgresql-vendor.com

**Security Incident (CERT-UA):**
- Email: cert@cert.gov.ua
- Phone: +380-44-XXX-XXXX

---

## Висновки

**Ключові принципи incident management:**

✅ **Швидкість** — чим швидше реагуємо, тим менше impact
✅ **Прозорість** — чітка комунікація з учасниками
✅ **Навчання** — post-incident reviews для покращення
✅ **Автоматизація** — автоматичне виявлення та alerting
✅ **Підготовка** — runbooks та training для команди

**Метрики для tracking:**
- Mean Time To Detect (MTTD)
- Mean Time To Response (MTTR)
- Incident count by severity
- % incidents з post-incident reviews

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** Щоквартально
