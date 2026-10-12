CREATE TABLE inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  expected_quantity integer NOT NULL CHECK (expected_quantity >= 0),
  actual_quantity integer NOT NULL CHECK (actual_quantity >= 0),
  difference_quantity integer NOT NULL,
  reason text NOT NULL,
  counted_by uuid NOT NULL REFERENCES users(id),
  counted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_counts_recent_idx ON inventory_counts(counted_at DESC);
