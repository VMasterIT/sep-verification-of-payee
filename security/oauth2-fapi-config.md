# OAuth 2.0 + FAPI Configuration для VoP

**Версія:** 1.0
**Дата:** 2026-02-06
**Аудиторія:** Банки, ННПП, Backend Developers, Security Engineers

---

## Зміст

1. [Вступ](#вступ)
2. [Що таке FAPI](#що-таке-fapi)
3. [OAuth 2.0 Flow для VoP](#oauth-20-flow-для-vop)
4. [Authorization Server Setup](#authorization-server-setup)
5. [Client Configuration](#client-configuration)
6. [Token Management](#token-management)
7. [Scopes та Permissions](#scopes-та-permissions)
8. [Security Considerations](#security-considerations)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Вступ

VoP використовує **OAuth 2.0 + FAPI** (Financial-grade API) для авторизації всіх API запитів.

**Що потрібно знати:**
- OAuth 2.0 забезпечує **авторизацію** (що клієнт має право робити)
- mTLS забезпечує **автентифікацію** (хто є клієнт)
- FAPI додає додаткові security requirements для фінансових API

**Комбінація mTLS + OAuth 2.0:**
```
┌────────────────────────────────────────────────────────────┐
│                 mTLS + OAuth 2.0 для VoP                   │
└────────────────────────────────────────────────────────────┘

1. mTLS Handshake
   Client ──[Certificate]──> VoP Router
   VoP Router: "OK, ти ПриватБанк (NBU ID: 305299)"
                                  │
                                  ▼
2. OAuth 2.0 Authorization
   Client ──[Access Token]──> VoP Router
   VoP Router: "OK, токен валідний, scope: vop:read vop:write"
                                  │
                                  ▼
3. API Request Processing
   VoP Router: "ПриватБанк (305299) має право на vop:write"
   VoP Router → Responder API
```

**Результат:**
- ✅ **Authentication:** VoP Router знає, хто є клієнт (mTLS)
- ✅ **Authorization:** VoP Router знає, що клієнт має право робити (OAuth token)

---

## Що таке FAPI

### FAPI = Financial-grade API

FAPI — це специфікація OpenID Foundation для high-security APIs у фінансовому секторі.

**Чому FAPI:**
- ✅ Stronger security ніж звичайний OAuth 2.0
- ✅ Захист від advanced attacks (CSRF, token substitution, replay attacks)
- ✅ Compliance з PSD2 та іншими фінансовими регуляціями
- ✅ Industry standard (UK Open Banking, EU PSD2, Australia CDR)

### FAPI вимоги

**FAPI додає до OAuth 2.0:**

1. **Mandatory mTLS** (holder-of-key binding)
2. **Signed JWT for requests** (JAR - JWT-Secured Authorization Request)
3. **PKCE** (Proof Key for Code Exchange) — для authorization code flow
4. **Stronger algorithms** (RSA 2048+ або ECDSA P-256)
5. **Short-lived tokens** (access token max 10 min)
6. **No implicit flow** (тільки authorization code flow)

**FAPI Profiles:**
- **FAPI 1.0 Baseline:** Basic security (для low-risk scenarios)
- **FAPI 1.0 Advanced:** High security (для high-risk scenarios) ← **VoP використовує це**
- **FAPI 2.0:** New version (not yet widely adopted)

---

## OAuth 2.0 Flow для VoP

### Client Credentials Flow (Рекомендовано для VoP)

VoP використовує **Client Credentials Grant** для machine-to-machine authentication.

```
┌─────────────────────────────────────────────────────────────┐
│          OAuth 2.0 Client Credentials Flow                  │
└─────────────────────────────────────────────────────────────┘

   Банк (Client)          Authorization Server (НБУ)
        │                           │
        │ 1. Token Request          │
        ├──────────────────────────>│
        │   POST /oauth/token       │
        │   grant_type=client_credentials
        │   client_id=305299        │
        │   client_assertion=JWT    │
        │   scope=vop:write         │
        │                           │
        │                      2. Validate:
        │                         - client_id
        │                         - client_assertion (JWT)
        │                         - mTLS certificate
        │                         - scope permissions
        │                           │
        │ 3. Access Token Response  │
        │<──────────────────────────┤
        │   {                       │
        │     "access_token": "...",│
        │     "token_type": "Bearer",
        │     "expires_in": 600     │
        │   }                       │
        │                           │
        ▼                           ▼

   Use access token for VoP API requests
        │
        │ 4. VoP API Request
        ├──────────────────────────> VoP Router
        │   Authorization: Bearer <token>
        │                           │
        │                      5. Validate token
        │                         - signature
        │                         - expiration
        │                         - scope
        │                           │
        │ 6. VoP Response           │
        │<──────────────────────────┤
```

**Чому Client Credentials Flow:**
- ✅ Machine-to-machine (no user interaction)
- ✅ Simple для implementation
- ✅ FAPI-compliant з client_assertion (JWT)

---

## Authorization Server Setup

НБУ надає Authorization Server для VoP. Банки НЕ потребують свій Authorization Server.

**НБУ Authorization Server:**
- **URL:** `https://auth.sep.nbu.gov.ua`
- **Token endpoint:** `https://auth.sep.nbu.gov.ua/oauth/token`
- **JWKs endpoint:** `https://auth.sep.nbu.gov.ua/.well-known/jwks.json`

### Authorization Server Endpoints

```
/.well-known/oauth-authorization-server
  → OAuth 2.0 metadata

/oauth/token
  → Token endpoint (для отримання access token)

/oauth/introspect
  → Token introspection (для перевірки токена)

/oauth/revoke
  → Token revocation (для revoke токена)

/.well-known/jwks.json
  → Public keys для JWT signature verification
```

---

## Client Configuration

### Крок 1: Реєстрація клієнта в НБУ

**Коли:** Під час onboarding до VoP (Фаза 1 пілот або Фаза 2 production)

**Що надати НБУ:**
```json
{
  "client_name": "АТ ПриватБанк VoP Client",
  "client_id": "305299",  // NBU ID як client_id
  "redirect_uris": [],    // Not needed для client credentials flow
  "grant_types": ["client_credentials"],
  "token_endpoint_auth_method": "private_key_jwt",  // FAPI requirement
  "jwks_uri": "https://vop.privatbank.ua/.well-known/jwks.json",
  "scope": "vop:read vop:write",
  "tls_client_certificate_bound_access_tokens": true  // mTLS binding
}
```

**НБУ надасть вам:**
- `client_id` (ваш NBU ID, наприклад "305299")
- Confirmation що ваш клієнт зареєстрований

### Крок 2: Генерація JWT Signing Key

Для `private_key_jwt` authentication потрібен окремий keypair (НЕ той самий, що для mTLS!).

```bash
# Generate JWT signing key (RSA 2048-bit)
openssl genrsa -out jwt-signing.key 2048

# Extract public key
openssl rsa -in jwt-signing.key -pubout -out jwt-signing-public.pem

# Convert to JWK format (для jwks.json)
# Use online tool або library (jose, jwcrypto, тощо)
```

**Publish JWK at `https://vop.privatbank.ua/.well-known/jwks.json`:**

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "privatbank-jwt-2026",
      "alg": "RS256",
      "n": "xGOr-H4z7...",  // Base64url-encoded modulus
      "e": "AQAB"           // Base64url-encoded exponent
    }
  ]
}
```

**Важливо:**
- Authorization Server буде fetch ваш jwks.json для verification
- Endpoint має бути publicly accessible (без auth)
- HTTPS обов'язковий

### Крок 3: Отримання Access Token

#### Request

```http
POST https://auth.sep.nbu.gov.ua/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=305299
&scope=vop:write
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByaXZhdGJhbmstand0LTIwMjYifQ.eyJpc3MiOiIzMDAwMjMiLCJzdWIiOiIzMDAwMjMiLCJhdWQiOiJodHRwczovL2F1dGguc2VwLm5idS5nb3YudWEvb2F1dGgvdG9rZW4iLCJleHAiOjE3MDcyMjMyMDAsImlhdCI6MTcwNzIyMjkwMCwianRpIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0.signature
```

**client_assertion JWT payload:**
```json
{
  "iss": "305299",                   // Issuer = your client_id
  "sub": "305299",                   // Subject = your client_id
  "aud": "https://auth.sep.nbu.gov.ua/oauth/token",  // Token endpoint
  "exp": 1707223200,                 // Expiration (max 5 min від iat)
  "iat": 1707222900,                 // Issued at
  "jti": "550e8400-e29b-41d4-a716-446655440000"  // Unique JWT ID
}
```

**Signed з вашим JWT signing key:**
```
Header:
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "privatbank-jwt-2026"  // Key ID з вашого jwks.json
}
```

#### Response (Success)

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 600,        // 10 minutes
  "scope": "vop:write"
}
```

**Access token є JWT:**
```json
{
  "iss": "https://auth.sep.nbu.gov.ua",
  "sub": "305299",
  "aud": "https://vop-router.sep.nbu.gov.ua",
  "exp": 1707223200,
  "iat": 1707222600,
  "scope": "vop:write",
  "client_id": "305299",
  "cnf": {                  // mTLS certificate confirmation
    "x5t#S256": "bwcK0esc3ACC3DB2Y5..."  // Certificate thumbprint
  }
}
```

---

## Token Management

### Access Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│               Access Token Lifecycle                        │
└─────────────────────────────────────────────────────────────┘

1. REQUEST TOKEN
   Client → Authorization Server
   (with client_assertion JWT + mTLS)
            │
            ▼
2. RECEIVE TOKEN (expires in 600 sec = 10 min)
   Client stores token in memory
            │
            ▼
3. USE TOKEN (for multiple VoP requests)
   Client → VoP Router (with Bearer token)
            │
            ▼
4a. TOKEN EXPIRES (after 10 min)
    Request new token (go to step 1)

4b. TOKEN REVOKED (emergency)
    Request new token immediately
```

### Token Caching Strategy

**DO:**
- ✅ Cache token in memory (Redis, Memcached)
- ✅ Refresh token за 1-2 хв до expiration (proactive refresh)
- ✅ Handle token refresh failures (fallback to new token request)

**DON'T:**
- ❌ НЕ store tokens in database (too slow, security risk)
- ❌ НЕ share tokens між processes (кожен process має свій token)
- ❌ НЕ request new token для кожного VoP request (waste of resources)

### Implementation Example (Node.js)

```javascript
class VopTokenManager {
  constructor() {
    this.token = null;
    this.expiresAt = null;
  }

  async getToken() {
    // Check if token is valid (не expired)
    if (this.token && Date.now() < this.expiresAt - 60000) {
      // Token valid для ще 1+ хвилин, use cached
      return this.token;
    }

    // Token expired або close to expiration, request new
    return await this.requestNewToken();
  }

  async requestNewToken() {
    const clientAssertion = this.createClientAssertion();

    const response = await fetch('https://auth.sep.nbu.gov.ua/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: '305299',
        scope: 'vop:write',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion
      })
    });

    const data = await response.json();

    // Cache token
    this.token = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000);

    return this.token;
  }

  createClientAssertion() {
    const jwt = require('jsonwebtoken');
    const fs = require('fs');

    const privateKey = fs.readFileSync('./jwt-signing.key');

    const payload = {
      iss: '305299',
      sub: '305299',
      aud: 'https://auth.sep.nbu.gov.ua/oauth/token',
      exp: Math.floor(Date.now() / 1000) + 300,  // 5 min
      iat: Math.floor(Date.now() / 1000),
      jti: this.generateUUID()
    };

    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: 'privatbank-jwt-2026'
    });
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Usage
const tokenManager = new VopTokenManager();

