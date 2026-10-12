CREATE TABLE customer_loyalty_accounts (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  tier text NOT NULL DEFAULT 'BRONZE' CHECK (tier IN ('BRONZE','SILVER','GOLD')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_loyalty_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  points_delta integer NOT NULL CHECK (points_delta <> 0),
  reason text NOT NULL,
  reference_type text,
  reference_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_loyalty_movements_customer_idx
  ON customer_loyalty_movements(customer_id,created_at DESC);
