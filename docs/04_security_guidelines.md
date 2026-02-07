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
   - Перевіряє Subject DN (Код ID НБУ / NBU ID)
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

    # 3. Перевірити Код ID НБУ (NBU ID)
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

**Огляд:**

Rate Limiting (обмеження швидкості запитів) є критично важливим механізмом захисту для VoP системи. Він запобігає:
- DDoS атакам та перевантаженню системи
- Зловживанням API з боку окремих учасників
- Непередбачуваним пікам навантаження
- Несправедливому розподілу ресурсів між учасниками

VoP система використовує багаторівневу стратегію rate limiting на різних рівнях архітектури.

---

#### 5.1.1 Політики обмежень VoP Router

**A. Глобальні ліміти (на рівні системи):**

| Метрика | Ліміт | Опис |
|---------|-------|------|
| Загальний RPS (requests per second) | 5,000 RPS | Максимальна пропускна здатність Router |
| Пікове навантаження | 10,000 RPS | Короткочасні сплески (до 10 сек) |
| Concurrent connections | 50,000 | Одночасні TLS з'єднання |

**B. Per-Client ліміти (на рівні учасника):**

```
Рівні обслуговування для Requester:
┌─────────────────┬──────────┬─────────┬──────────┐
│ Тип учасника    │ RPS      │ Burst   │ Денний   │
├─────────────────┼──────────┼─────────┼──────────┤
│ Tier 1 (банки)  │ 100 RPS  │ 200     │ 5M       │
│ Tier 2 (ННПП)   │ 50 RPS   │ 100     │ 2M       │
│ Tier 3 (малі)   │ 20 RPS   │ 40      │ 500K     │
│ Test environment│ 5 RPS    │ 10      │ 10K      │
└─────────────────┴──────────┴─────────┴──────────┘

Рівні обслуговування для Responder:
┌─────────────────┬──────────┬─────────┬──────────┐
│ Тип учасника    │ RPS      │ Burst   │ Денний   │
├─────────────────┼──────────┼─────────┼──────────┤
│ Tier 1 (банки)  │ 200 RPS  │ 400     │ 10M      │
│ Tier 2 (ННПП)   │ 100 RPS  │ 200     │ 5M       │
│ Tier 3 (малі)   │ 50 RPS   │ 100     │ 1M       │
│ Test environment│ 10 RPS   │ 20      │ 20K      │
└─────────────────┴──────────┴─────────┴──────────┘

Примітка: Responder ліміти вищі, оскільки один учасник
може отримувати запити від багатьох Requester одночасно.
```

**C. Per-IP ліміти (захист від атак):**

```yaml
ip_rate_limits:
  # Загальний ліміт на IP (для захисту від DDoS)
  global_per_ip: 50 RPS
  burst: 100

  # Блокування після перевищення
  ban_threshold: 1000 requests/minute
  ban_duration: 3600 seconds  # 1 година

  # Whitelist для trusted IP (NAT учасників)
  whitelist:
    - 203.0.113.0/24    # Bank A NAT range
    - 198.51.100.50     # Bank B static IP
```

---

#### 5.1.2 Конфігурація NGINX Rate Limiting

**Файл: `/etc/nginx/conf.d/vop-rate-limits.conf`**

