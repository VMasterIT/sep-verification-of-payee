-- VoP Directory Database Schema
-- Verification of Payee for NBU SEP

-- Create database (if running manually)
-- CREATE DATABASE vop_directory;

-- Connect to database
\c vop_directory;

-- Create vop_directory table
CREATE TABLE IF NOT EXISTS vop_directory (
    id SERIAL PRIMARY KEY,
    bic VARCHAR(11) NOT NULL UNIQUE,
    bank_name VARCHAR(255) NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
    certificate_fingerprint VARCHAR(128),
    rate_limit_per_sec INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_vop_directory_bic ON vop_directory(bic);
CREATE INDEX idx_vop_directory_status ON vop_directory(status);

-- Create IBAN prefix mapping table
CREATE TABLE IF NOT EXISTS iban_prefix_mapping (
    id SERIAL PRIMARY KEY,
    iban_prefix VARCHAR(6) NOT NULL UNIQUE,
    bic VARCHAR(11) NOT NULL REFERENCES vop_directory(bic) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index
CREATE INDEX idx_iban_prefix_mapping_prefix ON iban_prefix_mapping(iban_prefix);
CREATE INDEX idx_iban_prefix_mapping_bic ON iban_prefix_mapping(bic);

-- Insert example data
INSERT INTO vop_directory (bic, bank_name, endpoint_url, status, rate_limit_per_sec)
VALUES
    ('NBUA', 'Національний банк України', 'https://vop-nbu.bank.gov.ua/vop/verify', 'ACTIVE', 100),
    ('PBAN', 'ПриватБанк', 'https://vop.privatbank.ua/vop/verify', 'ACTIVE', 100),
    ('MONU', 'Monobank (Universal Bank)', 'https://vop.monobank.ua/vop/verify', 'ACTIVE', 100),
    ('OSCHBUA', 'Ощадбанк', 'https://vop.oschadbank.ua/vop/verify', 'ACTIVE', 100),
    ('UKRSUA', 'Укрсиббанк', 'https://vop.ukrsibbank.ua/vop/verify', 'ACTIVE', 100)
ON CONFLICT (bic) DO NOTHING;

-- Insert IBAN prefix mappings
-- Format: UA + 2 check digits + 6 bank code (MFO)
-- For mapping, we use first 6 characters: UA + check + first 2 of MFO

-- Національний банк України (MFO 300001)
INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES ('UA3030', 'NBUA')
ON CONFLICT (iban_prefix) DO NOTHING;

-- ПриватБанк (MFO 305299)
INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES ('UA3030', 'PBAN'), ('UA3030', 'PBAN')  -- Multiple prefixes can map to same bank
ON CONFLICT (iban_prefix) DO NOTHING;

-- Monobank / Universal Bank (MFO 380805)
INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES ('UA3038', 'MONU')
ON CONFLICT (iban_prefix) DO NOTHING;

-- Ощадбанк (MFO 300465)
INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES ('UA3030', 'OSCHBUA')
ON CONFLICT (iban_prefix) DO NOTHING;

-- Укрсиббанк (MFO 351005)
INSERT INTO iban_prefix_mapping (iban_prefix, bic)
VALUES ('UA3035', 'UKRSUA')
ON CONFLICT (iban_prefix) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vop_directory
CREATE TRIGGER update_vop_directory_updated_at
    BEFORE UPDATE ON vop_directory
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON DATABASE vop_directory TO vop_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vop_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vop_user;

-- Create audit log table (optional)
CREATE TABLE IF NOT EXISTS vop_audit_log (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(35) NOT NULL,
    requester_bic VARCHAR(11) NOT NULL,
    responder_bic VARCHAR(11),
    iban_hash VARCHAR(64),  -- SHA-256 hash of IBAN
    match_status VARCHAR(20),
    duration_ms INT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for audit log
CREATE INDEX idx_vop_audit_log_request_id ON vop_audit_log(request_id);
CREATE INDEX idx_vop_audit_log_requester_bic ON vop_audit_log(requester_bic);
CREATE INDEX idx_vop_audit_log_created_at ON vop_audit_log(created_at);

-- Create data retention policy (delete logs older than 90 days)
CREATE OR REPLACE FUNCTION delete_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM vop_audit_log
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Note: Set up a cron job or pg_cron extension to run delete_old_audit_logs() daily

COMMENT ON TABLE vop_directory IS 'VoP participant directory - banks that support VoP';
COMMENT ON TABLE iban_prefix_mapping IS 'Mapping of IBAN prefixes to bank BIC codes';
COMMENT ON TABLE vop_audit_log IS 'Audit log for VoP requests (GDPR compliant, retention 90 days)';
