# Рекомендації з безпеки для VoP СЕП НБУ

## Зміст

1. [Загальні принципи безпеки](#загальні-принципи-безпеки)
2. [Автентифікація та авторизація](#автентифікація-та-авторизація)
3. [Шифрування даних](#шифрування-даних)
4. [Управління сертифікатами](#управління-сертифікатами)
5. [Захист від атак](#захист-від-атак)
6. [Конфіденційність та GDPR](#конфіденційність-та-gdpr)
7. [Audit та compliance](#audit-та-compliance)

---

## 1. Загальні принципи безпеки

### 1.1 Security by Design

VoP система побудована з урахуванням безпеки на кожному рівні:

```
Layer 1: Network Security
  - mTLS (Mutual TLS)
  - TLS 1.3
  - IP whitelisting
  - DDoS protection

Layer 2: Application Security
  - OAuth 2.0 + FAPI
  - API rate limiting
  - Input validation
  - Output encoding

Layer 3: Data Security
  - Encryption at rest
  - Encryption in transit
  - Data minimization
  - Pseudonymization

Layer 4: Operational Security
  - Audit logging
  - Monitoring and alerting
  - Incident response
  - Regular security audits
```

### 1.2 Security Requirements

**Обов'язкові вимоги:**

- ✅ TLS 1.3 (мінімум TLS 1.2)
- ✅ mTLS для bank-to-bank communication
- ✅ OAuth 2.0 FAPI для авторизації
- ✅ QWAC сертифікати
- ✅ Rate limiting
- ✅ Audit logging всіх операцій
- ✅ GDPR compliance

---

## 2. Автентифікація та авторизація

### 2.1 mTLS (Mutual TLS)

**Призначення:** Взаємна автентифікація банків

**Процес:**
```
1. Client (Requester) надсилає свій сертифікат до Server (Router/Responder)
2. Server валідує client certificate:
   - Перевіряє підпис CA
   - Перевіряє термін дії (not expired)
   - Перевіряє revocation status (CRL / OCSP)
   - Перевіряє Subject DN (NBU ID, BIC)
3. Server надсилає свій сертифікат до Client
4. Client валідує server certificate
5. Встановлюється зашифроване TLS з'єднання
```

**Конфігурація mTLS (NGINX):**

```nginx
server {
    listen 443 ssl http2;
    server_name vop.yourbank.ua;

    # TLS 1.3
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;

    # Server certificate
    ssl_certificate /etc/ssl/certs/vop-server.crt;
    ssl_certificate_key /etc/ssl/private/vop-server.key;

    # Client certificate (mTLS)
    ssl_client_certificate /etc/ssl/certs/nbu-ca-bundle.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    # OCSP Stapling (для перевірки revocation)
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/ssl/certs/nbu-ca-bundle.crt;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location /vop/v1/ {
        # Передати client certificate info до backend
        proxy_set_header X-Client-Certificate $ssl_client_cert;
        proxy_set_header X-Client-Verify $ssl_client_verify;
        proxy_set_header X-Client-DN $ssl_client_s_dn;

        proxy_pass http://vop-backend;
    }
}
```

**Валідація client certificate в backend:**

```python
# backend validation
from flask import request

def validate_client_certificate():
    """
    Валідує client certificate передан© nginx
    """
    # 1. Перевірити, що certificate був валідований nginx
    client_verify = request.headers.get('X-Client-Verify')
    if client_verify != 'SUCCESS':
        raise SecurityError('Client certificate validation failed')

    # 2. Витягнути Subject DN
    client_dn = request.headers.get('X-Client-DN')
    # Приклад: "CN=vop.privatbank.ua,O=PrivatBank,C=UA"

    # 3. Перевірити NBU ID або BIC
    if not is_authorized_participant(client_dn):
        raise SecurityError('Client not authorized for VoP')

    return True

def is_authorized_participant(client_dn):
    """
    Перевіряє, чи клієнт є авторизованим учасником VoP
    """
    # Витягнути CN (Common Name)
    import re
    cn_match = re.search(r'CN=([^,]+)', client_dn)
    if not cn_match:
        return False

    cn = cn_match.group(1)

    # Перевірити в whitelist
    return directory_service.is_participant(cn)
```

### 2.2 OAuth 2.0 + FAPI

**Призначення:** Авторизація API запитів

**Financial-grade API (FAPI) вимоги:**
- ✅ Використання JWT (signed tokens)
- ✅ Short token lifetime (15-60 minutes)
- ✅ Token binding (MTLS або DPoP)
- ✅ Scope-based authorization

**OAuth 2.0 Flow (Client Credentials):**

```
┌──────────┐                                  ┌─────────────┐
│  Client  │                                  │ Auth Server │
│  (Bank)  │                                  │    (NBU)    │
└────┬─────┘                                  └──────┬──────┘
     │                                               │
     │ 1. POST /oauth/token                         │
     │    grant_type=client_credentials             │
     │    client_id={id}                            │
     │    client_secret={secret}                    │
     │    scope=vop:request                         │
     ├──────────────────────────────────────────────►
     │                                               │
     │ 2. Validate client credentials               │
     │                                               │
     │ 3. Issue access_token (JWT)                  │
     │◄──────────────────────────────────────────────┤
     │   {                                           │
     │     "access_token": "eyJhbGc...",            │
     │     "token_type": "Bearer",                   │
     │     "expires_in": 3600,                       │
     │     "scope": "vop:request"                    │
     │   }                                           │
     │                                               │
     │ 4. Use access_token for API calls            │
     │    Authorization: Bearer eyJhbGc...          │
     │                                               │
```

**JWT Token Format:**

```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT",
    "kid": "nbu-key-2026-01"
  },
  "payload": {
    "iss": "https://auth.nbu.gov.ua",
    "sub": "300023",
    "aud": "https://vop-router.nbu.gov.ua",
    "exp": 1707228000,
    "iat": 1707224400,
    "scope": "vop:request vop:respond",
    "bic": "PRYBUA2XXXX",
    "nbu_id": "300023"
  },
  "signature": "..."
}
```

**Token Validation:**

```javascript
// token-validator.js
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

class TokenValidator {
  constructor(authServerUrl) {
    this.client = jwksClient({
      jwksUri: `${authServerUrl}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true
    });
  }

  async validate(token) {
    // 1. Decode token header
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      throw new Error('Invalid token format');
    }

    // 2. Get signing key
    const key = await this.getSigningKey(decoded.header.kid);

    // 3. Verify signature and claims
    const verified = jwt.verify(token, key, {
      audience: 'https://vop-router.nbu.gov.ua',
      issuer: 'https://auth.nbu.gov.ua',
      algorithms: ['RS256']
    });

    // 4. Validate scopes
    if (!this.hasRequiredScope(verified.scope)) {
      throw new Error('Insufficient scope');
    }

    return verified;
  }

  async getSigningKey(kid) {
    return new Promise((resolve, reject) => {
      this.client.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(err);
        } else {
          resolve(key.getPublicKey());
        }
      });
    });
  }

  hasRequiredScope(scope) {
    const scopes = scope.split(' ');
    return scopes.includes('vop:request') || scopes.includes('vop:respond');
  }
}
```

### 2.3 API Keys (додатково)

Для додаткової ідентифікації запитів:

```http
POST /vop/v1/verify
Authorization: Bearer {access_token}
X-API-Key: {bank_api_key}
X-NBU-ID: 300023
```

---

## 3. Шифрування даних

### 3.1 Encryption in Transit

**TLS 1.3 Configuration:**

```yaml
TLS Configuration:
  version: TLS 1.3 (preferred) / TLS 1.2 (minimum)

  cipher_suites:
    TLS 1.3:
      - TLS_AES_256_GCM_SHA384
      - TLS_CHACHA20_POLY1305_SHA256
      - TLS_AES_128_GCM_SHA256

    TLS 1.2 (fallback):
      - ECDHE-RSA-AES256-GCM-SHA384
      - ECDHE-RSA-AES128-GCM-SHA256

  key_exchange:
    - ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)
    - Forward Secrecy enabled

  certificate:
    - RSA 4096-bit або ECC P-384
    - SHA-256 signature
