ALTER TABLE checkout_sessions ADD COLUMN coupon_id uuid REFERENCES coupons(id), ADD COLUMN discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount >= 0);
