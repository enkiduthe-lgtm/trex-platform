-- V56: operational response targets for customer support tickets.
ALTER TABLE support_tickets
  ADD COLUMN due_at timestamptz;

UPDATE support_tickets
SET due_at = created_at + CASE priority
  WHEN 'URGENT' THEN interval '2 hours'
  WHEN 'HIGH' THEN interval '8 hours'
  WHEN 'NORMAL' THEN interval '24 hours'
  ELSE interval '72 hours'
END
WHERE due_at IS NULL;

ALTER TABLE support_tickets
  ALTER COLUMN due_at SET NOT NULL;

CREATE INDEX support_tickets_due_at_idx
  ON support_tickets(due_at)
  WHERE status IN ('OPEN','IN_PROGRESS','WAITING_CUSTOMER');