```

### 3.2 Encryption at Rest

**Database Encryption:**

```sql
-- PostgreSQL Transparent Data Encryption
-- Шифрування на рівні tablespace

CREATE TABLESPACE vop_encrypted
  LOCATION '/data/vop_encrypted'
  WITH (encryption = 'on', encryption_key = 'key-id-123');

CREATE TABLE vop_logs (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL,
  iban_encrypted BYTEA NOT NULL,  -- Шифроване IBAN
  name_hash VARCHAR(64) NOT NULL,  -- Hash імені (SHA-256)
  match_status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
) TABLESPACE vop_encrypted;

-- Функція для шифрування IBAN
CREATE OR REPLACE FUNCTION encrypt_iban(iban TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(iban, current_setting('app.encryption_key'));
END;
$$ LANGUAGE plpgsql;

-- Функція для дешифрування IBAN
CREATE OR REPLACE FUNCTION decrypt_iban(encrypted BYTEA)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted, current_setting('app.encryption_key'));
END;
$$ LANGUAGE plpgsql;
```

**Application-level Encryption:**

```python
# encryption.py
from cryptography.fernet import Fernet
import hashlib

class DataProtection:
    def __init__(self, encryption_key):
        self.cipher = Fernet(encryption_key)

    def encrypt_iban(self, iban):
        """
        Шифрує IBAN для зберігання в БД
        """
        return self.cipher.encrypt(iban.encode())

    def decrypt_iban(self, encrypted_iban):
        """
        Дешифрує IBAN з БД
        """
        return self.cipher.decrypt(encrypted_iban).decode()

    def hash_name(self, name):
        """
        Створює hash імені (для логів)
        """
        return hashlib.sha256(name.encode()).hexdigest()

    def mask_iban(self, iban):
        """
        Маскує IBAN для відображення
        UA21********66001
        """
        return iban[:4] + '*' * 8 + iban[-5:]
