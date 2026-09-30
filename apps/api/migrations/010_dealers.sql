CREATE TYPE dealer_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TABLE dealers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid UNIQUE REFERENCES customers(id),
  parent_dealer_id uuid REFERENCES dealers(id),
  dealer_level_id uuid REFERENCES dealer_levels(id),
  code text NOT NULL UNIQUE,
  company_name text NOT NULL,
  tax_number text,
  status dealer_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dealers_not_own_parent CHECK (id <> parent_dealer_id)
);
CREATE INDEX dealers_parent_idx ON dealers(parent_dealer_id);
ALTER TABLE product_prices ADD CONSTRAINT product_prices_dealer_id_fk FOREIGN KEY (dealer_id) REFERENCES dealers(id);
CREATE TABLE dealer_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  account_holder text NOT NULL,
  iban text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dealer_id, iban)
);
CREATE UNIQUE INDEX dealer_primary_bank_idx ON dealer_bank_accounts(dealer_id) WHERE is_primary;