```nginx
# Rate limiting zones
http {
    # 1. Per-IP rate limiting (захист від DDoS)
    limit_req_zone $binary_remote_addr
        zone=vop_by_ip:10m
        rate=50r/s;

    # 2. Per-Client rate limiting (по NBU ID з JWT)
    # NBU ID передається в custom header X-NBU-Client-ID
    limit_req_zone $http_x_nbu_client_id
        zone=vop_by_client:20m
        rate=100r/s;

    # 3. Global rate limiting (на весь Router)
    limit_req_zone $server_name
        zone=vop_global:5m
        rate=5000r/s;

    # 4. Connection limiting
    limit_conn_zone $binary_remote_addr
        zone=vop_conn_per_ip:10m;

    # Custom log format для rate limit events
    log_format rate_limit_log '$remote_addr - $http_x_nbu_client_id '
                              '[$time_local] "$request" $status '
                              'limit=$limit_req_status';

    # Map для whitelist IP
    geo $rate_limit_bypass {
        default 0;
        203.0.113.0/24 1;    # Bank A NAT
        198.51.100.50 1;     # Bank B IP
    }

    server {
        listen 443 ssl http2;
        server_name vop-router.bank.gov.ua;

        # SSL/TLS configuration...

        # Rate limit log
        access_log /var/log/nginx/vop-rate-limits.log rate_limit_log;

        # Apply rate limits to VoP endpoints
        location /vop/v1/verify {
            # Skip rate limiting для whitelisted IPs
            if ($rate_limit_bypass) {
                set $limit_key "";
            }
            if ($rate_limit_bypass = 0) {
                set $limit_key $binary_remote_addr;
            }

            # Per-IP limit (burst дозволяє короткочасні сплески)
            limit_req zone=vop_by_ip burst=100 nodelay;

            # Per-Client limit
            limit_req zone=vop_by_client burst=200 nodelay;

            # Global limit
            limit_req zone=vop_global burst=1000;

            # Connection limit (max 100 concurrent від одного IP)
            limit_conn vop_conn_per_ip 100;

            # HTTP 429 status для rate limit
            limit_req_status 429;
            limit_conn_status 429;

            # Custom error page
            error_page 429 = @rate_limit_error;

            proxy_pass http://vop-backend;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        # Інші endpoints...
        location /vop/v1/respond {
            limit_req zone=vop_by_ip burst=100 nodelay;
            limit_req zone=vop_by_client burst=400 nodelay;  # Вищий burst для Responder
            limit_req zone=vop_global burst=1000;
            limit_req_status 429;

            error_page 429 = @rate_limit_error;

            proxy_pass http://vop-backend;
        }

        # Custom 429 response
        location @rate_limit_error {
            internal;
            default_type application/json;
            return 429 '{"error":"RATE_LIMIT_EXCEEDED","message":"Too many requests. Please retry after some time.","retryAfter":60}';
            add_header Retry-After 60 always;
            add_header X-RateLimit-Limit $limit_req_zone_burst always;
            add_header X-RateLimit-Remaining 0 always;
        }
    }
}
```

---

#### 5.1.3 Application-Level Rate Limiting

**Python реалізація з Redis (Token Bucket алгоритм):**

