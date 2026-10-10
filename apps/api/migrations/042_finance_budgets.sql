CREATE TABLE finance_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  expense_category text NOT NULL,
  cost_center text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency IN ('TRY','EUR','USD')),
  description text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_start,expense_category,cost_center,currency)
);
CREATE INDEX finance_budgets_period_idx ON finance_budgets(period_start DESC,currency);
