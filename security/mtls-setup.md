# Налаштування Mutual TLS (mTLS) для VoP

**Версія:** 1.0
**Дата:** 2026-02-06
**Аудиторія:** Банки, ННПП, DevOps інженери

---

## Зміст

1. [Вступ](#вступ)
2. [Що таке mTLS](#що-таке-mtls)
3. [Вимоги до сертифікатів](#вимоги-до-сертифікатів)
4. [Отримання сертифікатів](#отримання-сертифікатів)
5. [Налаштування mTLS](#налаштування-mtls)
6. [Приклади конфігурації](#приклади-конфігурації)
7. [Тестування](#тестування)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Вступ

Mutual TLS (mTLS) є обов'язковим для всіх учасників VoP СЕП НБУ. mTLS забезпечує:

- ✅ Двосторонню автентифікацію (server ↔ client)
- ✅ Шифрування даних in-transit
- ✅ Захист від man-in-the-middle атак
- ✅ Non-repudiation (неможливість заперечення)

**Важливо:** Без правильно налаштованого mTLS з'єднання з VoP Router буде відхилене.

---

## Що таке mTLS

### Звичайний TLS (односторонній)

```
Client → Server: "Привіт, підключаюсь"
Server → Client: "Ось мій сертифікат (server certificate)"
Client: Перевіряє server certificate
Client → Server: "OK, довіряю тобі"
[Встановлюється зашифроване з'єднання]
```

**Проблема:** Server не знає, хто є client. Client може бути будь-хто.

### Mutual TLS (двосторонній)

```
Client → Server: "Привіт, підключаюсь"
Server → Client: "Ось мій сертифікат (server certificate)"
Client: Перевіряє server certificate
Client → Server: "Ось МІЙ сертифікат (client certificate)"
Server: Перевіряє client certificate
Server → Client: "OK, я знаю хто ти, довіряю тобі"
[Встановлюється зашифроване з'єднання]
```

**Переваги:**
- ✅ Server знає, хто є client (автентифікація)
- ✅ Тільки авторизовані клієнти можуть з'єднатися
- ✅ Кожне з'єднання можна відстежити (audit trail)

---

## Архітектура mTLS у VoP

```
┌─────────────────────────────────────────────────────────────┐
│                         VoP Router (НБУ)                    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  TLS Termination Layer                             │   │
│  │  - Validates client certificates                   │   │
│  │  - Checks certificate against whitelist            │   │
│  │  - Verifies certificate not revoked (CRL/OCSP)     │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ mTLS
                ┌───────────┴───────────┐
                │                       │
    ┌───────────▼─────────┐ ┌──────────▼──────────┐
    │  Банк A (Requester) │ │  Банк B (Responder) │
    │  - Client cert      │ │  - Client cert      │
    │  - Private key      │ │  - Private key      │
    └─────────────────────┘ └─────────────────────┘
```

**Потік:**
1. Банк A відправляє VoP Request до Router з client certificate
2. Router перевіряє certificate Банку A (валідний? у whitelist? не revoked?)
3. Якщо OK → Router пересилає запит до Банку B
4. Router відправляє запит до Банку B з СВОЇМ client certificate
5. Банк B перевіряє certificate Router
6. Якщо OK → Банк B обробляє запит та повертає відповідь

---

## Вимоги до сертифікатів

### Для банків та ННПП (Requester/Responder)

**Тип сертифікату:**
- ✅ **QWAC** (Qualified Website Authentication Certificate) — для ЄС-сумісності
- ✅ **АЦСК** (Акредитований центр сертифікації ключів) — для українського ринку
- ✅ X.509 v3 certificate

**Технічні вимоги:**
```
Key Type: RSA 2048-bit або ECDSA P-256
Signature Algorithm: SHA-256 with RSA або ECDSA
Validity: Max 2 роки (рекомендовано 1 рік)
Key Usage: Digital Signature, Key Encipherment
Extended Key Usage: TLS Web Client Authentication, TLS Web Server Authentication
```

**Обов'язкові поля в сертифікаті:**

| Поле | Приклад | Опис |
|------|---------|------|
| Common Name (CN) | `vop.privatbank.ua` | Доменне ім'я VoP API |
| Organization (O) | `АТ "ПриватБанк"` | Повна назва банку |
| Organizational Unit (OU) | `VoP API` | Підрозділ |
| Country (C) | `UA` | Код країни |
| NBU ID (custom field) | `305299` | Код ID НБУ (6 цифр) |

**Додаткові вимоги:**
- Subject Alternative Names (SAN): мають включати DNS name VoP API endpoint
- Certificate Transparency (CT) logs: рекомендовано

### Для VoP Router (НБУ)

**Тип сертифікату:**
- Server certificate для HTTPS endpoint
- Client certificate для з'єднань до банків

**Вимоги:**
- Такі ж технічні вимоги, як для банків
- CN: `vop-router.sep.nbu.gov.ua`
- Organization: `Національний банк України`

---

## Отримання сертифікатів

### Варіант 1: QWAC (рекомендовано для міжнародної інтеграції)

**Qualified Trust Service Providers (QTSP) в Україні:**
1. **Кваліфіковані постачальники:**
   - АТ "Інформаційні судові системи" (ІСС)
   - ТОВ "Кристел"
   - АЦСК "Україна"

**Процес отримання:**
1. Подати заявку до QTSP
2. Надати документи (статут, виписка з ЄДР, довіреність)
3. Пройти верифікацію організації
4. Сгенерувати CSR (Certificate Signing Request)
5. QTSP підписує та видає certificate
6. Отримати certificate (зазвичай 3-7 робочих днів)

**Вартість:** ~10,000-30,000 грн/рік (залежить від QTSP та опцій)

### Варіант 2: АЦСК (для локального ринку)

**Акредитовані ЦСК в Україні:**
- АЦСК "Україна"
- ІСС
- Інші акредитовані ЦСК (список на сайті Мінцифри)

**Процес:** Аналогічний до QWAC

### Варіант 3: Private CA (НЕ рекомендовано для production)

Для тестових середовищ можна використовувати private CA (наприклад, OpenSSL, easy-rsa, або cfssl).

**⚠️ ВАЖЛИВО:** Private CA сертифікати НЕ приймаються у production VoP Router!

---

## Налаштування mTLS

### Крок 1: Генерація CSR (Certificate Signing Request)

#### За допомогою OpenSSL:

```bash
# Згенерувати private key (RSA 2048-bit)
openssl genrsa -out vop-client.key 2048

# Згенерувати CSR
openssl req -new -key vop-client.key -out vop-client.csr \
  -subj "/C=UA/O=AT PrivatBank/OU=VoP API/CN=vop.privatbank.ua"

# Перевірити CSR
openssl req -text -noout -verify -in vop-client.csr
```

**Примітка:** Зберігайте `vop-client.key` в безпечному місці! Це ваш приватний ключ.

#### За допомогою Java keytool:

```bash
# Згенерувати keypair та CSR
keytool -genkeypair -alias vop-client \
  -keyalg RSA -keysize 2048 \
  -dname "CN=vop.privatbank.ua, OU=VoP API, O=AT PrivatBank, C=UA" \
  -keystore vop-keystore.jks -storepass changeit

keytool -certreq -alias vop-client \
  -file vop-client.csr \
  -keystore vop-keystore.jks -storepass changeit
```

### Крок 2: Отримання підписаного certificate від QTSP/АЦСК

1. Надіслати CSR до QTSP
2. Пройти верифікацію
3. Отримати підписаний certificate (зазвичай у форматі PEM або DER)

**Приклад отриманого certificate:**
```
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKJ9...
...
-----END CERTIFICATE-----
```

### Крок 3: Завантаження certificate chain

QTSP також надасть **certificate chain** (intermediate + root CA certificates). Вам потрібно:

```
vop-client.crt       ← Ваш certificate
intermediate-ca.crt  ← Intermediate CA certificate
root-ca.crt          ← Root CA certificate
```

**Створення bundle:**

```bash
# Об'єднати в один файл (client + intermediate + root)
cat vop-client.crt intermediate-ca.crt root-ca.crt > vop-client-bundle.pem
```

### Крок 4: Налаштування truststore

Truststore містить сертифікати CA, яким ви довіряєте (наприклад, VoP Router CA).

**НБУ надасть вам:**
- `vop-router-ca.crt` — Root CA certificate VoP Router

**Створення truststore:**

#### OpenSSL/PEM format:
```bash
# Просто зберегти у файл
cp vop-router-ca.crt vop-truststore.pem
```

#### Java keystore:
```bash
# Імпортувати CA certificate в truststore
keytool -import -alias vop-router-ca \
  -file vop-router-ca.crt \
  -keystore vop-truststore.jks -storepass changeit
```

---

## Приклади конфігурації

### Node.js (Express + HTTPS)

#### Server (Responder API)

```javascript
const https = require('https');
const fs = require('fs');
const express = require('express');

const app = express();

// mTLS configuration
const options = {
  // Server certificate (your bank's certificate)
  key: fs.readFileSync('/path/to/vop-client.key'),
  cert: fs.readFileSync('/path/to/vop-client-bundle.pem'),

  // Client certificate validation
  ca: [fs.readFileSync('/path/to/vop-router-ca.crt')],
  requestCert: true,  // Request client certificate
  rejectUnauthorized: true,  // Reject if client certificate invalid

  // TLS version
  minVersion: 'TLSv1.3',
  maxVersion: 'TLSv1.3',

  // Cipher suites (FAPI-compliant)
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_AES_128_GCM_SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384'
  ].join(':')
};

// Middleware to check client certificate
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();

  if (!cert || !req.client.authorized) {
    return res.status(401).json({ error: 'Unauthorized - Invalid client certificate' });
  }

  // Extract NBU ID from certificate
  const nbuId = cert.subject.serialNumber; // Assuming NBU ID is in serialNumber field
  console.log(`Request from NBU ID: ${nbuId}`);

  next();
});

// VoP endpoint
app.post('/vop/v1/verify', (req, res) => {
  // Handle VoP request
  res.json({ matchStatus: 'MATCH' });
});

// Start server
https.createServer(options, app).listen(443, () => {
  console.log('VoP Responder API running on https://localhost:443');
});
```

#### Client (Requester API)

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'vop-router.sep.nbu.gov.ua',
  port: 443,
  path: '/api/vop/v1/verify',
  method: 'POST',

  // Client certificate (your bank's certificate)
  key: fs.readFileSync('/path/to/vop-client.key'),
  cert: fs.readFileSync('/path/to/vop-client-bundle.pem'),

  // Server certificate validation
  ca: [fs.readFileSync('/path/to/vop-router-ca.crt')],
  rejectUnauthorized: true,

  // Headers
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_ACCESS_TOKEN'
  }
};

// VoP Request payload
const payload = JSON.stringify({
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: new Date().toISOString(),
  requester: {
    nbuId: '300001',
    bic: 'NBUBUBU1XXX'
  },
  payee: {
    iban: 'UA213223130000026007233566001',
    name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ'
  }
});

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('VoP Response:', JSON.parse(data));
  });
});

req.on('error', (e) => {
  console.error('Error:', e);
});

req.write(payload);
req.end();
```

---

### Java (Spring Boot)

#### application.yml

```yaml
server:
  port: 443
  ssl:
    enabled: true
    # Server certificate (your bank's certificate)
    key-store: classpath:vop-keystore.jks
    key-store-password: changeit
    key-store-type: JKS
    key-alias: vop-client

    # Client certificate validation (mTLS)
    client-auth: need  # Require client certificate
    trust-store: classpath:vop-truststore.jks
    trust-store-password: changeit
    trust-store-type: JKS

    # TLS configuration
    protocol: TLSv1.3
    enabled-protocols: TLSv1.3
    ciphers: TLS_AES_256_GCM_SHA384,TLS_AES_128_GCM_SHA256
```

#### VopResponderController.java

```java
@RestController
@RequestMapping("/vop/v1")
public class VopResponderController {

    @PostMapping("/verify")
    public ResponseEntity<VopResponse> verify(
        @RequestBody VopRequest request,
        HttpServletRequest httpRequest
    ) {
        // Extract client certificate
        X509Certificate[] certs = (X509Certificate[])
            httpRequest.getAttribute("javax.servlet.request.X509Certificate");

        if (certs == null || certs.length == 0) {
            return ResponseEntity.status(401)
                .body(new ErrorResponse("No client certificate"));
        }

        X509Certificate clientCert = certs[0];
        String nbuId = extractNbuId(clientCert);

        log.info("VoP request from NBU ID: {}", nbuId);

        // Process VoP request
        VopResponse response = vopService.processRequest(request);

        return ResponseEntity.ok(response);
    }

    private String extractNbuId(X509Certificate cert) {
        // Extract NBU ID from certificate
        // Implementation depends on where NBU ID is stored in certificate
        return cert.getSubjectDN().getName(); // Simplified
    }
}
```

#### VoP Client (Requester)

```java
@Configuration
public class VopClientConfig {

    @Bean
    public RestTemplate vopRestTemplate() throws Exception {
        // Load keystore (client certificate)
        KeyStore keyStore = KeyStore.getInstance("JKS");
        keyStore.load(
            new FileInputStream("vop-keystore.jks"),
            "changeit".toCharArray()
        );

        // Load truststore (VoP Router CA)
        KeyStore trustStore = KeyStore.getInstance("JKS");
        trustStore.load(
            new FileInputStream("vop-truststore.jks"),
            "changeit".toCharArray()
        );

        // Create SSL context with mTLS
        SSLContext sslContext = SSLContexts.custom()
            .loadKeyMaterial(keyStore, "changeit".toCharArray())
            .loadTrustMaterial(trustStore, new TrustSelfSignedStrategy())
            .build();

        // Create HTTP client with mTLS
        CloseableHttpClient httpClient = HttpClients.custom()
            .setSSLContext(sslContext)
            .setSSLHostnameVerifier(new DefaultHostnameVerifier())
            .build();

        HttpComponentsClientHttpRequestFactory requestFactory =
            new HttpComponentsClientHttpRequestFactory(httpClient);
        requestFactory.setConnectTimeout(5000);
        requestFactory.setReadTimeout(10000);

        return new RestTemplate(requestFactory);
    }
}
```

---

### NGINX (Reverse Proxy)

```nginx
# VoP Responder API with mTLS
server {
    listen 443 ssl http2;
    server_name vop.privatbank.ua;

    # Server certificate (your bank's certificate)
    ssl_certificate /etc/nginx/ssl/vop-client-bundle.pem;
    ssl_certificate_key /etc/nginx/ssl/vop-client.key;

    # Client certificate validation (mTLS)
    ssl_client_certificate /etc/nginx/ssl/vop-router-ca.crt;
    ssl_verify_client on;
    ssl_verify_depth 2;

    # TLS configuration
    ssl_protocols TLSv1.3;
    ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_AES_128_GCM_SHA256';
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Pass client certificate info to backend
    proxy_set_header X-Client-Cert-DN $ssl_client_s_dn;
    proxy_set_header X-Client-Cert-Serial $ssl_client_serial;

    location /vop/v1/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Тестування

### Крок 1: Тестування з curl

```bash
# Test mTLS connection to VoP Router
curl -v --cert vop-client.crt \
     --key vop-client.key \
     --cacert vop-router-ca.crt \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"requestId":"test-123","timestamp":"2026-02-06T10:00:00Z"}' \
     https://vop-router.sep.nbu.gov.ua/api/vop/v1/verify
```

**Очікуваний результат:** HTTP 200 або 401 (якщо invalid request), але НЕ SSL handshake error.

### Крок 2: Перевірка certificate

```bash
# Verify certificate
openssl x509 -in vop-client.crt -text -noout

# Check certificate expiration
openssl x509 -in vop-client.crt -noout -enddate

# Verify certificate chain
openssl verify -CAfile root-ca.crt -untrusted intermediate-ca.crt vop-client.crt
```

### Крок 3: Тестування TLS handshake

```bash
# Test TLS handshake with client certificate
openssl s_client -connect vop-router.sep.nbu.gov.ua:443 \
  -cert vop-client.crt \
  -key vop-client.key \
  -CAfile vop-router-ca.crt \
  -showcerts
```

**Що шукати:**
```
✅ Verify return code: 0 (ok)
✅ SSL handshake has read ... bytes
❌ Verify return code: 20 (unable to get local issuer certificate) - missing CA
❌ Verify return code: 18 (self signed certificate) - wrong CA
```

---

## Troubleshooting

### Problem 1: "SSL handshake failed"

**Symptom:**
```
Error: unable to verify the first certificate
```

**Причина:** Truststore не містить правильний CA certificate

**Рішення:**
1. Перевірте, що ви додали VoP Router CA certificate до truststore
2. Перевірте, що certificate chain правильний (client → intermediate → root)

```bash
# Verify certificate chain
openssl verify -CAfile vop-router-ca.crt vop-client.crt
```

---

### Problem 2: "Certificate verification failed"

**Symptom:**
```
Error: certificate verify failed (error:20)
```

**Причина:** Client certificate не trusted VoP Router

**Рішення:**
1. Перевірте, що ваш certificate виданий акредитованим QTSP/АЦСК
2. Зверніться до НБУ для додавання вашого certificate до whitelist
3. Перевірте, що certificate не revoked

---

### Problem 3: "Hostname mismatch"

**Symptom:**
```
Error: Hostname/IP does not match certificate's altnames
```

**Причина:** CN або SAN в certificate не співпадає з hostname

**Рішення:**
1. Перевірте CN у вашому certificate:
   ```bash
   openssl x509 -in vop-client.crt -noout -subject
   ```
2. Додайте правильний DNS name в SAN під час генерації CSR

---

### Problem 4: "Certificate expired"

**Symptom:**
```
Error: certificate has expired
```

**Причина:** Certificate закінчився

**Рішення:**
1. Перевірте expiration date:
   ```bash
   openssl x509 -in vop-client.crt -noout -enddate
   ```
2. Замовте новий certificate у QTSP
3. Виконайте certificate rotation (див. Certificate Management guide)

---

## Best Practices

### 1. ✅ Зберігання private keys

**DO:**
- ✅ Зберігайте private keys в Hardware Security Module (HSM) або Key Management System (KMS)
- ✅ Шифруйте private keys at rest (AES-256)
- ✅ Обмежте доступ до private keys (тільки necessary personnel)
- ✅ Використовуйте окремі keys для dev/staging/production

**DON'T:**
- ❌ НЕ commit private keys в Git
- ❌ НЕ передавайте private keys по email
- ❌ НЕ зберігайте private keys в plain text
- ❌ НЕ використовуйте один key для всіх environments

---

### 2. ✅ Certificate rotation

- Оновлюйте certificates кожні 12 місяців (навіть якщо validity 2 роки)
- Підтримуйте 2 active certificates одночасно під час rotation (graceful transition)
- Тестуйте новий certificate в staging перед production
- Документуйте rotation procedure

---

### 3. ✅ Monitoring

Моніторте:
- Certificate expiration dates (alert за 30/14/7 днів до expiration)
- Certificate revocation status (CRL/OCSP)
- TLS handshake errors
- mTLS authentication failures

**Приклад Prometheus metric:**
```
# Certificate expiration
ssl_certificate_expiry_seconds{cn="vop.privatbank.ua"} 2592000

# mTLS auth failures
mtls_auth_failures_total{reason="invalid_cert"} 15
```

---

### 4. ✅ Security hardening

- Використовуйте TLS 1.3 (disable TLS 1.2 and below)
- Використовуйте strong cipher suites (AES-256-GCM)
- Enable Certificate Transparency (CT)
- Implement certificate pinning (де можливо)
- Regular security audits та penetration testing

---

## Контакти та підтримка

**Технічна підтримка НБУ:**
- Email: vop-support@bank.gov.ua
- Slack: #vop-technical-support (для pilot учасників)

**Documentation:**
- [Certificate Management Guide](certificate-management.md)
- [OAuth 2.0 FAPI Configuration](oauth2-fapi-config.md)
- [Security Guidelines](../docs/04_security_guidelines.md)

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-06
**Наступний review:** Q3 2026
