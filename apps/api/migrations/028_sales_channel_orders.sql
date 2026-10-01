ALTER TYPE sales_channel_code ADD VALUE IF NOT EXISTS 'WHOLESALE';
ALTER TYPE sales_channel_code ADD VALUE IF NOT EXISTS 'MARKETPLACE';
INSERT INTO sales_channels(code,name) VALUES ('WHOLESALE','Toptan satış'),('MARKETPLACE','Pazar yeri') ON CONFLICT (code) DO NOTHING;
ALTER TABLE orders ADD COLUMN sales_channel sales_channel_code NOT NULL DEFAULT 'PUBLIC_WEB';
ALTER TABLE orders ADD COLUMN marketplace_name text;
ALTER TABLE orders ADD COLUMN commission_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0);
ALTER TABLE orders ADD COLUMN shipping_cost_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_cost_amount >= 0);
CREATE INDEX orders_sales_channel_created_idx ON orders(sales_channel, created_at DESC);
