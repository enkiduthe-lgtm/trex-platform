-- V5: immutable staff and manager commission ledger.
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES users(id);
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS recipient_kind text NOT NULL DEFAULT 'DEALER' CHECK (recipient_kind IN ('DEALER','STAFF','MANAGER'));
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id);
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES users(id);
ALTER TABLE commission_rules ALTER COLUMN dealer_level_id DROP NOT NULL;
UPDATE commission_rules SET recipient_kind='DEALER' WHERE recipient_user_id IS NULL;
CREATE INDEX IF NOT EXISTS commission_rules_active_staff_idx ON commission_rules(product_id,recipient_user_id,recipient_kind) WHERE is_active=true;

ALTER TABLE commission_entries ALTER COLUMN dealer_id DROP NOT NULL;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES users(id);
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS recipient_kind text NOT NULL DEFAULT 'DEALER' CHECK (recipient_kind IN ('DEALER','STAFF','MANAGER'));
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'EARN' CHECK (entry_kind IN ('EARN','REVERSAL'));
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS source_entry_id uuid REFERENCES commission_entries(id);
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES users(id);
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS finance_transaction_id uuid REFERENCES finance_transactions(id);
ALTER TABLE commission_entries ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE commission_entries ADD CONSTRAINT commission_entries_recipient_chk CHECK ((dealer_id IS NOT NULL AND recipient_user_id IS NULL) OR (dealer_id IS NULL AND recipient_user_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_staff_earn_unique ON commission_entries(recipient_user_id,order_item_id,rule_id) WHERE entry_kind='EARN' AND recipient_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commission_entries_reversal_source_unique ON commission_entries(source_entry_id) WHERE entry_kind='REVERSAL';
CREATE INDEX IF NOT EXISTS commission_entries_order_idx ON commission_entries(order_id,created_at DESC);
