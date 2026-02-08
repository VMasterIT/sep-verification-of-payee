# Security Tests для VoP СЕП НБУ

**Версія:** 1.0
**Дата:** 2026-02-07
**Статус:** Draft

---

## Зміст

1. [Огляд](#огляд)
2. [Security Testing Strategy](#security-testing-strategy)
3. [Authentication & Authorization Tests](#authentication--authorization-tests)
4. [Encryption & TLS Tests](#encryption--tls-tests)
5. [Input Validation & Injection Tests](#input-validation--injection-tests)
6. [API Security Tests](#api-security-tests)
7. [Certificate Management Tests](#certificate-management-tests)
8. [Rate Limiting & DoS Protection Tests](#rate-limiting--dos-protection-tests)
9. [Data Privacy & GDPR Tests](#data-privacy--gdpr-tests)
10. [Audit & Logging Tests](#audit--logging-tests)
11. [Penetration Testing](#penetration-testing)
12. [Security Scan Tools](#security-scan-tools)
13. [Compliance Checklist](#compliance-checklist)

---

## Огляд

Цей документ визначає стратегію та тест-кейси для security тестування системи Verification of Payee (VoP) СЕП НБУ.

**Цілі security testing:**
- ✅ Перевірити всі механізми автентифікації та авторизації
- ✅ Виявити вразливості (OWASP Top 10)
- ✅ Протестувати encryption та TLS налаштування
- ✅ Перевірити захист від DoS та rate limiting
- ✅ Забезпечити GDPR compliance
- ✅ Протестувати audit logging

**Стандарти та frameworks:**
- OWASP Top 10 (2021)
- OWASP ASVS (Application Security Verification Standard)
- PCI DSS 3.2.1 (для платіжних систем)
- GDPR (General Data Protection Regulation)
- NBU Security Guidelines

---

## Security Testing Strategy

### Testing Phases

**Phase 1: Automated Security Scanning**
- SAST (Static Application Security Testing)
- DAST (Dynamic Application Security Testing)
- Dependency vulnerability scanning
- Container image scanning

**Phase 2: Manual Security Testing**
- Authentication bypass attempts
- Authorization testing
- Input validation testing
- Session management testing

**Phase 3: Penetration Testing**
- External penetration test (VoP Router)
- Internal penetration test (VoP Responder)
- API security testing
- Infrastructure security testing

**Phase 4: Compliance Validation**
- GDPR compliance check
- PCI DSS compliance (якщо застосовно)
- NBU security requirements validation

### Testing Environment

**Staging environment:**
```yaml
VoP Router:
  - URL: https://vop-staging.nbu.gov.ua
  - mTLS: Required (test certificates)
  - OAuth 2.0: Test tokens

VoP Responder (Mock):
  - URL: https://bank-vop-staging.example.com
  - Test accounts available
  - Separate database
```

**Test credentials:**
- Test certificates (АЦСК test CA)
- Test OAuth 2.0 client credentials
- Test user accounts

---

## Authentication & Authorization Tests

### SEC-AUTH-001: mTLS Certificate Validation

**Objective:** Verify that only valid mTLS certificates are accepted.

**Test Steps:**
1. Send request with valid mTLS certificate
   - **Expected:** Request accepted (HTTP 200)
2. Send request with expired certificate
   - **Expected:** Request rejected (HTTP 401 or connection refused)
3. Send request with self-signed certificate (not from АЦСК)
   - **Expected:** Request rejected (HTTP 401)
4. Send request with revoked certificate (CRL check)
   - **Expected:** Request rejected (HTTP 401)
5. Send request without certificate
   - **Expected:** Connection refused (TLS handshake fails)

**Tools:**
- `curl` with `--cert` and `--key` options
- `openssl s_client`

**Example:**
```bash
# Valid certificate
curl --cert client.crt --key client.key \
  https://vop-router.nbu.gov.ua/v1/verify

# Expired certificate
curl --cert expired.crt --key expired.key \
  https://vop-router.nbu.gov.ua/v1/verify
# Expected: SSL certificate problem: certificate has expired
```

**Success Criteria:**
- ✅ All invalid certificates are rejected
- ✅ Only certificates from trusted CA (АЦСК) are accepted
- ✅ CRL/OCSP check works correctly

---

### SEC-AUTH-002: OAuth 2.0 Token Validation

**Objective:** Verify OAuth 2.0 token validation.

**Test Steps:**
1. Request with valid access token
   - **Expected:** HTTP 200
2. Request with expired token
   - **Expected:** HTTP 401, error: "invalid_token"
3. Request with invalid token (random string)
   - **Expected:** HTTP 401, error: "invalid_token"
4. Request without token (missing Authorization header)
   - **Expected:** HTTP 401, error: "unauthorized"
5. Request with token for different scope
   - **Expected:** HTTP 403, error: "insufficient_scope"

**Example:**
```bash
# Valid token
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  https://vop-router.nbu.gov.ua/v1/verify

# Expired token
curl -H "Authorization: Bearer EXPIRED_TOKEN" \
  https://vop-router.nbu.gov.ua/v1/verify
# Expected: {"error": "invalid_token", "error_description": "Token expired"}

# Missing token
curl https://vop-router.nbu.gov.ua/v1/verify
# Expected: {"error": "unauthorized"}
```

**Success Criteria:**
- ✅ Expired tokens are rejected
- ✅ Invalid tokens are rejected
- ✅ Scope validation works correctly

---

### SEC-AUTH-003: Authorization Rules

**Objective:** Verify that authorization rules are enforced.

**Test Steps:**
1. **Requester:** Bank A sends VoP request as Requester
   - **Expected:** HTTP 200 (allowed)
2. **Responder:** Bank B receives VoP request
   - **Expected:** HTTP 200 (allowed)
3. **Unauthorized access:** Bank A tries to query VoP Directory directly
   - **Expected:** HTTP 403 (only NBU can access)
4. **Cross-bank access:** Bank A tries to send request with Bank B's client ID
   - **Expected:** HTTP 403 (unauthorized)

**Success Criteria:**
- ✅ Each participant can only access authorized endpoints
- ✅ VoP Directory is only accessible to NBU
- ✅ No cross-bank impersonation possible

---

### SEC-AUTH-004: Session Management

**Objective:** Test session management (OAuth 2.0 refresh tokens).

**Test Steps:**
1. Obtain access token and refresh token
2. Wait for access token to expire
3. Use refresh token to get new access token
   - **Expected:** New access token issued
4. Try to reuse old refresh token (after getting new one)
   - **Expected:** Rejected (refresh token rotation)
5. Try to use refresh token after revocation
   - **Expected:** Rejected

**Success Criteria:**
- ✅ Refresh token rotation works
- ✅ Revoked tokens cannot be reused
- ✅ No concurrent refresh token use

---

## Encryption & TLS Tests

### SEC-TLS-001: TLS Version and Cipher Suite

**Objective:** Verify that only TLS 1.2+ with strong ciphers is allowed.

**Test Steps:**
1. Connect with TLS 1.3
   - **Expected:** Success
2. Connect with TLS 1.2
   - **Expected:** Success
3. Connect with TLS 1.1
   - **Expected:** Connection refused
4. Connect with TLS 1.0
   - **Expected:** Connection refused
5. Connect with SSLv3
   - **Expected:** Connection refused

**Tools:**
- `nmap`
- `testssl.sh`
- `ssllabs.com` (for external scan)

**Example:**
```bash
# Test TLS versions
nmap --script ssl-enum-ciphers -p 443 vop-router.nbu.gov.ua

# Detailed TLS test
testssl.sh https://vop-router.nbu.gov.ua

# Test specific TLS version
openssl s_client -tls1_1 -connect vop-router.nbu.gov.ua:443
# Expected: handshake failure
```

**Success Criteria:**
- ✅ Only TLS 1.2 and TLS 1.3 accepted
- ✅ Strong cipher suites only (ECDHE-RSA-AES256-GCM-SHA384, etc.)
- ✅ Perfect Forward Secrecy (PFS) enabled
- ✅ No weak ciphers (RC4, DES, 3DES)

---

### SEC-TLS-002: Certificate Validation

**Objective:** Verify server certificate validation.

**Test Steps:**
1. Check certificate chain (trusted CA)
2. Check certificate expiration date
3. Check certificate Subject Alternative Names (SAN)
4. Check certificate revocation status (CRL/OCSP)

**Example:**
```bash
# Check certificate
openssl s_client -connect vop-router.nbu.gov.ua:443 -showcerts

# Check OCSP
openssl ocsp -issuer issuer.crt -cert server.crt \
  -url http://ocsp.acsk.gov.ua -CAfile ca.crt
```

**Success Criteria:**
- ✅ Certificate issued by trusted CA (АЦСК)
- ✅ Certificate not expired
- ✅ SAN includes correct domain names
- ✅ OCSP/CRL check enabled

---

### SEC-TLS-003: Data Encryption

**Objective:** Verify that all data in transit is encrypted.

**Test Steps:**
1. Capture network traffic with Wireshark
2. Send VoP request
3. Analyze captured packets
   - **Expected:** All payload data is encrypted (TLS)
4. Try to intercept traffic with MITM proxy
   - **Expected:** Connection refused (certificate pinning)

**Tools:**
- Wireshark
- mitmproxy

**Success Criteria:**
- ✅ No plaintext data in network traffic
- ✅ MITM attacks are prevented

---

## Input Validation & Injection Tests

### SEC-INJ-001: SQL Injection

**Objective:** Test for SQL injection vulnerabilities.

**Test Cases:**

**1. IBAN field:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001' OR '1'='1",
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
  }
}
```
- **Expected:** Validation error (invalid IBAN format)

**2. Name field:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "Test'; DROP TABLE customers; --"
  }
}
```
- **Expected:** Name processed safely, no SQL executed

**3. requestId field:**
```json
{
  "requestId": "REQ-001' UNION SELECT * FROM users--"
}
```
- **Expected:** Validation error (invalid requestId format)

**Success Criteria:**
- ✅ All SQL injection attempts are blocked
- ✅ Parameterized queries used (no raw SQL)
- ✅ Input validation prevents malicious input

---

### SEC-INJ-002: NoSQL Injection

**Objective:** Test for NoSQL injection (якщо використовується MongoDB).

**Test Cases:**

**1. JSON injection:**
```json
{
  "payee": {
    "iban": {"$ne": null},
    "name": "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ"
  }
}
```
- **Expected:** Validation error (IBAN must be string)

**2. Operator injection:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": {"$regex": ".*"}
  }
}
```
- **Expected:** Validation error (name must be string)

**Success Criteria:**
- ✅ NoSQL operators are not interpreted
- ✅ Strict JSON schema validation

---

### SEC-INJ-003: XSS (Cross-Site Scripting)

**Objective:** Test for XSS vulnerabilities.

**Test Cases:**

**1. Name field with script:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "<script>alert('XSS')</script>"
  }
}
```
- **Expected:** Name processed safely, script not executed
- **Response should escape HTML:**
```json
{
  "verifiedName": "&lt;script&gt;alert('XSS')&lt;/script&gt;"
}
```

**2. Name field with event handler:**
```json
{
  "payee": {
    "name": "<img src=x onerror=alert('XSS')>"
  }
}
```
- **Expected:** HTML tags stripped or escaped

**Success Criteria:**
- ✅ All HTML/JS is escaped in responses
- ✅ Content-Type headers are correct (application/json)
- ✅ No script execution possible

---

### SEC-INJ-004: Command Injection

**Objective:** Test for OS command injection.

**Test Cases:**

**1. IBAN field:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001; ls -la",
    "name": "Test"
  }
}
```
- **Expected:** Validation error

**2. Name field:**
```json
{
  "payee": {
    "name": "Test $(whoami)"
  }
}
```
- **Expected:** Processed as literal string, no command execution

**Success Criteria:**
- ✅ No OS commands executed
- ✅ Input validation prevents special characters

---

### SEC-INJ-005: XML Injection (XXE)

**Objective:** Test for XML External Entity (XXE) injection (якщо ISO 20022 XML використовується).

**Test Case:**
```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<VopRequest>
  <Payee>
    <Name>&xxe;</Name>
  </Payee>
</VopRequest>
```
- **Expected:** XML parsing error or entity not expanded

**Success Criteria:**
- ✅ External entities are disabled
- ✅ DTD processing is disabled

---

## API Security Tests

### SEC-API-001: API Input Validation

**Objective:** Test strict input validation.

**Test Cases:**

**1. Missing required fields:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001"
    // Missing "name"
  }
}
```
- **Expected:** HTTP 400, error: "Missing required field: payee.name"

**2. Invalid IBAN format:**
```json
{
  "payee": {
    "iban": "INVALID",
    "name": "Test"
  }
}
```
- **Expected:** HTTP 400, error: "Invalid IBAN format"

**3. Field too long:**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "A" * 1000  // 1000 characters
  }
}
```
- **Expected:** HTTP 400, error: "Name exceeds maximum length (140 characters)"

**4. Invalid data type:**
```json
{
  "payee": {
    "iban": 123456789,  // Number instead of string
    "name": "Test"
  }
}
```
- **Expected:** HTTP 400, error: "Invalid data type for field: iban"

**Success Criteria:**
- ✅ All invalid inputs are rejected
- ✅ Clear error messages returned
- ✅ No internal errors exposed

---

### SEC-API-002: HTTP Method Validation

**Objective:** Verify that only allowed HTTP methods are accepted.

**Test Cases:**

**1. POST to /v1/verify (correct):**
```bash
curl -X POST https://vop-router.nbu.gov.ua/v1/verify
```
- **Expected:** HTTP 200 or 400 (depends on body)

**2. GET to /v1/verify:**
```bash
curl -X GET https://vop-router.nbu.gov.ua/v1/verify
```
- **Expected:** HTTP 405 Method Not Allowed

**3. PUT, DELETE, PATCH:**
- **Expected:** HTTP 405

**4. TRACE, OPTIONS:**
- **Expected:** HTTP 405 (TRACE should be disabled)

**Success Criteria:**
- ✅ Only POST allowed for /v1/verify
- ✅ TRACE method disabled (security risk)

---

### SEC-API-003: Response Header Security

**Objective:** Verify security headers in HTTP responses.

**Test:**
```bash
curl -I https://vop-router.nbu.gov.ua/v1/verify
```

**Expected headers:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Referrer-Policy: no-referrer
```

**Missing headers (should NOT be present):**
```
Server: nginx/1.18.0  ❌ (should be hidden)
X-Powered-By: Express  ❌ (should be hidden)
```

**Success Criteria:**
- ✅ All security headers present
- ✅ Server version hidden
- ✅ Technology stack not exposed

---

### SEC-API-004: API Versioning

**Objective:** Test API version handling.

**Test Cases:**

**1. Request with correct version:**
```
POST /v1/verify
```
- **Expected:** HTTP 200

**2. Request with unsupported version:**
```
POST /v2/verify
```
- **Expected:** HTTP 404 Not Found

**3. Request without version:**
```
POST /verify
```
- **Expected:** HTTP 404 or redirect to /v1/verify

**Success Criteria:**
- ✅ API version enforced
- ✅ Unsupported versions rejected gracefully

---

## Certificate Management Tests

### SEC-CERT-001: Certificate Expiration Monitoring

**Objective:** Verify certificate expiration monitoring.

**Test Steps:**
1. Check certificate expiration date
2. Set up alert for certificates expiring in < 30 days
3. Test certificate renewal process

**Example:**
```bash
# Check expiration
openssl x509 -in server.crt -noout -enddate

# Check all certificates
for cert in /etc/ssl/certs/vop-*.crt; do
  echo "Certificate: $cert"
  openssl x509 -in $cert -noout -enddate
done
```

**Success Criteria:**
- ✅ Monitoring alerts for certificates expiring in < 30 days
- ✅ Renewal process documented and tested
- ✅ No expired certificates in use

---

### SEC-CERT-002: Certificate Revocation (CRL/OCSP)

**Objective:** Test certificate revocation checking.

**Test Steps:**
1. Present valid certificate
   - **Expected:** Accepted
2. Present revoked certificate (from CRL)
   - **Expected:** Rejected
3. OCSP responder not available
   - **Expected:** Soft fail (configurable) or hard fail

**Example:**
```bash
# Check CRL
curl http://crl.acsk.gov.ua/TestCA.crl -o crl.pem
openssl crl -in crl.pem -text -noout

# Check OCSP
openssl ocsp -issuer issuer.crt -cert revoked.crt \
  -url http://ocsp.acsk.gov.ua -CAfile ca.crt
# Expected: revoked
```

**Success Criteria:**
- ✅ Revoked certificates are rejected
- ✅ CRL updated regularly (every 24 hours)
- ✅ OCSP stapling enabled

---

### SEC-CERT-003: Certificate Pinning

**Objective:** Test certificate pinning (для критичних з'єднань).

**Test Steps:**
1. Connect with correct certificate
   - **Expected:** Success
2. Connect with different valid certificate (from same CA)
   - **Expected:** Rejected (if pinning enabled)

**Example (Node.js):**
```javascript
const https = require('https');
const tls = require('tls');

const options = {
  hostname: 'vop-router.nbu.gov.ua',
  port: 443,
  path: '/v1/verify',
  method: 'POST',
  checkServerIdentity: (hostname, cert) => {
    const expectedFingerprint = 'AA:BB:CC:DD:EE:FF:...';
    const actualFingerprint = cert.fingerprint256;

    if (actualFingerprint !== expectedFingerprint) {
      return new Error('Certificate fingerprint mismatch');
    }
  }
};
```

**Success Criteria:**
- ✅ Certificate pinning works for critical connections
- ✅ Pin rotation procedure documented

---

## Rate Limiting & DoS Protection Tests

### SEC-DOS-001: Rate Limiting per Participant

**Objective:** Test rate limiting (100 req/sec per participant).

**Test Steps:**
1. Send requests at 50 req/sec
   - **Expected:** All requests accepted
2. Send requests at 100 req/sec
   - **Expected:** All requests accepted (at limit)
3. Send requests at 150 req/sec
   - **Expected:** Some requests rejected with HTTP 429

**Tools:**
- Apache JMeter
- k6
- Gatling

**Example (k6):**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  scenarios: {
    rate_limit_test: {
      executor: 'constant-arrival-rate',
      rate: 150,  // 150 requests per second
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
    },
  },
};

export default function() {
  const res = http.post('https://vop-router.nbu.gov.ua/v1/verify', payload, params);

  check(res, {
    'rate limited': (r) => r.status === 429,
  });
}
```

**Expected response (HTTP 429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Maximum 100 requests per second.",
  "retryAfter": 1
}
```

**Success Criteria:**
- ✅ Rate limiting enforced (100 req/sec)
- ✅ HTTP 429 returned with Retry-After header
- ✅ Rate limiting per participant (not global)

---

### SEC-DOS-002: Request Size Limit

**Objective:** Test maximum request size limit.

**Test Cases:**

**1. Normal request (< 10 KB):**
- **Expected:** HTTP 200

**2. Large request (100 KB):**
```json
{
  "payee": {
    "iban": "UA213052990000026007233566001",
    "name": "A" * 100000
  }
}
```
- **Expected:** HTTP 413 Payload Too Large

**Success Criteria:**
- ✅ Requests > 10 KB rejected
- ✅ Clear error message

---

### SEC-DOS-003: Connection Limits

**Objective:** Test connection limits per participant.

**Test Steps:**
1. Open 100 concurrent connections from one participant
   - **Expected:** All accepted
2. Open 500 concurrent connections from one participant
   - **Expected:** Some connections rejected or queued

**Success Criteria:**
- ✅ Connection limits enforced
- ✅ No resource exhaustion on server

---

### SEC-DOS-004: Slowloris Attack Protection

**Objective:** Test protection against slow HTTP attacks.

**Test:**
Use Slowloris tool to send incomplete HTTP requests slowly.

```bash
slowloris -s 200 vop-router.nbu.gov.ua
```

- **Expected:** Connections timed out after 30 seconds
- **Expected:** Server remains available for legitimate clients

**Success Criteria:**
- ✅ Request timeout enforced (30 sec)
- ✅ Connection timeout enforced
- ✅ Server remains available

---

## Data Privacy & GDPR Tests

### SEC-GDPR-001: Data Minimization

**Objective:** Verify that only necessary data is collected and stored.

**Test:**
1. Send VoP request
2. Check what data is logged

**Expected:**
- ✅ Request ID logged
- ✅ IBAN logged (hashed or truncated)
- ✅ Match status logged
- ❌ Full name NOT logged (only hash)
- ❌ Other PII NOT logged

**Example log:**
```json
{
  "timestamp": "2026-02-07T10:30:00Z",
  "requestId": "REQ-20260207-001",
  "requesterBIC": "NBUA",
  "responderBIC": "PBUA",
  "ibanHash": "sha256(UA213052990000026007233566001)",
  "matchStatus": "MATCH",
  "latency": 450
}
```

**Success Criteria:**
- ✅ No full names in logs
- ✅ IBAN hashed or masked (UA21...6001)
- ✅ Minimal PII stored

---

### SEC-GDPR-002: Data Retention

**Objective:** Verify data retention policy (90 days).

**Test:**
1. Send VoP request
2. Check database after 90 days
   - **Expected:** Record deleted
3. Check database after 89 days
   - **Expected:** Record still exists

**SQL query (for testing):**
```sql
-- Find records older than 90 days
SELECT * FROM vop_requests
WHERE created_at < NOW() - INTERVAL '90 days';

-- Should return 0 rows (automated cleanup)
```

**Success Criteria:**
- ✅ Automated data cleanup job runs daily
- ✅ Data deleted after 90 days
- ✅ Deletion logged in audit trail

---

### SEC-GDPR-003: Right to Erasure

**Objective:** Test "right to be forgotten" request.

**Test Steps:**
1. Customer requests data deletion
2. Bank sends deletion request to VoP system
3. Verify all customer data deleted within 30 days

**Success Criteria:**
- ✅ Deletion process documented
- ✅ Data deleted from all systems (including backups)
- ✅ Deletion confirmation sent

---

### SEC-GDPR-004: Data Encryption at Rest

**Objective:** Verify that sensitive data is encrypted at rest.

**Test:**
1. Check database encryption (PostgreSQL TDE, AWS RDS encryption)
2. Check backup encryption
3. Check log file encryption

**Example (PostgreSQL):**
```sql
-- Check if database is encrypted
SHOW data_checksums;
SELECT * FROM pg_stat_database WHERE datname = 'vop_db';
```

**Success Criteria:**
- ✅ Database encrypted (TDE or disk encryption)
- ✅ Backups encrypted (AES-256)
- ✅ Logs encrypted or contain no PII

---

## Audit & Logging Tests

### SEC-LOG-001: Audit Trail Completeness

**Objective:** Verify that all critical events are logged.

**Events that MUST be logged:**
- ✅ VoP request received (with requestId, timestamp)
- ✅ Authentication success/failure
- ✅ Authorization failure
- ✅ Rate limit exceeded
- ✅ Certificate validation failure
- ✅ Database errors
- ✅ Configuration changes
- ✅ Admin actions

**Test:**
1. Trigger each event type
2. Check logs

**Success Criteria:**
- ✅ All events logged
- ✅ Logs include timestamp, user, action, result

---

### SEC-LOG-002: Log Tampering Prevention

**Objective:** Verify that logs cannot be tampered with.

**Test:**
1. Try to modify log file
   - **Expected:** File permissions prevent modification
2. Try to delete log entries
   - **Expected:** Logs are write-once or signed

**Best practices:**
- ✅ Logs sent to centralized logging (ELK, Splunk)
- ✅ Log file permissions: 640 (read-only for most users)
- ✅ Log signing (HMAC) for integrity

**Success Criteria:**
- ✅ Logs immutable (write-once)
- ✅ Log tampering detected
- ✅ Centralized logging used

---

### SEC-LOG-003: Log Retention

**Objective:** Verify log retention policy (1 year for security logs).

**Test:**
1. Check logs older than 1 year
   - **Expected:** Deleted or archived

**Success Criteria:**
- ✅ Security logs retained for 1 year
- ✅ Application logs retained for 90 days
- ✅ Automated log rotation

---

## Penetration Testing

### SEC-PEN-001: External Penetration Test

**Objective:** Conduct external penetration test of VoP Router.

**Scope:**
- VoP Router API (https://vop-router.nbu.gov.ua)
- VoP Directory Service
- Public-facing endpoints

**Testing approach:**
- Black-box testing (no internal knowledge)
- Automated scanning + manual testing
- OWASP Top 10 focus

**Tools:**
- Burp Suite Professional
- OWASP ZAP
- Nmap
- Metasploit (for known vulnerabilities)

**Test cases:**
1. Authentication bypass
2. SQL injection
3. XSS
4. CSRF
5. Insecure direct object references (IDOR)
6. Security misconfiguration
7. Sensitive data exposure

**Deliverables:**
- Penetration test report
- List of vulnerabilities (with severity: Critical, High, Medium, Low)
- Remediation recommendations

**Success Criteria:**
- ✅ No Critical or High vulnerabilities
- ✅ All Medium vulnerabilities have remediation plan

---

### SEC-PEN-002: Internal Penetration Test

**Objective:** Test VoP Responder from internal network perspective.

**Scope:**
- VoP Responder API
- Database access
- Internal network segmentation

**Test cases:**
1. Privilege escalation
2. Lateral movement
3. Database access control
4. Internal API exposure

**Success Criteria:**
- ✅ Network segmentation enforced
- ✅ Database access requires authentication
- ✅ No internal APIs exposed publicly

---

### SEC-PEN-003: API Fuzzing

**Objective:** Fuzz VoP API to find unexpected behavior.

**Tools:**
- Burp Suite Intruder
- OWASP ZAP Fuzzer
- ffuf
- wfuzz

**Test:**
```bash
# Fuzz IBAN field
ffuf -w payloads.txt -u https://vop-router.nbu.gov.ua/v1/verify \
  -X POST -H "Content-Type: application/json" \
  -d '{"payee":{"iban":"FUZZ","name":"Test"}}'
```

**Payloads:**
- Special characters: `<>'";&|`
- SQL keywords: `SELECT, UNION, DROP`
- Long strings: 10,000 characters
- Unicode characters: `\u0000`, `\uFFFF`
- Format strings: `%s%s%s%s`

**Success Criteria:**
- ✅ No crashes
- ✅ All invalid inputs rejected gracefully
- ✅ No sensitive error messages

---

## Security Scan Tools

### SAST (Static Application Security Testing)

**Tools:**
- **SonarQube** — code quality and security
- **Checkmarx** — SAST для enterprise
- **Semgrep** — open-source SAST

**Example (SonarQube):**
```bash
sonar-scanner \
  -Dsonar.projectKey=vop-router \
  -Dsonar.sources=src \
  -Dsonar.host.url=https://sonarqube.nbu.gov.ua
```

**Checks:**
- SQL injection vulnerabilities
- Hardcoded credentials
- Weak cryptography
- Insecure random number generation
- Path traversal

---

### DAST (Dynamic Application Security Testing)

**Tools:**
- **OWASP ZAP** — open-source DAST
- **Burp Suite Professional** — commercial DAST
- **Acunetix** — web vulnerability scanner

**Example (OWASP ZAP):**
```bash
docker run -v $(pwd):/zap/wrk/:rw \
  owasp/zap2docker-stable zap-baseline.py \
  -t https://vop-staging.nbu.gov.ua \
  -r zap_report.html
```

---

### Dependency Vulnerability Scanning

**Tools:**
- **npm audit** (Node.js)
- **pip-audit** (Python)
- **OWASP Dependency-Check**
- **Snyk**

**Example:**
```bash
# Node.js
npm audit
npm audit fix

# Python
pip-audit
```

**Success Criteria:**
- ✅ No High or Critical vulnerabilities in dependencies
- ✅ All dependencies up to date

---

### Container Image Scanning

**Tools:**
- **Trivy** (Aqua Security)
- **Clair** (CoreOS)
- **Anchore**

**Example (Trivy):**
```bash
trivy image vop-router:latest
```

**Success Criteria:**
- ✅ No Critical vulnerabilities in base image
- ✅ All OS packages updated

---

## Compliance Checklist

### OWASP Top 10 (2021)

- [ ] **A01:2021 – Broken Access Control**
  - [ ] Authorization rules enforced
  - [ ] No IDOR vulnerabilities
  - [ ] Least privilege principle

- [ ] **A02:2021 – Cryptographic Failures**
  - [ ] TLS 1.2+ only
  - [ ] Strong cipher suites
  - [ ] Data encrypted at rest

- [ ] **A03:2021 – Injection**
  - [ ] SQL injection prevented (parameterized queries)
  - [ ] XSS prevented (input validation, output escaping)
  - [ ] Command injection prevented

- [ ] **A04:2021 – Insecure Design**
  - [ ] Threat modeling completed
  - [ ] Security requirements defined
  - [ ] Secure design patterns used

- [ ] **A05:2021 – Security Misconfiguration**
  - [ ] Default credentials changed
  - [ ] Unnecessary services disabled
  - [ ] Security headers configured
  - [ ] Error messages don't expose internals

- [ ] **A06:2021 – Vulnerable and Outdated Components**
  - [ ] All dependencies up to date
  - [ ] Vulnerability scanning in CI/CD
  - [ ] Patch management process

- [ ] **A07:2021 – Identification and Authentication Failures**
  - [ ] mTLS implemented
  - [ ] OAuth 2.0 + FAPI
  - [ ] Session management secure
  - [ ] No default credentials

- [ ] **A08:2021 – Software and Data Integrity Failures**
  - [ ] Code signing
  - [ ] Dependency integrity (checksums)
  - [ ] CI/CD pipeline secured

- [ ] **A09:2021 – Security Logging and Monitoring Failures**
  - [ ] All security events logged
  - [ ] Real-time monitoring
  - [ ] Alerting configured
  - [ ] Incident response plan

- [ ] **A10:2021 – Server-Side Request Forgery (SSRF)**
  - [ ] URL validation
  - [ ] Network segmentation
  - [ ] Whitelist allowed domains

---

### OWASP ASVS Level 2

**Authentication (V2):**
- [ ] Multi-factor authentication (mTLS + OAuth)
- [ ] Password policy (N/A — використовується mTLS)
- [ ] Session timeout enforced

**Session Management (V3):**
- [ ] Session tokens secure (OAuth tokens)
- [ ] Token rotation
- [ ] Secure logout

**Access Control (V4):**
- [ ] Least privilege
- [ ] Authorization checks on every request
- [ ] No IDOR

**Validation, Sanitization and Encoding (V5):**
- [ ] Input validation (whitelist)
- [ ] Output encoding
- [ ] JSON schema validation

**Cryptography (V6):**
- [ ] TLS 1.2+
- [ ] Strong algorithms (AES-256, RSA-2048+)
- [ ] No hardcoded secrets

**Error Handling and Logging (V7):**
- [ ] Generic error messages (no stack traces)
- [ ] All errors logged
- [ ] PII not in logs

**Data Protection (V8):**
- [ ] Data encrypted in transit (TLS)
- [ ] Data encrypted at rest
- [ ] GDPR compliance

**Communications (V9):**
- [ ] TLS for all communications
- [ ] Certificate validation
- [ ] HSTS enabled

**API and Web Service (V13):**
- [ ] RESTful API security
- [ ] Rate limiting
- [ ] API versioning

---

### PCI DSS 3.2.1 (якщо застосовно)

- [ ] **Requirement 1:** Install and maintain firewall
- [ ] **Requirement 2:** Do not use vendor defaults
- [ ] **Requirement 3:** Protect stored cardholder data
  - (N/A — VoP не зберігає card data)
- [ ] **Requirement 4:** Encrypt transmission of data
  - [ ] TLS 1.2+
- [ ] **Requirement 6:** Develop secure systems
  - [ ] Secure SDLC
  - [ ] Code review
  - [ ] Vulnerability scanning
- [ ] **Requirement 8:** Identify and authenticate access
  - [ ] mTLS + OAuth
- [ ] **Requirement 10:** Track and monitor all access
  - [ ] Audit logging
- [ ] **Requirement 11:** Regularly test security systems
  - [ ] Penetration testing annually
  - [ ] Vulnerability scanning quarterly

---

### NBU Security Requirements

- [ ] mTLS з сертифікатами АЦСК
- [ ] OAuth 2.0 + FAPI для авторизації
- [ ] TLS 1.2 або вище
- [ ] Audit logging (retention 1 рік)
- [ ] Data retention 90 днів (GDPR)
- [ ] Incident reporting (протягом 24 годин)
- [ ] Annual security audit
- [ ] Disaster Recovery plan (RPO < 4 год, RTO < 1 год)

---

## Security Testing Schedule

### Pre-Production

- [ ] SAST (continuous — every commit)
- [ ] Dependency scanning (daily)
- [ ] DAST (weekly)
- [ ] Manual security testing (sprint review)

### Production

- [ ] Vulnerability scanning (weekly)
- [ ] Penetration testing (annually)
- [ ] Security audit (annually)
- [ ] Compliance review (quarterly)

---

## Incident Response

**У випадку виявлення security issue:**

1. **Severity assessment:**
   - **Critical:** Immediate data breach, system compromise
   - **High:** Potential data breach, authentication bypass
   - **Medium:** DoS vulnerability, information disclosure
   - **Low:** Security configuration issue

2. **Response timeline:**
   - **Critical:** Fix within 24 hours
   - **High:** Fix within 7 days
   - **Medium:** Fix within 30 days
   - **Low:** Fix in next release

3. **Notification:**
   - NBU notified immediately (Critical/High)
   - Affected participants notified (if applicable)
   - Post-incident report (RCA)

---

## Test Execution Checklist

### Pre-Test

- [ ] Test environment prepared (staging)
- [ ] Test certificates issued
- [ ] Test accounts created
- [ ] Backup created
- [ ] Stakeholders notified

### During Test

- [ ] All test cases executed
- [ ] Results documented
- [ ] Screenshots/evidence captured
- [ ] Vulnerabilities reported

### Post-Test

- [ ] Test report created
- [ ] Vulnerabilities prioritized
- [ ] Remediation plan created
- [ ] Re-test scheduled (after fixes)

---

## Підсумок

**Security testing для VoP включає:**

1. **Authentication & Authorization** — mTLS, OAuth 2.0, certificate validation
2. **Encryption** — TLS 1.2+, strong ciphers, data at rest encryption
3. **Input Validation** — SQL injection, XSS, command injection prevention
4. **API Security** — rate limiting, request validation, security headers
5. **Certificate Management** — expiration monitoring, CRL/OCSP, rotation
6. **DoS Protection** — rate limiting, connection limits, request size limits
7. **GDPR Compliance** — data minimization, retention, encryption
8. **Audit Logging** — comprehensive logging, tamper-prevention
9. **Penetration Testing** — external and internal tests, API fuzzing
10. **Compliance** — OWASP Top 10, ASVS Level 2, PCI DSS (якщо застосовно)

**Рекомендації:**
- ✅ Automated security testing в CI/CD
- ✅ Annual penetration testing
- ✅ Quarterly compliance review
- ✅ Security training для developers
- ✅ Bug bounty program (опціонально)

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-07
**Наступний review:** після пілоту (6 місяців)

---

## Контакти

**NBU Security Team:**
- Email: security@bank.gov.ua
- Incident reporting: security-incidents@bank.gov.ua
- Phone: +380-44-XXX-XXXX (24/7 hotline)

**Для звітування вразливостей:**
- Email: security-bugs@bank.gov.ua
- PGP key: https://bank.gov.ua/security/pgp-key.asc
