# Performance Testing для VoP СЕП НБУ

**Версія:** 1.0
**Дата:** 2026-02-07
**Статус:** Draft

---

## Зміст

1. [Огляд](#огляд)
2. [Performance Targets](#performance-targets)
3. [Load Testing](#load-testing)
4. [Stress Testing](#stress-testing)
5. [Endurance Testing](#endurance-testing)
6. [Spike Testing](#spike-testing)
7. [Scalability Testing](#scalability-testing)
8. [Database Performance](#database-performance)
9. [Network Latency Testing](#network-latency-testing)
10. [Tools та Environment](#tools-та-environment)

---

## Огляд

Performance testing для VoP системи є критично важливим, оскільки:
- VoP має обробляти запити за < 1 секунду (для миттєвих переказів)
- Система має підтримувати високий throughput (1000+ req/sec)
- Downtime неприйнятний (99.9% uptime SLA)

**Test Types:**
- **Load Testing** — нормальне навантаження
- **Stress Testing** — понадлімітне навантаження
- **Endurance/Soak Testing** — тривале навантаження
- **Spike Testing** — раптові сплески навантаження
- **Scalability Testing** — здатність до масштабування

---

## Performance Targets

### VoP Router (НБУ)

| Метрика | Target | Maximum | Critical |
|---------|--------|---------|----------|
| **Latency (p50)** | < 200 мс | 500 мс | 1000 мс |
| **Latency (p95)** | < 500 мс | 1000 мс | 3000 мс |
| **Latency (p99)** | < 1000 мс | 3000 мс | 5000 мс |
| **Throughput** | 1000 req/s | 3000 req/s | N/A |
| **Error Rate** | < 0.5% | 2% | 5% |
| **CPU Usage** | < 70% | 85% | 95% |
| **Memory Usage** | < 70% | 85% | 95% |

### VoP Responder (Учасники)

| Метрика | Target | Maximum | Critical |
|---------|--------|---------|----------|
| **Latency (p95)** | < 800 мс | 1000 мс | 3000 мс |
| **Latency (p99)** | < 1500 мс | 3000 мс | 5000 мс |
| **Throughput** | 500 req/s | 1000 req/s | N/A |
| **Error Rate** | < 2% | 5% | 10% |
| **DB Query Time** | < 200 мс | 500 мс | 1000 мс |

---

## Load Testing

### PT-L-001: Normal Load Test

**Objective:** Перевірити продуктивність при нормальному навантаженні

**Test Configuration:**
- **Duration:** 30 minutes
- **Users:** 500 concurrent users
- **Requests per second:** 1000 req/s (average)
- **Ramp-up:** 5 minutes

**Test Scenario:**
```
Ramp-up phase (0-5 min):
  - Start: 0 users
  - End: 500 users
  - Gradual increase

Sustained load (5-30 min):
  - Maintain: 500 users
  - Rate: 1000 req/s

Cool-down (30-35 min):
  - Gradual decrease to 0
```

**Expected Results:**
- ✅ p95 latency: < 500 мс
- ✅ Error rate: < 0.5%
- ✅ Throughput: 1000+ req/s
- ✅ No memory leaks
- ✅ CPU usage: < 70%

**Test Script (JMeter):**
```xml
<ThreadGroup>
  <numThreads>500</numThreads>
  <rampTime>300</rampTime>  <!-- 5 min -->
  <duration>1800</duration> <!-- 30 min -->
  <HTTPSampler>
    <domain>vop-router.nbu.gov.ua</domain>
    <path>/api/vop/v1/verify</path>
    <method>POST</method>
    <body>
      {
        "requestId": "${__UUID}",
        "timestamp": "${__time}",
        "requester": {"nbuId": "300001"},
        "payee": {
          "iban": "${IBAN}",
          "name": "${NAME}"
        }
      }
    </body>
  </HTTPSampler>
</ThreadGroup>
```

**Metrics to Monitor:**
- Response time distribution (p50, p95, p99)
- Throughput (req/s)
- Error rate (%)
- CPU usage (%)
- Memory usage (%)
- Network I/O
- Database connections

---

### PT-L-002: Peak Hour Load Test

**Objective:** Симулювати peak hours (9:00-10:00, 12:00-13:00)

**Test Configuration:**
- **Duration:** 1 hour
- **Peak users:** 1000 concurrent
- **Peak rate:** 2000 req/s

**Load Pattern:**
```
09:00 - 300 users  (600 req/s)
09:30 - 800 users  (1600 req/s) ← ramp up
10:00 - 1000 users (2000 req/s) ← peak
10:30 - 500 users  (1000 req/s) ← decrease
11:00 - 300 users  (600 req/s)
```

**Expected Results:**
- p95 latency: < 1000 мс (during peak)
- Error rate: < 1%
- System stable during peak

**Pass Criteria:**
- [ ] No system crashes
- [ ] Latency within acceptable range
- [ ] Error rate < 1%

---

### PT-L-003: Multi-Bank Load Test

**Objective:** Симулювати навантаження від множини банків одночасно

**Test Configuration:**
- **Banks:** 50 банків (учасників)
- **Requests per bank:** 20 req/s
- **Total:** 1000 req/s
- **Duration:** 30 minutes

**Expected Results:**
- Fair load distribution між банками
- No single bank monopolizing resources
- Consistent latency для всіх банків

---

## Stress Testing

### PT-S-001: Overload Test

**Objective:** Визначити breaking point системи

**Test Configuration:**
- **Start:** 1000 req/s
- **Increment:** +500 req/s every 5 minutes
- **Until:** System breaks або error rate > 10%

**Expected Behavior:**
```
1000 req/s - OK
1500 req/s - OK
2000 req/s - OK
2500 req/s - Latency increasing
3000 req/s - Error rate > 5%
3500 req/s - SYSTEM BREAKS ← breaking point
```

**Metrics:**
- Maximum throughput before degradation
- Graceful degradation behavior
- Recovery time after stress removed

**Pass Criteria:**
- [ ] System doesn't crash completely
- [ ] Graceful degradation (errors, not crashes)
- [ ] Quick recovery after load reduction

---

### PT-S-002: Memory Stress Test

**Objective:** Перевірити поведінку при memory exhaustion

**Test Configuration:**
- Gradually увеличувати memory usage
- Monitor для memory leaks
- Check garbage collection behavior

**Expected Results:**
- No memory leaks
- GC паузи < 100 мс
- OOMKiller не спрацьовує

---

### PT-S-003: Database Connection Pool Exhaustion

**Objective:** Перевірити поведінку коли DB connection pool повний

**Test Configuration:**
- Connection pool size: 20
- Send 100 concurrent DB queries
- Monitor connection queue

**Expected Results:**
- Requests queue gracefully
- Timeout errors (not crashes)
- System recovers when load decreases

---

## Endurance Testing

### PT-E-001: 24-Hour Soak Test

**Objective:** Виявити memory leaks та degradation при тривалому навантаженні

**Test Configuration:**
- **Duration:** 24 години
- **Load:** 500 req/s (constant)
- **Users:** 250 concurrent

**Monitoring:**
- Memory usage trend (growing? stable?)
- Response time trend (increasing? stable?)
- Error rate trend
- Database connection leaks
- Thread pool exhaustion

**Expected Results:**
- Memory usage stable (no leaks)
- Response time stable (no degradation)
- Error rate < 1%
- No resource leaks

**Red Flags:**
- ❌ Memory usage constantly growing
- ❌ Response time increasing over time
- ❌ DB connections not released
- ❌ Thread pool exhaustion

---

### PT-E-002: 7-Day Endurance Test (Production-like)

**Objective:** Симулювати production usage pattern протягом тижня

**Load Pattern:**
```
Weekday (Mon-Fri):
  09:00-10:00: Peak (2000 req/s)
  10:00-12:00: Normal (1000 req/s)
  12:00-13:00: Peak (1800 req/s)
  13:00-18:00: Normal (1000 req/s)
  18:00-09:00: Low (200 req/s)

Weekend (Sat-Sun):
  All day: Low (300 req/s)
```

**Expected Results:**
- System stable протягом всього тижня
- No memory leaks
- No degradation

---

## Spike Testing

### PT-SP-001: Sudden Traffic Spike

**Objective:** Перевірити поведінку при раптовому сплеску навантаження

**Test Scenario:**
```
Normal load: 1000 req/s
  ↓
Sudden spike: 5000 req/s (5x increase)
  ↓ (hold for 2 minutes)
Back to normal: 1000 req/s
```

**Expected Behavior:**
- System handles spike gracefully
- Possible temporary degradation (latency increase)
- Error rate < 5% during spike
- Quick recovery after spike

**Metrics:**
- Time to detect spike
- Time to scale up (if auto-scaling enabled)
- Error rate during spike
- Recovery time

---

### PT-SP-002: Multiple Sequential Spikes

**Test Pattern:**
```
10:00 - Spike 1 (3000 req/s) - 5 min
10:10 - Normal (1000 req/s) - 5 min
10:20 - Spike 2 (4000 req/s) - 5 min
10:30 - Normal (1000 req/s) - 5 min
10:40 - Spike 3 (5000 req/s) - 5 min
```

**Expected Results:**
- System handles multiple spikes
- No cumulative degradation
- Resources released between spikes

---

## Scalability Testing

### PT-SC-001: Horizontal Scaling Test

**Objective:** Перевірити linear scalability при додаванні pods/instances

**Test Configuration:**
```
Test 1: 2 pods  → 1000 req/s → Measure latency
Test 2: 4 pods  → 2000 req/s → Measure latency
Test 3: 8 pods  → 4000 req/s → Measure latency
Test 4: 16 pods → 8000 req/s → Measure latency
```

**Expected Results:**
- Linear scalability (2x pods → 2x throughput)
- Latency remains constant
- Load balancer distributes evenly

**Pass Criteria:**
- [ ] Throughput scales linearly
- [ ] No bottlenecks (DB, network)
- [ ] Latency doesn't increase with scale

---

### PT-SC-002: Auto-Scaling Test (Kubernetes HPA)

**Objective:** Перевірити Horizontal Pod Autoscaler

**Test Configuration:**
- HPA target: 70% CPU usage
- Min pods: 3
- Max pods: 20

**Test Scenario:**
```
1. Start with 3 pods (low load)
2. Increase load → CPU > 70%
3. HPA scales up to 6 pods
4. Continue increasing → scales to 12 pods
5. Decrease load
6. HPA scales down to 3 pods
```

**Expected Results:**
- Scale-up time: < 2 minutes
- Scale-down time: < 5 minutes (with grace period)
- No request drops during scaling

---

## Database Performance

### PT-DB-001: Database Query Performance

**Objective:** Виміряти DB query latency

**Test Queries:**
```sql
-- Query 1: Account lookup by IBAN
SELECT * FROM accounts WHERE iban = 'UA...';
Target: < 50 мс

-- Query 2: Customer data with joins
SELECT c.*, a.* FROM customers c
JOIN accounts a ON c.id = a.customer_id
WHERE a.iban = 'UA...';
Target: < 100 мс

-- Query 3: Full-text search on name
SELECT * FROM customers WHERE name ILIKE '%ШЕВЧЕНКО%';
Target: < 200 мс
```

**Expected Results:**
- Indexed queries: < 50 мс
- Join queries: < 100 мс
- Full-text search: < 200 мс

**Optimization:**
- [ ] Index on `accounts.iban`
- [ ] Index on `customers.name`
- [ ] Connection pooling (20-50 connections)

---

### PT-DB-002: Database Connection Pool Test

**Test Configuration:**
- Pool size: 20 connections
- Send 100 concurrent requests
- Monitor connection wait time

**Expected Results:**
- 20 requests: immediate (use pool)
- Next 80 requests: queued (wait for pool)
- Max wait time: < 500 мс

---

### PT-DB-003: Database Failover Test

**Objective:** Перевірити failover до replica

**Test Scenario:**
1. Primary DB active, load: 1000 req/s
2. Simulate primary failure
3. Failover to read replica
4. System continues working

**Expected Results:**
- Failover time: < 30 seconds
- Some requests fail during failover (acceptable)
- System recovers automatically

---

## Network Latency Testing

### PT-N-001: Network Latency by Region

**Objective:** Виміряти network latency між різними datacenters

**Test Configuration:**
- Requester: Kyiv
- Router: Kyiv
- Responder: Lviv, Dnipro, Odesa

**Expected Latency:**
```
Kyiv → Kyiv:   < 10 мс
Kyiv → Lviv:   < 30 мс
Kyiv → Dnipro: < 40 мс
Kyiv → Odesa:  < 50 мс
```

**Pass Criteria:**
- [ ] Latency within acceptable range
- [ ] No packet loss

---

### PT-N-002: Bandwidth Test

**Objective:** Перевірити network bandwidth

**Test:**
- Send 1000 concurrent requests
- Monitor network throughput
- Check for bottlenecks

**Expected Results:**
- Network utilization: < 80%
- No bandwidth saturation

---

## Tools та Environment

### Load Testing Tools

**Apache JMeter:**
```bash
# Install
brew install jmeter

# Run test
jmeter -n -t vop-load-test.jmx -l results.jtl
```

**Gatling:**
```scala
class VopLoadTest extends Simulation {
  val httpConf = http.baseUrl("https://vop-router.nbu.gov.ua")

  val scn = scenario("VoP Request")
    .exec(
      http("Verify Payee")
        .post("/api/vop/v1/verify")
        .header("Content-Type", "application/json")
        .body(StringBody("""{"requestId":"${requestId}"}"""))
    )

  setUp(
    scn.inject(
      rampUsers(500) during (5 minutes),
      constantUsersPerSec(1000) during (30 minutes)
    )
  ).protocols(httpConf)
}
```

**k6 (Cloud-native):**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '5m', target: 500 },  // ramp-up
    { duration: '30m', target: 500 }, // stay
    { duration: '5m', target: 0 },    // cool-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% < 500ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};

export default function() {
  const payload = JSON.stringify({
    requestId: `test-${Date.now()}`,
    timestamp: new Date().toISOString(),
    requester: { nbuId: '300001' },
    payee: {
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
    }
  });

  let res = http.post(
    'https://vop-router.nbu.gov.ua/api/vop/v1/verify',
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Monitoring Tools

**Prometheus + Grafana:**
- Real-time metrics
- Dashboards для latency, throughput, errors
- Alerting

**ELK Stack:**
- Log aggregation
- Error analysis
- Query performance analysis

---

## Test Execution Plan

### Phase 1: Baseline (Week 1)
- [ ] PT-L-001: Normal load test
- [ ] PT-DB-001: Database query performance
- [ ] Establish baseline metrics

### Phase 2: Load Testing (Week 2)
- [ ] PT-L-002: Peak hour load
- [ ] PT-L-003: Multi-bank load
- [ ] PT-N-001: Network latency

### Phase 3: Stress Testing (Week 3)
- [ ] PT-S-001: Overload test
- [ ] PT-S-002: Memory stress
- [ ] PT-S-003: DB connection pool

### Phase 4: Endurance (Week 4-5)
- [ ] PT-E-001: 24-hour soak test
- [ ] PT-E-002: 7-day endurance (optional)

### Phase 5: Advanced (Week 6)
- [ ] PT-SP-001: Spike testing
- [ ] PT-SC-001: Scalability test
- [ ] PT-DB-003: Failover test

---

## Performance Test Report Template

```markdown
# VoP Performance Test Report

**Date:** 2026-02-XX
**Environment:** Staging
**Tester:** [Name]

## Executive Summary
- Overall system performance: ✅ PASS / ❌ FAIL
- Key findings: [Summary]

## Test Results

### Load Testing
| Test | Target | Actual | Status |
|------|--------|--------|--------|
| PT-L-001 Normal Load | p95<500ms | 350ms | ✅ PASS |
| PT-L-002 Peak Load | p95<1000ms | 850ms | ✅ PASS |

### Stress Testing
| Test | Breaking Point | Actual | Status |
|------|----------------|--------|--------|
| PT-S-001 Overload | >3000 req/s | 3200 req/s | ✅ PASS |

### Metrics Summary
- **p50 Latency:** 180 мс (target: <200ms) ✅
- **p95 Latency:** 420 мс (target: <500ms) ✅
- **p99 Latency:** 950 мс (target: <1000ms) ✅
- **Max Throughput:** 3200 req/s (target: >1000 req/s) ✅
- **Error Rate:** 0.3% (target: <0.5%) ✅

## Bottlenecks Identified
1. Database queries slow at > 2000 req/s
   - Solution: Add read replicas
2. High CPU usage during peak
   - Solution: Increase pod count

## Recommendations
1. Add 2 database read replicas for load distribution
2. Increase HPA max pods from 10 to 20
3. Implement Redis caching for frequent queries
4. Optimize database indexes

**Sign-off:** [Performance Engineer] [Date]
```

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** After pilot performance testing
