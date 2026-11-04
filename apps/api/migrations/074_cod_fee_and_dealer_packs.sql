ALTER TABLE orders ADD COLUMN cod_service_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (cod_service_fee >= 0);
ALTER TABLE product_prices ADD COLUMN pack_size integer NOT NULL DEFAULT 1 CHECK (pack_size IN (1,2,3,5));
ALTER TABLE product_prices ADD CONSTRAINT dealer_pack_scope CHECK (pack_size = 1 OR (scope = 'DEALER_LEVEL' AND currency = 'TRY'));
CREATE INDEX product_prices_dealer_pack ON product_prices(product_id,dealer_level_id,pack_size,starts_at DESC) WHERE scope='DEALER_LEVEL';
