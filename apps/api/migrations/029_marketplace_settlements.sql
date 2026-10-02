CREATE TABLE marketplace_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES finance_accounts(id),
  finance_transaction_id uuid NOT NULL UNIQUE REFERENCES finance_transactions(id),
  marketplace_name text NOT NULL,
  reference_number text,
  gross_sales_amount numeric(12,2) NOT NULL CHECK (gross_sales_amount >= 0),
  commission_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  shipping_cost_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost_amount >= 0),
  campaign_contribution_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (campaign_contribution_amount >= 0),
  refund_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  net_collection_amount numeric(12,2) NOT NULL CHECK (net_collection_amount >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketplace_settlements_occurred_idx ON marketplace_settlements(occurred_at DESC);