// In VoP API client
async function sendVopRequest(payload) {
  const token = await tokenManager.getToken();

  const response = await fetch('https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return await response.json();
}
```

---

## Scopes та Permissions

### VoP Scopes

| Scope | Опис | Для кого |
|-------|------|----------|
| `vop:read` | Read-only доступ (introspection, status check) | Всі учасники |
| `vop:write` | Відправка VoP requests | Requester (банки, ННПП) |
| `vop:respond` | Обробка VoP requests як Responder | Responder (банки, ННПП з рахунками) |
| `vop:admin` | Адміністративні операції (directory management) | НБУ тільки |

### Scope-based Authorization

VoP Router перевіряє scope перед обробкою request:

```javascript
// VoP Router authorization middleware
function checkScope(requiredScope) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Decode JWT (validate signature)
    const decoded = jwt.verify(token, publicKey);

    // Check scope
    const scopes = decoded.scope.split(' ');
    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Required scope: ${requiredScope}`
      });
    }

    next();
  };
}

// VoP verify endpoint requires vop:write
app.post('/api/vop/v1/verify', checkScope('vop:write'), vopVerifyHandler);
```

---

## Security Considerations

### 1. ✅ JWT Signing Key Security

**DO:**
- ✅ Generate separate key для JWT signing (не той самий що mTLS)
- ✅ Store private key securely (HSM, KMS, encrypted storage)
- ✅ Rotate JWT signing keys regularly (every 12 months)
- ✅ Use RS256 (RSA-SHA256) або ES256 (ECDSA-SHA256)

**DON'T:**
- ❌ НЕ use HS256 (symmetric key) для client_assertion
- ❌ НЕ reuse mTLS certificate для JWT signing
- ❌ НЕ hardcode private key в коді

### 2. ✅ Token Storage

**DO:**
- ✅ Store tokens in memory (RAM)
- ✅ Use in-memory cache (Redis, Memcached)
- ✅ Encrypt tokens at rest (якщо persistence потрібна)

**DON'T:**
- ❌ НЕ store tokens у database (security risk + performance hit)
- ❌ НЕ log tokens (у logs)
- ❌ НЕ expose tokens у URLs (query parameters)

### 3. ✅ Token Validation

VoP Router validates access tokens:

```javascript
function validateAccessToken(token) {
  // 1. Verify JWT signature
  const decoded = jwt.verify(token, authServerPublicKey);

  // 2. Check expiration
  if (decoded.exp < Date.now() / 1000) {
    throw new Error('Token expired');
  }

  // 3. Check audience
  if (decoded.aud !== 'https://vop-router.sep.nbu.gov.ua') {
    throw new Error('Invalid audience');
  }

  // 4. Check issuer
  if (decoded.iss !== 'https://auth.sep.nbu.gov.ua') {
    throw new Error('Invalid issuer');
  }

  // 5. Check mTLS binding (certificate thumbprint)
  const clientCert = req.socket.getPeerCertificate();
  const certThumbprint = crypto
    .createHash('sha256')
    .update(clientCert.raw)
    .digest('base64url');

  if (decoded.cnf['x5t#S256'] !== certThumbprint) {
    throw new Error('Token not bound to certificate');
  }

  // 6. Check scope
  const scopes = decoded.scope.split(' ');
  if (!scopes.includes('vop:write')) {
    throw new Error('Insufficient scope');
  }

  return decoded;
}
```

### 4. ✅ Replay Attack Prevention

**client_assertion має унікальний `jti` (JWT ID):**

```json
{
  "jti": "550e8400-e29b-41d4-a716-446655440000"
}
```

Authorization Server зберігає used `jti` values (протягом exp period) та відхиляє duplicates.

### 5. ✅ Rate Limiting

Authorization Server має rate limits:

| Endpoint | Rate Limit | Per |
|----------|------------|-----|
| `/oauth/token` | 100 requests | Per client per minute |
| `/oauth/introspect` | 500 requests | Per client per minute |

**Якщо перевищено:**
```json
{
  "error": "rate_limit_exceeded",
  "error_description": "Too many token requests. Retry after 60 seconds."
}
```

---

## Testing

### Test 1: Отримання Access Token

```bash
# Generate client_assertion JWT
# (use online JWT.io або library)

# Token request
curl -X POST https://auth.sep.nbu.gov.ua/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --cert vop-client.crt \
  --key vop-client.key \
  -d "grant_type=client_credentials" \
  -d "client_id=305299" \
  -d "scope=vop:write" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  -d "client_assertion=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."

# Expected response:
# {
#   "access_token": "eyJhbGc...",
#   "token_type": "Bearer",
#   "expires_in": 600,
#   "scope": "vop:write"
# }
```

### Test 2: Використання Access Token

```bash
# VoP API request з access token
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  --cert vop-client.crt \
  --key vop-client.key \
  -d '{
    "requestId": "test-123",
    "timestamp": "2026-02-06T10:00:00Z",
    "requester": {"nbuId": "305299"},
    "payee": {"iban": "UA213052990000026007233566001", "name": "TEST"}
  }'
```

### Test 3: Token Expiration

```bash
# Wait for token to expire (>10 min)
sleep 610

# Try using expired token (should fail)
curl -X POST https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify \
  -H "Authorization: Bearer <expired_token>" \
  ...

# Expected: 401 Unauthorized
# {
#   "error": "invalid_token",
#   "error_description": "Token expired"
# }
```

---

## Troubleshooting

### Problem 1: "invalid_client_assertion"

**Symptom:**
```json
{
  "error": "invalid_client",
  "error_description": "Invalid client_assertion"
}
```

**Причини:**
1. JWT signature invalid (wrong private key)
2. JWT expired (exp < now або exp > now + 5 min)
3. Wrong aud (має бути token endpoint URL)
4. Wrong iss/sub (має бути ваш client_id)

**Рішення:**
- Verify JWT на jwt.io
- Check private key matches public key в jwks.json
- Check timestamps (iat, exp)

---

### Problem 2: "insufficient_scope"

**Symptom:**
```json
{
  "error": "insufficient_scope",
  "error_description": "Required scope: vop:write"
}
```

**Причина:** Access token не має потрібного scope

**Рішення:**
- Request token з правильним scope: `scope=vop:write`
- Verify decoded token має scope field

---

### Problem 3: "Token not bound to certificate"

**Symptom:**
```json
{
  "error": "invalid_token",
  "error_description": "Token not bound to mTLS certificate"
}
```

**Причина:** Access token отриманий з одним mTLS certificate, але використовується з іншим

**Рішення:**
- Використовуйте той самий mTLS certificate для token request і VoP API requests
- Verify `cnf.x5t#S256` у token matches ваш certificate thumbprint

---

## Контакти та підтримка

**НБУ Authorization Server Support:**
- Email: oauth-support@bank.gov.ua
- Slack: #vop-oauth-support

**Documentation:**
- [FAPI 1.0 Specification](https://openid.net/specs/openid-financial-api-part-1-1_0.html)
- [RFC 7521 - JWT Bearer Tokens](https://tools.ietf.org/html/rfc7521)
- [RFC 8705 - OAuth 2.0 mTLS](https://tools.ietf.org/html/rfc8705)

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-06
**Наступний review:** Q3 2026
