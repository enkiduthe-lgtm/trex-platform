ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_ciphertext text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_secret_ciphertext text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled_at timestamptz;
