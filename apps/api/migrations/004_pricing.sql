CREATE TYPE sales_channel_code AS ENUM ('PUBLIC_WEB', 'ADMIN_ORDER', 'DEALER_PORTAL');

CREATE TABLE sales_channels (
  code sales_channel_code PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO sales_channels (code, name) VALUES
  ('PUBLIC_WEB', 'Public Web'), ('ADMIN_ORDER', 'Admin Order'), ('DEALER_PORTAL', 'Dealer Portal');

CREATE TABLE dealer_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealer_levels_code_format CHECK (code ~ '^[A-Z0-9_]+$')
);

CREATE TYPE price_scope AS ENUM ('GLOBAL', 'CHANNEL', 'DEALER_LEVEL', 'DEALER');
CREATE TABLE product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  scope price_scope NOT NULL,
  channel sales_channel_code REFERENCES sales_channels(code),
  dealer_level_id uuid REFERENCES dealer_levels(id),
  dealer_id uuid,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_prices_window CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT product_prices_scope_target CHECK (
    (scope = 'GLOBAL' AND channel IS NULL AND dealer_level_id IS NULL AND dealer_id IS NULL) OR
    (scope = 'CHANNEL' AND channel IS NOT NULL AND dealer_level_id IS NULL AND dealer_id IS NULL) OR
    (scope = 'DEALER_LEVEL' AND channel IS NULL AND dealer_level_id IS NOT NULL AND dealer_id IS NULL) OR
    (scope = 'DEALER' AND channel IS NULL AND dealer_level_id IS NULL AND dealer_id IS NOT NULL)
  )
);
CREATE INDEX product_prices_lookup_idx ON product_prices(product_id, scope, starts_at DESC);

CREATE TABLE product_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_costs_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);
