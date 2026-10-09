ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'RETURN_QUARANTINE';
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'RETURN_DAMAGED';
ALTER TABLE returns ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES users(id);
ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE returns ADD COLUMN IF NOT EXISTS rejection_reason text;
CREATE TYPE return_stock_disposition AS ENUM ('SELLABLE','QUARANTINE','DAMAGED');
CREATE TABLE return_item_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  return_item_id uuid NOT NULL REFERENCES return_items(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES warehouses(id),
  disposition return_stock_disposition NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(return_item_id)
);
CREATE TABLE return_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL UNIQUE REFERENCES returns(id),
  payment_id uuid REFERENCES payments(id),
  finance_transaction_id uuid NOT NULL UNIQUE REFERENCES finance_transactions(id),
  amount numeric(12,2) NOT NULL CHECK(amount > 0),
  currency char(3) NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
