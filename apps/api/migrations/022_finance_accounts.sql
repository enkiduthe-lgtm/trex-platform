CREATE TYPE finance_account_type AS ENUM ('BANK', 'CASH', 'MARKETPLACE', 'COD_PENDING', 'FOREIGN_CURRENCY');
CREATE TYPE finance_transaction_kind AS ENUM ('INCOME', 'EXPENSE', 'COLLECTION', 'REFUND', 'COMMISSION', 'TRANSFER_IN', 'TRANSFER_OUT', 'PRIME_EXPENSE', 'MANUAL');
CREATE TYPE finance_payment_status AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED', 'COLLECTION_PENDING', 'OVERDUE');

CREATE TABLE finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  account_type finance_account_type NOT NULL,
  currency char(3) NOT NULL DEFAULT 'TRY',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES finance_accounts(id),
  kind finance_transaction_kind NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_status finance_payment_status,
  counterparty_name text,
  reference_number text,
  description text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  transfer_group_id uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_transactions_account_occurred_idx ON finance_transactions(account_id, occurred_at DESC);
CREATE INDEX finance_transactions_transfer_group_idx ON finance_transactions(transfer_group_id) WHERE transfer_group_id IS NOT NULL;
