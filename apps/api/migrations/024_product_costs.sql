CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  contact_name text,
  phone text,
  email citext,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE product_costs ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
ALTER TABLE product_costs ADD COLUMN note text;
CREATE INDEX product_costs_product_effective_idx ON product_costs(product_id, starts_at DESC, created_at DESC);