```

### 3.3 Payload Encryption (опційно)

Для додаткового захисту можна шифрувати весь payload:

```javascript
// JWE (JSON Web Encryption)
const jose = require('jose');

async function encryptPayload(payload, publicKey) {
  const jwe = await new jose.CompactEncrypt(
    new TextEncoder().encode(JSON.stringify(payload))
  )
    .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
    .encrypt(publicKey);

  return jwe;
}

async function decryptPayload(jwe, privateKey) {
  const { plaintext } = await jose.compactDecrypt(jwe, privateKey);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
```

---

## 4. Управління сертифікатами

### 4.1 Certificate Lifecycle

```
┌────────────┐
│  Generate  │ ← CSR (Certificate Signing Request)
│    CSR     │
└─────┬──────┘
      │
      ▼
┌────────────┐
│   Submit   │ ← Подати CSR до CA (НБУ або акредитований)
│   to CA    │
└─────┬──────┘
      │
      ▼
┌────────────┐
│   Issue    │ ← CA підписує сертифікат
│    Cert    │
└─────┬──────┘
      │
      ▼
┌────────────┐
│   Deploy   │ ← Встановити на сервери
│    Cert    │
└─────┬──────┘
      │
      ▼
┌────────────┐
│  Monitor   │ ← Моніторинг expiration
│  Expiry    │
└─────┬──────┘
      │
      ▼
┌────────────┐
│   Renew    │ ← Оновити за 30 днів до expiry
│    Cert    │
└─────┬──────┘
      │
      ▼
┌────────────┐
│   Revoke   │ ← Відкликати при компрометації
│ (if needed)│
└────────────┘
```

### 4.2 Certificate Generation

```bash
#!/bin/bash
# generate-vop-cert.sh

# 1. Generate private key
openssl genrsa -out vop-private.key 4096

# 2. Generate CSR
openssl req -new -key vop-private.key -out vop.csr \
  -subj "/C=UA/O=YourBank/OU=VoP/CN=vop.yourbank.ua" \
  -addext "subjectAltName=DNS:vop.yourbank.ua,DNS:vop-backup.yourbank.ua"

# 3. Submit CSR to CA (НБУ або акредитований CA)
# ... manually or via ACME protocol

# 4. Після отримання сертифіката від CA
# Перевірити сертифікат
openssl x509 -in vop.crt -text -noout

# 5. Створити certificate bundle
cat vop.crt intermediate-ca.crt root-ca.crt > vop-bundle.crt

# 6. Встановити права доступу
chmod 600 vop-private.key
chmod 644 vop-bundle.crt
```

### 4.3 Certificate Monitoring

```python
# cert-monitor.py
from datetime import datetime, timedelta
import OpenSSL
import ssl

def check_certificate_expiry(hostname, port=443):
    """
    Перевіряє термін дії сертифіката
    """
    cert = ssl.get_server_certificate((hostname, port))
    x509 = OpenSSL.crypto.load_certificate(OpenSSL.crypto.FILETYPE_PEM, cert)

    # Отримати expiry date
    expiry_date = datetime.strptime(x509.get_notAfter().decode('ascii'), '%Y%m%d%H%M%SZ')

    # Перевірити, скільки днів залишилось
    days_remaining = (expiry_date - datetime.now()).days

    if days_remaining < 30:
        send_alert(f"Certificate for {hostname} expires in {days_remaining} days")

    return days_remaining

# Cron job для перевірки кожен день
# 0 9 * * * python cert-monitor.py
```

### 4.4 Certificate Revocation

**Якщо сертифікат скомпрометовано:**

```bash
# 1. Негайно відкликати сертифікат у CA
# 2. Згенерувати новий сертифікат
# 3. Оновити конфігурацію серверів
# 4. Перезапустити сервіси з новим сертифікатом
# 5. Повідомити НБУ та інших учасників

# Перевірка revocation status (OCSP)
openssl ocsp -issuer intermediate-ca.crt \
  -cert vop.crt \
  -url http://ocsp.ca.example.com \
  -CAfile root-ca.crt
```

---

## 5. Захист від атак

### 5.1 DDoS Protection

**Rate Limiting:**

```nginx
# NGINX rate limiting
http {
    # Limit requests по IP
    limit_req_zone $binary_remote_addr zone=vop_by_ip:10m rate=10r/s;

    # Limit requests по NBU ID (з JWT token)
    limit_req_zone $http_x_nbu_id zone=vop_by_bank:10m rate=100r/s;

    server {
        location /vop/v1/verify {
            limit_req zone=vop_by_ip burst=20 nodelay;
            limit_req zone=vop_by_bank burst=500 nodelay;
            limit_req_status 429;

            proxy_pass http://vop-backend;
        }
    }
}
```

**Application-level Rate Limiting:**

```python
# rate-limiter.py
from redis import Redis
from datetime import datetime

class RateLimiter:
    def __init__(self, redis_client):
        self.redis = redis_client

    def is_allowed(self, bank_id, max_requests=100, window_seconds=60):
        """
        Перевіряє, чи дозволено запит для банку
        """
        key = f"rate_limit:{bank_id}:{datetime.now().minute}"
        current = self.redis.incr(key)

        if current == 1:
            self.redis.expire(key, window_seconds)

        return current <= max_requests

# Використання
limiter = RateLimiter(redis_client)

@app.route('/vop/v1/verify', methods=['POST'])
def verify():
    bank_id = get_bank_id_from_token()

    if not limiter.is_allowed(bank_id):
        return jsonify({'error': 'Rate limit exceeded'}), 429

    # Process request...
```

### 5.2 Input Validation

```python
# validation.py
from jsonschema import validate, ValidationError
import re

VOP_REQUEST_SCHEMA = {
    "type": "object",
    "required": ["requestId", "timestamp", "requester", "payee"],
    "properties": {
        "requestId": {
            "type": "string",
            "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
        },
        "payee": {
            "type": "object",
            "properties": {
                "iban": {
                    "type": "string",
                    "pattern": "^UA\\d{27}$"
                },
                "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 140
                }
            }
        }
    }
}

