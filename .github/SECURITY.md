# Security Policy

## Reporting Security Vulnerabilities

**⚠️ DO NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in the VoP (Verification of Payee) system, please report it responsibly:

### 🔒 Private Reporting

**Email:** security@bank.gov.ua

**Subject:** `[SECURITY] VoP Vulnerability Report`

**Please include:**
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)
- Your contact information

### ⏱️ Response Time

- **Acknowledgment:** Within 24 hours (business days)
- **Initial assessment:** Within 72 hours
- **Status updates:** Every 7 days until resolution

### 🛡️ Security Measures

This project follows security best practices:

- ✅ **mTLS** for bank-to-bank communication
- ✅ **OAuth 2.0 + FAPI** for authorization
- ✅ **TLS 1.2+** encryption in transit
- ✅ **No hardcoded credentials** in code
- ✅ **Environment variables** for sensitive config
- ✅ **Audit logging** for all requests
- ✅ **GDPR compliance** (data minimization, 90-day retention)

### 📋 Security Checklist for Integrators

Before deploying VoP in production:

- [ ] Replace all example credentials with real ones
- [ ] Use proper certificate management (not self-signed certs)
- [ ] Configure firewall rules (whitelist VoP Router IP only)
- [ ] Enable audit logging and monitoring
- [ ] Set up proper backup and disaster recovery
- [ ] Review and apply security guidelines from `docs/04_security_guidelines.md`
- [ ] Conduct security testing (penetration testing, OWASP Top 10)

### 🔐 Responsible Disclosure

We appreciate responsible disclosure and will:

- Acknowledge your contribution publicly (if you wish)
- Keep you informed about the progress of the fix
- Notify you when the vulnerability is resolved

**Thank you for helping keep VoP secure!**

---

**National Bank of Ukraine**
IT Security Team
https://bank.gov.ua
