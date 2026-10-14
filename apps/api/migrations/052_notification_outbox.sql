ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'RETRYING';

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_outbox_pending_idx
  ON notifications (status, next_attempt_at, created_at)
  WHERE status IN ('PENDING', 'RETRYING');
