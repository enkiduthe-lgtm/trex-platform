CREATE TYPE admin_finance_record_kind AS ENUM ('EXPENSE', 'INCOMING_TRANSFER');

CREATE TABLE admin_finance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind admin_finance_record_kind NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency = 'TRY'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  counterparty_name text,
  bank_name text,
  reference_number text,
  description text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_finance_records_kind_occurred_idx ON admin_finance_records(kind, occurred_at DESC);
