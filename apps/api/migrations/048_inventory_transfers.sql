-- V48: controlled warehouse-to-warehouse inventory transfers.
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'TRANSFER_IN';

CREATE TABLE inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  source_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  destination_warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  transferred_by uuid NOT NULL REFERENCES users(id),
  transferred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id)
);
CREATE INDEX inventory_transfers_product_time_idx ON inventory_transfers(product_id, transferred_at DESC);
