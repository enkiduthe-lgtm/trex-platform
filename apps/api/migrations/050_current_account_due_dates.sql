-- V55: due dates on immutable receivable movements.
ALTER TABLE current_account_entries ADD COLUMN due_at date;
CREATE INDEX current_account_entries_due_at_idx ON current_account_entries(due_at) WHERE due_at IS NOT NULL;
