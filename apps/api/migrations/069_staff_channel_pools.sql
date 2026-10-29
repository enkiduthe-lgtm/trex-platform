-- Versioned settings preserve the recipients and rates that applied at order creation.
CREATE TABLE staff_prim_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 executive_count integer NOT NULL CHECK(executive_count BETWEEN 1 AND 100),
 executive_ids uuid[] NOT NULL,
 director_id uuid NOT NULL REFERENCES users(id),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(cardinality(executive_ids)=executive_count),
 CHECK(NOT(director_id=ANY(executive_ids)))
);
CREATE TABLE staff_prim_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL REFERENCES products(id),
 channel_group text NOT NULL CHECK(channel_group IN ('RETAIL','WHOLESALE','DEALER')),
 executive_amount numeric(12,2) NOT NULL CHECK(executive_amount>=0),
 director_amount numeric(12,2) NOT NULL CHECK(director_amount>=0),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX staff_prim_rates_history ON staff_prim_rates(product_id,channel_group,created_at DESC);
ALTER TABLE commission_entries ADD COLUMN staff_settings_id uuid REFERENCES staff_prim_settings(id),
 ADD COLUMN staff_rate_id uuid REFERENCES staff_prim_rates(id),
 ADD COLUMN staff_role text CHECK(staff_role IN ('EXECUTIVE','DIRECTOR')),
 ADD COLUMN staff_channel_group text,
 ADD COLUMN staff_unit_amount numeric(12,2),
 ADD COLUMN staff_pool_amount numeric(12,2),
 ADD COLUMN staff_share_count integer,
 ADD COLUMN staff_paid_amount numeric(12,2);
CREATE UNIQUE INDEX commission_entries_staff_pool_once
 ON commission_entries(order_item_id,recipient_user_id,staff_role)
 WHERE calculation_source='STAFF_CHANNEL_POOL_V1' AND entry_kind='EARN';
