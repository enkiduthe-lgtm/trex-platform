CREATE TABLE carrier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES finance_accounts(id),
  carrier_name varchar(80) NOT NULL,
  reference_number varchar(120),
  gross_collection_amount numeric(14,2) NOT NULL CHECK (gross_collection_amount >= 0),
  shipping_deduction_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (shipping_deduction_amount >= 0),
  other_deduction_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (other_deduction_amount >= 0),
  net_payout_amount numeric(14,2) NOT NULL CHECK (net_payout_amount >= 0),
  expected_payout_date date NOT NULL,
  paid_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','PAID')),
  note text,
  finance_transaction_id uuid UNIQUE REFERENCES finance_transactions(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX carrier_settlements_status_due_idx ON carrier_settlements(status, expected_payout_date);