def validate_vop_request(request_data):
    """
    Валідує VoP request
    """
    try:
        # 1. JSON Schema validation
        validate(instance=request_data, schema=VOP_REQUEST_SCHEMA)

        # 2. IBAN checksum validation
        if not validate_iban_checksum(request_data['payee']['iban']):
            raise ValidationError("Invalid IBAN checksum")

        # 3. Sanitize name (remove dangerous characters)
        request_data['payee']['name'] = sanitize_name(request_data['payee']['name'])

        return True

    except ValidationError as e:
        raise ValueError(f"Invalid request: {e.message}")

def sanitize_name(name):
    """
    Очищує ім'я від небезпечних символів
    """
    # Remove control characters
    name = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', name)

    # Remove SQL injection patterns
    dangerous_patterns = ['--', ';', '/*', '*/', 'xp_', 'sp_', 'DROP', 'DELETE']
    for pattern in dangerous_patterns:
        name = name.replace(pattern, '')

    return name.strip()
```

### 5.3 SQL Injection Protection

```python
# Використовувати parametrized queries
def find_account_by_iban(iban):
    """
    Безпечний пошук рахунку (parametrized query)
    """
    query = "SELECT * FROM accounts WHERE iban = %s"
    cursor.execute(query, (iban,))  # ✅ Safe
    return cursor.fetchone()

# ❌ NEVER do this:
# query = f"SELECT * FROM accounts WHERE iban = '{iban}'"  # UNSAFE!
```

### 5.4 XSS Protection

```javascript
// Escape output for UI
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Використання
const verifiedName = escapeHtml(vopResponse.result.verifiedName);
document.getElementById('verified-name').textContent = verifiedName;
```

---

## 6. Конфіденційність та GDPR

### 6.1 Data Minimization

**Передавати тільки необхідні дані:**

```
✅ Передається:
- IBAN
- Ім'я
- Ідентифікаційний код (ЄДРПОУ/ІПН)