```python
# vop_rate_limiter.py
from redis import Redis
from datetime import datetime
import time
import logging

logger = logging.getLogger(__name__)

class VopRateLimiter:
    """
    Token Bucket алгоритм для rate limiting.
    Підтримує різні tier для учасників та graceful degradation.
    """

    # Rate limit tiers (requests per second, burst, daily quota)
    TIERS = {
        'tier1_requester': {'rps': 100, 'burst': 200, 'daily': 5_000_000},
        'tier2_requester': {'rps': 50, 'burst': 100, 'daily': 2_000_000},
        'tier3_requester': {'rps': 20, 'burst': 40, 'daily': 500_000},
        'tier1_responder': {'rps': 200, 'burst': 400, 'daily': 10_000_000},
        'tier2_responder': {'rps': 100, 'burst': 200, 'daily': 5_000_000},
        'tier3_responder': {'rps': 50, 'burst': 100, 'daily': 1_000_000},
        'test': {'rps': 5, 'burst': 10, 'daily': 10_000},
    }

    def __init__(self, redis_client: Redis):
        self.redis = redis_client

    def is_allowed(self, client_id: str, tier: str, role: str = 'requester') -> tuple[bool, dict]:
        """
        Перевіряє, чи дозволено запит для клієнта.

        Returns:
            (allowed: bool, metadata: dict)
            metadata містить: remaining, reset_time, daily_remaining
        """
        tier_key = f"{tier}_{role}"
        if tier_key not in self.TIERS:
            logger.error(f"Unknown tier: {tier_key}")
            return False, {'error': 'Invalid tier'}

        config = self.TIERS[tier_key]

        # Перевірка RPS limit (Token Bucket)
        allowed_rps, rps_meta = self._check_token_bucket(
            client_id, config['rps'], config['burst']
        )

        # Перевірка daily quota
        allowed_daily, daily_remaining = self._check_daily_quota(
            client_id, config['daily']
        )

        allowed = allowed_rps and allowed_daily

        metadata = {
            'remaining': rps_meta['tokens'],
            'reset_time': rps_meta['reset_time'],
            'daily_remaining': daily_remaining,
            'tier': tier_key,
            'limit_rps': config['rps'],
            'limit_burst': config['burst'],
            'limit_daily': config['daily']
        }

        # Логування для аналітики
        if not allowed:
            reason = 'daily_quota' if not allowed_daily else 'rps_limit'
            logger.warning(
                f"Rate limit exceeded for {client_id} "
                f"(tier={tier_key}, reason={reason})"
            )
            self._record_rate_limit_event(client_id, tier_key, reason)

        return allowed, metadata

    def _check_token_bucket(self, client_id: str, rate: int, burst: int) -> tuple[bool, dict]:
        """
        Token Bucket algorithm implementation.
        Tokens поповнюються з швидкістю 'rate' tokens/second.
        Максимальна кількість tokens = burst.
        """
        key = f"rate_limit:bucket:{client_id}"
        now = time.time()

        # Lua script для атомарної операції
        lua_script = """
        local key = KEYS[1]
        local rate = tonumber(ARGV[1])
        local burst = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
        local tokens = tonumber(bucket[1]) or burst
        local last_update = tonumber(bucket[2]) or now

        -- Додаємо tokens за час, що минув
        local elapsed = now - last_update
        tokens = math.min(burst, tokens + elapsed * rate)

        local allowed = 0
        if tokens >= 1 then
            tokens = tokens - 1
            allowed = 1
        end

        -- Оновлюємо bucket
        redis.call('HMSET', key, 'tokens', tokens, 'last_update', now)
        redis.call('EXPIRE', key, 3600)  -- TTL 1 hour

        return {allowed, tokens, now + (1/rate)}
        """

        result = self.redis.eval(lua_script, 1, key, rate, burst, now)
        allowed = bool(result[0])
        remaining_tokens = int(result[1])
        reset_time = int(result[2])

        return allowed, {
            'tokens': remaining_tokens,
            'reset_time': reset_time
        }

    def _check_daily_quota(self, client_id: str, daily_limit: int) -> tuple[bool, int]:
        """
        Перевіряє денну квоту запитів.
        """
        today = datetime.utcnow().strftime('%Y-%m-%d')
        key = f"rate_limit:daily:{client_id}:{today}"

        try:
            current_count = self.redis.incr(key)

            # Set expiry на 25 годин (щоб не втратити дані при зміні доби)
            if current_count == 1:
                self.redis.expire(key, 90000)  # 25 hours

            remaining = max(0, daily_limit - current_count)
            allowed = current_count <= daily_limit

            return allowed, remaining

        except Exception as e:
            logger.error(f"Daily quota check failed: {e}")
            # У разі помилки Redis - дозволяємо запит (fail-open)
            return True, daily_limit

    def _record_rate_limit_event(self, client_id: str, tier: str, reason: str):
        """
        Записує rate limit event для моніторингу та аналітики.
        """
        timestamp = datetime.utcnow().isoformat()
        key = f"rate_limit:events:{datetime.utcnow().strftime('%Y-%m-%d')}"

        event = f"{timestamp}|{client_id}|{tier}|{reason}"
        self.redis.lpush(key, event)
        self.redis.ltrim(key, 0, 9999)  # Keep last 10K events
        self.redis.expire(key, 604800)  # 7 days

    def get_client_tier(self, client_id: str) -> str:
        """
        Отримує tier клієнта з конфігурації (можна зберігати в БД/Redis).
        """
        # Приклад: tier зберігається в Redis
        tier_key = f"client:tier:{client_id}"
        tier = self.redis.get(tier_key)

        if tier:
            return tier.decode('utf-8')

        # Default tier для невідомих клієнтів
        return 'tier3'


# Flask middleware для rate limiting
from flask import Flask, request, jsonify, g
from functools import wraps

app = Flask(__name__)
redis_client = Redis(host='localhost', port=6379, decode_responses=False)
rate_limiter = VopRateLimiter(redis_client)

def require_rate_limit(role='requester'):
    """
    Decorator для перевірки rate limits.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Отримуємо client_id з JWT token
            client_id = g.get('client_id')
            if not client_id:
                return jsonify({'error': 'UNAUTHORIZED'}), 401

            # Отримуємо tier клієнта
            tier = rate_limiter.get_client_tier(client_id)

            # Перевіряємо rate limit
            allowed, metadata = rate_limiter.is_allowed(client_id, tier, role)

            # Додаємо rate limit headers у відповідь
            @after_this_request
            def add_rate_limit_headers(response):
                response.headers['X-RateLimit-Limit'] = str(metadata.get('limit_rps', 0))
                response.headers['X-RateLimit-Remaining'] = str(metadata.get('remaining', 0))
                response.headers['X-RateLimit-Reset'] = str(metadata.get('reset_time', 0))
                response.headers['X-RateLimit-Daily-Remaining'] = str(metadata.get('daily_remaining', 0))
                return response

            if not allowed:
                retry_after = 60  # seconds
                response = jsonify({
                    'error': 'RATE_LIMIT_EXCEEDED',
                    'message': 'Too many requests. Please retry later.',
                    'retryAfter': retry_after,
                    'metadata': metadata
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                return response

            return f(*args, **kwargs)

        return decorated_function
    return decorator


# Використання
@app.route('/vop/v1/verify', methods=['POST'])
@require_rate_limit(role='requester')
def verify_request():
    # Process VoP request...
    return jsonify({'status': 'MATCH'})

@app.route('/vop/v1/respond', methods=['POST'])
@require_rate_limit(role='responder')
def verify_response():
    # Process VoP response...
    return jsonify({'status': 'success'})
```

