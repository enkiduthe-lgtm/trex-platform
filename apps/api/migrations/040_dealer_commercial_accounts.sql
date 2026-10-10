CREATE TABLE dealer_price_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]+$'),
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS price_group_id uuid REFERENCES dealer_price_groups(id);
CREATE INDEX IF NOT EXISTS dealers_price_group_idx ON dealers(price_group_id);

ALTER TYPE price_scope ADD VALUE IF NOT EXISTS 'DEALER_PRICE_GROUP';
ALTER TABLE product_prices ADD COLUMN IF NOT EXISTS dealer_price_group_id uuid REFERENCES dealer_price_groups(id);
ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS product_prices_scope_target;
ALTER TABLE product_prices ADD CONSTRAINT product_prices_scope_target CHECK (
  (scope = 'GLOBAL' AND channel IS NULL AND dealer_level_id IS NULL AND dealer_id IS NULL AND dealer_price_group_id IS NULL) OR
  (scope = 'CHANNEL' AND channel IS NOT NULL AND dealer_level_id IS NULL AND dealer_id IS NULL AND dealer_price_group_id IS NULL) OR
  (scope = 'DEALER_LEVEL' AND channel IS NULL AND dealer_level_id IS NOT NULL AND dealer_id IS NULL AND dealer_price_group_id IS NULL) OR
  (scope = 'DEALER' AND channel IS NULL AND dealer_level_id IS NULL AND dealer_id IS NOT NULL AND dealer_price_group_id IS NULL) OR
  (scope = 'DEALER_PRICE_GROUP' AND channel IS NULL AND dealer_level_id IS NULL AND dealer_id IS NULL AND dealer_price_group_id IS NOT NULL)
);

CREATE TYPE dealer_ledger_direction AS ENUM ('DEBIT','CREDIT');
CREATE TABLE dealer_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  direction dealer_ledger_direction NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
  reference_type text NOT NULL,
  reference_id uuid,
  description text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dealer_ledger_entries_dealer_idx ON dealer_ledger_entries(dealer_id, created_at DESC);
