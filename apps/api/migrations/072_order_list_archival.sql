ALTER TABLE orders ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by uuid REFERENCES users(id), ADD COLUMN archive_reason text;
CREATE INDEX orders_visible_created_idx ON orders(created_at DESC) WHERE archived_at IS NULL;