---

#### 5.1.4 HTTP 429 Response Format

**Стандартна структура відповіді при перевищенні ліміту:**

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Request rate limit exceeded for client tier2_requester",
  "details": {
    "limitType": "rps",
    "currentTier": "tier2_requester",
    "limits": {
      "rps": 50,
      "burst": 100,
      "daily": 2000000
    },
    "usage": {
      "currentRps": 52,
      "dailyUsed": 1543210,
      "dailyRemaining": 456790
    }
  },
  "retryAfter": 60,
  "timestamp": "2026-02-06T14:32:15Z"
}
```

**HTTP Headers при 429:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1675695195
X-RateLimit-Daily-Limit: 2000000
X-RateLimit-Daily-Remaining: 456790
```

---

#### 5.1.5 Client-Side Rate Limit Handling

**Best practices для Requester/Responder при отриманні 429:**

```javascript
// vop-client-rate-limit-handler.js
class VopClientWithRateLimiting {
  constructor(baseUrl, credentials) {
    this.baseUrl = baseUrl;
    this.credentials = credentials;
    this.requestQueue = [];
    this.isProcessing = false;
  }

  async sendVopRequest(payload, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this._makeRequest(payload);

        // Зберігаємо rate limit info для моніторингу
        this._updateRateLimitMetrics(response.headers);

        return response.data;

      } catch (error) {
        if (error.response && error.response.status === 429) {
          attempt++;

          // Читаємо Retry-After header
          const retryAfter = this._getRetryAfter(error.response);

          if (attempt < maxRetries) {
            console.warn(
              `Rate limit exceeded. Retrying after ${retryAfter}s ` +
              `(attempt ${attempt}/${maxRetries})`
            );

            // Чекаємо перед retry
            await this._sleep(retryAfter * 1000);

            // Exponential backoff при повторних 429
            if (attempt > 1) {
              const backoff = Math.min(retryAfter * Math.pow(2, attempt - 1), 300);
              await this._sleep(backoff * 1000);
            }
          } else {
            // Вичерпано спроби - повертаємо помилку
            throw new Error(
              `Rate limit exceeded after ${maxRetries} retries. ` +
              `Please try again later.`
            );
          }
        } else {
          // Інша помилка - не retry
          throw error;
        }
      }
    }
  }

  _getRetryAfter(response) {
    // Пріоритет: Retry-After header > response body > default 60s
    const header = response.headers['retry-after'];
    if (header) {
      return parseInt(header, 10);
    }

    const body = response.data;
    if (body && body.retryAfter) {
      return body.retryAfter;
    }

    return 60;  // Default
  }

  _updateRateLimitMetrics(headers) {
    // Метрики для Prometheus/моніторингу
    const metrics = {
      limit: parseInt(headers['x-ratelimit-limit'] || 0),
      remaining: parseInt(headers['x-ratelimit-remaining'] || 0),
      reset: parseInt(headers['x-ratelimit-reset'] || 0),
      dailyRemaining: parseInt(headers['x-ratelimit-daily-remaining'] || 0)
    };

    // Попередження, якщо залишилось мало quota
    if (metrics.remaining < metrics.limit * 0.1) {
      console.warn(
        `Rate limit warning: only ${metrics.remaining} requests remaining`
      );
    }

    // Експортуємо метрики
    this._exportMetrics(metrics);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

#### 5.1.6 Emergency Bypass & Dynamic Adjustment

**Механізм аварійного bypass для критичних ситуацій:**

```python
# emergency_bypass.py
from enum import Enum

