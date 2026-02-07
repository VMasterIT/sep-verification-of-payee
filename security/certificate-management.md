# Управління сертифікатами для VoP

**Версія:** 1.0
**Дата:** 2026-02-06
**Аудиторія:** Банки, ННПП, Security Engineers, DevOps

---

## Зміст

1. [Вступ](#вступ)
2. [Типи сертифікатів](#типи-сертифікатів)
3. [Certificate Lifecycle](#certificate-lifecycle)
4. [Отримання сертифікатів](#отримання-сертифікатів)
5. [Certificate Rotation](#certificate-rotation)
6. [Certificate Revocation](#certificate-revocation)
7. [Storage та Security](#storage-та-security)
8. [Monitoring та Alerting](#monitoring-та-alerting)
9. [Automation](#automation)
10. [Best Practices](#best-practices)

---

## Вступ

Правильне управління сертифікатами є критично важливим для безпеки VoP. Ця документація описує повний lifecycle сертифікатів — від отримання до revocation.

**Що потрібно знати:**
- ✅ Certificate lifecycle management (issue, renew, rotate, revoke)
- ✅ Storage best practices (HSM, KMS, encrypted storage)
- ✅ Monitoring expiration dates
- ✅ Emergency procedures (compromised keys, revocation)

---

## Типи сертифікатів

### 1. QWAC (Qualified Website Authentication Certificate)

**Що це:**
- Кваліфікований сертифікат для автентифікації веб-сайтів
- Визнається в ЄС згідно з eIDAS Regulation
- Використовується для ЄС-сумісності VoP

**Коли використовувати:**
- ✅ Для міжнародної інтеграції (EU VoP cross-border)
- ✅ Для Open Banking / PSD2 compliance
- ✅ Коли потрібна ЄС-визнана автентифікація

**Qualified Trust Service Providers (QTSP) в Україні:**
- AT "Інформаційні судові системи" (ІСС)
- ТОВ "Кристел"
- АЦСК "Україна"

**Вартість:** ~15,000-30,000 грн/рік

**Validity:** Max 2 роки (рекомендовано 1 рік)

---

### 2. АЦСК (Акредитований центр сертифікації ключів)

**Що це:**
- Сертифікат виданий акредитованим ЦСК України
- Визнається в Україні згідно з законодавством про електронний підпис
- Використовується для локального українського ринку

**Коли використовувати:**
- ✅ Для локальної VoP в Україні (без cross-border)
- ✅ Для compliance з українським законодавством
- ✅ Дешевша альтернатива QWAC (для локального use case)

**Акредитовані ЦСК в Україні:**
- АЦСК "Україна"
- AT "ІСС"
- АЦСК приватних банків (якщо акредитовані)

**Вартість:** ~8,000-20,000 грн/рік

**Validity:** Max 2 роки

---

### 3. Порівняння QWAC vs АЦСК

| Параметр | QWAC | АЦСК |
|----------|------|------|
| **Визнання** | ЄС + Україна | Тільки Україна |
| **eIDAS compliance** | Так | Ні |
| **PSD2 compliance** | Так | Ні |
| **Вартість** | Вище (~15-30к грн/рік) | Нижче (~8-20к грн/рік) |
| **Validation process** | Строгіший | Менш строгий |
| **Cross-border VoP** | Підтримується | Не підтримується |
| **Production VoP (UA)** | ✅ Приймається | ✅ Приймається |
| **EU VoP integration** | ✅ Приймається | ❌ Не приймається |

**Рекомендація НБУ:**
- Для production VoP в Україні: **АЦСК OK** (дешевше, швидше)
- Для майбутньої EU integration: **QWAC рекомендовано** (ready for cross-border)

---

## Certificate Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  Certificate Lifecycle                      │
└─────────────────────────────────────────────────────────────┘

1. REQUEST          2. ISSUE           3. DEPLOY          4. MONITOR
   │                   │                  │                  │
   ▼                   ▼                  ▼                  ▼
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│ Generate │      │  QTSP    │      │  Deploy  │      │  Monitor │
│   CSR    │─────▶│  Signs   │─────▶│   Cert   │─────▶│   Exp.   │
│          │      │   Cert   │      │          │      │   Date   │
└──────────┘      └──────────┘      └──────────┘      └──────────┘
                                                            │
                                                            ▼
                                      ┌──────────────────────────────┐
                                      │     5. RENEW (30 days before)│
                                      │        OR                     │
                                      │     6. REVOKE (if compromised)│
                                      └──────────────────────────────┘
```

### Фази lifecycle:

1. **REQUEST (День 0):** Генерація CSR, подання заявки до QTSP
2. **ISSUE (День 3-7):** QTSP верифікує та підписує certificate
3. **DEPLOY (День 7-10):** Deployment certificate в production
4. **MONITOR (Дні 10-365):** Continuous monitoring expiration date
5. **RENEW (День 335):** Renewal за 30 днів до expiration
6. **REVOKE (Будь-коли):** Emergency revocation якщо compromised

---

## Отримання сертифікатів

### Крок 1: Підготовка документів

**Для банків:**
- ✅ Статут банку
- ✅ Виписка з ЄДР (не старше 30 днів)
- ✅ Ліцензія НБУ на банківську діяльність
- ✅ Довіреність на особу, що подає заявку (якщо застосовно)
- ✅ Паспорт відповідальної особи

**Для ННПП:**
- ✅ Статут
- ✅ Виписка з ЄДР
- ✅ Ліцензія НБУ на надання платіжних послуг
- ✅ Довіреність
- ✅ Паспорт відповідальної особи

### Крок 2: Генерація CSR

**Best practice:** Генеруйте private key та CSR на безпечному сервері (не на ноутбуку!)

```bash
# Generate private key (RSA 2048-bit)
openssl genrsa -out vop-privatbank-2026.key 2048

# Set secure permissions
chmod 400 vop-privatbank-2026.key

# Generate CSR
openssl req -new -key vop-privatbank-2026.key \
  -out vop-privatbank-2026.csr \
  -subj "/C=UA/O=AT PrivatBank/OU=VoP API/CN=vop.privatbank.ua" \
  -addext "subjectAltName=DNS:vop.privatbank.ua,DNS:vop-backup.privatbank.ua"

# Verify CSR
openssl req -text -noout -verify -in vop-privatbank-2026.csr
```

**Важливо:**
- CN (Common Name) має співпадати з вашим VoP API hostname
- SAN (Subject Alternative Names) має включати всі domains, які будуть використовувати certificate
- NBU ID може бути доданий як custom OID (узгодити з QTSP)

### Крок 3: Подання заявки до QTSP

**Приклад процесу (ІСС):**

1. **Online заявка:**
   - Зайти на портал ІСС (https://iss.ua)
   - Обрати "QWAC Certificate"
   - Завантажити CSR
   - Завантажити документи

2. **Verification:**
   - QTSP верифікує документи (1-3 робочі дні)
   - Можливий дзвінок для підтвердження (verification call)

3. **Payment:**
   - Оплата invoice (~15,000-30,000 грн)

4. **Issue:**
   - QTSP підписує certificate (1-2 дні після оплати)
   - Ви отримуєте certificate на email або через portal

**Загальний час:** 3-7 робочих днів

### Крок 4: Отримання certificate та certificate chain

QTSP надасть вам:
```
vop-privatbank-2026.crt   ← Ваш certificate
iss-intermediate-ca.crt   ← Intermediate CA certificate
iss-root-ca.crt           ← Root CA certificate
```

**Verify certificate:**
```bash
# Check certificate details
openssl x509 -in vop-privatbank-2026.crt -text -noout

# Verify certificate chain
openssl verify -CAfile iss-root-ca.crt \
  -untrusted iss-intermediate-ca.crt \
  vop-privatbank-2026.crt

# Expected output: vop-privatbank-2026.crt: OK
```

### Крок 5: Реєстрація certificate в VoP Directory

**Після отримання certificate:**

1. Надішліть certificate fingerprint до НБУ:
   ```bash
   openssl x509 -in vop-privatbank-2026.crt -noout -fingerprint -sha256
   ```

2. НБУ додасть ваш certificate до VoP Directory whitelist

3. Ви отримаєте підтвердження (email)

4. Certificate готовий до використання в VoP

---

## Certificate Rotation

Certificate rotation — процес заміни старого certificate на новий без downtime.

### Коли робити rotation:

- ✅ **30 днів до expiration** (рекомендовано)
- ✅ **90 днів до expiration** (для conservative approach)
- ❌ **НЕ чекайте до останнього дня!**

### Стратегія rotation

#### Approach 1: Blue-Green Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    Blue-Green Rotation                      │
└─────────────────────────────────────────────────────────────┘

PHASE 1: OLD CERT ACTIVE
┌───────────────┐
│  Old Cert     │ ◄─── 100% traffic
│  (expires in  │
│   30 days)    │
└───────────────┘

PHASE 2: DUAL CERT (overlap period)
┌───────────────┐       ┌───────────────┐
│  Old Cert     │◄─50%─▶│  New Cert     │
│               │       │  (fresh)      │
└───────────────┘       └───────────────┘

PHASE 3: NEW CERT ACTIVE
                        ┌───────────────┐
                        │  New Cert     │◄─── 100% traffic
                        │               │
                        └───────────────┘

PHASE 4: OLD CERT RETIRED
                        ┌───────────────┐
                        │  New Cert     │◄─── 100% traffic
                        └───────────────┘
```

**Timeline:**
- **Day 0:** Generate new CSR, request new certificate
- **Day 7:** Receive new certificate
- **Day 10:** Deploy new certificate alongside old (dual setup)
- **Day 15:** Shift 50% traffic to new certificate (canary)
- **Day 20:** Shift 100% traffic to new certificate
- **Day 25:** Remove old certificate

**Benefits:**
- ✅ Zero downtime
- ✅ Easy rollback (if issue with new cert)
- ✅ Gradual migration

#### Approach 2: Direct Replacement

```
1. Отримати новий certificate
2. Протестувати в staging
3. Scheduled maintenance window (наприклад, 2 AM)
4. Stop service
5. Replace old certificate з новим
6. Start service
7. Verify
```

**Downtime:** 5-15 хвилин

**Рекомендовано для:** Non-critical environments або якщо Blue-Green неможливий

### Certificate Rotation Checklist

**30 днів до expiration:**
```
☐ Generate new CSR
☐ Submit request to QTSP
☐ Pay invoice
☐ Track request status
```

**7 днів до expiration:**
```
☐ Receive new certificate from QTSP
☐ Verify certificate (openssl x509)
☐ Verify certificate chain
☐ Register certificate з НБУ VoP Directory
☐ Test certificate in staging environment
☐ Prepare deployment runbook
```

**3 дні до expiration (або раніше):**
```
☐ Deploy new certificate to production (Blue-Green або maintenance window)
☐ Monitor error logs
☐ Verify TLS handshake (openssl s_client)
☐ Test VoP requests end-to-end
☐ Notify stakeholders про успішний rotation
☐ Update documentation (новий certificate fingerprint)
```

**After deployment:**
```
☐ Monitor для 24-48 годин
☐ Archive old certificate (secure backup)
☐ Update monitoring alerts (новий expiration date)
☐ Schedule next rotation reminder (календар)
```

---

## Certificate Revocation

### Коли revoke certificate:

**ТЕРМIНОВО revoke якщо:**
- 🔴 Private key compromised (leaked, stolen, або suspected breach)
- 🔴 Employee з доступом до key покинув компанію (без proper offboarding)
- 🔴 Server з certificate було взломано (hacked)
- 🔴 Certificate виданий з помилковими даними

**Також revoke якщо:**
- 🟡 Certificate більше не потрібен (decommissioned service)
- 🟡 Organization змінила назву (потрібен новий certificate з новою назвою)

### Процес revocation

#### Крок 1: Повідомити QTSP

Негайно зв'язатися з QTSP та запросити revocation:

**Email template:**
```
To: support@iss.ua
Subject: URGENT: Certificate Revocation Request

Certificate Details:
- Serial Number: 1234567890ABCDEF
- Common Name: vop.privatbank.ua
- Issued: 2026-01-15
- Expires: 2027-01-15

Reason for Revocation: [Key Compromise / Cessation of Operation / Other]

Request: Please revoke this certificate immediately.

Contact: [Your name, phone, position]
```

**QTSP response time:** Зазвичай протягом 1-4 годин для emergency cases

#### Крок 2: Повідомити НБУ

Відразу після запиту revocation до QTSP, повідомте НБУ:

```
To: vop-support@bank.gov.ua
Subject: Certificate Revocation Notification

Bank: АТ "ПриватБанк"
NBU ID: 305299
Certificate: vop.privatbank.ua (Serial: 1234567890ABCDEF)
Status: Revocation requested from QTSP (ІСС)
Reason: [Key Compromise]

Action: Please remove certificate from VoP Directory whitelist.

New certificate will be issued within 7 days.
```

#### Крок 3: Replace certificate

1. Негайно згенерувати новий CSR (з НОВИМ private key!)
2. Подати emergency request до QTSP (зазвичай швидший процес)
3. Отримати новий certificate (1-3 дні для emergency)
4. Deploy новий certificate
5. Протестувати

#### Крок 4: Incident response

Якщо key compromise:
```
☐ Провести security audit (як key було compromised?)
☐ Перевірити logs на suspicious activity
☐ Rotate всі інші keys/credentials на скомпрометованому сервері
☐ Notify security team та management
☐ Document incident (incident report)
☐ Implement preventive measures
```

### Certificate Revocation List (CRL)

QTSP публікує CRL — список revoked certificates.

**Checking CRL:**
```bash
# Download CRL
wget http://crl.iss.ua/iss-ca.crl

# Convert CRL to readable format
openssl crl -in iss-ca.crl -inform DER -text -noout

# Check if certificate is revoked
openssl verify -crl_check -CRLfile iss-ca.crl \
  -CAfile iss-root-ca.crt vop-privatbank-2026.crt
```

**OCSP (Online Certificate Status Protocol):**
```bash
# Check certificate status via OCSP
openssl ocsp -issuer iss-intermediate-ca.crt \
  -cert vop-privatbank-2026.crt \
  -url http://ocsp.iss.ua \
  -CAfile iss-root-ca.crt
```

---

## Storage та Security

### 1. Private Key Storage

**✅ BEST: Hardware Security Module (HSM)**

HSM — це physical device для secure storage та cryptographic operations.

**Benefits:**
- ✅ Private key ніколи не покидає HSM (cannot be extracted)
- ✅ Tamper-resistant hardware
- ✅ FIPS 140-2 Level 3 compliant
- ✅ Audit logs для всіх operations

**Providers:**
- Thales (Luna HSM)
- Gemalto (SafeNet HSM)
- AWS CloudHSM
- Azure Key Vault (with HSM backing)

**Вартість:** ~$10k-50k (hardware) або ~$1-2k/month (cloud HSM)

**Рекомендовано для:** Великі банки, production environments

---

**✅ GOOD: Key Management System (KMS)**

Software-based key management у cloud або on-premise.

**Examples:**
- AWS KMS
- Azure Key Vault
- HashiCorp Vault
- Google Cloud KMS

**Benefits:**
- ✅ Централізоване управління keys
- ✅ Encryption at rest
- ✅ Access control (IAM)
- ✅ Audit logs
- ✅ Дешевше за HSM

**Вартість:** ~$1-5/key/month (cloud) або self-hosted (free open-source Vault)

**Рекомендовано для:** Середні банки, cloud deployments

---

**⚠️ ACCEPTABLE: Encrypted File Storage**

Якщо HSM/KMS недоступні, зберігайте private keys як encrypted files.

```bash
# Encrypt private key з AES-256
openssl enc -aes-256-cbc -salt \
  -in vop-privatbank.key \
  -out vop-privatbank.key.enc

# Decrypt коли потрібно використати
openssl enc -aes-256-cbc -d \
  -in vop-privatbank.key.enc \
  -out vop-privatbank.key
```

**Security measures:**
- ✅ Strong passphrase (20+ characters)
- ✅ File permissions 400 (read-only by owner)
- ✅ Separate server для key storage (not on web server!)
- ✅ Regular backups (encrypted backups!)

**Рекомендовано для:** Малі банки, staging/test environments

---

**❌ NEVER: Plain text storage**

```bash
# ❌ NEVER DO THIS:
chmod 644 vop-privatbank.key  # Everyone can read!
git add vop-privatbank.key    # Committed to Git!
cp vop-privatbank.key /tmp/   # In temp directory!
```

### 2. Certificate Storage

Certificates (public keys) менш sensitive, але все одно потребують proper storage:

```bash
# Store certificates securely
mkdir -p /etc/ssl/vop/
chmod 755 /etc/ssl/vop/

# Copy certificates
cp vop-privatbank-2026.crt /etc/ssl/vop/
cp iss-intermediate-ca.crt /etc/ssl/vop/
cp iss-root-ca.crt /etc/ssl/vop/

# Set permissions
chmod 644 /etc/ssl/vop/*.crt
```

### 3. Backup Strategy

**Що backup:**
- ✅ Private keys (encrypted!)
- ✅ Certificates
- ✅ Certificate chains (intermediate + root CA)
- ✅ Configuration files (NGINX, Java keystore, тощо)

**Де backup:**
- ✅ Encrypted backup storage (AWS S3 з encryption, Azure Blob Storage)
- ✅ Physical secure location (safe, bank vault)
- ✅ Offsite backup (disaster recovery)

**Як часто:**
- ✅ Після кожного нового certificate
- ✅ Після кожного rotation
- ✅ Regular automated backups (щоденно)

```bash
# Backup script example
#!/bin/bash
BACKUP_DIR="/secure/backups/certificates/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# Backup private key (encrypted)
openssl enc -aes-256-cbc -salt \
  -in /etc/ssl/vop/vop-privatbank.key \
  -out "$BACKUP_DIR/vop-privatbank.key.enc"

# Backup certificates
cp /etc/ssl/vop/*.crt "$BACKUP_DIR/"

# Create tarball
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"

# Upload to S3 (encrypted)
aws s3 cp "$BACKUP_DIR.tar.gz" \
  s3://my-secure-bucket/vop-certificates/ \
  --sse AES256

# Clean up local backup
rm -rf "$BACKUP_DIR" "$BACKUP_DIR.tar.gz"
```

---

## Monitoring та Alerting

### Metrics to Monitor

**1. Certificate Expiration**

```prometheus
# Prometheus metric
ssl_certificate_expiry_seconds{
  cn="vop.privatbank.ua",
  issuer="ISS CA"
} 2592000  # 30 days remaining
```

**Alert rules:**
```yaml
# Alert 30 days before expiration
- alert: CertificateExpiresIn30Days
  expr: ssl_certificate_expiry_seconds < 2592000
  labels:
    severity: warning
  annotations:
    summary: "Certificate {{ $labels.cn }} expires in 30 days"

# Alert 14 days before expiration
- alert: CertificateExpiresIn14Days
  expr: ssl_certificate_expiry_seconds < 1209600
  labels:
    severity: high
  annotations:
    summary: "Certificate {{ $labels.cn }} expires in 14 days"

# Alert 7 days before expiration
- alert: CertificateExpiresIn7Days
  expr: ssl_certificate_expiry_seconds < 604800
  labels:
    severity: critical
  annotations:
    summary: "URGENT: Certificate {{ $labels.cn }} expires in 7 days!"
```

**2. Certificate Revocation Status**

Check CRL/OCSP periodically:
```bash
# Cron job (daily)
0 2 * * * /scripts/check-certificate-revocation.sh
```

**3. mTLS Handshake Failures**

Monitor TLS handshake errors:
```prometheus
# Metric
mtls_handshake_failures_total{
  reason="certificate_expired"
} 15
```

### Monitoring Tools

**Certificate monitoring tools:**
- SSL Labs (https://www.ssllabs.com/ssltest/) - Online testing
- cert-manager (Kubernetes) - Automated certificate management
- Certbot (Let's Encrypt) - For automated cert renewal (не для QWAC, тільки для internal)

**Custom script for checking expiration:**
```bash
#!/bin/bash
# check-cert-expiration.sh

CERT="/etc/ssl/vop/vop-privatbank-2026.crt"
ALERT_DAYS=30

# Get expiration date
EXPIRY_DATE=$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)

# Calculate days remaining
DAYS_REMAINING=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_REMAINING -lt $ALERT_DAYS ]; then
  echo "WARNING: Certificate expires in $DAYS_REMAINING days!"
  # Send alert (email, Slack, PagerDuty, etc.)
  curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
    -d "{\"text\":\"Certificate expires in $DAYS_REMAINING days!\"}"
fi
```

---

## Automation

### Automated Certificate Renewal

**For QWAC/АЦСК:**
Automation складно, оскільки QTSP вимагає manual verification. Але можна автоматизувати частину процесу:

```bash
# Automated CSR generation + notification (30 days before expiry)
#!/bin/bash
# auto-renew-reminder.sh

CERT="/etc/ssl/vop/vop-privatbank-2026.crt"
EXPIRY_DATE=$(openssl x509 -in "$CERT" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_REMAINING=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_REMAINING -eq 30 ]; then
  echo "Certificate expires in 30 days. Starting renewal process..."

  # Auto-generate new CSR
  NEW_KEY="vop-privatbank-$(date +%Y).key"
  NEW_CSR="vop-privatbank-$(date +%Y).csr"

  openssl genrsa -out "$NEW_KEY" 2048
  openssl req -new -key "$NEW_KEY" -out "$NEW_CSR" \
    -subj "/C=UA/O=AT PrivatBank/OU=VoP API/CN=vop.privatbank.ua"

  # Send email notification з CSR attached
  mail -s "Certificate Renewal Required - CSR Generated" \
    security-team@privatbank.ua \
    -a "$NEW_CSR" < /tmp/renewal-instructions.txt

  echo "CSR generated: $NEW_CSR"
  echo "Email sent to security team with CSR attached."
fi
```

**Cron:**
```bash
# Run daily at 2 AM
0 2 * * * /scripts/auto-renew-reminder.sh
```

---

## Best Practices

### ✅ DO:

1. **Generate strong private keys**
   - RSA 2048-bit minimum (4096-bit recommended for high security)
   - ECDSA P-256 для performance (smaller size, faster)

2. **Store private keys securely**
   - HSM (best)
   - KMS (good)
   - Encrypted file storage (acceptable)
   - Never plain text!

3. **Monitor expiration dates**
   - Alerts: 30 days, 14 days, 7 days before expiry
   - Automated monitoring (Prometheus, Nagios)

4. **Rotate certificates regularly**
   - Every 12 months (навіть якщо validity 2 роки)
   - Blue-Green deployment (zero downtime)

5. **Backup certificates and keys**
   - Encrypted backups
   - Offsite storage
   - Regular backup testing (restore test)

6. **Document everything**
   - Certificate inventory (spreadsheet або CMDB)
   - Rotation procedures (runbooks)
   - Emergency contacts (QTSP, НБУ)

### ❌ DON'T:

1. **НЕ commit private keys в Git**
2. **НЕ share private keys по email**
3. **НЕ використовуйте weak algorithms** (RSA 1024, MD5, SHA-1)
4. **НЕ reuse private keys** (після rotation — новий key!)
5. **НЕ ignore expiration warnings**
6. **НЕ store plain text keys** на production servers

---

## Контакти та підтримка

**QTSP Support:**
- ІСС: support@iss.ua, +380 44 123-4567
- Кристел: support@crystals.com.ua, +380 44 234-5678
- АЦСК Україна: support@csk.gov.ua

**НБУ VoP Support:**
- Email: vop-support@bank.gov.ua
- Slack: #vop-certificate-support (pilot учасники)

**Emergency contacts (24/7):**
- НБУ Duty Officer: +380 44 230-XXXX (для certificate emergencies)

---

## Related Documentation

- [mTLS Setup Guide](mtls-setup.md)
- [OAuth 2.0 FAPI Configuration](oauth2-fapi-config.md)
- [Security Guidelines](../docs/04_security_guidelines.md)

---

**Версія:** 1.0
**Дата останнього оновлення:** 2026-02-06
**Наступний review:** Q3 2026
