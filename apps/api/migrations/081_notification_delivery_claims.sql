ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode text CHECK (delivery_mode IN ('IN_APP','MOCK','BREVO')),
  ADD COLUMN IF NOT EXISTS delivery_token uuid,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_delivery_claim_idx
  ON notifications(delivery_started_at)
  WHERE status='RETRYING';

UPDATE notifications
SET delivery_mode=CASE
  WHEN starts_with(provider_reference,'mock_notification_') THEN 'MOCK'
  WHEN channel='IN_APP' THEN 'IN_APP'
  WHEN channel='EMAIL' AND status='SENT' AND NULLIF(trim(provider_reference),'') IS NOT NULL THEN 'BREVO'
  ELSE NULL
END
WHERE delivery_mode IS NULL;
