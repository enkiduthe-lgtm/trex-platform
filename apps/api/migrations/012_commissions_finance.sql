CREATE TYPE commission_status AS ENUM ('PENDING', 'CONFIRMED', 'AVAILABLE', 'RESERVED', 'USED', 'REVERSED', 'PAID');
CREATE TABLE commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_level_id uuid REFERENCES dealer_levels(id),
  product_id uuid REFERENCES products(id),
  amount_per_unit numeric(12,2) NOT NULL CHECK (amount_per_unit >= 0),
  currency char(3) NOT NULL DEFAULT 'TRY',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_rules_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  rule_id uuid REFERENCES commission_rules(id),
  amount numeric(12,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'TRY',
  status commission_status NOT NULL DEFAULT 'PENDING',
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  UNIQUE(dealer_id, order_item_id, rule_id)
);
CREATE TYPE payout_status AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'FAILED');
CREATE TABLE commission_payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_for date NOT NULL,
  status payout_status NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commission_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES commission_payout_batches(id),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  amount numeric(12,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'TRY',
  bank_account_id uuid REFERENCES dealer_bank_accounts(id),
  status payout_status NOT NULL DEFAULT 'DRAFT',
  UNIQUE(batch_id, dealer_id)
);
CREATE TABLE financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES financial_accounts(id),
  amount numeric(12,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'TRY',
  direction text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  reference_type text NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
