CREATE TABLE inventory_reorder_levels (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  minimum_quantity integer NOT NULL DEFAULT 5 CHECK (minimum_quantity >= 0),
  target_quantity integer NOT NULL DEFAULT 20 CHECK (target_quantity >= minimum_quantity),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE INDEX inventory_reorder_levels_warehouse_idx ON inventory_reorder_levels(warehouse_id);
