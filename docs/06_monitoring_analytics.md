# Моніторинг та Аналітика VoP Системи

## Зміст

1. [Огляд стратегії моніторингу](#1-огляд-стратегії-моніторингу)
2. [Prometheus Metrics](#2-prometheus-metrics)
3. [Grafana Dashboards](#3-grafana-dashboards)
4. [Alerting Rules](#4-alerting-rules)
5. [ELK Stack для логів](#5-elk-stack-для-логів)
6. [Performance Monitoring](#6-performance-monitoring)
7. [Business Analytics](#7-business-analytics)
8. [SLA Monitoring](#8-sla-monitoring)
9. [Incident Response Integration](#9-incident-response-integration)

---

## 1. Огляд стратегії моніторингу

### 1.1 Архітектура моніторингу

```
┌─────────────────────────────────────────────────────────────┐
│                      VoP Infrastructure                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Router   │  │ Directory│  │ Requester│  │ Responder│   │
│  │          │  │ Service  │  │ Banks    │  │ Banks    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │              │              │          │
│       └─────────────┴──────────────┴──────────────┘          │
│                         │                                     │
│                    Metrics Export                            │
└─────────────────────────┼───────────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                  │
    ┌────▼─────┐                     ┌─────▼────┐
    │Prometheus│                     │  ELK     │
    │  Server  │                     │  Stack   │
    └────┬─────┘                     └─────┬────┘
         │                                  │
    ┌────▼──────┐                    ┌─────▼────┐
    │ Grafana   │                    │ Kibana   │
    │Dashboards │                    │ Logs UI  │
    └────┬──────┘                    └──────────┘
         │
    ┌────▼──────┐
    │AlertManager│──▶ Email, Slack, PagerDuty
    └───────────┘
```

### 1.2 Ключові метрики для моніторингу

**Operational Metrics (технічні):**
- Request rate (RPS)
- Response latency (p50, p95, p99)
- Error rates (4xx, 5xx)
- System health (CPU, memory, disk)
- Database performance
- Network I/O

**Business Metrics (бізнесові):**
- Verification match rate (MATCH/CLOSE_MATCH/NO_MATCH)
- Daily transaction volume
- Participant activity
- Fraud detection rate
- Cost savings from prevented errors

**Security Metrics:**
- Authentication failures
- Certificate expiry warnings
- Rate limit violations
- Suspicious activity patterns

### 1.3 Retention Policy

```yaml
retention_policy:
  # Prometheus metrics
  prometheus:
    raw_metrics: 15 days         # Детальні метрики
    aggregated_5m: 90 days       # 5-хвилинні агрегати
    aggregated_1h: 1 year        # Годинні агрегати

  # ELK logs
  elasticsearch:
    hot_tier: 7 days             # SSD, швидкий доступ
    warm_tier: 30 days           # Повільніше, но доступно
    cold_tier: 365 days          # Архів, рідкий доступ

  # Business analytics
  analytics_db:
    detailed_transactions: 90 days
    aggregated_reports: 5 years
```

---

## 2. Prometheus Metrics

### 2.1 Infrastructure Metrics

**File: `/etc/prometheus/vop-metrics.yml`**

```yaml
# Prometheus scrape configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'vop-production'
    environment: 'prod'

scrape_configs:
  # VoP Router metrics
  - job_name: 'vop-router'
    static_configs:
      - targets:
        - 'router-01.vop.bank.gov.ua:9090'
        - 'router-02.vop.bank.gov.ua:9090'
    metrics_path: '/metrics'
    scheme: https
    tls_config:
      cert_file: /etc/prometheus/certs/prometheus.crt
      key_file: /etc/prometheus/certs/prometheus.key
      ca_file: /etc/prometheus/certs/ca.crt

  # Directory Service metrics
  - job_name: 'vop-directory'
    static_configs:
      - targets: ['directory.vop.bank.gov.ua:9091']

  # PostgreSQL exporter
  - job_name: 'postgresql'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Node exporter (system metrics)
  - job_name: 'node'
    static_configs:
      - targets:
        - 'router-01.vop.bank.gov.ua:9100'
        - 'router-02.vop.bank.gov.ua:9100'
        - 'directory.vop.bank.gov.ua:9100'

  # NGINX exporter
  - job_name: 'nginx'
    static_configs:
      - targets: ['router-01.vop.bank.gov.ua:9113']
```

### 2.2 Custom VoP Metrics

**Python instrumentation з prometheus_client:**

```python
# vop_metrics.py
from prometheus_client import Counter, Histogram, Gauge, Summary, Info
from prometheus_client import start_http_server
import time

# ============================================
# 1. REQUEST METRICS
# ============================================

# Загальна кількість запитів
vop_requests_total = Counter(
    'vop_requests_total',
    'Total number of VoP verification requests',
    ['endpoint', 'method', 'client_id', 'status']
)

# Latency розподіл
vop_request_duration_seconds = Histogram(
    'vop_request_duration_seconds',
    'VoP request duration in seconds',
    ['endpoint', 'method'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

# Розмір payload
vop_request_size_bytes = Histogram(
    'vop_request_size_bytes',
    'Size of VoP request payload in bytes',
    ['endpoint'],
    buckets=[100, 500, 1000, 5000, 10000, 50000]
)

vop_response_size_bytes = Histogram(
    'vop_response_size_bytes',
    'Size of VoP response payload in bytes',
    ['endpoint'],
    buckets=[100, 500, 1000, 5000, 10000, 50000]
)

# ============================================
# 2. VERIFICATION RESULTS
# ============================================

vop_verification_results_total = Counter(
    'vop_verification_results_total',
    'Total verification results by match status',
    ['status', 'requester_id', 'responder_id']
)
# Можливі статуси: MATCH, CLOSE_MATCH, NO_MATCH, ERROR

vop_match_score_distribution = Histogram(
    'vop_match_score_distribution',
    'Distribution of name matching scores',
    ['algorithm'],  # levenshtein, jaro_winkler, combined
    buckets=[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
)

# ============================================
# 3. ERROR METRICS
# ============================================

vop_errors_total = Counter(
    'vop_errors_total',
    'Total number of errors',
    ['error_type', 'endpoint', 'client_id']
)
# error_type: timeout, network_error, validation_error, auth_error, etc.

vop_timeout_total = Counter(
    'vop_timeout_total',
    'Total number of timeout errors',
    ['endpoint', 'timeout_stage']
)
# timeout_stage: request, database, external_api

# ============================================
# 4. RATE LIMITING
# ============================================

vop_rate_limit_exceeded_total = Counter(
    'vop_rate_limit_exceeded_total',
    'Total number of rate limit exceeded events',
    ['client_id', 'tier', 'limit_type']
)
# limit_type: rps, burst, daily

vop_rate_limit_usage_ratio = Gauge(
    'vop_rate_limit_usage_ratio',
    'Current rate limit usage ratio (0-1)',
    ['client_id', 'tier', 'limit_type']
)

# ============================================
# 5. AUTHENTICATION & SECURITY
# ============================================

vop_auth_attempts_total = Counter(
    'vop_auth_attempts_total',
    'Total authentication attempts',
    ['client_id', 'auth_method', 'result']
)
# auth_method: mtls, oauth2
# result: success, failure

vop_certificate_expiry_days = Gauge(
    'vop_certificate_expiry_days',
    'Days until certificate expiry',
    ['client_id', 'cert_type', 'serial_number']
)

vop_token_refresh_total = Counter(
    'vop_token_refresh_total',
    'OAuth2 token refresh operations',
    ['client_id', 'result']
)

# ============================================
# 6. DATABASE METRICS
# ============================================

vop_db_query_duration_seconds = Histogram(
    'vop_db_query_duration_seconds',
    'Database query execution time',
    ['query_type', 'table'],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0]
)

vop_db_connections_active = Gauge(
    'vop_db_connections_active',
    'Number of active database connections',
    ['pool_name']
)

vop_db_pool_size = Gauge(
    'vop_db_pool_size',
    'Maximum database connection pool size',
    ['pool_name']
)

# ============================================
# 7. DIRECTORY SERVICE
# ============================================

vop_directory_lookup_duration_seconds = Histogram(
    'vop_directory_lookup_duration_seconds',
    'Directory Service lookup duration',
    ['lookup_type'],  # by_iban, by_participant_id
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5]
)

vop_directory_cache_hits_total = Counter(
    'vop_directory_cache_hits_total',
    'Directory Service cache hits',
    ['cache_type']
)

vop_directory_cache_misses_total = Counter(
    'vop_directory_cache_misses_total',
    'Directory Service cache misses',
    ['cache_type']
)

vop_directory_entries_total = Gauge(
    'vop_directory_entries_total',
    'Total number of entries in Directory Service',
    ['entry_type']  # bank, nnpp, iban_range
)

# ============================================
# 8. SYSTEM RESOURCES
# ============================================

vop_memory_usage_bytes = Gauge(
    'vop_memory_usage_bytes',
    'Memory usage in bytes',
    ['component', 'type']  # type: heap, non_heap, cache
)

vop_cpu_usage_percent = Gauge(
    'vop_cpu_usage_percent',
    'CPU usage percentage',
    ['component']
)

vop_disk_io_operations_total = Counter(
    'vop_disk_io_operations_total',
    'Total disk I/O operations',
    ['operation', 'device']  # operation: read, write
)

# ============================================
# 9. BUSINESS METRICS
# ============================================

vop_transactions_prevented_errors = Counter(
    'vop_transactions_prevented_errors',
    'Number of prevented erroneous transactions',
    ['error_severity']  # high: wrong recipient, low: typo
)

vop_estimated_savings_uah = Counter(
    'vop_estimated_savings_uah',
    'Estimated financial savings in UAH',
    ['savings_type']  # direct_loss_prevention, operational_cost_reduction
)

vop_participant_activity_score = Gauge(
    'vop_participant_activity_score',
    'Participant activity score (requests per hour)',
    ['participant_id', 'participant_type']
)

# ============================================
# 10. SLA METRICS
# ============================================

vop_sla_compliance_ratio = Gauge(
    'vop_sla_compliance_ratio',
    'SLA compliance ratio (0-1)',
    ['sla_metric']  # availability, latency_p95, error_rate
)

vop_uptime_seconds_total = Counter(
    'vop_uptime_seconds_total',
    'Total uptime in seconds',
    ['component']
)

vop_downtime_seconds_total = Counter(
    'vop_downtime_seconds_total',
    'Total downtime in seconds',
    ['component', 'reason']
)


# ============================================
# USAGE EXAMPLE
# ============================================

def record_verification_request(endpoint, method, client_id, status_code, duration):
    """
    Записує метрики для VoP запиту.
    """
    # Increment request counter
    vop_requests_total.labels(
        endpoint=endpoint,
        method=method,
        client_id=client_id,
        status=f"{status_code}"
    ).inc()

    # Record latency
    vop_request_duration_seconds.labels(
        endpoint=endpoint,
        method=method
    ).observe(duration)


def record_verification_result(status, requester_id, responder_id, match_score):
    """
    Записує результат верифікації.
    """
    vop_verification_results_total.labels(
        status=status,
        requester_id=requester_id,
        responder_id=responder_id
    ).inc()

    # Record match score distribution
    vop_match_score_distribution.labels(
        algorithm='combined'
    ).observe(match_score)


def update_rate_limit_metrics(client_id, tier, limit_type, used, limit):
    """
    Оновлює метрики rate limiting.
    """
    ratio = used / limit if limit > 0 else 0
    vop_rate_limit_usage_ratio.labels(
        client_id=client_id,
        tier=tier,
        limit_type=limit_type
    ).set(ratio)


# Start Prometheus HTTP server
if __name__ == '__main__':
    start_http_server(9090)
    print("Prometheus metrics server started on :9090")

    # Keep alive
    while True:
        time.sleep(60)
```

### 2.3 Метрики у Flask додатку

```python
# flask_app_with_metrics.py
from flask import Flask, request, g
from prometheus_client import make_wsgi_app
from werkzeug.middleware.dispatcher import DispatcherMiddleware
import time

app = Flask(__name__)

# Add prometheus metrics endpoint
app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {
    '/metrics': make_wsgi_app()
})

@app.before_request
def before_request():
    """Record request start time."""
    g.start_time = time.time()

@app.after_request
def after_request(response):
    """Record metrics after request."""
    if hasattr(g, 'start_time'):
        duration = time.time() - g.start_time

        # Record metrics
        record_verification_request(
            endpoint=request.endpoint or 'unknown',
            method=request.method,
            client_id=g.get('client_id', 'anonymous'),
            status_code=response.status_code,
            duration=duration
        )

        # Record request/response size
        vop_request_size_bytes.labels(
            endpoint=request.endpoint or 'unknown'
        ).observe(request.content_length or 0)

        vop_response_size_bytes.labels(
            endpoint=request.endpoint or 'unknown'
        ).observe(len(response.data))

    return response

@app.route('/vop/v1/verify', methods=['POST'])
def verify():
    try:
        # Process verification...
        result = process_verification(request.json)

        # Record business metrics
        record_verification_result(
            status=result['status'],
            requester_id=g.client_id,
            responder_id=result['responder_id'],
            match_score=result['matchScore']
        )

        return jsonify(result), 200

    except TimeoutError as e:
        vop_timeout_total.labels(
            endpoint='verify',
            timeout_stage='database'
        ).inc()
        raise

    except Exception as e:
        vop_errors_total.labels(
            error_type=type(e).__name__,
            endpoint='verify',
            client_id=g.client_id
        ).inc()
        raise
```

---

## 3. Grafana Dashboards

### 3.1 Main Dashboard - VoP System Overview

**Dashboard JSON: `grafana-dashboards/vop-overview.json`**

```json
{
  "dashboard": {
    "title": "VoP System Overview",
    "tags": ["vop", "overview"],
    "timezone": "Europe/Kiev",
    "refresh": "30s",
    "time": {
      "from": "now-6h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "Requests Per Second",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(vop_requests_total[5m])",
            "legendFormat": "{{endpoint}} - {{client_id}}"
          }
        ],
        "yaxes": [
          {
            "label": "RPS",
            "format": "short"
          }
        ]
      },
      {
        "id": 2,
        "title": "Response Latency (p95)",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(vop_request_duration_seconds_bucket[5m]))",
            "legendFormat": "{{endpoint}}"
          }
        ],
        "yaxes": [
          {
            "label": "Seconds",
            "format": "s"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [2.0],
                "type": "gt"
              },
              "operator": {
                "type": "and"
              },
              "query": {
                "params": ["A", "5m", "now"]
              },
              "reducer": {
                "params": [],
                "type": "avg"
              },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "60s",
          "handler": 1,
          "name": "High Latency Alert",
          "noDataState": "no_data",
          "notifications": []
        }
      },
      {
        "id": 3,
        "title": "Verification Results Distribution",
        "type": "piechart",
        "targets": [
          {
            "expr": "sum by (status) (increase(vop_verification_results_total[1h]))",
            "legendFormat": "{{status}}"
          }
        ]
      },
      {
        "id": 4,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(vop_errors_total[5m])",
            "legendFormat": "{{error_type}}"
          }
        ],
        "yaxes": [
          {
            "label": "Errors/sec",
            "format": "short"
          }
        ]
      },
      {
        "id": 5,
        "title": "Rate Limit Violations",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(increase(vop_rate_limit_exceeded_total[1h]))",
            "legendFormat": "Total violations"
          }
        ],
        "options": {
          "graphMode": "area",
          "colorMode": "background",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {"value": 0, "color": "green"},
              {"value": 10, "color": "yellow"},
              {"value": 100, "color": "red"}
            ]
          }
        }
      },
      {
        "id": 6,
        "title": "Database Query Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(vop_db_query_duration_seconds_bucket[5m]))",
            "legendFormat": "{{query_type}} - p95"
          }
        ]
      },
      {
        "id": 7,
        "title": "Active Participants",
        "type": "stat",
        "targets": [
          {
            "expr": "count(count by (client_id) (increase(vop_requests_total[5m]) > 0))",
            "legendFormat": "Active clients"
          }
        ]
      },
      {
        "id": 8,
        "title": "Certificate Expiry Status",
        "type": "table",
        "targets": [
          {
            "expr": "vop_certificate_expiry_days < 30",
            "format": "table",
            "instant": true
          }
        ],
        "options": {
          "sortBy": [
            {
              "displayName": "Expiry Days",
              "desc": false
            }
          ]
        }
      }
    ]
  }
}
```

### 3.2 Business Metrics Dashboard

**PromQL Queries для бізнес-метрик:**

```promql
# 1. Daily verification volume
sum(increase(vop_requests_total[24h]))

# 2. Match rate percentage
(
  sum(increase(vop_verification_results_total{status="MATCH"}[24h]))
  /
  sum(increase(vop_verification_results_total[24h]))
) * 100

# 3. Average match score
avg(vop_match_score_distribution)

# 4. Top 10 active participants
topk(10, sum by (client_id) (rate(vop_requests_total[1h])))

# 5. Prevented errors count
sum(increase(vop_transactions_prevented_errors[24h]))

# 6. Estimated savings (₴ per day)
sum(increase(vop_estimated_savings_uah[24h]))

# 7. Peak hour traffic
max_over_time(
  sum(rate(vop_requests_total[5m]))[24h:5m]
)

# 8. Success rate
(
  sum(rate(vop_requests_total{status=~"2.."}[5m]))
  /
  sum(rate(vop_requests_total[5m]))
) * 100

# 9. Average response time by participant
avg by (client_id) (
  rate(vop_request_duration_seconds_sum[1h])
  /
  rate(vop_request_duration_seconds_count[1h])
)

# 10. Weekly growth rate
(
  sum(increase(vop_requests_total[7d]))
  -
  sum(increase(vop_requests_total[7d] offset 7d))
) / sum(increase(vop_requests_total[7d] offset 7d)) * 100
```

### 3.3 SLA Dashboard

```json
{
  "dashboard": {
    "title": "VoP SLA Monitoring",
    "panels": [
      {
        "id": 1,
        "title": "Availability (Target: 99.9%)",
        "type": "gauge",
        "targets": [
          {
            "expr": "(1 - (sum(increase(vop_downtime_seconds_total[30d])) / (30 * 24 * 3600))) * 100"
          }
        ],
        "options": {
          "thresholds": {
            "steps": [
              {"value": 0, "color": "red"},
              {"value": 99.5, "color": "yellow"},
              {"value": 99.9, "color": "green"}
            ]
          }
        }
      },
      {
        "id": 2,
        "title": "P95 Latency (Target: <2s)",
        "type": "gauge",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(vop_request_duration_seconds_bucket[30d]))"
          }
        ],
        "options": {
          "unit": "s",
          "thresholds": {
            "steps": [
              {"value": 0, "color": "green"},
              {"value": 2.0, "color": "yellow"},
              {"value": 5.0, "color": "red"}
            ]
          }
        }
      },
      {
        "id": 3,
        "title": "Error Rate (Target: <0.1%)",
        "type": "gauge",
        "targets": [
          {
            "expr": "(sum(rate(vop_requests_total{status=~\"5..\"}[30d])) / sum(rate(vop_requests_total[30d]))) * 100"
          }
        ],
        "options": {
          "unit": "percent",
          "thresholds": {
            "steps": [
              {"value": 0, "color": "green"},
              {"value": 0.1, "color": "yellow"},
              {"value": 1.0, "color": "red"}
            ]
          }
        }
      }
    ]
  }
}
```

---

## 4. Alerting Rules

### 4.1 Critical Alerts (PagerDuty)

**File: `/etc/prometheus/alerts/critical.yml`**

```yaml
groups:
  - name: vop_critical
    interval: 30s
    rules:
      # CRITICAL: VoP Router Down
      - alert: VopRouterDown
        expr: up{job="vop-router"} == 0
        for: 1m
        labels:
          severity: critical
          component: router
          oncall: true
        annotations:
          summary: "VoP Router {{ $labels.instance }} is down"
          description: |
            VoP Router instance {{ $labels.instance }} has been down for more than 1 minute.
            IMMEDIATE ACTION REQUIRED.

            Runbook: https://docs.vop.bank.gov.ua/runbooks/router-down
          dashboard: https://grafana.vop.bank.gov.ua/d/vop-overview

      # CRITICAL: High Error Rate
      - alert: VopHighErrorRate
        expr: |
          (
            sum(rate(vop_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(vop_requests_total[5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: critical
          component: application
          oncall: true
        annotations:
          summary: "High error rate detected: {{ $value | humanizePercentage }}"
          description: |
            Error rate is {{ $value | humanizePercentage }} (threshold: 5%)
            over the last 5 minutes.

            Check logs and recent deployments.

      # CRITICAL: Database Connection Pool Exhausted
      - alert: VopDatabasePoolExhausted
        expr: |
          vop_db_connections_active / vop_db_pool_size > 0.95
        for: 2m
        labels:
          severity: critical
          component: database
          oncall: true
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: |
            Pool {{ $labels.pool_name }} is at {{ $value | humanizePercentage }} capacity.
            May cause request failures.

      # CRITICAL: Certificate Expiring Soon
      - alert: VopCertificateExpiringSoon
        expr: vop_certificate_expiry_days < 7
        for: 1h
        labels:
          severity: critical
          component: security
          oncall: true
        annotations:
          summary: "Certificate for {{ $labels.client_id }} expires in {{ $value }} days"
          description: |
            Certificate ({{ $labels.cert_type }}, S/N: {{ $labels.serial_number }})
            for client {{ $labels.client_id }} will expire in {{ $value }} days.

            URGENT: Coordinate certificate renewal with the participant.

      # CRITICAL: SLA Violation - Availability
      - alert: VopSlaAvailabilityViolation
        expr: |
          (
            1 - (
              sum(increase(vop_downtime_seconds_total[30d]))
              /
              (30 * 24 * 3600)
            )
          ) < 0.999
        for: 10m
        labels:
          severity: critical
          component: sla
          oncall: true
        annotations:
          summary: "SLA availability violation: {{ $value | humanizePercentage }}"
          description: |
            30-day availability is {{ $value | humanizePercentage }}
            (SLA target: 99.9%)

            Immediate investigation required.

      # CRITICAL: SLA Violation - Latency
      - alert: VopSlaLatencyViolation
        expr: |
          histogram_quantile(0.95,
            rate(vop_request_duration_seconds_bucket[30d])
          ) > 2.0
        for: 15m
        labels:
          severity: critical
          component: sla
          oncall: true
        annotations:
          summary: "SLA latency violation: p95={{ $value }}s"
          description: |
            30-day p95 latency is {{ $value }}s (SLA target: <2s)

            Performance optimization needed.
```

### 4.2 Warning Alerts (Slack)

**File: `/etc/prometheus/alerts/warnings.yml`**

```yaml
groups:
  - name: vop_warnings
    interval: 1m
    rules:
      # WARNING: High Latency
      - alert: VopHighLatency
        expr: |
          histogram_quantile(0.95,
            rate(vop_request_duration_seconds_bucket[5m])
          ) > 1.5
        for: 10m
        labels:
          severity: warning
          component: performance
        annotations:
          summary: "High latency detected: p95={{ $value }}s"
          description: |
            P95 latency for {{ $labels.endpoint }} is {{ $value }}s
            (threshold: 1.5s)

      # WARNING: Rate Limit Abuse
      - alert: VopRateLimitAbuse
        expr: |
          rate(vop_rate_limit_exceeded_total[5m]) > 1
        for: 15m
        labels:
          severity: warning
          component: rate_limiter
        annotations:
          summary: "Client {{ $labels.client_id }} frequently exceeds rate limits"
          description: |
            Client {{ $labels.client_id }} (tier: {{ $labels.tier }})
            is hitting rate limits {{ $value }} times per second.

            May need tier upgrade or investigation for abuse.

      # WARNING: Low Match Rate
      - alert: VopLowMatchRate
        expr: |
          (
            sum(increase(vop_verification_results_total{status="MATCH"}[1h]))
            /
            sum(increase(vop_verification_results_total[1h]))
          ) < 0.70
        for: 30m
        labels:
          severity: warning
          component: business
        annotations:
          summary: "Low match rate: {{ $value | humanizePercentage }}"
          description: |
            Only {{ $value | humanizePercentage }} of verifications resulted in MATCH
            over the last hour (expected: >70%).

            Investigate data quality issues.

      # WARNING: Certificate Expiring
      - alert: VopCertificateExpiringWarning
        expr: vop_certificate_expiry_days < 30 and vop_certificate_expiry_days >= 7
        for: 6h
        labels:
          severity: warning
          component: security
        annotations:
          summary: "Certificate for {{ $labels.client_id }} expires in {{ $value }} days"
          description: |
            Start planning certificate renewal for {{ $labels.client_id }}.

      # WARNING: High Memory Usage
      - alert: VopHighMemoryUsage
        expr: |
          (
            vop_memory_usage_bytes{type="heap"}
            /
            vop_memory_usage_bytes{type="heap_max"}
          ) > 0.85
        for: 15m
        labels:
          severity: warning
          component: system
        annotations:
          summary: "High memory usage: {{ $value | humanizePercentage }}"
          description: |
            Component {{ $labels.component }} is using {{ $value | humanizePercentage }}
            of available heap memory.

      # WARNING: Database Slow Queries
      - alert: VopDatabaseSlowQueries
        expr: |
          histogram_quantile(0.95,
            rate(vop_db_query_duration_seconds_bucket[5m])
          ) > 0.5
        for: 10m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Slow database queries detected"
          description: |
            P95 query time for {{ $labels.query_type }} on {{ $labels.table }}
            is {{ $value }}s (threshold: 0.5s)

      # WARNING: Directory Service Cache Miss Rate
      - alert: VopDirectoryCacheMissRate
        expr: |
          (
            rate(vop_directory_cache_misses_total[5m])
            /
            (
              rate(vop_directory_cache_hits_total[5m])
              +
              rate(vop_directory_cache_misses_total[5m])
            )
          ) > 0.3
        for: 20m
        labels:
          severity: warning
          component: directory
        annotations:
          summary: "High cache miss rate: {{ $value | humanizePercentage }}"
          description: |
            Directory Service cache miss rate is {{ $value | humanizePercentage }}
            (threshold: 30%). Consider increasing cache size or TTL.
```

### 4.3 Info Alerts (Email)

```yaml
groups:
  - name: vop_info
    interval: 5m
    rules:
      # INFO: Daily Report
      - alert: VopDailyReport
        expr: |
          hour() == 8 and minute() < 5
        labels:
          severity: info
          component: reporting
        annotations:
          summary: "Daily VoP Report"
          description: |
            Yesterday's statistics:
            - Total requests: {{ query "sum(increase(vop_requests_total[24h] offset 24h))" }}
            - Match rate: {{ query "(sum(increase(vop_verification_results_total{status=\"MATCH\"}[24h] offset 24h)) / sum(increase(vop_verification_results_total[24h] offset 24h))) * 100" }}%
            - Prevented errors: {{ query "sum(increase(vop_transactions_prevented_errors[24h] offset 24h))" }}
            - Estimated savings: ₴{{ query "sum(increase(vop_estimated_savings_uah[24h] offset 24h))" }}

      # INFO: New Participant Joined
      - alert: VopNewParticipant
        expr: |
          increase(vop_directory_entries_total[1h]) > 0
        labels:
          severity: info
          component: directory
        annotations:
          summary: "New participant registered in Directory Service"
          description: |
            A new {{ $labels.entry_type }} has been added to the Directory Service.

      # INFO: Unusual Traffic Pattern
      - alert: VopUnusualTrafficPattern
        expr: |
          abs(
            rate(vop_requests_total[1h])
            -
            avg_over_time(rate(vop_requests_total[1h])[7d:1h])
          ) / avg_over_time(rate(vop_requests_total[1h])[7d:1h]) > 2
        for: 2h
        labels:
          severity: info
          component: analytics
        annotations:
          summary: "Unusual traffic pattern detected"
          description: |
            Current traffic is {{ $value }}x the 7-day average.
            This may indicate a business event or potential issue.
```

### 4.4 AlertManager Configuration

**File: `/etc/alertmanager/alertmanager.yml`**

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

# Routing tree
route:
  receiver: 'default'
  group_by: ['alertname', 'component']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Critical alerts → PagerDuty
    - match:
        severity: critical
      receiver: pagerduty
      group_wait: 10s
      repeat_interval: 1h
      continue: true  # Also send to Slack

    # Critical alerts → Slack (urgent channel)
    - match:
        severity: critical
      receiver: slack-critical
      group_wait: 10s

    # Warning alerts → Slack (monitoring channel)
    - match:
        severity: warning
      receiver: slack-warnings

    # Info alerts → Email
    - match:
        severity: info
      receiver: email-reports

# Receivers
receivers:
  - name: 'default'
    slack_configs:
      - channel: '#vop-monitoring'
        title: 'VoP Alert'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_SERVICE_KEY>'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ .Alerts.Firing | len }}'
          resolved: '{{ .Alerts.Resolved | len }}'
          description: '{{ .CommonAnnotations.description }}'

  - name: 'slack-critical'
    slack_configs:
      - channel: '#vop-critical-alerts'
        color: 'danger'
        title: ':rotating_light: CRITICAL: {{ .GroupLabels.alertname }}'
        text: |
          *Summary:* {{ .CommonAnnotations.summary }}
          *Description:* {{ .CommonAnnotations.description }}
          *Dashboard:* {{ .CommonAnnotations.dashboard }}
          *Runbook:* {{ .CommonAnnotations.runbook }}
        actions:
          - type: button
            text: 'View Dashboard'
            url: '{{ .CommonAnnotations.dashboard }}'
          - type: button
            text: 'Runbook'
            url: '{{ .CommonAnnotations.runbook }}'

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#vop-monitoring'
        color: 'warning'
        title: ':warning: Warning: {{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.description }}'

  - name: 'email-reports'
    email_configs:
      - to: 'vop-ops@bank.gov.ua'
        from: 'alertmanager@vop.bank.gov.ua'
        smarthost: 'smtp.bank.gov.ua:587'
        auth_username: 'alertmanager@vop.bank.gov.ua'
        auth_password: '<SMTP_PASSWORD>'
        headers:
          Subject: 'VoP Info: {{ .GroupLabels.alertname }}'

# Inhibition rules (suppress less severe alerts when more severe are firing)
inhibit_rules:
  # If Router is down, suppress all other Router alerts
  - source_match:
      alertname: 'VopRouterDown'
    target_match:
      component: 'router'
    equal: ['instance']

  # If high error rate, suppress individual error alerts
  - source_match:
      alertname: 'VopHighErrorRate'
    target_match_re:
      alertname: 'Vop.*Error'
```

---

## 5. ELK Stack для логів

### 5.1 Filebeat Configuration

**File: `/etc/filebeat/filebeat.yml`**

```yaml
filebeat.inputs:
  # VoP Router logs
  - type: log
    enabled: true
    paths:
      - /var/log/vop/router/*.log
      - /var/log/vop/router/*/*.log
    fields:
      app: vop-router
      environment: production
    fields_under_root: true
    json.keys_under_root: true
    json.add_error_key: true
    multiline.pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    multiline.negate: true
    multiline.match: after

  # NGINX access logs
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/vop-access.log
    fields:
      app: nginx
      log_type: access
    json.keys_under_root: true

  # NGINX error logs
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/vop-error.log
    fields:
      app: nginx
      log_type: error

  # Application logs (JSON structured)
  - type: log
    enabled: true
    paths:
      - /var/log/vop/app/*.json
    fields:
      app: vop-application
    json.keys_under_root: true
    json.overwrite_keys: true

  # Audit logs (security events)
  - type: log
    enabled: true
    paths:
      - /var/log/vop/audit/*.log
    fields:
      app: vop-audit
      log_category: security
    json.keys_under_root: true

# Filebeat modules
filebeat.modules:
  - module: system
    syslog:
      enabled: true
    auth:
      enabled: true

# Processors
processors:
  - add_host_metadata:
      when.not.contains.tags: forwarded
  - add_cloud_metadata: ~
  - add_docker_metadata: ~
  - add_kubernetes_metadata: ~

  # Drop debug logs in production
  - drop_event:
      when:
        and:
          - equals:
              log.level: "debug"
          - equals:
              environment: "production"

  # Add timestamp
  - timestamp:
      field: json.timestamp
      layouts:
        - '2006-01-02T15:04:05Z'
        - '2006-01-02T15:04:05.999Z'
      test:
        - '2024-01-15T14:32:15Z'

# Output to Logstash
output.logstash:
  hosts: ["logstash-01.vop.bank.gov.ua:5044", "logstash-02.vop.bank.gov.ua:5044"]
  loadbalance: true
  ssl.certificate_authorities: ["/etc/filebeat/ca.crt"]
  ssl.certificate: "/etc/filebeat/filebeat.crt"
  ssl.key: "/etc/filebeat/filebeat.key"

# Logging
logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
  permissions: 0644
```

### 5.2 Logstash Pipeline

**File: `/etc/logstash/conf.d/vop-pipeline.conf`**

```ruby
# Input from Filebeat
input {
  beats {
    port => 5044
    ssl => true
    ssl_certificate => "/etc/logstash/logstash.crt"
    ssl_key => "/etc/logstash/logstash.key"
    ssl_certificate_authorities => ["/etc/logstash/ca.crt"]
  }
}

# Filters
filter {
  # Parse VoP application logs
  if [app] == "vop-application" or [app] == "vop-router" {
    json {
      source => "message"
      target => "parsed"
    }

    # Extract fields
    mutate {
      rename => {
        "[parsed][level]" => "log_level"
        "[parsed][timestamp]" => "@timestamp"
        "[parsed][requestId]" => "request_id"
        "[parsed][clientId]" => "client_id"
        "[parsed][duration]" => "duration_ms"
        "[parsed][statusCode]" => "status_code"
      }
    }

    # Convert types
    mutate {
      convert => {
        "duration_ms" => "float"
        "status_code" => "integer"
      }
    }

    # Add latency category
    if [duration_ms] {
      if [duration_ms] < 100 {
        mutate { add_field => { "latency_category" => "fast" } }
      } else if [duration_ms] < 500 {
        mutate { add_field => { "latency_category" => "normal" } }
      } else if [duration_ms] < 2000 {
        mutate { add_field => { "latency_category" => "slow" } }
      } else {
        mutate { add_field => { "latency_category" => "very_slow" } }
      }
    }

    # Classify HTTP status
    if [status_code] {
      if [status_code] >= 200 and [status_code] < 300 {
        mutate { add_field => { "status_category" => "success" } }
      } else if [status_code] >= 400 and [status_code] < 500 {
        mutate { add_field => { "status_category" => "client_error" } }
      } else if [status_code] >= 500 {
        mutate { add_field => { "status_category" => "server_error" } }
      }
    }
  }

  # Parse NGINX access logs
  if [app] == "nginx" and [log_type] == "access" {
    grok {
      match => {
        "message" => '%{IPORHOST:client_ip} - %{DATA:client_id} \[%{HTTPDATE:timestamp}\] "%{WORD:http_method} %{DATA:request_path} HTTP/%{NUMBER:http_version}" %{NUMBER:status_code} %{NUMBER:bytes_sent} "%{DATA:referer}" "%{DATA:user_agent}" %{NUMBER:request_time:float}'
      }
    }

    date {
      match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
      target => "@timestamp"
    }

    mutate {
      convert => {
        "status_code" => "integer"
        "bytes_sent" => "integer"
        "request_time" => "float"
      }
    }

    # GeoIP lookup
    geoip {
      source => "client_ip"
      target => "geo"
    }
  }

  # Parse audit logs (security events)
  if [app] == "vop-audit" {
    json {
      source => "message"
    }

    # Add security event type
    mutate {
      add_field => { "event_type" => "security_audit" }
    }

    # Flag suspicious activities
    if [event] == "auth_failure" or [event] == "rate_limit_exceeded" {
      mutate {
        add_tag => [ "suspicious" ]
      }
    }
  }

  # Remove unnecessary fields
  mutate {
    remove_field => [ "[parsed]", "message", "beat", "prospector" ]
  }
}

# Output to Elasticsearch
output {
  elasticsearch {
    hosts => ["es-01.vop.bank.gov.ua:9200", "es-02.vop.bank.gov.ua:9200", "es-03.vop.bank.gov.ua:9200"]
    index => "vop-%{[app]}-%{+YYYY.MM.dd}"
    user => "logstash_writer"
    password => "${ELASTICSEARCH_PASSWORD}"
    ssl => true
    cacert => "/etc/logstash/es-ca.crt"

    # ILM policy
    ilm_enabled => true
    ilm_rollover_alias => "vop-logs"
    ilm_pattern => "{now/d}-000001"
    ilm_policy => "vop-logs-policy"
  }

  # Also output critical errors to separate index for alerts
  if [log_level] == "ERROR" or [log_level] == "CRITICAL" or "suspicious" in [tags] {
    elasticsearch {
      hosts => ["es-01.vop.bank.gov.ua:9200"]
      index => "vop-errors-%{+YYYY.MM.dd}"
      user => "logstash_writer"
      password => "${ELASTICSEARCH_PASSWORD}"
    }
  }
}
```

### 5.3 Elasticsearch Index Template

```json
{
  "index_patterns": ["vop-*"],
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "index.codec": "best_compression",
    "index.refresh_interval": "5s",
    "index.query.default_field": ["message", "error", "stack_trace"]
  },
  "mappings": {
    "properties": {
      "@timestamp": {"type": "date"},
      "log_level": {
        "type": "keyword",
        "fields": {
          "text": {"type": "text"}
        }
      },
      "app": {"type": "keyword"},
      "environment": {"type": "keyword"},
      "request_id": {"type": "keyword"},
      "client_id": {"type": "keyword"},
      "client_ip": {"type": "ip"},
      "duration_ms": {"type": "float"},
      "status_code": {"type": "short"},
      "latency_category": {"type": "keyword"},
      "status_category": {"type": "keyword"},
      "http_method": {"type": "keyword"},
      "request_path": {"type": "keyword"},
      "error": {"type": "text"},
      "stack_trace": {"type": "text"},
      "geo": {
        "properties": {
          "location": {"type": "geo_point"},
          "country_name": {"type": "keyword"},
          "city_name": {"type": "keyword"}
        }
      }
    }
  }
}
```

### 5.4 ILM Policy (Index Lifecycle Management)

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "1d"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          },
          "set_priority": {
            "priority": 50
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "freeze": {},
          "set_priority": {
            "priority": 0
          }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### 5.5 Kibana Dashboards & Searches

**Saved Search: "VoP Critical Errors"**

```
app:vop-* AND (log_level:ERROR OR log_level:CRITICAL)
| sort @timestamp desc
```

**Saved Search: "VoP Slow Requests"**

```
app:vop-router AND duration_ms:>2000
| sort duration_ms desc
```

**Saved Search: "Authentication Failures"**

```
app:vop-audit AND event:auth_failure
| stats count by client_id
```

**Dashboard: "VoP Logs Overview"**
- Visualization 1: Log level distribution (pie chart)
- Visualization 2: Requests per minute (line chart)
- Visualization 3: Top errors (data table)
- Visualization 4: Latency heatmap (heatmap)
- Visualization 5: Geographic distribution of requests (coordinate map)

---

## 6. Performance Monitoring

### 6.1 Application Performance Monitoring (APM)

**Elastic APM Integration:**

```python
# apm_integration.py
from elasticapm import Client
from elasticapm.contrib.flask import ElasticAPM

# Initialize APM client
apm = ElasticAPM(app, config={
    'SERVICE_NAME': 'vop-router',
    'SERVER_URL': 'https://apm.vop.bank.gov.ua',
    'SECRET_TOKEN': '<APM_SECRET_TOKEN>',
    'ENVIRONMENT': 'production',
    'TRANSACTION_SAMPLE_RATE': 0.1,  # Sample 10% of transactions
    'CAPTURE_BODY': 'errors',  # Capture request body on errors
    'CAPTURE_HEADERS': True
})

# Custom transaction
@app.route('/vop/v1/verify', methods=['POST'])
def verify():
    # APM automatically traces this
    with apm.capture_span('name_matching', span_type='app.algorithm'):
        match_result = perform_name_matching(...)

    with apm.capture_span('database_query', span_type='db.postgresql'):
        db_result = query_database(...)

    return jsonify(result)
```

### 6.2 Database Performance Monitoring

**pg_stat_statements для PostgreSQL:**

```sql
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT
    query,
    calls,
    mean_exec_time,
    max_exec_time,
    stddev_exec_time
FROM pg_stat_statements
WHERE query LIKE '%vop_%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Queries with high variance (unpredictable performance)
SELECT
    query,
    calls,
    mean_exec_time,
    stddev_exec_time,
    (stddev_exec_time / NULLIF(mean_exec_time, 0)) AS coefficient_of_variation
FROM pg_stat_statements
WHERE calls > 100
ORDER BY coefficient_of_variation DESC
LIMIT 10;

-- Create monitoring view
CREATE VIEW vop_query_performance AS
SELECT
    substring(query, 1, 100) AS query_preview,
    calls,
    total_exec_time / 1000 AS total_seconds,
    mean_exec_time AS avg_ms,
    min_exec_time AS min_ms,
    max_exec_time AS max_ms,
    rows / NULLIF(calls, 0) AS avg_rows_per_call
FROM pg_stat_statements
WHERE query LIKE '%vop_%'
ORDER BY total_exec_time DESC;
```

**Export to Prometheus:**

```python
# db_metrics_exporter.py
import psycopg2
from prometheus_client import Gauge

db_slow_queries_count = Gauge(
    'vop_db_slow_queries_count',
    'Number of slow queries (>500ms)',
    ['query_type']
)

def export_db_metrics():
    """Export PostgreSQL metrics to Prometheus."""
    conn = psycopg2.connect(DB_CONNECTION_STRING)
    cur = conn.cursor()

    # Count slow queries
    cur.execute("""
        SELECT
            CASE
                WHEN query LIKE '%iban_directory%' THEN 'directory_lookup'
                WHEN query LIKE '%transactions%' THEN 'transaction'
                ELSE 'other'
            END AS query_type,
            COUNT(*) AS count
        FROM pg_stat_statements
        WHERE mean_exec_time > 500
        GROUP BY query_type
    """)

    for row in cur.fetchall():
        query_type, count = row
        db_slow_queries_count.labels(query_type=query_type).set(count)

    cur.close()
    conn.close()

# Run every 5 minutes
import schedule
schedule.every(5).minutes.do(export_db_metrics)
```

---

## 7. Business Analytics

### 7.1 Analytics Database Schema

```sql
-- analytics_schema.sql

-- Aggregated daily statistics
CREATE TABLE vop_daily_stats (
    date DATE PRIMARY KEY,
    total_requests INTEGER NOT NULL,
    match_count INTEGER NOT NULL,
    close_match_count INTEGER NOT NULL,
    no_match_count INTEGER NOT NULL,
    error_count INTEGER NOT NULL,
    avg_response_time_ms FLOAT,
    p95_response_time_ms FLOAT,
    p99_response_time_ms FLOAT,
    unique_requesters INTEGER,
    unique_responders INTEGER,
    prevented_errors INTEGER,
    estimated_savings_uah DECIMAL(15, 2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Per-participant statistics
CREATE TABLE vop_participant_stats (
    date DATE NOT NULL,
    participant_id VARCHAR(50) NOT NULL,
    participant_type VARCHAR(20) NOT NULL, -- requester, responder
    request_count INTEGER NOT NULL,
    match_rate FLOAT,
    avg_response_time_ms FLOAT,
    error_rate FLOAT,
    rate_limit_violations INTEGER,
    PRIMARY KEY (date, participant_id, participant_type)
);

-- Hourly aggregates (for trend analysis)
CREATE TABLE vop_hourly_stats (
    timestamp TIMESTAMP NOT NULL,
    requests_count INTEGER NOT NULL,
    match_rate FLOAT,
    avg_response_time_ms FLOAT,
    PRIMARY KEY (timestamp)
);

-- Match score distribution (for algorithm tuning)
CREATE TABLE vop_match_score_histogram (
    date DATE NOT NULL,
    score_bucket INTEGER NOT NULL, -- 0-10, 11-20, ..., 91-100
    count INTEGER NOT NULL,
    PRIMARY KEY (date, score_bucket)
);

-- Top errors (for prioritizing fixes)
CREATE TABLE vop_error_summary (
    date DATE NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    count INTEGER NOT NULL,
    affected_clients TEXT[], -- Array of client IDs
    PRIMARY KEY (date, error_type)
);

-- Indexes
CREATE INDEX idx_participant_stats_date ON vop_participant_stats(date);
CREATE INDEX idx_hourly_stats_timestamp ON vop_hourly_stats(timestamp);
```

### 7.2 Analytics Aggregation Jobs

```python
# analytics_aggregator.py
from datetime import datetime, timedelta
import psycopg2

class VopAnalyticsAggregator:
    """
    Агрегує дані з Prometheus та logs у analytics DB.
    Виконується щодня о 01:00 для попереднього дня.
    """

    def __init__(self, prometheus_url, analytics_db_conn):
        self.prometheus_url = prometheus_url
        self.db_conn = analytics_db_conn

    def aggregate_daily_stats(self, target_date):
        """
        Агрегує денні статистики з Prometheus.
        """
        # Query Prometheus for yesterday's data
        queries = {
            'total_requests': f'sum(increase(vop_requests_total[24h] @ end()))',
            'match_count': f'sum(increase(vop_verification_results_total{{status="MATCH"}}[24h] @ end()))',
            'close_match_count': f'sum(increase(vop_verification_results_total{{status="CLOSE_MATCH"}}[24h] @ end()))',
            'no_match_count': f'sum(increase(vop_verification_results_total{{status="NO_MATCH"}}[24h] @ end()))',
            'error_count': f'sum(increase(vop_errors_total[24h] @ end()))',
            'avg_response_time_ms': f'avg(rate(vop_request_duration_seconds_sum[24h] @ end()) / rate(vop_request_duration_seconds_count[24h] @ end())) * 1000',
            'p95_response_time_ms': f'histogram_quantile(0.95, rate(vop_request_duration_seconds_bucket[24h] @ end())) * 1000',
            'p99_response_time_ms': f'histogram_quantile(0.99, rate(vop_request_duration_seconds_bucket[24h] @ end())) * 1000',
            'unique_requesters': f'count(count by (client_id) (increase(vop_requests_total[24h] @ end()) > 0))',
            'prevented_errors': f'sum(increase(vop_transactions_prevented_errors[24h] @ end()))',
            'estimated_savings_uah': f'sum(increase(vop_estimated_savings_uah[24h] @ end()))'
        }

        results = {}
        for metric_name, query in queries.items():
            value = self._query_prometheus(query, target_date)
            results[metric_name] = value

        # Insert into analytics DB
        cur = self.db_conn.cursor()
        cur.execute("""
            INSERT INTO vop_daily_stats (
                date, total_requests, match_count, close_match_count,
                no_match_count, error_count, avg_response_time_ms,
                p95_response_time_ms, p99_response_time_ms,
                unique_requesters, unique_responders,
                prevented_errors, estimated_savings_uah
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (date) DO UPDATE SET
                total_requests = EXCLUDED.total_requests,
                match_count = EXCLUDED.match_count,
                -- ... update all fields
        """, (
            target_date,
            results.get('total_requests', 0),
            results.get('match_count', 0),
            results.get('close_match_count', 0),
            results.get('no_match_count', 0),
            results.get('error_count', 0),
            results.get('avg_response_time_ms', 0),
            results.get('p95_response_time_ms', 0),
            results.get('p99_response_time_ms', 0),
            results.get('unique_requesters', 0),
            results.get('unique_responders', 0),
            results.get('prevented_errors', 0),
            results.get('estimated_savings_uah', 0)
        ))
        self.db_conn.commit()
        cur.close()

    def generate_monthly_report(self, year, month):
        """
        Генерує місячний звіт для NBU.
        """
        cur = self.db_conn.cursor()
        cur.execute("""
            SELECT
                DATE_TRUNC('month', date) AS month,
                SUM(total_requests) AS total_requests,
                AVG(match_rate) AS avg_match_rate,
                SUM(prevented_errors) AS total_prevented_errors,
                SUM(estimated_savings_uah) AS total_savings,
                AVG(p95_response_time_ms) AS avg_p95_latency
            FROM (
                SELECT
                    date,
                    total_requests,
                    (match_count::FLOAT / NULLIF(total_requests, 0)) AS match_rate,
                    prevented_errors,
                    estimated_savings_uah,
                    p95_response_time_ms
                FROM vop_daily_stats
                WHERE date >= %s AND date < %s
            ) sub
            GROUP BY month
        """, (
            f"{year}-{month:02d}-01",
            f"{year}-{month+1:02d}-01" if month < 12 else f"{year+1}-01-01"
        ))

        report = cur.fetchone()
        cur.close()

        return {
            'month': f"{year}-{month:02d}",
            'total_requests': report[1],
            'avg_match_rate': round(report[2] * 100, 2),
            'total_prevented_errors': report[3],
            'total_savings_uah': float(report[4]),
            'avg_p95_latency_ms': round(report[5], 2)
        }
```

### 7.3 Business Intelligence Queries

```sql
-- 1. Тренд використання системи (growth rate)
WITH monthly_stats AS (
    SELECT
        DATE_TRUNC('month', date) AS month,
        SUM(total_requests) AS requests
    FROM vop_daily_stats
    GROUP BY month
    ORDER BY month
)
SELECT
    month,
    requests,
    LAG(requests) OVER (ORDER BY month) AS prev_month_requests,
    ROUND(
        ((requests - LAG(requests) OVER (ORDER BY month))::FLOAT
         / NULLIF(LAG(requests) OVER (ORDER BY month), 0)) * 100,
        2
    ) AS growth_rate_percent
FROM monthly_stats;

-- 2. Top 10 найактивніших учасників
SELECT
    participant_id,
    participant_type,
    SUM(request_count) AS total_requests,
    AVG(match_rate) * 100 AS avg_match_rate_percent,
    AVG(avg_response_time_ms) AS avg_latency_ms
FROM vop_participant_stats
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY participant_id, participant_type
ORDER BY total_requests DESC
LIMIT 10;

-- 3. Пікові години використання
SELECT
    EXTRACT(HOUR FROM timestamp) AS hour_of_day,
    AVG(requests_count) AS avg_requests,
    MAX(requests_count) AS peak_requests
FROM vop_hourly_stats
WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY hour_of_day
ORDER BY hour_of_day;

-- 4. ROI розрахунок (порівняння з baseline)
WITH baseline AS (
    SELECT 100000 AS daily_errors_baseline, -- До впровадження VoP
           500 AS avg_loss_per_error_uah
),
current_metrics AS (
    SELECT
        AVG(prevented_errors) AS avg_daily_prevented
    FROM vop_daily_stats
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
    baseline.daily_errors_baseline - current_metrics.avg_daily_prevented AS improvement,
    (current_metrics.avg_daily_prevented * baseline.avg_loss_per_error_uah * 365) AS annual_savings_uah
FROM baseline, current_metrics;

-- 5. Quality score per participant (для tier assignment)
SELECT
    participant_id,
    AVG(match_rate) * 100 AS avg_match_rate,
    AVG(error_rate) * 100 AS avg_error_rate,
    AVG(avg_response_time_ms) AS avg_latency_ms,
    SUM(rate_limit_violations) AS total_violations,
    -- Composite quality score (0-100)
    (
        (AVG(match_rate) * 40) +  -- 40% weight on match rate
        ((1 - AVG(error_rate)) * 30) +  -- 30% weight on low error rate
        (CASE
            WHEN AVG(avg_response_time_ms) < 500 THEN 30
            WHEN AVG(avg_response_time_ms) < 1000 THEN 20
            WHEN AVG(avg_response_time_ms) < 2000 THEN 10
            ELSE 0
        END)  -- 30% weight on low latency
    ) AS quality_score
FROM vop_participant_stats
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY participant_id
ORDER BY quality_score DESC;
```

---

## 8. SLA Monitoring

### 8.1 SLA Definitions

**VoP System SLA Targets:**

| Метрика | Target | Measurement Period |
|---------|--------|--------------------|
| **Availability** | 99.9% | Monthly (43.2 min downtime/month) |
| **Latency (p95)** | < 2 seconds | Daily rolling average |
| **Latency (p99)** | < 5 seconds | Daily rolling average |
| **Error Rate** | < 0.1% | Daily |
| **Successful Verifications** | > 99.5% | Daily |
| **Directory Lookup Time** | < 100ms (p95) | Hourly |
| **Certificate Renewal** | 30 days notice | Continuous |

### 8.2 SLA Tracking Dashboard

**Grafana SLA Dashboard:**

```json
{
  "dashboard": {
    "title": "VoP SLA Compliance",
    "panels": [
      {
        "id": 1,
        "title": "Monthly Availability (Target: 99.9%)",
        "type": "gauge",
        "targets": [
          {
            "expr": "(1 - (sum(increase(vop_downtime_seconds_total[30d])) / (30 * 24 * 3600))) * 100",
            "legendFormat": "Availability %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                {"value": 0, "color": "red"},
                {"value": 99.5, "color": "yellow"},
                {"value": 99.9, "color": "green"}
              ]
            },
            "unit": "percent",
            "max": 100,
            "min": 99
          }
        }
      },
      {
        "id": 2,
        "title": "SLA Compliance Score",
        "type": "stat",
        "targets": [
          {
            "expr": "avg(vop_sla_compliance_ratio) * 100"
          }
        ]
      },
      {
        "id": 3,
        "title": "SLA Violations (Last 30 days)",
        "type": "table",
        "targets": [
          {
            "expr": "sum by (sla_metric) (increase(vop_sla_violations_total[30d]))",
            "format": "table"
          }
        ]
      }
    ]
  }
}
```

### 8.3 SLA Reporting Automation

```python
# sla_reporter.py
from datetime import datetime, timedelta
import json

class SlaReporter:
    """
    Автоматична генерація SLA звітів для NBU та учасників.
    """

    SLA_TARGETS = {
        'availability': 0.999,
        'latency_p95': 2.0,  # seconds
        'latency_p99': 5.0,
        'error_rate': 0.001,  # 0.1%
        'success_rate': 0.995
    }

    def generate_monthly_sla_report(self, year, month):
        """
        Генерує місячний SLA звіт.
        """
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)

        # Fetch metrics from Prometheus
        metrics = self._fetch_monthly_metrics(start_date, end_date)

        # Calculate SLA compliance
        compliance = {
            'availability': {
                'target': self.SLA_TARGETS['availability'] * 100,
                'actual': metrics['availability'],
                'compliant': metrics['availability'] >= self.SLA_TARGETS['availability'] * 100,
                'downtime_minutes': metrics['downtime_seconds'] / 60
            },
            'latency_p95': {
                'target': self.SLA_TARGETS['latency_p95'],
                'actual': metrics['latency_p95'],
                'compliant': metrics['latency_p95'] <= self.SLA_TARGETS['latency_p95']
            },
            'error_rate': {
                'target': self.SLA_TARGETS['error_rate'] * 100,
                'actual': metrics['error_rate'],
                'compliant': metrics['error_rate'] <= self.SLA_TARGETS['error_rate'] * 100
            }
        }

        # Overall compliance
        all_compliant = all(m['compliant'] for m in compliance.values())

        report = {
            'period': f"{year}-{month:02d}",
            'generated_at': datetime.utcnow().isoformat(),
            'overall_compliant': all_compliant,
            'metrics': compliance,
            'incidents': self._fetch_incidents(start_date, end_date),
            'summary': self._generate_summary(compliance, metrics)
        }

        # Save report
        self._save_report(report, year, month)

        # Send notifications if SLA violated
        if not all_compliant:
            self._notify_sla_violation(report)

        return report

    def _generate_summary(self, compliance, metrics):
        """
        Генерує текстовий summary звіту.
        """
        violations = [k for k, v in compliance.items() if not v['compliant']]

        if not violations:
            return "✅ All SLA targets met this month. Excellent performance!"

        summary = f"⚠️ SLA violations detected: {', '.join(violations)}\n\n"
        summary += f"Total requests: {metrics['total_requests']:,}\n"
        summary += f"Successful verifications: {metrics['success_rate']}%\n"
        summary += f"Average response time: {metrics['avg_latency_ms']:.0f}ms\n"

        return summary

    def _fetch_monthly_metrics(self, start_date, end_date):
        """
        Fetch metrics from Prometheus for the given period.
        """
        # Implementation: Query Prometheus API
        # Return aggregated metrics
        pass

    def _notify_sla_violation(self, report):
        """
        Надсилає notification при порушенні SLA.
        """
        # Send email to NBU management
        # Post to Slack
        # Create incident ticket
        pass
```

---

## 9. Incident Response Integration

### 9.1 Incident Classification

```yaml
# incident_classification.yml
incident_severity_levels:
  P1_CRITICAL:
    description: "Complete service outage or data loss"
    response_time: "15 minutes"
    resolution_time: "4 hours"
    escalation: "Immediate - CTO + NBU Management"
    examples:
      - VoP Router completely down
      - Database corruption
      - Security breach

  P2_HIGH:
    description: "Significant degradation affecting multiple participants"
    response_time: "30 minutes"
    resolution_time: "8 hours"
    escalation: "After 1 hour - Senior Engineering"
    examples:
      - High error rate (>5%)
      - Latency >10s
      - Multiple participant outages

  P3_MEDIUM:
    description: "Isolated issues affecting single participant or feature"
    response_time: "2 hours"
    resolution_time: "24 hours"
    escalation: "After 4 hours - Team Lead"
    examples:
      - Single participant certificate issues
      - Slow queries
      - Cache failures

  P4_LOW:
    description: "Minor issues, no immediate impact"
    response_time: "1 business day"
    resolution_time: "1 week"
    escalation: "None"
    examples:
      - Low match rate for specific participant
      - Minor UI bugs
      - Documentation updates
```

### 9.2 Automated Incident Creation

```python
# incident_automation.py
import requests
from datetime import datetime

class IncidentManager:
    """
    Автоматичне створення та управління інцидентами.
    Інтеграція з PagerDuty, Jira, та Slack.
    """

    SEVERITY_MAP = {
        'critical': 'P1_CRITICAL',
        'warning': 'P3_MEDIUM',
        'info': 'P4_LOW'
    }

    def create_incident_from_alert(self, alert):
        """
        Створює incident на основі Prometheus alert.
        """
        severity = self.SEVERITY_MAP.get(alert['labels'].get('severity'), 'P4_LOW')

        incident = {
            'title': alert['annotations']['summary'],
            'description': alert['annotations']['description'],
            'severity': severity,
            'source': 'prometheus',
            'alert_name': alert['labels']['alertname'],
            'component': alert['labels'].get('component', 'unknown'),
            'started_at': alert['startsAt'],
            'status': 'open',
            'metadata': alert['labels']
        }

        # Create in PagerDuty
        if severity in ['P1_CRITICAL', 'P2_HIGH']:
            pagerduty_incident = self._create_pagerduty_incident(incident)
            incident['pagerduty_id'] = pagerduty_incident['id']

        # Create Jira ticket
        jira_ticket = self._create_jira_ticket(incident)
        incident['jira_key'] = jira_ticket['key']

        # Post to Slack
        self._post_to_slack(incident)

        # Store in incident database
        self._store_incident(incident)

        return incident

    def _create_pagerduty_incident(self, incident):
        """
        Creates incident in PagerDuty.
        """
        payload = {
            'incident': {
                'type': 'incident',
                'title': incident['title'],
                'service': {
                    'id': 'PVOP_SERVICE_ID',
                    'type': 'service_reference'
                },
                'urgency': 'high' if 'CRITICAL' in incident['severity'] else 'low',
                'body': {
                    'type': 'incident_body',
                    'details': incident['description']
                }
            }
        }

        headers = {
            'Authorization': f'Token token={PAGERDUTY_API_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.pagerduty+json;version=2'
        }

        response = requests.post(
            'https://api.pagerduty.com/incidents',
            json=payload,
            headers=headers
        )

        return response.json()['incident']

    def _create_jira_ticket(self, incident):
        """
        Creates Jira ticket for incident tracking.
        """
        payload = {
            'fields': {
                'project': {'key': 'VOP'},
                'summary': incident['title'],
                'description': incident['description'],
                'issuetype': {'name': 'Incident'},
                'priority': {'name': self._map_severity_to_jira(incident['severity'])},
                'labels': ['vop', 'automated', incident['component']],
                'customfield_10050': incident['started_at']  # Incident start time
            }
        }

        response = requests.post(
            f'{JIRA_URL}/rest/api/2/issue',
            json=payload,
            auth=(JIRA_USERNAME, JIRA_API_TOKEN),
            headers={'Content-Type': 'application/json'}
        )

        return response.json()

    def _post_to_slack(self, incident):
        """
        Posts incident notification to Slack.
        """
        channel = '#vop-incidents' if 'CRITICAL' in incident['severity'] else '#vop-monitoring'
        color = 'danger' if 'CRITICAL' in incident['severity'] else 'warning'

        payload = {
            'channel': channel,
            'username': 'VoP Incident Bot',
            'icon_emoji': ':rotating_light:',
            'attachments': [
                {
                    'color': color,
                    'title': f"{incident['severity']}: {incident['title']}",
                    'text': incident['description'],
                    'fields': [
                        {'title': 'Component', 'value': incident['component'], 'short': True},
                        {'title': 'Started', 'value': incident['started_at'], 'short': True},
                        {'title': 'Jira', 'value': incident.get('jira_key', 'N/A'), 'short': True}
                    ],
                    'footer': 'VoP Monitoring System',
                    'ts': int(datetime.utcnow().timestamp())
                }
            ]
        }

        requests.post(SLACK_WEBHOOK_URL, json=payload)
```

### 9.3 Incident Response Runbooks

**Runbook: VoP Router Down**

```markdown
# Runbook: VoP Router Down

## Severity: P1 CRITICAL

## Symptoms
- Alert: `VopRouterDown`
- All VoP verification requests failing
- Health check endpoint unreachable

## Investigation Steps

1. **Check Router Status**
   ```bash
   # SSH to router hosts
   ssh router-01.vop.bank.gov.ua
   systemctl status vop-router

   # Check logs
   journalctl -u vop-router -n 100 --no-pager
   tail -f /var/log/vop/router/error.log
   ```

2. **Check Load Balancer**
   ```bash
   # Check NGINX status
   systemctl status nginx
   nginx -t  # Test configuration

   # Check upstream health
   curl -k https://localhost/health
   ```

3. **Check Dependencies**
   ```bash
   # PostgreSQL
   pg_isready -h db.vop.bank.gov.ua

   # Redis
   redis-cli -h redis.vop.bank.gov.ua ping
   ```

## Resolution Steps

### Scenario A: Process Crashed
```bash
# Restart service
sudo systemctl restart vop-router

# Monitor logs
journalctl -u vop-router -f
```

### Scenario B: Resource Exhaustion
```bash
# Check resources
free -h
df -h
top

# Clear logs if disk full
find /var/log/vop -type f -name "*.log" -mtime +7 -delete

# Restart with resource limits
sudo systemctl restart vop-router
```

### Scenario C: Database Connection Issues
```bash
# Check connection pool
psql -h db.vop.bank.gov.ua -U vop -c "SELECT count(*) FROM pg_stat_activity;"

# Kill long-running queries
psql -h db.vop.bank.gov.ua -U vop -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';"
```

## Communication

1. **Post to Slack** (#vop-incidents):
   ```
   🚨 INCIDENT: VoP Router Down
   Status: Investigating
   Impact: All verification requests failing
   ETA: TBD
   ```

2. **Email NBU Management** if downtime > 15 minutes

3. **Update Status Page**: https://status.vop.bank.gov.ua

## Post-Incident

1. Document root cause in Jira
2. Schedule post-mortem meeting
3. Update runbook with lessons learned
4. Implement preventive measures

## Escalation

- **Immediate**: @vop-oncall-engineer
- **After 30 min**: @vop-team-lead
- **After 1 hour**: @vop-cto + NBU Management
```

---

## 10. Monitoring Best Practices

### 10.1 Golden Signals (Google SRE)

**Для VoP системи моніторимо:**

1. **Latency** - час відповіді на запити
2. **Traffic** - кількість запитів (RPS)
3. **Errors** - рівень помилок
4. **Saturation** - використання ресурсів (CPU, memory, disk)

### 10.2 Alert Fatigue Prevention

**Strategies:**

- **Prioritize alerts** - тільки actionable alerts генерують notifications
- **Group related alerts** - не спамити окремими alerts для однієї проблеми
- **Use appropriate thresholds** - не trigger на short-term spikes
- **Implement alert inhibition** - suppress lower-priority alerts when critical alert fires
- **Regular alert review** - quarterly review of all alerts, disable noisy ones

### 10.3 Observability Maturity Model

```
Level 1: Basic Monitoring
  ✓ Infrastructure metrics (CPU, memory, disk)
  ✓ Application logs
  ✓ Basic uptime checks

Level 2: Application Performance
  ✓ Request latency tracking
  ✓ Error rate monitoring
  ✓ Database performance
  ✓ Custom business metrics

Level 3: Full Observability (VoP Target)
  ✓ Distributed tracing
  ✓ Real-time alerting
  ✓ Automated incident response
  ✓ SLA tracking and reporting
  ✓ Predictive analytics
  ✓ Capacity planning

Level 4: AI-Driven Operations
  □ Anomaly detection with ML
  □ Auto-remediation
  □ Intelligent alert routing
  □ Predictive failure analysis
```

---

## Висновок

Комплексна система моніторингу та аналітики для VoP включає:

✅ **Prometheus metrics** - 50+ custom метрик для технічних та бізнес-метрик
✅ **Grafana dashboards** - візуалізація в реальному часі
✅ **AlertManager** - багаторівневі alerts (critical, warning, info)
✅ **ELK Stack** - централізоване збирання та аналіз логів
✅ **Performance monitoring** - APM, database query analysis
✅ **Business analytics** - ROI розрахунки, трендовий аналіз
✅ **SLA tracking** - автоматичні звіти про дотримання SLA
✅ **Incident response** - інтеграція з PagerDuty, Jira, Slack

Ця infrastructure забезпечує **повну observability** VoP системи та дозволяє NBU та учасникам:
- Швидко виявляти та вирішувати проблеми
- Відстежувати business impact
- Дотримуватись SLA
- Оптимізувати performance
- Приймати data-driven рішення

**Retention policy** забезпечує баланс між детальністю даних та storage costs, зберігаючи критичні дані до 5 років.
