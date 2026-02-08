# Operational Procedures — VoP СЕП НБУ

**Версія:** 1.0
**Дата:** 2026-02-07
**Статус:** Final

---

## Зміст

1. [Огляд](#огляд)
2. [Організаційна структура](#організаційна-структура)
3. [Моніторинг 24/7](#моніторинг-247)
4. [Incident Response](#incident-response)
5. [Change Management](#change-management)
6. [Backup та Recovery](#backup-та-recovery)
7. [Security Operations](#security-operations)
8. [Capacity Planning](#capacity-planning)
9. [Runbooks](#runbooks)
10. [Контакти та ескалація](#контакти-та-ескалація)

---

## Огляд

Цей документ описує операційні процедури для підтримки системи Verification of Payee (VoP) в production environment.

**Цільова аудиторія:**
- 👨‍💼 Operations team (24/7 monitoring)
- 👨‍💻 Engineering team (incident response)
- 🔐 Security team (security incidents)
- 📊 Management (escalation)

**Scope:**
- VoP Router (НБУ)
- VoP Directory Service
- Моніторинг та alerting
- Incident management
- Change management
- Disaster recovery

---

## Організаційна структура

### Команди та ролі

#### 1. Operations Team (24/7)

**Відповідальність:**
- Моніторинг системи 24/7
- Реагування на alerts
- Перша лінія підтримки
- Ескалація incidents
- Ведення incident log

**Склад:**
- L1 Support Engineers (6 осіб, ротація по 12 годин)
- L2 Support Engineers (4 особи, on-call)

**Робочий час:**
- 24/7/365
- Змінність: 2 зміни по 12 годин (08:00-20:00, 20:00-08:00)
- Weekend coverage: 2 особи на зміну

#### 2. Engineering Team

**Відповідальність:**
- Розробка та підтримка VoP системи
- Incident resolution (P0, P1)
- Performance optimization
- Code reviews та deployments
- Technical documentation

**Склад:**
- Backend Engineers (4 особи)
- DevOps Engineers (2 особи)
- Security Engineer (1 особа)
- Tech Lead (1 особа)

**Робочий час:**
- Пн-Пт 09:00-18:00
- On-call rotation (24/7 для P0/P1)

#### 3. Security Team

**Відповідальність:**
- Security monitoring
- Incident response (security breaches)
- Certificate management
- Vulnerability assessments
- Compliance audits

**Склад:**
- Security Engineers (2 особи)
- Security Analyst (1 особа)

#### 4. Management

**Відповідальність:**
- Ескалація critical incidents
- Комунікація зі stakeholders
- Budget approval
- Strategic decisions

**Склад:**
- Head of IT Department
- VoP Product Owner
- Service Delivery Manager

---

## Моніторинг 24/7

### Моніторинг інфраструктури

#### Prometheus + Grafana

**Metrics:**

```prometheus
# VoP Router
vop_router_requests_total
vop_router_request_duration_seconds
vop_router_errors_total
vop_router_active_requests

# Database
pg_up
pg_stat_database_numbackends
pg_stat_database_xact_commit
pg_stat_database_blks_hit

# Redis
redis_up
redis_connected_clients
redis_used_memory_bytes

# System
node_cpu_seconds_total
node_memory_MemAvailable_bytes
node_disk_io_time_seconds_total
```

**Dashboards:**

1. **VoP Overview Dashboard**
   - Requests per second (успішні / помилки)
   - Latency (p50, p95, p99)
   - Error rate %
   - Active requests
   - Match status distribution

2. **Infrastructure Dashboard**
   - CPU usage (per pod)
   - Memory usage
   - Disk I/O
   - Network traffic

3. **Database Dashboard**
   - Query performance
   - Connection pool
   - Slow queries (> 100ms)
   - Database size

4. **Redis Dashboard**
   - Connected clients
   - Memory usage
   - Cache hit rate
   - Evictions

**Grafana URL:** https://monitoring.nbu.gov.ua/grafana

### Alerting

#### AlertManager configuration

**Critical Alerts (PagerDuty):**

```yaml
groups:
- name: vop_critical
  rules:
  # VoP Router down
  - alert: VopRouterDown
    expr: up{job="vop-router"} == 0
    for: 1m
    severity: critical
    annotations:
      summary: "VoP Router is down"
      description: "VoP Router has been down for more than 1 minute"

  # High error rate
  - alert: VopHighErrorRate
    expr: rate(vop_router_errors_total[5m]) > 0.05
    for: 5m
    severity: critical
    annotations:
      summary: "VoP error rate > 5%"

  # High latency
  - alert: VopHighLatency
    expr: histogram_quantile(0.95, vop_router_request_duration_seconds) > 1.0
    for: 5m
    severity: critical
    annotations:
      summary: "VoP p95 latency > 1 second"

  # Database down
  - alert: DatabaseDown
    expr: pg_up == 0
    for: 1m
    severity: critical

  # Redis down
  - alert: RedisDown
    expr: redis_up == 0
    for: 1m
    severity: critical
```

**Warning Alerts (Slack):**

```yaml
- name: vop_warnings
  rules:
  # Elevated error rate
  - alert: VopElevatedErrorRate
    expr: rate(vop_router_errors_total[5m]) > 0.02
    for: 10m
    severity: warning

  # Elevated latency
  - alert: VopElevatedLatency
    expr: histogram_quantile(0.95, vop_router_request_duration_seconds) > 0.5
    for: 10m
    severity: warning

  # High CPU
  - alert: HighCPUUsage
    expr: rate(node_cpu_seconds_total{mode="idle"}[5m]) < 0.2
    for: 10m
    severity: warning

  # Low disk space
  - alert: LowDiskSpace
    expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
    for: 5m
    severity: warning
```

**Notification channels:**

- **Critical:** PagerDuty (SMS + Phone call)
- **Warning:** Slack #vop-alerts
- **Info:** Slack #vop-monitoring

### Log Monitoring (ELK Stack)

**Elasticsearch queries:**

```json
# Error logs
{
  "query": {
    "bool": {
      "must": [
        { "match": { "level": "error" } },
        { "range": { "@timestamp": { "gte": "now-15m" } } }
      ]
    }
  }
}

# Slow requests (> 1 sec)
{
  "query": {
    "range": {
      "duration": { "gte": 1000 }
    }
  }
}

# Failed authentication
{
  "query": {
    "match": { "message": "authentication failed" }
  }
}
```

**Kibana dashboards:**

1. Error Log Dashboard
2. Request Log Dashboard
3. Security Log Dashboard
4. Audit Log Dashboard

**Kibana URL:** https://monitoring.nbu.gov.ua/kibana

### On-Call Schedule

**PagerDuty rotation:**

```
Week 1: Engineer A (primary), Engineer B (secondary)
Week 2: Engineer C (primary), Engineer D (secondary)
Week 3: Engineer B (primary), Engineer A (secondary)
Week 4: Engineer D (primary), Engineer C (secondary)
```

**On-call responsibilities:**

- ✅ Respond to P0/P1 incidents within 15 minutes
- ✅ Ескалація до Tech Lead якщо потрібно
- ✅ Post-incident report протягом 24 годин
- ✅ Доступність: phone + laptop + internet

**Compensation:**

- On-call week: +20% до зарплати
- Incident response (non-business hours): +50% hourly rate

---

## Incident Response

### Incident Severity Levels

| Severity | Description | Response Time | Escalation |
|----------|-------------|---------------|------------|
| **P0 (Critical)** | VoP Router down, data breach | 15 min | Immediate (Tech Lead + Management) |
| **P1 (High)** | High error rate (> 5%), high latency | 30 min | Tech Lead |
| **P2 (Medium)** | Elevated errors, performance degradation | 2 hours | Engineering team |
| **P3 (Low)** | Minor issues, cosmetic bugs | 1 business day | Normal process |

### P0 Incident Response

**Приклад: VoP Router повністю недоступний**

**Крок 1: Detection (0-5 min)**

1. AlertManager trigger: `VopRouterDown`
2. PagerDuty phone call до on-call engineer
3. Slack alert у #vop-critical

**Крок 2: Initial Response (5-15 min)**

1. On-call engineer acknowledge incident у PagerDuty
2. Перевірити status:
   ```bash
   kubectl get pods -n vop
   kubectl logs -n vop deployment/vop-router --tail=100
   ```
3. Створити incident у JIRA: `INC-YYYYMMDD-NNN`
4. Повідомити у Slack #vop-incidents:
   ```
   🚨 P0 INCIDENT: VoP Router Down
   Incident ID: INC-20260207-001
   Detected: 2026-02-07 14:35 UTC
   On-call: Engineer A
   Status: Investigating
   ```

**Крок 3: Investigation (15-30 min)**

1. Check infrastructure:
   ```bash
   # Kubernetes cluster health
   kubectl get nodes
   kubectl top nodes

   # Pod status
   kubectl describe pod -n vop vop-router-xxxxx

   # Recent events
   kubectl get events -n vop --sort-by='.lastTimestamp'
   ```

2. Check dependencies:
   - PostgreSQL: `psql -h db-host -U vop_user -c "SELECT 1"`
   - Redis: `redis-cli -h redis-host PING`

3. Check logs:
   - Application logs (Kibana)
   - System logs (`journalctl`)
   - Kubernetes logs

**Крок 4: Escalation (якщо потрібно)**

Якщо не можна вирішити за 30 хвилин:

1. Escalate до Tech Lead (phone call)
2. Escalate до DevOps team (якщо infrastructure issue)
3. Escalate до Management (якщо > 1 година downtime)

**Крок 5: Resolution**

Приклад причин та рішень:

| Причина | Рішення |
|---------|---------|
| Pod crashed (OOMKilled) | Збільшити memory limit, restart pod |
| Database connection pool exhausted | Перезапустити DB connections, scale up |
| Kubernetes node down | Cordon node, drain pods, provision new node |
| Certificate expired | Renew certificate, redeploy |
| DDoS attack | Enable rate limiting, block IPs |

```bash
# Restart pods
kubectl rollout restart deployment/vop-router -n vop

# Scale up
kubectl scale deployment/vop-router --replicas=5 -n vop

# Check rollout status
kubectl rollout status deployment/vop-router -n vop
```

**Крок 6: Verification**

1. Check health endpoint:
   ```bash
   curl -k https://vop-router.nbu.gov.ua/health
   ```

2. Send test VoP request

3. Monitor metrics (Grafana):
   - Requests per second відновлюється
   - Error rate < 1%
   - Latency в межах SLA

**Крок 7: Communication**

1. Update incident status у Slack:
   ```
   ✅ RESOLVED: VoP Router Down
   Incident ID: INC-20260207-001
   Root cause: Database connection pool exhausted
   Resolution: Restarted DB connections, scaled to 5 replicas
   Downtime: 23 minutes
   ```

2. Close incident у PagerDuty

3. Send email до stakeholders:
   ```
   Subject: [RESOLVED] VoP Incident - 23 minutes downtime

   Dear stakeholders,

   VoP Router experienced downtime from 14:35 to 14:58 UTC (23 minutes).

   Root cause: Database connection pool was exhausted due to spike in traffic.

   Resolution: We restarted database connections and scaled VoP Router to 5 replicas.

   Impact: Approximately 1,500 VoP requests failed during this period.

   Next steps: We will increase DB connection pool size and add alerting for connection pool usage.

   Full RCA will be published within 48 hours.

   Regards,
   VoP Operations Team
   ```

**Крок 8: Post-Incident Review (24-48 hours)**

Створити RCA (Root Cause Analysis) document:

**Template:**

```markdown
# Root Cause Analysis: VoP Router Downtime

**Incident ID:** INC-20260207-001
**Date:** 2026-02-07
**Duration:** 23 minutes (14:35-14:58 UTC)
**Severity:** P0

## Summary

VoP Router was completely unavailable for 23 minutes due to database connection pool exhaustion.

## Timeline

- 14:35 - Alert triggered: VopRouterDown
- 14:37 - On-call engineer acknowledged
- 14:40 - Investigation started
- 14:45 - Root cause identified: DB connection pool exhausted
- 14:50 - DB connections restarted, scaled to 5 replicas
- 14:55 - Service restored
- 14:58 - Verification complete, incident closed

## Root Cause

Database connection pool size was configured to 20 connections. During peak traffic (1,500 req/s), all connections were exhausted, causing new requests to timeout.

## Impact

- 1,500 VoP requests failed (returned HTTP 500)
- Estimated affected payments: 1,500
- No data loss or security breach

## Resolution

1. Restarted database connections
2. Scaled VoP Router from 3 to 5 replicas
3. Increased DB connection pool size from 20 to 50

## Prevention

Action items:

1. [ ] Increase default DB connection pool to 50 (Owner: Engineer A, Due: 2026-02-10)
2. [ ] Add alerting for DB connection pool usage > 80% (Owner: DevOps B, Due: 2026-02-10)
3. [ ] Implement connection pool auto-scaling (Owner: Engineer C, Due: 2026-02-15)
4. [ ] Load testing to identify limits (Owner: QA Team, Due: 2026-02-20)

## Lessons Learned

- Need better monitoring of DB connection pool
- Auto-scaling should consider DB connections, not just CPU/memory
- Traffic spike patterns should trigger proactive scaling
```

### P1 Incident Response

**Приклад: High error rate (10%)**

Process схожий до P0, але:
- Response time: 30 min
- Менш агресивна ескалація
- Можна спробувати mitigations перед повним restart

**Typical P1 scenarios:**
- Elevated error rate (5-15%)
- High latency (p95 > 2 seconds)
- Responder bank unavailable
- Certificate expiring soon (< 7 days)

---

## Change Management

### Change Process

**Types of changes:**

1. **Standard Change** — pre-approved, low risk (e.g., configuration update)
2. **Normal Change** — requires CAB approval
3. **Emergency Change** — critical fix, expedited approval

### Standard Change (Low Risk)

**Examples:**
- Update log level
- Adjust cache TTL
- Minor configuration changes

**Process:**

1. Create change ticket у JIRA: `CHG-YYYYMMDD-NNN`
2. Document change details:
   - What is changing
   - Why (business justification)
   - Rollback plan
3. Schedule change (prefer off-peak hours)
4. Execute change
5. Verify
6. Close ticket

**Approval:** Tech Lead (can be done asynchronously)

**Timing:** Anytime (avoid peak hours 10:00-16:00)

### Normal Change (Medium/High Risk)

**Examples:**
- Deploy new version
- Database schema change
- Infrastructure upgrade
- Certificate renewal

**Process:**

1. **Request (1 week before)**
   - Create RFC (Request for Change) у JIRA
   - Fill change template:
     ```
     Title: Deploy VoP Router v1.1.0
     Description: New version with performance improvements
     Risk: Medium
     Impact: Low (rolling deployment, no downtime expected)
     Rollback plan: kubectl rollout undo deployment/vop-router
     Testing: Completed in staging environment
     Deployment plan: Rolling update, 1 pod at a time
     ```

2. **CAB Review (3 days before)**
   - Change Advisory Board (CAB) meeting: Wednesday 14:00
   - Participants: Tech Lead, DevOps Lead, Service Delivery Manager
   - Review RFC
   - Approve / Reject / Request more info

3. **Preparation**
   - Notify stakeholders (email)
   - Update status page
   - Prepare rollback scripts
   - Backup current configuration

4. **Execution (change window)**
   - Preferred time: Tuesday/Wednesday 22:00-02:00 (low traffic)
   - Execute deployment:
     ```bash
     # Deploy new version
     kubectl set image deployment/vop-router \
       vop-router=vop-router:1.1.0 -n vop

     # Monitor rollout
     kubectl rollout status deployment/vop-router -n vop

     # If issues, rollback
     kubectl rollout undo deployment/vop-router -n vop
     ```

5. **Verification**
   - Health checks
   - Smoke tests
   - Monitor metrics (30 minutes)

6. **Post-Change**
   - Update documentation
   - Close RFC
   - Send completion email

**Approval:** CAB (Change Advisory Board)

**Timing:** Maintenance window (Tuesday/Wednesday 22:00-02:00)

### Emergency Change (Critical Fix)

**Examples:**
- Security vulnerability patch
- Critical bug fix
- Certificate expired

**Process:**

1. **Request**
   - Create emergency RFC
   - Notify Management immediately
   - Get verbal approval from Tech Lead or CTO

2. **Expedited Review**
   - Emergency CAB (virtual, within 30 min)
   - Fast-track approval

3. **Execution**
   - Can be done during business hours if critical
   - Notify all stakeholders
   - Execute with extra care

4. **Post-Change**
   - Detailed RCA
   - Update runbooks

**Approval:** CTO or Head of IT

**Timing:** ASAP (даже в робочий час якщо критично)

### Change Calendar

**Preferred change windows:**

| Day | Time | Type |
|-----|------|------|
| Tuesday | 22:00-02:00 | Normal changes |
| Wednesday | 22:00-02:00 | Normal changes |
| Thursday | 22:00-02:00 | Emergency only |
| Friday | ❌ No changes | - |
| Weekend | ❌ No changes | Emergency only |

**Blackout periods (no changes):**

- Перший робочий день після свят
- Останній день місяця (фінансова звітність)
- Під час аудиту

---

## Backup та Recovery

### Backup Strategy

#### Database (PostgreSQL)

**Backup schedule:**

- **Full backup:** Щодня о 02:00 UTC
- **Incremental backup:** Кожні 6 годин
- **WAL archiving:** Continuous

**Backup script:**

```bash
#!/bin/bash
# /opt/vop/scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgres"
DB_NAME="vop_directory"

# Full backup
pg_dump -h db-host -U vop_user -Fc $DB_NAME \
  > $BACKUP_DIR/vop_db_$DATE.dump

# Compress
gzip $BACKUP_DIR/vop_db_$DATE.dump

# Upload to S3
aws s3 cp $BACKUP_DIR/vop_db_$DATE.dump.gz \
  s3://nbu-vop-backups/postgres/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.dump.gz" -mtime +30 -delete
```

**Retention:**

- Local: 7 days
- S3: 30 days
- Long-term (yearly): 7 years

**Backup verification:**

Щотижня (субота 04:00) — restore test backup у staging:

```bash
# Restore from latest backup
pg_restore -h staging-db -U vop_user -d vop_directory_test \
  /backups/postgres/vop_db_latest.dump

# Verify data
psql -h staging-db -U vop_user -d vop_directory_test \
  -c "SELECT COUNT(*) FROM vop_directory"
```

#### Redis

**Backup schedule:**

- **RDB snapshot:** Щогодини
- **AOF:** Enabled (fsync every second)

**Backup location:** `/data/redis-backups/`

**Retention:** 7 days (local), 30 days (S3)

#### Configuration (Git)

Всі конфігураційні файли зберігаються в Git:

- Kubernetes manifests
- Helm charts
- Environment variables (encrypted з SOPS)
- Scripts

**Repository:** `git@github.com:nbu/vop-infrastructure.git`

### Disaster Recovery

#### RTO and RPO

| System | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|--------|-------------------------------|-------------------------------|
| VoP Router | 1 hour | 15 minutes |
| PostgreSQL | 2 hours | 1 hour |
| Redis | 30 minutes | 1 hour |

#### DR Procedures

**Scenario 1: Kubernetes cluster failure**

1. **Detection:**
   - All pods down
   - Cluster API unreachable

2. **Recovery:**
   ```bash
   # Provision new cluster (Terraform)
   cd /opt/vop/terraform
   terraform apply -target=module.kubernetes_cluster

   # Deploy VoP from Git
   git clone git@github.com:nbu/vop-infrastructure.git
   cd vop-infrastructure/k8s
   kubectl apply -f .

   # Restore database
   pg_restore -h new-db-host -U vop_user -d vop_directory \
     s3://nbu-vop-backups/postgres/latest.dump
   ```

3. **Verification:**
   - Health checks
   - Smoke tests
   - DNS update (if new IPs)

**Estimated time:** 1-2 hours

**Scenario 2: Database corruption**

1. **Detection:**
   - Database errors
   - Data inconsistency

2. **Recovery:**
   ```bash
   # Stop VoP Router
   kubectl scale deployment/vop-router --replicas=0 -n vop

   # Drop corrupted database
   psql -h db-host -U postgres -c "DROP DATABASE vop_directory"

   # Create new database
   psql -h db-host -U postgres -c "CREATE DATABASE vop_directory"

   # Restore from backup
   pg_restore -h db-host -U vop_user -d vop_directory \
     /backups/postgres/vop_db_latest.dump

   # Verify data integrity
   psql -h db-host -U vop_user -d vop_directory \
     -f /opt/vop/scripts/verify-data.sql

   # Start VoP Router
   kubectl scale deployment/vop-router --replicas=3 -n vop
   ```

**Estimated time:** 2-3 hours

**Data loss:** Up to 1 hour (залежить від backup frequency)

#### DR Drills

**Schedule:** Quarterly (кожні 3 місяці)

**Process:**

1. Schedule DR drill (announce 2 weeks ahead)
2. Execute DR procedures у test environment
3. Measure RTO and RPO
4. Document issues
5. Update runbooks
6. Report to management

**Last DR drill:** 2026-01-15 (RTO: 1.5 hours, RPO: 30 min)

---

## Security Operations

### Certificate Management

#### Certificate Lifecycle

**Certificates used:**

- VoP Router TLS certificate (АЦСК)
- Client certificates (per bank, АЦСК)
- Internal certificates (Kubernetes, PostgreSQL)

**Renewal process:**

**90 days before expiry:**
1. Generate CSR (Certificate Signing Request)
   ```bash
   openssl req -new -key vop-router.key -out vop-router.csr
   ```

2. Submit CSR до АЦСК
3. Wait for approval (3-5 business days)

**30 days before expiry:**
4. Receive new certificate від АЦСЬК
5. Verify certificate:
   ```bash
   openssl x509 -in vop-router.crt -text -noout
   ```

**14 days before expiry:**
6. Create change request (RFC)
7. Schedule deployment

**7 days before expiry:**
8. Deploy new certificate (rolling update):
   ```bash
   # Update Kubernetes secret
   kubectl create secret tls vop-router-tls \
     --cert=vop-router.crt \
     --key=vop-router.key \
     --dry-run=client -o yaml | kubectl apply -f -

   # Restart pods to load new certificate
   kubectl rollout restart deployment/vop-router -n vop
   ```

9. Verify:
   ```bash
   echo | openssl s_client -connect vop-router.nbu.gov.ua:443 2>&1 | \
     openssl x509 -noout -dates
   ```

**Alerting:**

```yaml
- alert: CertificateExpiringSoon
  expr: (cert_expiry_timestamp - time()) < 7 * 24 * 3600
  severity: critical
  annotations:
    summary: "Certificate expires in < 7 days"
```

#### Certificate Revocation

**Якщо сertificate скомпрометовано:**

1. **Immediate action:**
   - Revoke certificate у АЦСЬК
   - Update CRL (Certificate Revocation List)
   - Block certificate fingerprint у VoP Router config

2. **Generate new certificate:**
   - New private key
   - New CSR
   - Submit до АЦСЬК (expedited process)

3. **Emergency deployment:**
   - Emergency RFC
   - Deploy ASAP (can be during business hours)

4. **Notify stakeholders:**
   - Email всім учасникам VoP
   - Update на website

**Estimated time:** 4-6 hours (залежить від АЦСЬК response time)

### Security Monitoring

**SIEM (Security Information and Event Management):**

Всі security events надсилаються до SIEM system.

**Events monitored:**

- Failed authentication attempts
- Unauthorized access attempts
- Certificate errors
- Rate limit exceeded
- Suspicious patterns (e.g., brute force)
- Data exfiltration attempts

**Alerts:**

```yaml
# Failed authentication spike
- alert: FailedAuthSpike
  expr: rate(vop_router_auth_failures[5m]) > 10
  severity: warning

# Suspicious IP
- alert: SuspiciousIP
  expr: vop_router_requests_from_blacklisted_ip > 0
  severity: critical
```

**Weekly security review:**

- Review failed authentication logs
- Analyze traffic patterns
- Check for vulnerabilities (CVEs)
- Review access logs

### Vulnerability Management

**Process:**

1. **Weekly scan** (every Monday):
   ```bash
   # Container image scan
   trivy image vop-router:latest

   # Dependency scan
   npm audit
   pip-audit
   ```

2. **Vulnerability assessment:**
   - Critical: Fix within 24 hours
   - High: Fix within 7 days
   - Medium: Fix within 30 days
   - Low: Fix in next release

3. **Patch deployment:**
   - Create RFC
   - Test patch у staging
   - Deploy to production

**CVE subscriptions:**

- GitHub Security Advisories
- NPM Security Alerts
- NIST NVD (National Vulnerability Database)

---

## Capacity Planning

### Metrics Collection

**Збирати щомісяця:**

- Peak requests per second
- Average requests per second
- Peak concurrent requests
- Database size (GB)
- Redis memory usage
- Storage usage (logs, backups)

**Dashboard:** https://monitoring.nbu.gov.ua/grafana/d/capacity-planning

### Growth Projections

**Historical data (6 months):**

| Month | Avg req/s | Peak req/s | Growth |
|-------|-----------|------------|--------|
| Jan   | 500       | 1,200      | -      |
| Feb   | 550       | 1,350      | +10%   |
| Mar   | 600       | 1,500      | +9%    |
| Apr   | 680       | 1,700      | +13%   |
| May   | 750       | 1,900      | +10%   |
| Jun   | 820       | 2,100      | +9%    |

**Average growth:** 10% per month

**Projection (next 6 months):**

- Jul: 900 req/s (peak 2,300)
- Aug: 990 req/s (peak 2,500)
- ...
- Dec: 1,450 req/s (peak 3,600)

### Capacity Thresholds

**Current capacity:**

- VoP Router: 2,000 req/s (with 3 pods)
- Database: 5,000 connections
- Redis: 10 GB memory

**Thresholds:**

| Resource | Warning (70%) | Critical (85%) | Action |
|----------|---------------|----------------|--------|
| VoP Router | 1,400 req/s | 1,700 req/s | Scale to 5 pods |
| Database connections | 3,500 | 4,250 | Increase pool size |
| Redis memory | 7 GB | 8.5 GB | Scale to larger instance |

**Alerting:**

```yaml
- alert: CapacityWarning
  expr: vop_router_rps > 1400
  for: 30m
  severity: warning
  annotations:
    summary: "VoP Router approaching capacity (70%)"
```

### Scaling Plan

**Short-term (< 1 month):**

- Horizontal scaling: Add more pods (3 → 5 → 10)
- Vertical scaling: Increase pod resources (2 CPU → 4 CPU)

**Long-term (3-6 months):**

- Database sharding (якщо > 1 TB)
- Multi-region deployment
- CDN for static content

**Budget:**

- Current: $5,000/month (infrastructure)
- Projected (Dec): $8,000/month (+60%)

---

## Runbooks

### Runbook Template

```markdown
# Runbook: [Task Name]

**Purpose:** What this runbook helps with
**Frequency:** Daily / Weekly / Monthly / As needed
**Owner:** Team / Person
**Estimated time:** X minutes

## Prerequisites

- Access to [system]
- Credentials for [service]
- Tools: [tool1], [tool2]

## Steps

1. **Step 1: [Description]**
   ```bash
   # Command
   kubectl get pods -n vop
   ```

   Expected output:
   ```
   NAME                          READY   STATUS
   vop-router-xxxxx              1/1     Running
   ```

2. **Step 2: [Description]**
   ...

## Verification

How to verify the task completed successfully.

## Rollback

If something goes wrong, how to rollback.

## Troubleshooting

Common issues and solutions.
```

### Common Runbooks

**1. Daily Health Check**

**Frequency:** Every day, 09:00 UTC

**Steps:**

1. Check Grafana dashboards
2. Review overnight alerts
3. Check backup status:
   ```bash
   aws s3 ls s3://nbu-vop-backups/postgres/ | tail -5
   ```
4. Check certificate expiry:
   ```bash
   kubectl get certificates -n vop
   ```
5. Review error logs (Kibana)

**Time:** 15 minutes

**2. Weekly Security Review**

**Frequency:** Every Monday, 10:00 UTC

**Steps:**

1. Run vulnerability scan
2. Review failed authentication logs
3. Check for CVEs
4. Review access logs
5. Update security dashboard

**Time:** 30 minutes

**3. Monthly Capacity Review**

**Frequency:** First Monday of month, 14:00 UTC

**Steps:**

1. Export metrics from Grafana
2. Update capacity planning spreadsheet
3. Calculate growth rate
4. Forecast next 3 months
5. Recommend scaling actions

**Time:** 1 hour

**4. Certificate Renewal**

**Frequency:** As needed (90 days before expiry)

**Steps:**

1. Generate CSR
2. Submit до АЦСЬК
3. Wait for approval
4. Receive certificate
5. Verify certificate
6. Create RFC
7. Schedule deployment
8. Deploy new certificate
9. Verify deployment

**Time:** 2-3 hours (spread over 2 weeks)

**5. Database Backup Restore Test**

**Frequency:** Weekly (Saturday 04:00 UTC)

**Steps:**

1. Download latest backup від S3
2. Restore to staging database
3. Verify data integrity
4. Run smoke tests
5. Document results
6. Delete staging data

**Time:** 1 hour

---

## Контакти та ескалація

### Contact Information

#### Operations Team (24/7)

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| L1 Support (Shift 1) | Engineer A | +380-XX-XXX-XX01 | engineer-a@nbu.gov.ua | @engineer-a |
| L1 Support (Shift 2) | Engineer B | +380-XX-XXX-XX02 | engineer-b@nbu.gov.ua | @engineer-b |
| L2 Support (On-call) | Engineer C | +380-XX-XXX-XX03 | engineer-c@nbu.gov.ua | @engineer-c |

**Email:** vop-support@bank.gov.ua
**Slack:** #vop-support
**Phone hotline:** +380-44-XXX-XXXX

#### Engineering Team

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Tech Lead | Engineer D | +380-XX-XXX-XX04 | tech-lead@nbu.gov.ua |
| Backend Engineer | Engineer E | +380-XX-XXX-XX05 | engineer-e@nbu.gov.ua |
| DevOps Engineer | Engineer F | +380-XX-XXX-XX06 | devops@nbu.gov.ua |

**Email:** vop-engineering@bank.gov.ua
**Slack:** #vop-engineering

#### Security Team

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Security Lead | Security A | +380-XX-XXX-XX07 | security-lead@nbu.gov.ua |

**Email:** security@bank.gov.ua
**Slack:** #vop-security

#### Management

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Head of IT | Manager A | +380-XX-XXX-XX08 | it-head@bank.gov.ua |
| VoP Product Owner | Manager B | +380-XX-XXX-XX09 | vop-po@nbu.gov.ua |

### Escalation Matrix

| Incident Severity | L1 Support | L2 Support | Tech Lead | Management |
|-------------------|------------|------------|-----------|------------|
| **P0 (Critical)** | Immediate | +15 min | +30 min | +1 hour |
| **P1 (High)** | Immediate | +30 min | +2 hours | +4 hours |
| **P2 (Medium)** | +1 hour | +4 hours | +1 day | - |
| **P3 (Low)** | +1 day | - | - | - |

**Escalation procedure:**

1. L1 Support створює incident ticket
2. Якщо не можна вирішити за [time] → escalate до L2
3. L2 не може вирішити → escalate до Tech Lead
4. Якщо downtime > [threshold] → notify Management

### Communication Templates

**Email template (incident notification):**

```
Subject: [SEVERITY] VoP Incident - [Brief description]

Dear stakeholders,

We are currently experiencing [issue description].

Impact:
- [Impact on users]
- [Affected systems]

Status: [Investigating / In progress / Resolved]

ETA: [Estimated time to resolution]

We will provide updates every [interval].

For questions, please contact: vop-support@bank.gov.ua

Regards,
VoP Operations Team
```

**Slack template (incident update):**

```
🔴 P0 INCIDENT UPDATE

Incident ID: INC-20260207-001
Status: In Progress
Root cause: Database connection pool exhausted
Actions taken:
  ✅ Restarted DB connections
  ✅ Scaled to 5 replicas
  ⏳ Monitoring recovery

ETA: 10 minutes

Next update: 15:15 UTC
```

---

## Підсумок

Цей документ містить ключові операційні процедури для VoP системи:

✅ **Моніторинг 24/7** — Prometheus, Grafana, AlertManager, PagerDuty
✅ **Incident Response** — Severity levels, escalation, RCA
✅ **Change Management** — CAB process, change windows, emergency changes
✅ **Backup та Recovery** — Daily backups, DR procedures, RTO/RPO
✅ **Security Operations** — Certificate management, vulnerability scanning, SIEM
✅ **Capacity Planning** — Growth forecasting, scaling thresholds
✅ **Runbooks** — Daily/weekly/monthly operational tasks

**Важливі нагадування:**

- 📞 On-call engineer має відповісти на P0 incident за 15 хвилин
- 💾 Backups перевіряються щотижня (restore test)
- 🔐 Certificates renewals починаються за 90 днів до expiry
- 📊 Capacity planning review — щомісяця
- 🔄 DR drill — щокварталу

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** Q2 2026

**Контакти:**

- Operations: vop-support@bank.gov.ua
- Engineering: vop-engineering@bank.gov.ua
- Security: security@bank.gov.ua
- Emergency (24/7): +380-44-XXX-XXXX

**Документація:**

- Runbooks: https://docs.nbu.gov.ua/vop/runbooks
- Monitoring: https://monitoring.nbu.gov.ua/grafana
- Incident tracker: https://jira.nbu.gov.ua/projects/VOP
