-- Primler ürün, alıcı ve satış kanalına göre ayrı tanımlanabilir.
-- NULL, eski kuralların bütün kanallarda çalışmaya devam etmesini sağlar.
ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS sales_channel_group text
  CHECK (sales_channel_group IN ('RETAIL','WHOLESALE','DEALER'));

CREATE INDEX IF NOT EXISTS commission_rules_staff_channel_idx
  ON commission_rules(product_id, recipient_user_id, recipient_kind, sales_channel_group)
  WHERE is_active = true;