class BypassReason(Enum):
    SYSTEM_TEST = "system_test"
    REGULATOR_AUDIT = "regulator_audit"
    INCIDENT_RESPONSE = "incident_response"
    MIGRATION = "data_migration"

class EmergencyBypass:
    """
    Дозволяє тимчасово обійти rate limits для критичних операцій.
    Вимагає авторизації від NBU операторів.
    """

    def __init__(self, redis_client):
        self.redis = redis_client

    def create_bypass(
        self,
        client_id: str,
        reason: BypassReason,
        duration_minutes: int,
        authorized_by: str,
        justification: str
    ) -> str:
        """
        Створює тимчасовий bypass для клієнта.
        Повертає bypass_token.
        """
        import uuid
        from datetime import datetime, timedelta

        bypass_token = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(minutes=duration_minutes)

        bypass_data = {
            'client_id': client_id,
            'reason': reason.value,
            'authorized_by': authorized_by,
            'justification': justification,
            'created_at': datetime.utcnow().isoformat(),
            'expires_at': expires_at.isoformat(),
            'token': bypass_token
        }

        # Зберігаємо bypass
        key = f"rate_limit:bypass:{bypass_token}"
        self.redis.hmset(key, bypass_data)
        self.redis.expire(key, duration_minutes * 60)

        # Додаємо до списку активних bypass для аудиту
        audit_key = f"rate_limit:bypass:audit:{datetime.utcnow().strftime('%Y-%m')}"
        self.redis.lpush(audit_key, json.dumps(bypass_data))
        self.redis.expire(audit_key, 7776000)  # 90 days

        logger.warning(
            f"Emergency bypass created: client={client_id}, "
            f"reason={reason.value}, duration={duration_minutes}min, "
            f"by={authorized_by}"
        )

        return bypass_token

    def check_bypass(self, bypass_token: str) -> bool:
        """
        Перевіряє, чи дійсний bypass token.
        """
        key = f"rate_limit:bypass:{bypass_token}"
        return self.redis.exists(key)

# Інтеграція з rate limiter
def is_allowed_with_bypass(client_id, tier, role, bypass_token=None):
    if bypass_token and emergency_bypass.check_bypass(bypass_token):
        logger.info(f"Bypass applied for {client_id}")
        return True, {'bypass': True}

    return rate_limiter.is_allowed(client_id, tier, role)
```

**Динамічна зміна лімітів (без restart):**

```python
# dynamic_limits.py
class DynamicRateLimitManager:
    """
    Дозволяє NBU операторам динамічно змінювати rate limits
    без перезапуску системи.
    """

    def __init__(self, redis_client):
        self.redis = redis_client

    def update_client_tier(self, client_id: str, new_tier: str, reason: str):
        """
        Змінює tier клієнта (наприклад, при масштабуванні).
        """
        key = f"client:tier:{client_id}"
        old_tier = self.redis.get(key)

        self.redis.set(key, new_tier)

        # Логування зміни
        logger.info(
            f"Tier changed for {client_id}: {old_tier} -> {new_tier}. "
            f"Reason: {reason}"
        )

        # Аудит лог
        audit_key = f"rate_limit:tier_changes:{datetime.utcnow().strftime('%Y-%m')}"
        change_record = {
            'client_id': client_id,
            'old_tier': old_tier,
            'new_tier': new_tier,
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat()
        }
        self.redis.lpush(audit_key, json.dumps(change_record))

    def get_current_usage(self, client_id: str) -> dict:
        """
        Показує поточне використання rate limits для клієнта.
        """
        today = datetime.utcnow().strftime('%Y-%m-%d')
        daily_key = f"rate_limit:daily:{client_id}:{today}"

        daily_used = int(self.redis.get(daily_key) or 0)
        tier = self.redis.get(f"client:tier:{client_id}").decode('utf-8')

        return {
            'client_id': client_id,
            'tier': tier,
            'daily_used': daily_used,
            'timestamp': datetime.utcnow().isoformat()
        }
```

---

#### 5.1.7 Monitoring & Alerting

**Prometheus metrics для rate limiting:**

```python
# rate_limit_metrics.py
from prometheus_client import Counter, Gauge, Histogram

