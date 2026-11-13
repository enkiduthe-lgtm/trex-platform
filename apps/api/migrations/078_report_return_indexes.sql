CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS returns_completed_order_idx ON returns(order_id) WHERE status='REFUNDED';
CREATE INDEX IF NOT EXISTS return_items_order_item_idx ON return_items(order_item_id,return_id);
