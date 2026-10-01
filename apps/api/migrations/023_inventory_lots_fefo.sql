CREATE TABLE inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  lot_code text NOT NULL,
  expiry_date date,
  available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  location_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id, lot_code)
);
CREATE INDEX inventory_lots_fefo_idx ON inventory_lots(product_id, warehouse_id, expiry_date ASC NULLS LAST) WHERE available_quantity > 0;