❌ НЕ передається:
- Номер телефону
- Email
- Адреса
- Дата народження
- Історія транзакцій
```

### 6.2 Retention Policy

```python
# data-retention.py
from datetime import datetime, timedelta

def cleanup_old_vop_logs():
    """
    Видалення логів старше 90 днів (GDPR requirement)
    """
    cutoff_date = datetime.now() - timedelta(days=90)

    # Видалити або анонімізувати
    db.execute("""
        DELETE FROM vop_logs
        WHERE created_at < %s
    """, (cutoff_date,))

    # Або анонімізувати
    db.execute("""
        UPDATE vop_logs
        SET iban_encrypted = NULL,
            name_hash = 'ANONYMIZED'
        WHERE created_at < %s
    """, (cutoff_date,))

# Cron job: щодня о 2:00
# 0 2 * * * python data-retention.py
```

### 6.3 Client Consent (Opt-out)

```python
# opt-out.py
def process_opt_out_request(client_id):
    """
    Обробка запиту клієнта на opt-out з VoP
    """
    # 1. Зареєструвати opt-out в БД
    db.execute("""
        UPDATE clients
        SET vop_opted_out = TRUE,
            vop_opt_out_date = NOW()
        WHERE client_id = %s
    """, (client_id,))

    # 2. Відповідь на майбутні VoP запити
    # При VoP запиті для цього клієнта:
    # return {matchStatus: 'NOT_SUPPORTED', reasonCode: 'OPTO'}

    # 3. Логування
    audit_log.info(f"Client {client_id} opted out from VoP")
```

---

## 7. Audit та Compliance

### 7.1 Audit Logging

```python
# audit-log.py
import logging
from datetime import datetime

class AuditLogger:
    def __init__(self):
        self.logger = logging.getLogger('vop.audit')

    def log_vop_request(self, request, response, user=None):
        """
        Логування VoP запиту (для аудиту)
        """
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'event_type': 'vop_request',
            'request_id': request['requestId'],
            'requester_bic': request['requester']['bic'],
            'responder_bic': response.get('responder', {}).get('bic'),
            'iban_masked': self.mask_iban(request['payee']['iban']),
            'name_hash': self.hash_name(request['payee']['name']),
            'match_status': response['result']['matchStatus'],
            'match_score': response['result'].get('matchScore'),
            'processing_time': response.get('processingTime'),
            'user_id': user.id if user else None,
            'ip_address': request.get('ip_address')
        }

        self.logger.info(json.dumps(log_entry))

    @staticmethod
    def mask_iban(iban):
        return iban[:4] + '*' * 8 + iban[-5:]

    @staticmethod
    def hash_name(name):
        import hashlib
        return hashlib.sha256(name.encode()).hexdigest()
```

### 7.2 Security Monitoring

```yaml
# Security alerts
groups:
- name: security_alerts
  rules:
  - alert: UnauthorizedAccessAttempt
    expr: rate(vop_auth_failures_total[5m]) > 10
    for: 1m
    annotations:
      summary: "High rate of authentication failures"

  - alert: SuspiciousActivity
    expr: rate(vop_no_match_total[10m]) > 0.5
    for: 5m
    annotations:
      summary: "High rate of NO_MATCH results (possible fraud)"

  - alert: RateLimitExceeded
    expr: rate(vop_rate_limit_exceeded_total[1m]) > 5
    for: 1m
    annotations:
      summary: "Bank exceeding rate limits"
```

### 7.3 Compliance Checklist

**Pre-production:**
- ☐ Security audit проведено
- ☐ Penetration testing виконано
- ☐ GDPR compliance перевірено
- ☐ Сертифікати валідні та встановлені
- ☐ Rate limiting налаштовано
- ☐ Audit logging активовано
- ☐ Monitoring та alerts налаштовані
- ☐ Incident response plan готовий
- ☐ Backup та recovery процедури протестовані

---

## Висновки

Безпека VoP системи забезпечується через:

✅ **mTLS** — взаємна автентифікація банків
✅ **OAuth 2.0 + FAPI** — авторизація запитів
✅ **TLS 1.3** — шифрування in transit
✅ **Encryption at rest** — захист даних в БД
✅ **Rate limiting** — захист від DDoS
✅ **Input validation** — захист від ін'єкцій
✅ **GDPR compliance** — захист персональних даних
✅ **Audit logging** — повний аудит операцій

---

**Версія:** 1.0
**Дата:** 2026-02-06
**Статус:** Draft
