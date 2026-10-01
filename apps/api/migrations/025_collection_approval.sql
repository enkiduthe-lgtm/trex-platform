ALTER TABLE finance_transactions ADD COLUMN order_id uuid REFERENCES orders(id);
ALTER TABLE finance_transactions ADD COLUMN approved_by uuid REFERENCES users(id);
ALTER TABLE finance_transactions ADD COLUMN approved_at timestamptz;
CREATE INDEX finance_transactions_pending_collections_idx ON finance_transactions(occurred_at DESC) WHERE kind='COLLECTION' AND payment_status IN ('PENDING','COLLECTION_PENDING','PARTIALLY_PAID');
