-- Used by finance editability checks and director-commission visibility filters.
CREATE INDEX IF NOT EXISTS commission_entries_finance_transaction_idx
  ON commission_entries(finance_transaction_id)
  WHERE finance_transaction_id IS NOT NULL;