# Кількість rate limit events
rate_limit_exceeded_total = Counter(
    'vop_rate_limit_exceeded_total',
    'Total number of rate limit exceeded events',
    ['client_id', 'tier', 'reason']
)

# Поточне використання
rate_limit_usage_ratio = Gauge(
    'vop_rate_limit_usage_ratio',
    'Current rate limit usage ratio (0-1)',
    ['client_id', 'tier', 'limit_type']
)

# Latency rate limit checks
rate_limit_check_duration = Histogram(
    'vop_rate_limit_check_duration_seconds',
    'Duration of rate limit checks',
    ['tier']
)

def record_rate_limit_exceeded(client_id, tier, reason):
    rate_limit_exceeded_total.labels(
        client_id=client_id,
        tier=tier,
        reason=reason
    ).inc()

def update_usage_ratio(client_id, tier, limit_type, used, limit):
    ratio = used / limit if limit > 0 else 0
    rate_limit_usage_ratio.labels(
        client_id=client_id,
        tier=tier,
        limit_type=limit_type
    ).set(ratio)
```

**Alerting rules (Prometheus AlertManager):**

```yaml
# rate_limit_alerts.yml
groups:
  - name: vop_rate_limiting
    interval: 30s
    rules:
      # Alert: клієнт постійно перевищує ліміти
      - alert: VopRateLimitExceededFrequently
        expr: |
          rate(vop_rate_limit_exceeded_total[5m]) > 1
        for: 10m
        labels:
          severity: warning
          component: rate_limiter
        annotations:
          summary: "Client {{ $labels.client_id }} exceeds rate limits frequently"
          description: |
            Client {{ $labels.client_id }} (tier: {{ $labels.tier }})
            is exceeding rate limits at {{ $value }} times per second.
            This may indicate misconfiguration or abuse.

      # Alert: клієнт використав >90% денної квоти
      - alert: VopDailyQuotaNearlyExhausted
        expr: |
          vop_rate_limit_usage_ratio{limit_type="daily"} > 0.9
        for: 5m
        labels:
          severity: info
          component: rate_limiter
        annotations:
          summary: "Client {{ $labels.client_id }} has used >90% of daily quota"
          description: |
            Client {{ $labels.client_id }} (tier: {{ $labels.tier }})
            has used {{ $value | humanizePercentage }} of daily quota.

      # Alert: глобальний RPS близький до максимуму
      - alert: VopGlobalRateLimitNearCapacity
        expr: |
          rate(vop_requests_total[1m]) > 4500
        for: 5m
        labels:
          severity: warning
          component: rate_limiter
        annotations:
          summary: "VoP Router approaching global rate limit capacity"
          description: |
            Global RPS is {{ $value }}, approaching limit of 5000 RPS.
            Consider scaling or investigate traffic spike.
```

---

#### 5.1.8 Best Practices

**Рекомендації для учасників:**

1. **Implement exponential backoff:**
   - При отриманні 429 не retry негайно
   - Використовуйте Retry-After header
   - Додайте jitter для уникнення thundering herd

2. **Monitor your rate limit usage:**
   - Відстежуйте X-RateLimit-* headers
   - Встановіть alerts при досягненні 80% квоти
   - Плануйте масштабування заздалегідь

3. **Request tier upgrade:**
   - Якщо постійно перевищуєте ліміти, зверніться до NBU
   - Надайте обґрунтування та прогноз навантаження
   - Tier зміни виконуються протягом 1-2 робочих днів

4. **Cache VoP responses:**
   - Не робіть повторні запити для тих самих даних
   - Кешуйте результати локально (обережно з GDPR)

5. **Batch requests якщо можливо:**
   - Якщо API підтримує batch - використовуйте його
   - Групуйте запити замість відправки по одному

**Рекомендації для NBU операторів:**

1. **Регулярно переглядайте tier assignments:**
   - Щомісячний аналіз використання
   - Автоматичні рекомендації щодо upgrade/downgrade

2. **Моніторте аномальну поведінку:**
   - Раптові сплески від окремих клієнтів
   - Нічна активність (потенційно abuse)

3. **Підтримуйте whitelist актуальним:**
   - Додавайте trusted IP ranges
   - Видаляйте неактивних учасників

4. **Документуйте всі emergency bypass:**
   - Вимагайте письмове обґрунтування
   - Аудит всіх bypass кожного кварталу

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
- Ідентифікаційний код (ЄДРПОУ/РНОКПП)

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
